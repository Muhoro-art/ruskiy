package event

import (
	"encoding/json"
	"fmt"
	"hash/fnv"
	"sync"
	"time"
)

// Record is a single message stored in a partition.
type Record struct {
	Key       string
	Value     []byte
	Offset    int64
	Timestamp time.Time
}

// partition holds an ordered sequence of records.
type partition struct {
	mu      sync.Mutex
	records []Record
}

func (p *partition) append(key string, value []byte) int64 {
	p.mu.Lock()
	defer p.mu.Unlock()
	offset := int64(len(p.records))
	p.records = append(p.records, Record{
		Key:       key,
		Value:     value,
		Offset:    offset,
		Timestamp: time.Now(),
	})
	return offset
}

func (p *partition) read(offset int64) (Record, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if offset < 0 || int(offset) >= len(p.records) {
		return Record{}, false
	}
	return p.records[offset], true
}

func (p *partition) size() int64 {
	p.mu.Lock()
	defer p.mu.Unlock()
	return int64(len(p.records))
}

// topic is a collection of partitions.
type topic struct {
	mu         sync.RWMutex
	partitions []*partition
	leaderMap  []int // partition index -> broker that is leader
}

func newTopic(numPartitions, replicationFactor int) *topic {
	parts := make([]*partition, numPartitions)
	leaders := make([]int, numPartitions)
	for i := 0; i < numPartitions; i++ {
		parts[i] = &partition{}
		leaders[i] = i % replicationFactor // spread leaders across brokers
	}
	return &topic{partitions: parts, leaderMap: leaders}
}

// consumerGroupState tracks offsets per partition for a consumer group.
type consumerGroupState struct {
	mu      sync.Mutex
	offsets map[int]int64 // partition index -> committed offset
}

// Broker simulates a multi-broker Kafka cluster in memory.
// It supports topics, partitions, consumer groups, and leader election.
type Broker struct {
	mu             sync.RWMutex
	topics         map[string]*topic
	groups         map[string]*consumerGroupState // groupID -> state
	numBrokers     int
	killedBrokers  map[int]bool
	subscribers    map[string][]chan Record // topic -> list of subscriber channels
	idempotencyLog map[string]map[string]bool // groupID -> set of processed event IDs
}

// NewBroker creates an in-memory Kafka broker cluster.
func NewBroker(numBrokers int) *Broker {
	return &Broker{
		topics:         make(map[string]*topic),
		groups:         make(map[string]*consumerGroupState),
		numBrokers:     numBrokers,
		killedBrokers:  make(map[int]bool),
		subscribers:    make(map[string][]chan Record),
		idempotencyLog: make(map[string]map[string]bool),
	}
}

// CreateTopic creates a topic with the given number of partitions.
func (b *Broker) CreateTopic(name string, numPartitions int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.topics[name] = newTopic(numPartitions, b.numBrokers)
}

// Publish writes a record to the appropriate partition based on the key hash.
// Returns an error if the leader broker for that partition is down.
func (b *Broker) Publish(topicName, key string, value []byte) (int, int64, error) {
	b.mu.RLock()
	t, exists := b.topics[topicName]
	b.mu.RUnlock()
	if !exists {
		return 0, 0, fmt.Errorf("topic %q does not exist", topicName)
	}

	t.mu.RLock()
	numParts := len(t.partitions)
	t.mu.RUnlock()

	partIdx := partitionFor(key, numParts)

	// Check if the leader broker is alive
	t.mu.RLock()
	leader := t.leaderMap[partIdx]
	t.mu.RUnlock()

	b.mu.RLock()
	killed := b.killedBrokers[leader]
	b.mu.RUnlock()

	if killed {
		return 0, 0, fmt.Errorf("leader broker %d for partition %d is down", leader, partIdx)
	}

	offset := t.partitions[partIdx].append(key, value)

	// Notify subscribers
	b.mu.RLock()
	subs := b.subscribers[topicName]
	b.mu.RUnlock()
	for _, ch := range subs {
		select {
		case ch <- Record{Key: key, Value: value, Offset: offset, Timestamp: time.Now()}:
		default:
		}
	}

	return partIdx, offset, nil
}

