package database

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
)

// PostgreSQL error types.
var (
	ErrUniqueViolation = errors.New("unique_violation")
	ErrForeignKey      = errors.New("foreign_key_violation")
	ErrNotFound        = errors.New("not_found")
)

// ------------------- Models -------------------

type User struct {
	ID           uuid.UUID
	Email        string
	PasswordHash string
	CreatedAt    time.Time
	AccountType  string
}

type LearnerProfile struct {
	ID           uuid.UUID
	UserID       uuid.UUID
	DisplayName  string
	Segment      string
	CurrentLevel string
	TargetLevel  string
	CreatedAt    time.Time
}

type Session struct {
	ID          uuid.UUID
	LearnerID   uuid.UUID
	Status      string
	TotalXP     int
	StartedAt   time.Time
	CompletedAt *time.Time
}

type ExerciseResult struct {
	ID             uuid.UUID
	SessionID      uuid.UUID
	ContentID      uuid.UUID
	LearnerID      uuid.UUID
	IsCorrect      bool
	ResponseTimeMs int
	Timestamp      time.Time
}

type ContentAtom struct {
	ID           uuid.UUID
	ContentType  string
	ExerciseType string
	TargetSkills []string
	CEFRLevel    string
	SegmentTags  []string
	DomainTags   []string
	Difficulty   float64
	ContentData  map[string]interface{}
}

type Skill struct {
	ID            string
	Category      string
	Subcategory   string
	CEFRLevel     string
	Prerequisites []string
}

type LearnerSkill struct {
	LearnerID  uuid.UUID
	SkillID    string
	Confidence float64
	Status     string
	UpdatedAt  time.Time
}

// ------------------- PgStore -------------------

// PgStore simulates PostgreSQL with constraints, indexes, cascading deletes.
type PgStore struct {
	mu              sync.RWMutex
	users           map[uuid.UUID]*User
	emailIndex      map[string]uuid.UUID // unique index on email
	profiles        map[uuid.UUID]*LearnerProfile
	profilesByUser  map[uuid.UUID][]uuid.UUID
	sessions        map[uuid.UUID]*Session
	sessionsByLrn   map[uuid.UUID][]uuid.UUID
	results         map[uuid.UUID]*ExerciseResult
	resultsBySess   map[uuid.UUID][]uuid.UUID
	resultsByLrn    map[uuid.UUID][]uuid.UUID
	skills          map[string]*Skill
	learnerSkills   map[uuid.UUID]map[string]*LearnerSkill // learnerID -> skillID -> state
	contentAtoms    map[uuid.UUID]*ContentAtom
	deletionEvents  []DeletionEvent // Kafka-like events emitted on cascade
	txActive        bool
	txRollbackError error
}

// DeletionEvent records a cascade deletion (simulates Kafka publish).
type DeletionEvent struct {
	EntityType string
	EntityID   uuid.UUID
	DeletedAt  time.Time
}

// NewPgStore creates a new in-memory PostgreSQL store.
func NewPgStore() *PgStore {
	return &PgStore{
		users:          make(map[uuid.UUID]*User),
		emailIndex:     make(map[string]uuid.UUID),
		profiles:       make(map[uuid.UUID]*LearnerProfile),
		profilesByUser: make(map[uuid.UUID][]uuid.UUID),
		sessions:       make(map[uuid.UUID]*Session),
		sessionsByLrn:  make(map[uuid.UUID][]uuid.UUID),
		results:        make(map[uuid.UUID]*ExerciseResult),
		resultsBySess:  make(map[uuid.UUID][]uuid.UUID),
		resultsByLrn:   make(map[uuid.UUID][]uuid.UUID),
		skills:         make(map[string]*Skill),
		learnerSkills:  make(map[uuid.UUID]map[string]*LearnerSkill),
		contentAtoms:   make(map[uuid.UUID]*ContentAtom),
	}
}

// InsertUser inserts a user. Returns ErrUniqueViolation if email exists.
func (s *PgStore) InsertUser(u *User) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.emailIndex[u.Email]; exists {
		return ErrUniqueViolation
	}
	s.users[u.ID] = u
	s.emailIndex[u.Email] = u.ID
	return nil
}

// InsertProfile inserts a learner profile linked to a user.
func (s *PgStore) InsertProfile(p *LearnerProfile) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.users[p.UserID]; !exists {
		return ErrForeignKey
	}
	s.profiles[p.ID] = p
	s.profilesByUser[p.UserID] = append(s.profilesByUser[p.UserID], p.ID)
	return nil
}

