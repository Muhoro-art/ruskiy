package event

import (
	"encoding/json"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ============================================================
// TC-KAFKA-001: Activity Event Published on Exercise Completion
// ============================================================

func TestActivityEventPublishedOnExerciseCompletion(t *testing.T) {
	broker := NewBroker(3)
	broker.CreateTopic(TopicLearnerActivity, 6)

	// Subscribe before publishing so we can time the delivery
	sub := broker.Subscribe(TopicLearnerActivity, 10)

	// Simulate: Learner completes an exercise via POST /v1/sessions/{id}/submit
	evt := NewActivityEvent(
		"learner-001",
		"session-abc",
		"content-xyz",
		[]string{"cyrillic.unique_letters", "phonetics.voiced_voiceless"},
		true,
		"none",
		1,
	)

	start := time.Now()
	err := PublishActivityEvent(broker, evt)
	require.NoError(t, err)

	// Assert: Event appears on topic "learner.activity" within 500ms
	select {
	case rec := <-sub:
		elapsed := time.Since(start)
		assert.Less(t, elapsed, 500*time.Millisecond, "event must appear within 500ms")

		// Assert: Event is valid JSON and passes schema validation
		parsed, err := ValidateJSON(rec.Value)
		require.NoError(t, err, "event must be valid JSON and pass schema validation")

		// Assert: Event contains required fields
		assert.NotEmpty(t, parsed.EventID, "must have event_id")
		assert.Equal(t, "learner-001", parsed.LearnerID, "must have learner_id")
		assert.Equal(t, "session-abc", parsed.SessionID, "must have session_id")
		assert.NotEmpty(t, parsed.Timestamp, "must have timestamp")
		assert.Equal(t, "exercise_completed", parsed.EventType, "must have event_type")
		assert.Equal(t, "content-xyz", parsed.ContentID, "must have content_id")
		assert.Equal(t, []string{"cyrillic.unique_letters", "phonetics.voiced_voiceless"}, parsed.SkillIDs, "must have skill_ids")
		assert.True(t, parsed.IsCorrect, "must have is_correct")
		assert.Equal(t, "none", parsed.ErrorType, "must have error_type")

	case <-time.After(500 * time.Millisecond):
		t.Fatal("event did not appear on topic within 500ms")
	}
}

// ============================================================
// TC-KAFKA-002: Consumer Group Processes Events Exactly Once
// ============================================================

func TestConsumerGroupProcessesEventsExactlyOnce(t *testing.T) {
	broker := NewBroker(3)
	numPartitions := 6
	broker.CreateTopic(TopicLearnerActivity, numPartitions)

	// Publish 1000 events
	for i := 0; i < 1000; i++ {
		evt := NewActivityEvent(
			fmt.Sprintf("learner-%03d", i%50), // 50 unique learners
			fmt.Sprintf("session-%d", i),
			fmt.Sprintf("content-%d", i),
			[]string{"grammar.cases"},
			i%3 != 0,
			"none",
			i,
		)
		err := PublishActivityEvent(broker, evt)
		require.NoError(t, err)
	}

	assert.Equal(t, int64(1000), broker.TopicSize(TopicLearnerActivity))

	// Run 3 consumer instances in the same consumer group
	groupID := "analytics-group"
	var totalProcessed atomic.Int64
	var wg sync.WaitGroup

	done := make(chan struct{})

	for c := 0; c < 3; c++ {
		wg.Add(1)
		go func(consumerID int) {
			defer wg.Done()
			count := RunConsumer(broker, TopicLearnerActivity, groupID, numPartitions, func(rec Record) error {
				// Simulate processing
				return nil
			}, done)
			totalProcessed.Add(int64(count))
		}(c)
	}

	// Give consumers time to drain all records
	time.Sleep(200 * time.Millisecond)
	close(done)
	wg.Wait()

	// Assert: Total events processed across all consumers == 1000
	assert.Equal(t, int64(1000), totalProcessed.Load(),
		"total events processed must be exactly 1000")

	// Assert: No event processed more than once (check idempotency log)
	assert.Equal(t, 1000, broker.ProcessedCount(groupID),
		"idempotency log must contain exactly 1000 unique event IDs")
}

// ============================================================
// TC-KAFKA-003: Dead Letter Queue for Malformed Events
// ============================================================

func TestDeadLetterQueueForMalformedEvents(t *testing.T) {
	broker := NewBroker(3)
	numPartitions := 3
	broker.CreateTopic(TopicLearnerActivity, numPartitions)
	broker.CreateTopic(TopicLearnerActivityDLQ, numPartitions)

	// Publish event with missing required field (no learner_id)
	malformedEvt := &ActivityEvent{
		EventID:   "evt-malformed",
		LearnerID: "", // MISSING
		SessionID: "session-999",
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		EventType: "exercise_completed",
		ContentID: "content-999",
		SkillIDs:  []string{"grammar.cases"},
		IsCorrect: false,
		ErrorType: "case_error",
	}
	data, err := malformedEvt.Marshal()
	require.NoError(t, err)

	// Use a non-empty key so it goes to a deterministic partition
	_, _, err = broker.Publish(TopicLearnerActivity, "malformed-key", data)
	require.NoError(t, err)

	// Run consumer that validates events
	groupID := "validator-group"
	done := make(chan struct{})

	go func() {
		RunConsumer(broker, TopicLearnerActivity, groupID, numPartitions, func(rec Record) error {
			// Consumer validates the event
			_, err := ValidateJSON(rec.Value)
			if err != nil {
				return err // Will route to DLQ
			}
			return nil
		}, done)
	}()

	time.Sleep(100 * time.Millisecond)
	close(done)

	// Assert: Event appears on "learner.activity.dlq" topic
	dlqRecords := broker.ConsumeAll(TopicLearnerActivityDLQ, "dlq-reader")
	require.Len(t, dlqRecords, 1, "exactly one event must be in DLQ")

	// Assert: DLQ event includes original payload + error reason
	var dlqEvt DLQEvent
	err = json.Unmarshal(dlqRecords[0].Value, &dlqEvt)
	require.NoError(t, err)

	assert.Contains(t, dlqEvt.ErrorReason, "missing learner_id",
		"DLQ must include error reason")
	assert.NotEmpty(t, dlqEvt.OriginalPayload,
		"DLQ must include original payload")
	assert.NotEmpty(t, dlqEvt.FailedAt,
		"DLQ must include failure timestamp")

	// Verify original payload is the malformed event
	var original ActivityEvent
	err = json.Unmarshal(dlqEvt.OriginalPayload, &original)
	require.NoError(t, err)
	assert.Equal(t, "evt-malformed", original.EventID)
	assert.Empty(t, original.LearnerID)
}

// ============================================================
// TC-KAFKA-004: Event Ordering Within Partition
// ============================================================

func TestEventOrderingWithinPartition(t *testing.T) {
	broker := NewBroker(3)
	numPartitions := 6
	broker.CreateTopic(TopicLearnerActivity, numPartitions)

	learnerID := "learner-ordering-test"

	// Publish 100 events for the same learner_id (same partition key)
	for i := 0; i < 100; i++ {
		evt := NewActivityEvent(
			learnerID,
			"session-order",
			fmt.Sprintf("content-%d", i),
			[]string{"grammar.cases"},
			true,
			"none",
			i, // session_position = i
		)
		err := PublishActivityEvent(broker, evt)
		require.NoError(t, err)
	}

	// Determine which partition the learner's events went to
	var targetPartition int
	for p := 0; p < numPartitions; p++ {
		records := broker.ReadPartition(TopicLearnerActivity, p)
		if len(records) > 0 {
			targetPartition = p
			break
		}
	}

	// Read all records from that partition
	records := broker.ReadPartition(TopicLearnerActivity, targetPartition)

	// Assert: all 100 events are in this partition
	assert.Len(t, records, 100, "all 100 events must be in the same partition")

	// Assert: Consumer receives events in publish order
	// Assert: session_position values are sequential
	for i, rec := range records {
		var evt ActivityEvent
		err := json.Unmarshal(rec.Value, &evt)
		require.NoError(t, err)

		assert.Equal(t, i, evt.SessionPosition,
			"session_position must be sequential: expected %d, got %d", i, evt.SessionPosition)
		assert.Equal(t, learnerID, evt.LearnerID)
		assert.Equal(t, rec.Offset, int64(i),
			"offsets must be sequential")
	}
}

// ============================================================
// TC-KAFKA-005: Kafka Cluster Failover
// ============================================================

func TestKafkaClusterFailover(t *testing.T) {
	// Precondition: 3-broker Kafka cluster
	broker := NewBroker(3)
	numPartitions := 3
	broker.CreateTopic(TopicLearnerActivity, numPartitions)

	// Publish some initial events to establish baseline
	for i := 0; i < 10; i++ {
		evt := NewActivityEvent(
			"learner-failover",
			"session-fail",
			fmt.Sprintf("content-pre-%d", i),
			[]string{"grammar.cases"},
			true,
			"none",
			i,
		)
		err := PublishActivityEvent(broker, evt)
		require.NoError(t, err)
	}

	beforeFailover := broker.TopicSize(TopicLearnerActivity)
	assert.Equal(t, int64(10), beforeFailover)

	// Identify partition 0's leader
	originalLeader := broker.GetLeader(TopicLearnerActivity, 0)
	assert.True(t, broker.IsBrokerAlive(originalLeader))

	// Kill leader broker for learner.activity partition 0
	broker.KillBroker(originalLeader)
	assert.False(t, broker.IsBrokerAlive(originalLeader))

	// Verify publishing to that partition fails while leader is down
	// (use a key that routes to partition 0)
	testEvt := NewActivityEvent("learner-failover", "s", "c", []string{"x"}, true, "none", 0)
	// The key "learner-failover" may or may not hash to partition 0.
	// Let's use a direct publish to verify the leader-down behavior.
	_, _, err := broker.Publish(TopicLearnerActivity, "learner-failover", []byte(`{}`))
	// This might succeed if "learner-failover" doesn't hash to partition 0
	// So let's test with a key we know maps to partition 0
	_ = testEvt

	// Find a key that maps to partition 0
	var keyForPart0 string
	for i := 0; i < 1000; i++ {
		candidate := fmt.Sprintf("key-%d", i)
		h := partitionForTest(candidate, numPartitions)
		if h == 0 {
			keyForPart0 = candidate
			break
		}
	}
	require.NotEmpty(t, keyForPart0, "must find a key that routes to partition 0")

	_, _, err = broker.Publish(TopicLearnerActivity, keyForPart0, []byte(`{"test":"down"}`))
	assert.Error(t, err, "publishing to partition with dead leader must fail")
	assert.Contains(t, err.Error(), "is down")

	// Elect new leader (simulates Kafka controller)
	start := time.Now()
	newLeader, err := broker.ElectNewLeader(TopicLearnerActivity, 0)
	electionTime := time.Since(start)
	require.NoError(t, err)

	// Assert: New leader elected within 10 seconds
	assert.Less(t, electionTime, 10*time.Second, "leader election must complete within 10s")
	assert.NotEqual(t, originalLeader, newLeader, "new leader must be different from killed broker")
	assert.True(t, broker.IsBrokerAlive(newLeader), "new leader must be alive")

	// Assert: Producer reconnects and publishes successfully
	_, _, err = broker.Publish(TopicLearnerActivity, keyForPart0, []byte(`{"test":"recovered"}`))
	assert.NoError(t, err, "publishing must succeed after new leader election")

	// Publish more events after failover
	for i := 10; i < 20; i++ {
		evt := NewActivityEvent(
			"learner-failover",
			"session-fail",
			fmt.Sprintf("content-post-%d", i),
			[]string{"grammar.cases"},
			true,
			"none",
			i,
		)
		err := PublishActivityEvent(broker, evt)
		require.NoError(t, err)
	}

	// Assert: No events lost during failover (check consumer offset)
	// The 10 pre-failover events must still be readable
	allRecords := broker.ConsumeAll(TopicLearnerActivity, "failover-check-group")
	// We have: 10 initial + 1 recovered + 10 post-failover = at least 21
	// Plus potentially the "learner-failover" key publish that succeeded earlier
	assert.GreaterOrEqual(t, len(allRecords), 21,
		"must have at least 21 events (10 pre + 1 recovered + 10 post failover)")

	// Verify pre-failover events are intact
	preCount := 0
	for _, rec := range allRecords {
		var m map[string]interface{}
		if json.Unmarshal(rec.Value, &m) == nil {
			if cid, ok := m["content_id"].(string); ok && len(cid) > 12 && cid[:12] == "content-pre-" {
				preCount++
			}
		}
	}
	assert.Equal(t, 10, preCount, "all 10 pre-failover events must be preserved")
}

// partitionForTest mirrors the broker's internal partitioning logic for test setup.
func partitionForTest(key string, numPartitions int) int {
	return partitionFor(key, numPartitions)
}