// Subscribe returns a channel that receives records published to the topic.
func (b *Broker) Subscribe(topicName string, bufSize int) chan Record {
	ch := make(chan Record, bufSize)
	b.mu.Lock()
	b.subscribers[topicName] = append(b.subscribers[topicName], ch)
	b.mu.Unlock()
	return ch
}

// Consume reads the next unprocessed record for a consumer group from a partition.
// Returns the record and true, or zero-value and false if nothing available.
func (b *Broker) Consume(topicName, groupID string, partIdx int) (Record, bool) {
	b.mu.RLock()
	t, exists := b.topics[topicName]
	b.mu.RUnlock()
	if !exists {
		return Record{}, false
	}

	gs := b.getOrCreateGroup(groupID)
	gs.mu.Lock()
	offset := gs.offsets[partIdx]
	gs.mu.Unlock()

	rec, ok := t.partitions[partIdx].read(offset)
	if !ok {
		return Record{}, false
	}

	// Advance offset
	gs.mu.Lock()
	gs.offsets[partIdx] = offset + 1
	gs.mu.Unlock()

	return rec, true
}

// ConsumeAll reads all records from all partitions for a consumer group.
func (b *Broker) ConsumeAll(topicName, groupID string) []Record {
	b.mu.RLock()
	t, exists := b.topics[topicName]
	b.mu.RUnlock()
	if !exists {
		return nil
	}

	t.mu.RLock()
	numParts := len(t.partitions)
	t.mu.RUnlock()

	var all []Record
	for partIdx := 0; partIdx < numParts; partIdx++ {
		for {
			rec, ok := b.Consume(topicName, groupID, partIdx)
			if !ok {
				break
			}
			all = append(all, rec)
		}
	}
	return all
}

// ReadPartition reads all records from a specific partition (without consumer group offsets).
func (b *Broker) ReadPartition(topicName string, partIdx int) []Record {
	b.mu.RLock()
	t, exists := b.topics[topicName]
	b.mu.RUnlock()
	if !exists {
		return nil
	}

	var records []Record
	var offset int64
	for {
		rec, ok := t.partitions[partIdx].read(offset)
		if !ok {
			break
		}
		records = append(records, rec)
		offset++
	}
	return records
}

// MarkProcessed records an event ID as processed for idempotency checking.
func (b *Broker) MarkProcessed(groupID, eventID string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.idempotencyLog[groupID] == nil {
		b.idempotencyLog[groupID] = make(map[string]bool)
	}
	b.idempotencyLog[groupID][eventID] = true
}

// IsProcessed checks if an event was already processed by the group.
func (b *Broker) IsProcessed(groupID, eventID string) bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if log, ok := b.idempotencyLog[groupID]; ok {
		return log[eventID]
	}
	return false
}

// ProcessedCount returns the number of unique events processed by a group.
func (b *Broker) ProcessedCount(groupID string) int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.idempotencyLog[groupID])
}

// TopicSize returns the total number of records across all partitions.
func (b *Broker) TopicSize(topicName string) int64 {
	b.mu.RLock()
	t, exists := b.topics[topicName]
	b.mu.RUnlock()
	if !exists {
		return 0
	}

	t.mu.RLock()
	defer t.mu.RUnlock()
	var total int64
	for _, p := range t.partitions {
		total += p.size()
	}
	return total
}

// KillBroker simulates a broker going down. Any partition whose leader is
// this broker will be unavailable until ElectNewLeader is called.
func (b *Broker) KillBroker(brokerID int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.killedBrokers[brokerID] = true
}