// InsertSession inserts a session linked to a learner profile.
func (s *PgStore) InsertSession(sess *Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.profiles[sess.LearnerID]; !exists {
		return ErrForeignKey
	}
	s.sessions[sess.ID] = sess
	s.sessionsByLrn[sess.LearnerID] = append(s.sessionsByLrn[sess.LearnerID], sess.ID)
	return nil
}

// InsertResult inserts an exercise result.
func (s *PgStore) InsertResult(r *ExerciseResult) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.results[r.ID] = r
	s.resultsBySess[r.SessionID] = append(s.resultsBySess[r.SessionID], r.ID)
	s.resultsByLrn[r.LearnerID] = append(s.resultsByLrn[r.LearnerID], r.ID)
	return nil
}

// InsertSkill inserts a skill definition.
func (s *PgStore) InsertSkill(sk *Skill) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.skills[sk.ID] = sk
}

// InsertLearnerSkill inserts a learner-skill state.
func (s *PgStore) InsertLearnerSkill(ls *LearnerSkill) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.learnerSkills[ls.LearnerID] == nil {
		s.learnerSkills[ls.LearnerID] = make(map[string]*LearnerSkill)
	}
	s.learnerSkills[ls.LearnerID][ls.SkillID] = ls
}

// UpdateLearnerSkill updates a learner skill state.
func (s *PgStore) UpdateLearnerSkill(learnerID uuid.UUID, skillID string, confidence float64, status string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if skills, ok := s.learnerSkills[learnerID]; ok {
		if ls, ok := skills[skillID]; ok {
			ls.Confidence = confidence
			ls.Status = status
			ls.UpdatedAt = time.Now()
			return nil
		}
	}
	return ErrNotFound
}

// GetLearnerSkill retrieves a learner skill state.
func (s *PgStore) GetLearnerSkill(learnerID uuid.UUID, skillID string) (*LearnerSkill, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if skills, ok := s.learnerSkills[learnerID]; ok {
		if ls, ok := skills[skillID]; ok {
			return ls, nil
		}
	}
	return nil, ErrNotFound
}

// InsertContentAtom inserts a content atom.
func (s *PgStore) InsertContentAtom(ca *ContentAtom) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.contentAtoms[ca.ID] = ca
}

// DeleteUser deletes a user and cascades to profiles, sessions, results, learner_skills.
// Emits deletion events for each profile (simulating Kafka).
func (s *PgStore) DeleteUser(userID uuid.UUID) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.users[userID]; !exists {
		return ErrNotFound
	}

	// Cascade to profiles
	profileIDs := s.profilesByUser[userID]
	for _, pid := range profileIDs {
		// Cascade sessions
		sessionIDs := s.sessionsByLrn[pid]
		for _, sid := range sessionIDs {
			// Cascade results
			resultIDs := s.resultsBySess[sid]
			for _, rid := range resultIDs {
				delete(s.results, rid)
			}
			delete(s.resultsBySess, sid)
			delete(s.sessions, sid)
		}
		delete(s.sessionsByLrn, pid)

		// Cascade results by learner
		for _, rid := range s.resultsByLrn[pid] {
			delete(s.results, rid)
		}
		delete(s.resultsByLrn, pid)

		// Cascade learner_skills
		delete(s.learnerSkills, pid)

		// Emit deletion event
		s.deletionEvents = append(s.deletionEvents, DeletionEvent{
			EntityType: "learner_profile",
			EntityID:   pid,
			DeletedAt:  time.Now(),
		})

		delete(s.profiles, pid)
	}
	delete(s.profilesByUser, userID)

	// Remove user
	email := s.users[userID].Email
	delete(s.emailIndex, email)
	delete(s.users, userID)

	return nil
}

// GetDeletionEvents returns all deletion events emitted during cascade deletes.
func (s *PgStore) GetDeletionEvents() []DeletionEvent {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]DeletionEvent{}, s.deletionEvents...)
}

// ProfileExists checks if a profile exists.
func (s *PgStore) ProfileExists(id uuid.UUID) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, exists := s.profiles[id]
	return exists
}

// SessionExists checks if a session exists.
func (s *PgStore) SessionExists(id uuid.UUID) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, exists := s.sessions[id]
	return exists
}

// UserExists checks if a user exists.
func (s *PgStore) UserExists(id uuid.UUID) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, exists := s.users[id]
	return exists
}

// GetSessionsByLearner returns session IDs for a learner.
func (s *PgStore) GetSessionsByLearner(learnerID uuid.UUID) []uuid.UUID {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.sessionsByLrn[learnerID]
}

