package database

import (
	"fmt"
	"math"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ============================================================
// TC-DB-001: User Creation with Unique Constraint
// ============================================================

func TestUserCreationWithUniqueConstraint(t *testing.T) {
	pg := NewPgStore()

	user1 := &User{
		ID:           uuid.New(),
		Email:        "test@test.com",
		PasswordHash: "$2a$10$hash1",
		CreatedAt:    time.Now(),
		AccountType:  "free",
	}

	// First insert succeeds
	err := pg.InsertUser(user1)
	assert.NoError(t, err, "first insert must succeed")

	// Second insert with same email fails with unique_violation
	user2 := &User{
		ID:           uuid.New(),
		Email:        "test@test.com",
		PasswordHash: "$2a$10$hash2",
		CreatedAt:    time.Now(),
		AccountType:  "free",
	}
	err = pg.InsertUser(user2)
	assert.Error(t, err)
	assert.ErrorIs(t, err, ErrUniqueViolation,
		"second insert must fail with unique_violation")

	// Transaction rolls back cleanly — only one user exists
	assert.True(t, pg.UserExists(user1.ID), "original user must still exist")
	assert.False(t, pg.UserExists(user2.ID), "duplicate user must not exist")
}

// ============================================================
// TC-DB-002: Learner Profile Cascade Deletion
// ============================================================

func TestLearnerProfileCascadeDeletion(t *testing.T) {
	pg := NewPgStore()

	// Create user with 2 learner profiles
	user := &User{
		ID:           uuid.New(),
		Email:        "cascade@test.com",
		PasswordHash: "$2a$10$hash",
		CreatedAt:    time.Now(),
		AccountType:  "free",
	}
	require.NoError(t, pg.InsertUser(user))

	profile1 := &LearnerProfile{
		ID: uuid.New(), UserID: user.ID,
		DisplayName: "Profile 1", Segment: "kid", CurrentLevel: "A1", TargetLevel: "B1",
		CreatedAt: time.Now(),
	}
	profile2 := &LearnerProfile{
		ID: uuid.New(), UserID: user.ID,
		DisplayName: "Profile 2", Segment: "teen", CurrentLevel: "A1", TargetLevel: "B2",
		CreatedAt: time.Now(),
	}
	require.NoError(t, pg.InsertProfile(profile1))
	require.NoError(t, pg.InsertProfile(profile2))

	// Create session history for each profile
	sessions := make([]uuid.UUID, 4)
	for i := 0; i < 2; i++ {
		sess := &Session{
			ID: uuid.New(), LearnerID: profile1.ID,
			Status: "completed", StartedAt: time.Now(),
		}
		sessions[i] = sess.ID
		require.NoError(t, pg.InsertSession(sess))
	}
	for i := 2; i < 4; i++ {
		sess := &Session{
			ID: uuid.New(), LearnerID: profile2.ID,
			Status: "completed", StartedAt: time.Now(),
		}
		sessions[i] = sess.ID
		require.NoError(t, pg.InsertSession(sess))
	}

	// Verify data exists before deletion
	assert.True(t, pg.ProfileExists(profile1.ID))
	assert.True(t, pg.ProfileExists(profile2.ID))
	for _, sid := range sessions {
		assert.True(t, pg.SessionExists(sid))
	}

	// DELETE user
	err := pg.DeleteUser(user.ID)
	require.NoError(t, err)

	// Assert: Both learner_profiles deleted
	assert.False(t, pg.ProfileExists(profile1.ID), "profile1 must be cascade-deleted")
	assert.False(t, pg.ProfileExists(profile2.ID), "profile2 must be cascade-deleted")

	// Assert: All session records for those profiles deleted
	for _, sid := range sessions {
		assert.False(t, pg.SessionExists(sid), "session %s must be cascade-deleted", sid)
	}

	// Assert: Kafka deletion event published for each profile
	events := pg.GetDeletionEvents()
	assert.Len(t, events, 2, "must emit 2 deletion events (one per profile)")
	profileIDs := map[uuid.UUID]bool{}
	for _, e := range events {
		assert.Equal(t, "learner_profile", e.EntityType)
		profileIDs[e.EntityID] = true
	}
	assert.True(t, profileIDs[profile1.ID], "deletion event for profile1")
	assert.True(t, profileIDs[profile2.ID], "deletion event for profile2")
}

// ============================================================
// TC-DB-003: Neo4j Knowledge Graph Creation
// ============================================================

func TestNeo4jKnowledgeGraphCreation(t *testing.T) {
	pg := NewPgStore()
	graph := NewNeo4jGraph()
	svc := NewDualWriteService(pg, graph)

	// Seed skills with prerequisites (simulating the migration data)
	a1Skills := []struct {
		id     string
		prereq []string
	}{
		{"script.cyrillic.cognates", nil},
		{"script.cyrillic.false_friends", []string{"script.cyrillic.cognates"}},
		{"script.cyrillic.unique", []string{"script.cyrillic.cognates"}},
		{"script.cyrillic.reading", []string{"script.cyrillic.cognates", "script.cyrillic.false_friends", "script.cyrillic.unique"}},
		{"phonetics.vowels.basic", nil},
		{"phonetics.consonants.voiced_voiceless", nil},
		{"grammar.cases.nominative.singular", []string{"script.cyrillic.reading"}},
		{"grammar.cases.nominative.plural", []string{"grammar.cases.nominative.singular"}},
		{"grammar.cases.accusative.inanimate", []string{"grammar.cases.nominative.singular"}},
		{"grammar.cases.prepositional.location", []string{"grammar.cases.nominative.singular"}},
		{"grammar.verbs.present.first_conj", []string{"script.cyrillic.reading"}},
		{"vocab.greetings", nil},
		{"vocab.numbers.1_20", nil},
		{"vocab.family", nil},
		// Add genitive to enable path query test
		{"grammar.cases.genitive.singular", []string{"grammar.cases.accusative.inanimate"}},
		{"grammar.cases.genitive.plural", []string{"grammar.cases.genitive.singular"}},
	}
	for _, sk := range a1Skills {
		pg.InsertSkill(&Skill{
			ID:            sk.id,
			Category:      "grammar",
			Subcategory:   "cases",
			CEFRLevel:     "A1",
			Prerequisites: sk.prereq,
		})
	}

	// Create learner profile via API simulation
	learnerID := uuid.New()
	svc.InitializeLearnerSkills(learnerID, "A1")

	// Assert: Neo4j contains LearnerSkill nodes for all A1 skills
	lsNodes := graph.GetNodesByLabel("LearnerSkill")
	assert.Equal(t, len(a1Skills), len(lsNodes),
		"graph must contain LearnerSkill nodes for all A1 skills")

	// Assert: All LearnerSkill nodes have confidence=0.0, status="new"
	for _, node := range lsNodes {
		conf, ok := node.Properties["confidence"].(float64)
		require.True(t, ok, "confidence must be float64")
		assert.Equal(t, 0.0, conf, "initial confidence must be 0.0 for node %s", node.ID)

		status, ok := node.Properties["status"].(string)
		require.True(t, ok, "status must be string")
		assert.Equal(t, "new", status, "initial status must be 'new' for node %s", node.ID)
	}

	// Assert: PREREQUISITE edges exist between dependent skills
	prereqEdges := graph.GetEdgesByType("PREREQUISITE")
	assert.Greater(t, len(prereqEdges), 0, "must have PREREQUISITE edges")

	// Count expected edges
	expectedEdges := 0
	for _, sk := range a1Skills {
		expectedEdges += len(sk.prereq)
	}
	assert.Equal(t, expectedEdges, len(prereqEdges),
		"must have exactly %d PREREQUISITE edges", expectedEdges)

	// Assert: Graph is queryable: MATCH path from "alphabet" (cognates) to "genitive.plural"
	fromNode := fmt.Sprintf("%s:%s", learnerID.String(), "script.cyrillic.cognates")
	toNode := fmt.Sprintf("%s:%s", learnerID.String(), "grammar.cases.genitive.plural")
	path := graph.FindPath(fromNode, toNode)
	require.NotNil(t, path, "must find path from alphabet to genitive.plural")
	assert.GreaterOrEqual(t, len(path), 3, "path must traverse at least 3 nodes")

	// Verify path makes sense (starts at cognates, ends at genitive.plural)
	assert.Equal(t, fromNode, path[0], "path must start at cognates")
	assert.Equal(t, toNode, path[len(path)-1], "path must end at genitive.plural")
}

// ============================================================
// TC-DB-004: Neo4j + PostgreSQL Consistency
// ============================================================

func TestNeo4jPostgreSQLConsistency(t *testing.T) {
	pg := NewPgStore()
	graph := NewNeo4jGraph()
	svc := NewDualWriteService(pg, graph)

	// Setup: seed a skill and create learner
	pg.InsertSkill(&Skill{
		ID: "grammar.cases.genitive.singular", Category: "grammar",
		Subcategory: "cases", CEFRLevel: "A2",
	})

	learnerID := uuid.New()
	svc.InitializeLearnerSkills(learnerID, "A2")

	// Record an activity event in PostgreSQL
	contentID := uuid.New()
	eventID := pg.InsertActivityEvent(learnerID, contentID, true)

	// Assert: PostgreSQL activity_events table has the event
	evt, found := pg.GetActivityEvent(eventID)
	require.True(t, found, "activity event must exist in PostgreSQL")
	assert.Equal(t, learnerID, evt.LearnerID)
	assert.True(t, evt.IsCorrect)
	pgTimestamp := evt.Timestamp

	// Update skill confidence via exercise completion
	newConfidence := 0.75
	pgTime, neoTime, err := svc.UpdateSkillConfidence(
		learnerID, "grammar.cases.genitive.singular", newConfidence, "learning",
	)
	require.NoError(t, err)

	// Assert: PostgreSQL has updated confidence
	pgSkill, err := pg.GetLearnerSkill(learnerID, "grammar.cases.genitive.singular")
	require.NoError(t, err)
	assert.Equal(t, newConfidence, pgSkill.Confidence)
	assert.Equal(t, "learning", pgSkill.Status)

	// Assert: Neo4j LearnerSkill node has updated confidence
	nodeID := fmt.Sprintf("%s:%s", learnerID.String(), "grammar.cases.genitive.singular")
	node, ok := graph.GetNode(nodeID)
	require.True(t, ok, "Neo4j node must exist")
	assert.Equal(t, newConfidence, node.Properties["confidence"],
		"Neo4j confidence must match PostgreSQL")
	assert.Equal(t, "learning", node.Properties["status"],
		"Neo4j status must match PostgreSQL")

	// Assert: Timestamps match within 2 second tolerance
	assert.WithinDuration(t, pgTime, neoTime, 2*time.Second,
		"PG and Neo4j update timestamps must be within 2s")

	// Also verify the activity event timestamp is reasonable
	assert.WithinDuration(t, pgTimestamp, time.Now(), 5*time.Second,
		"activity event timestamp must be recent")
}

// ============================================================
// TC-DB-005: Citus Shard Distribution
// ============================================================

func TestCitusShardDistribution(t *testing.T) {
	// Precondition: 4 Citus worker nodes, distribution column = user_id
	cluster := NewCitusCluster(4)

	// Insert 10,000 users
	for i := 0; i < 10000; i++ {
		userID := uuid.New()
		cluster.InsertUser(userID)
	}

	assert.Equal(t, 10000, cluster.TotalUsers())

	// Assert: Shards distributed across all 4 workers
	dist := cluster.ShardDistribution()
	for w := 0; w < 4; w++ {
		assert.Greater(t, dist[w], 0,
			"worker %d must have at least one user", w)
	}

	// Assert: Variance in shard sizes < 20%
	cv := cluster.DistributionVariance()
	assert.Less(t, cv, 20.0,
		"coefficient of variation must be < 20%%, got %.1f%%", cv)

	// Log distribution for visibility
	t.Logf("Shard distribution across 4 workers:")
	for w := 0; w < 4; w++ {
		t.Logf("  Worker %d: %d users (%.1f%%)", w, dist[w], float64(dist[w])/100.0)
	}
	t.Logf("  Coefficient of variation: %.1f%%", cv)

	// Assert: Query for single user hits only 1 worker (no scatter)
	testUser := uuid.New()
	cluster.InsertUser(testUser)

	workerID, isScatter := cluster.QueryUser(testUser)
	assert.False(t, isScatter, "single-user query must not scatter")
	assert.GreaterOrEqual(t, workerID, 0, "must route to a valid worker")
	assert.Less(t, workerID, 4, "must route to a valid worker (0-3)")
}

// ============================================================
// TC-DB-006: JSONB Content Data Query Performance
// ============================================================

func TestJSONBContentDataQueryPerformance(t *testing.T) {
	pg := NewPgStore()

	// Precondition: 100,000 content_atoms with JSONB content_data
	cefrLevels := []string{"A1", "A2", "B1", "B2", "C1"}
	segments := []string{"toddler", "kid", "teen", "uni_prep", "migrant", "senior"}
	skillPrefixes := []string{
		"grammar.cases.genitive", "grammar.cases.dative", "grammar.cases.accusative",
		"grammar.verbs.present", "grammar.verbs.past", "grammar.verbs.aspect",
		"vocab.greetings", "vocab.food", "vocab.family", "vocab.colors",
		"phonetics.vowels", "phonetics.consonants", "phonetics.stress",
	}

	for i := 0; i < 100000; i++ {
		skills := []string{skillPrefixes[i%len(skillPrefixes)]}
		if i%7 == 0 {
			skills = append(skills, skillPrefixes[(i+3)%len(skillPrefixes)])
		}

		segTags := []string{segments[i%len(segments)]}
		if i%5 == 0 {
			segTags = append(segTags, segments[(i+1)%len(segments)])
		}

		ca := &ContentAtom{
			ID:           uuid.New(),
			ContentType:  "exercise",
			ExerciseType: "multiple_choice",
			TargetSkills: skills,
			CEFRLevel:    cefrLevels[i%len(cefrLevels)],
			SegmentTags:  segTags,
			DomainTags:   []string{"general"},
			Difficulty:   float64(i%100) / 100.0,
			ContentData: map[string]interface{}{
				"prompt":  fmt.Sprintf("Question %d", i),
				"options": []string{"a", "b", "c", "d"},
				"answer":  "a",
			},
		}
		pg.InsertContentAtom(ca)
	}

	assert.Equal(t, 100000, pg.ContentCount())

	// Query: WHERE target_skills @> ARRAY['grammar.cases.genitive']
	//        AND segment_tags @> ARRAY['uni_prep']
	//        AND cefr_level = 'B1'
	results, plan := pg.QueryContent(ContentQuery{
		TargetSkills: []string{"grammar.cases.genitive"},
		SegmentTags:  []string{"uni_prep"},
		CEFRLevel:    "B1",
	})

	// Assert: Query returns results
	assert.Greater(t, len(results), 0, "query must return results")
	t.Logf("Query returned %d results from %d content atoms", len(results), pg.ContentCount())

	// Assert: Query completes in < 50ms
	assert.Less(t, plan.Duration.Milliseconds(), int64(50),
		"query must complete in < 50ms, took %v", plan.Duration)

	// Assert: GIN index on target_skills and segment_tags is used (EXPLAIN ANALYZE)
	assert.True(t, plan.UsesGINIndex, "query plan must use GIN index")
	assert.False(t, plan.UsesSeqScan, "query plan must NOT use sequential scan")
	assert.Contains(t, plan.IndexesUsed, "idx_content_skills (GIN)",
		"must use GIN index on target_skills")
	assert.Contains(t, plan.IndexesUsed, "idx_content_segments (GIN)",
		"must use GIN index on segment_tags")

	// Verify result correctness
	for _, r := range results {
		assert.Equal(t, "B1", r.CEFRLevel)
		assert.True(t, containsAll(r.TargetSkills, []string{"grammar.cases.genitive"}))
		assert.True(t, containsAll(r.SegmentTags, []string{"uni_prep"}))
	}

	t.Logf("EXPLAIN ANALYZE: scan=%s, indexes=%v, rows_examined=%d, rows_returned=%d, duration=%v",
		plan.ScanType, plan.IndexesUsed, plan.RowsExamined, plan.RowsReturned, plan.Duration)
}

// Helper to suppress unused import warning
func init() {
	_ = math.Abs
}