// IsBrokerAlive returns whether a broker is alive.
func (b *Broker) IsBrokerAlive(brokerID int) bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return !b.killedBrokers[brokerID]
}

// ElectNewLeader simulates leader election for a partition. Picks the next
// alive broker as leader.
func (b *Broker) ElectNewLeader(topicName string, partIdx int) (int, error) {
	b.mu.RLock()
	t, exists := b.topics[topicName]
	b.mu.RUnlock()
	if !exists {
		return 0, fmt.Errorf("topic %q does not exist", topicName)
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	oldLeader := t.leaderMap[partIdx]
	for i := 1; i < b.numBrokers; i++ {
		candidate := (oldLeader + i) % b.numBrokers
		b.mu.RLock()
		alive := !b.killedBrokers[candidate]
		b.mu.RUnlock()
		if alive {
			t.leaderMap[partIdx] = candidate
			return candidate, nil
		}
	}
	return 0, fmt.Errorf("no alive brokers available for topic %q partition %d", topicName, partIdx)
}

// GetLeader returns the current leader broker for a partition.
func (b *Broker) GetLeader(topicName string, partIdx int) int {
	b.mu.RLock()
	t := b.topics[topicName]
	b.mu.RUnlock()
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.leaderMap[partIdx]
}

func (b *Broker) getOrCreateGroup(groupID string) *consumerGroupState {
	b.mu.Lock()
	defer b.mu.Unlock()
	gs, exists := b.groups[groupID]
	if !exists {
		gs = &consumerGroupState{offsets: make(map[int]int64)}
		b.groups[groupID] = gs
	}
	return gs
}

func partitionFor(key string, numPartitions int) int {
	h := fnv.New32a()
	h.Write([]byte(key))
	return int(h.Sum32()) % numPartitions
}

// ------------------- Consumer Worker -------------------

// ConsumerFunc processes a record. Return an error to route to DLQ.
type ConsumerFunc func(record Record) error

// RunConsumer consumes records from all partitions for a consumer group,
// processes them with the handler, and routes failures to DLQ.
// It runs until the done channel is closed.
func RunConsumer(broker *Broker, topicName, groupID string, numPartitions int, handler ConsumerFunc, done <-chan struct{}) int {
	processed := 0
	for {
		select {
		case <-done:
			return processed
		default:
		}

		found := false
		for partIdx := 0; partIdx < numPartitions; partIdx++ {
			rec, ok := broker.Consume(topicName, groupID, partIdx)
			if !ok {
				continue
			}
			found = true

			// Extract event ID for idempotency
			var evt map[string]interface{}
			eventID := ""
			if err := json.Unmarshal(rec.Value, &evt); err == nil {
				if eid, ok := evt["event_id"].(string); ok {
					eventID = eid
				}
			}

			// Idempotency check
			if eventID != "" && broker.IsProcessed(groupID, eventID) {
				continue // skip duplicate
			}

			if err := handler(rec); err != nil {
				// Route to DLQ
				dlqEvt := DLQEvent{
					OriginalPayload: json.RawMessage(rec.Value),
					ErrorReason:     err.Error(),
					FailedAt:        time.Now().UTC().Format(time.RFC3339Nano),
				}
				dlqBytes, _ := json.Marshal(dlqEvt)
				broker.Publish(topicName+".dlq", rec.Key, dlqBytes)
			} else if eventID != "" {
				broker.MarkProcessed(groupID, eventID)
			}
			processed++
		}
		if !found {
			// Small yield to avoid busy-spin in tests
			time.Sleep(1 * time.Millisecond)
		}
	}
}

// ------------------- Producer Helper -------------------

// PublishActivityEvent validates and publishes an activity event.
// Uses learner_id as the partition key for ordering guarantees.
func PublishActivityEvent(broker *Broker, evt *ActivityEvent) error {
	data, err := evt.Marshal()
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}
	_, _, err = broker.Publish(TopicLearnerActivity, evt.LearnerID, data)
	return err
}