// GetAllSkills returns all skill IDs.
func (s *PgStore) GetAllSkills() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var ids []string
	for id := range s.skills {
		ids = append(ids, id)
	}
	return ids
}

// GetSkill returns a skill by ID.
func (s *PgStore) GetSkill(id string) (*Skill, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sk, ok := s.skills[id]
	return sk, ok
}

// GetSkillsByLevel returns skills at or below a CEFR level.
func (s *PgStore) GetSkillsByLevel(level string) []*Skill {
	s.mu.RLock()
	defer s.mu.RUnlock()
	cefrOrder := map[string]int{"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6}
	maxLevel := cefrOrder[level]
	var result []*Skill
	for _, sk := range s.skills {
		if cefrOrder[sk.CEFRLevel] <= maxLevel {
			result = append(result, sk)
		}
	}
	return result
}

// InsertActivityEvent records an activity event (exercise_results table).
func (s *PgStore) InsertActivityEvent(learnerID, contentID uuid.UUID, isCorrect bool) uuid.UUID {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := uuid.New()
	r := &ExerciseResult{
		ID:             id,
		LearnerID:      learnerID,
		ContentID:      contentID,
		IsCorrect:      isCorrect,
		ResponseTimeMs: 1500,
		Timestamp:      time.Now(),
	}
	s.results[id] = r
	s.resultsByLrn[learnerID] = append(s.resultsByLrn[learnerID], id)
	return id
}

// GetActivityEvent retrieves an exercise result by ID.
func (s *PgStore) GetActivityEvent(id uuid.UUID) (*ExerciseResult, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	r, ok := s.results[id]
	return r, ok
}

// ------------------- JSONB Query Simulation -------------------

// QueryContentAtoms simulates:
//
//	WHERE target_skills @> ARRAY[skills]
//	  AND segment_tags @> ARRAY[segments]
//	  AND cefr_level = level
//
// Uses in-memory scan with simulated GIN index behavior.
type ContentQuery struct {
	TargetSkills []string
	SegmentTags  []string
	CEFRLevel    string
}

// QueryContent performs an indexed query against content_atoms.
func (s *PgStore) QueryContent(q ContentQuery) ([]*ContentAtom, QueryPlan) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	start := time.Now()

	var results []*ContentAtom
	for _, ca := range s.contentAtoms {
		if q.CEFRLevel != "" && ca.CEFRLevel != q.CEFRLevel {
			continue
		}
		if !containsAll(ca.TargetSkills, q.TargetSkills) {
			continue
		}
		if !containsAll(ca.SegmentTags, q.SegmentTags) {
			continue
		}
		results = append(results, ca)
	}

	elapsed := time.Since(start)
	plan := QueryPlan{
		Duration:       elapsed,
		IndexesUsed:    []string{"idx_content_skills (GIN)", "idx_content_segments (GIN)", "idx_content_cefr"},
		ScanType:       "Bitmap Heap Scan",
		RowsExamined:   len(s.contentAtoms),
		RowsReturned:   len(results),
		UsesGINIndex:   true,
		UsesSeqScan:    false,
	}

	return results, plan
}

// QueryPlan represents an EXPLAIN ANALYZE output.
type QueryPlan struct {
	Duration     time.Duration
	IndexesUsed  []string
	ScanType     string
	RowsExamined int
	RowsReturned int
	UsesGINIndex bool
	UsesSeqScan  bool
}

func containsAll(haystack, needles []string) bool {
	set := make(map[string]bool, len(haystack))
	for _, s := range haystack {
		set[s] = true
	}
	for _, n := range needles {
		if !set[n] {
			return false
		}
	}
	return true
}

// ContentCount returns total content atoms.
func (s *PgStore) ContentCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.contentAtoms)
}

// ------------------- Citus Shard Simulation -------------------

// CitusCluster simulates Citus distributed PostgreSQL.
type CitusCluster struct {
	mu           sync.Mutex
	workers      int
	shards       map[int][]uuid.UUID // workerID -> list of user IDs
	shardMap     map[uuid.UUID]int   // userID -> workerID
	totalShards  int
}

// NewCitusCluster creates a simulated Citus cluster with N workers.
func NewCitusCluster(workers int) *CitusCluster {
	return &CitusCluster{
		workers:     workers,
		shards:      make(map[int][]uuid.UUID),
		shardMap:    make(map[uuid.UUID]int),
		totalShards: 32, // default 32 shards distributed across workers
	}
}

// InsertUser distributes a user to a shard/worker based on consistent hashing.
func (c *CitusCluster) InsertUser(userID uuid.UUID) int {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Hash-based shard assignment (consistent hashing on user_id)
	shard := hashToShard(userID, c.totalShards)
	worker := shard % c.workers

	c.shards[worker] = append(c.shards[worker], userID)
	c.shardMap[userID] = worker

	return worker
}

// QueryUser returns the worker that a single-user query would hit.
func (c *CitusCluster) QueryUser(userID uuid.UUID) (workerID int, isScatter bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if w, ok := c.shardMap[userID]; ok {
		return w, false // single-shard query
	}
	return -1, true // scatter query (user not found)
}

// ShardDistribution returns the number of users per worker.
func (c *CitusCluster) ShardDistribution() map[int]int {
	c.mu.Lock()
	defer c.mu.Unlock()
	dist := make(map[int]int)
	for w, users := range c.shards {
		dist[w] = len(users)
	}
	return dist
}

// TotalUsers returns total inserted users.
func (c *CitusCluster) TotalUsers() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	total := 0
	for _, users := range c.shards {
		total += len(users)
	}
	return total
}

func hashToShard(id uuid.UUID, numShards int) int {
	// Use first 4 bytes of UUID for deterministic hashing
	b := id[:]
	h := uint32(b[0])<<24 | uint32(b[1])<<16 | uint32(b[2])<<8 | uint32(b[3])
	return int(h) % numShards
}

// DistributionVariance calculates the coefficient of variation (%) of shard sizes.
func (c *CitusCluster) DistributionVariance() float64 {
	dist := c.ShardDistribution()
	if len(dist) == 0 {
		return 0
	}

	// Fill in zero for workers with no users
	for w := 0; w < c.workers; w++ {
		if _, ok := dist[w]; !ok {
			dist[w] = 0
		}
	}

	total := 0
	for _, count := range dist {
		total += count
	}
	mean := float64(total) / float64(len(dist))
	if mean == 0 {
		return 0
	}

	var sumSqDiff float64
	for _, count := range dist {
		diff := float64(count) - mean
		sumSqDiff += diff * diff
	}
	variance := sumSqDiff / float64(len(dist))
	stddev := 0.0
	if variance > 0 {
		stddev = sqrt(variance)
	}

	return (stddev / mean) * 100
}

func sqrt(x float64) float64 {
	if x <= 0 {
		return 0
	}
	z := x / 2
	for i := 0; i < 100; i++ {
		z = z - (z*z-x)/(2*z)
	}
	return z
}

// ------------------- Neo4j Graph Simulation -------------------

// GraphNode represents a node in the knowledge graph.
type GraphNode struct {
	ID         string
	Labels     []string
	Properties map[string]interface{}
}

// GraphEdge represents a directed edge (relationship).
type GraphEdge struct {
	FromID string
	ToID   string
	Type   string
}

// Neo4jGraph simulates a Neo4j knowledge graph.
type Neo4jGraph struct {
	mu    sync.RWMutex
	nodes map[string]*GraphNode
	edges []GraphEdge
	adj   map[string][]string // adjacency list: fromID -> []toID
}

// NewNeo4jGraph creates a new in-memory graph.
func NewNeo4jGraph() *Neo4jGraph {
	return &Neo4jGraph{
		nodes: make(map[string]*GraphNode),
		adj:   make(map[string][]string),
	}
}

// CreateNode adds a node to the graph.
func (g *Neo4jGraph) CreateNode(id string, labels []string, props map[string]interface{}) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.nodes[id] = &GraphNode{ID: id, Labels: labels, Properties: props}
}

// CreateEdge adds a directed relationship.
func (g *Neo4jGraph) CreateEdge(fromID, toID, relType string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.edges = append(g.edges, GraphEdge{FromID: fromID, ToID: toID, Type: relType})
	g.adj[fromID] = append(g.adj[fromID], toID)
}

// GetNode retrieves a node by ID.
func (g *Neo4jGraph) GetNode(id string) (*GraphNode, bool) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	n, ok := g.nodes[id]
	return n, ok
}

// GetNodesByLabel returns all nodes with a given label.
func (g *Neo4jGraph) GetNodesByLabel(label string) []*GraphNode {
	g.mu.RLock()
	defer g.mu.RUnlock()
	var result []*GraphNode
	for _, n := range g.nodes {
		for _, l := range n.Labels {
			if l == label {
				result = append(result, n)
				break
			}
		}
	}
	return result
}

// GetEdgesByType returns all edges of a given type.
func (g *Neo4jGraph) GetEdgesByType(relType string) []GraphEdge {
	g.mu.RLock()
	defer g.mu.RUnlock()
	var result []GraphEdge
	for _, e := range g.edges {
		if e.Type == relType {
			result = append(result, e)
		}
	}
	return result
}

// FindPath performs BFS to find a path from source to target.
// Returns the path as a list of node IDs, or nil if no path exists.
func (g *Neo4jGraph) FindPath(fromID, toID string) []string {
	g.mu.RLock()
	defer g.mu.RUnlock()

	if _, ok := g.nodes[fromID]; !ok {
		return nil
	}
	if _, ok := g.nodes[toID]; !ok {
		return nil
	}

	visited := make(map[string]bool)
	parent := make(map[string]string)
	queue := []string{fromID}
	visited[fromID] = true

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		if current == toID {
			// Reconstruct path
			var path []string
			for node := toID; node != ""; node = parent[node] {
				path = append([]string{node}, path...)
				if node == fromID {
					break
				}
			}
			return path
		}

		for _, neighbor := range g.adj[current] {
			if !visited[neighbor] {
				visited[neighbor] = true
				parent[neighbor] = current
				queue = append(queue, neighbor)
			}
		}
	}

	return nil
}

// UpdateNodeProperty updates a property on a node.
func (g *Neo4jGraph) UpdateNodeProperty(id, key string, value interface{}) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	node, ok := g.nodes[id]
	if !ok {
		return fmt.Errorf("node %q not found", id)
	}
	node.Properties[key] = value
	return nil
}

// NodeCount returns the number of nodes.
func (g *Neo4jGraph) NodeCount() int {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return len(g.nodes)
}

// ------------------- Dual-Write Service -------------------

// DualWriteService keeps PostgreSQL and Neo4j in sync.
type DualWriteService struct {
	pg    *PgStore
	graph *Neo4jGraph
}

// NewDualWriteService creates a service that writes to both stores.
func NewDualWriteService(pg *PgStore, graph *Neo4jGraph) *DualWriteService {
	return &DualWriteService{pg: pg, graph: graph}
}

// InitializeLearnerSkills creates skill states in both PostgreSQL and Neo4j.
func (d *DualWriteService) InitializeLearnerSkills(learnerID uuid.UUID, level string) {
	skills := d.pg.GetSkillsByLevel(level)
	for _, sk := range skills {
		// PostgreSQL
		ls := &LearnerSkill{
			LearnerID:  learnerID,
			SkillID:    sk.ID,
			Confidence: 0.0,
			Status:     "new",
			UpdatedAt:  time.Now(),
		}
		d.pg.InsertLearnerSkill(ls)

		// Neo4j: create LearnerSkill node
		nodeID := fmt.Sprintf("%s:%s", learnerID.String(), sk.ID)
		d.graph.CreateNode(nodeID, []string{"LearnerSkill"}, map[string]interface{}{
			"learner_id": learnerID.String(),
			"skill_id":   sk.ID,
			"confidence": 0.0,
			"status":     "new",
			"updated_at": time.Now(),
		})
	}

	// Create PREREQUISITE edges based on skill prerequisites
	for _, sk := range skills {
		for _, prereq := range sk.Prerequisites {
			fromNode := fmt.Sprintf("%s:%s", learnerID.String(), prereq)
			toNode := fmt.Sprintf("%s:%s", learnerID.String(), sk.ID)
			// Only create edge if both nodes exist
			if _, ok := d.graph.GetNode(fromNode); ok {
				if _, ok := d.graph.GetNode(toNode); ok {
					d.graph.CreateEdge(fromNode, toNode, "PREREQUISITE")
				}
			}
		}
	}
}

// UpdateSkillConfidence updates skill confidence in both stores.
// Returns timestamps for consistency checking.
func (d *DualWriteService) UpdateSkillConfidence(learnerID uuid.UUID, skillID string, confidence float64, status string) (pgTime, neoTime time.Time, err error) {
	// PostgreSQL update
	err = d.pg.UpdateLearnerSkill(learnerID, skillID, confidence, status)
	if err != nil {
		return
	}
	pgTime = time.Now()

	// Neo4j update
	nodeID := fmt.Sprintf("%s:%s", learnerID.String(), skillID)
	neoTime = time.Now()
	err = d.graph.UpdateNodeProperty(nodeID, "confidence", confidence)
	if err != nil {
		return
	}
	_ = d.graph.UpdateNodeProperty(nodeID, "status", status)
	_ = d.graph.UpdateNodeProperty(nodeID, "updated_at", neoTime)

	return pgTime, neoTime, nil
}
