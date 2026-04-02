// Dev server: in-memory API for UI testing without PostgreSQL.
// Run: go run ./cmd/devserver
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

const jwtSecret = "dev-secret-change-in-production"

// ============================================================
// In-Memory Data Store
// ============================================================

type MemStore struct {
	mu             sync.RWMutex
	users          map[uuid.UUID]*User
	emailIndex     map[string]uuid.UUID
	profiles       map[uuid.UUID]*LearnerProfile
	profilesByUser map[uuid.UUID][]uuid.UUID
	skills         []Skill
	learnerSkills  map[uuid.UUID][]LearnerSkillState
	content        []ContentAtom
	sessions       map[uuid.UUID]*Session
	sessionItems   map[uuid.UUID][]SessionItem
	results        map[uuid.UUID][]ExerciseResult
	streaks        map[uuid.UUID]*LearnerStats
}

type User struct {
	ID           uuid.UUID   `json:"id"`
	Email        string      `json:"email"`
	PasswordHash string      `json:"-"`
	CreatedAt    time.Time   `json:"createdAt"`
	LastLogin    *time.Time  `json:"lastLogin"`
	AccountType  string      `json:"accountType"`
	Locale       string      `json:"locale"`
}

type LearnerProfile struct {
	ID             uuid.UUID `json:"id"`
	UserID         uuid.UUID `json:"userId"`
	DisplayName    string    `json:"displayName"`
	Segment        string    `json:"segment"`
	NativeLanguage string    `json:"nativeLanguage"`
	Domain         string    `json:"domain"`
	CurrentLevel   string    `json:"currentLevel"`
	TargetLevel    string    `json:"targetLevel"`
	WeeklyHours    float64   `json:"weeklyHours"`
	CreatedAt      time.Time `json:"createdAt"`
}

type Skill struct {
	SkillID       string `json:"skillId"`
	Category      string `json:"category"`
	Subcategory   string `json:"subcategory"`
	CEFRLevel     string `json:"cefrLevel"`
	DisplayNameEn string `json:"displayNameEn"`
	DisplayNameRu string `json:"displayNameRu"`
}

type LearnerSkillState struct {
	LearnerID     string     `json:"learnerId"`
	SkillID       string     `json:"skillId"`
	Confidence    float64    `json:"confidence"`
	Stability     float64    `json:"stability"`
	Difficulty    float64    `json:"difficulty"`
	LastReviewed  *time.Time `json:"lastReviewed"`
	NextReviewDue *time.Time `json:"nextReviewDue"`
	TotalAttempts int        `json:"totalAttempts"`
	CorrectStreak int        `json:"correctStreak"`
	ErrorCount    int        `json:"errorCount"`
	ErrorTypes    []string   `json:"errorTypes"`
	Status        string     `json:"status"`
	Reps          int        `json:"reps"`
	Lapses        int        `json:"lapses"`
}

type ContentAtom struct {
	ID            uuid.UUID       `json:"id"`
	ContentType   string          `json:"contentType"`
	ExerciseType  *string         `json:"exerciseType"`
	TargetSkills  []string        `json:"targetSkills"`
	CEFRLevel     string          `json:"cefrLevel"`
	SegmentTags   []string        `json:"segmentTags"`
	DomainTags    []string        `json:"domainTags"`
	Difficulty    float64         `json:"difficulty"`
	EstimatedTime int             `json:"estimatedTime"`
	ContentData   json.RawMessage `json:"contentData"`
	MediaRefs     []string        `json:"mediaRefs"`
	CreatedAt     time.Time       `json:"createdAt"`
	QualityScore  float64         `json:"qualityScore"`
	UsageCount    int             `json:"usageCount"`
}

type Session struct {
	ID           uuid.UUID  `json:"id"`
	LearnerID    uuid.UUID  `json:"learnerId"`
	Status       string     `json:"status"`
	CurrentIndex int        `json:"currentIndex"`
	TotalXP      int        `json:"totalXp"`
	StartedAt    time.Time  `json:"startedAt"`
	CompletedAt  *time.Time `json:"completedAt"`
	Duration     int        `json:"duration"`
	AccuracyRate float64    `json:"accuracyRate"`
}

type SessionItem struct {
	ID        uuid.UUID `json:"id"`
	SessionID uuid.UUID `json:"sessionId"`
	Position  int       `json:"position"`
	ContentID uuid.UUID `json:"contentId"`
	SkillID   string    `json:"skillId"`
	Role      string    `json:"role"`
	Completed bool      `json:"completed"`
}

type SessionItemWithContent struct {
	SessionItem
	Content *ContentAtom `json:"content,omitempty"`
}

type ExerciseResult struct {
	ContentID      uuid.UUID `json:"contentId"`
	Response       string    `json:"response"`
	CorrectAnswer  string    `json:"correctAnswer"`
	IsCorrect      bool      `json:"isCorrect"`
	ErrorType      *string   `json:"errorType"`
	ResponseTimeMs int       `json:"responseTimeMs"`
	HintLevelUsed  int       `json:"hintLevelUsed"`
	XPEarned       int       `json:"xpEarned"`
	Timestamp      time.Time `json:"timestamp"`
}

type LearnerStats struct {
	LearnerID     uuid.UUID `json:"learnerId"`
	CurrentStreak int       `json:"currentStreak"`
	LongestStreak int       `json:"longestStreak"`
	TotalSessions int       `json:"totalSessions"`
	TotalXP       int       `json:"totalXp"`
	CurrentLevel  int       `json:"currentLevel"`
}

func NewMemStore() *MemStore {
	return &MemStore{
		users:          make(map[uuid.UUID]*User),
		emailIndex:     make(map[string]uuid.UUID),
		profiles:       make(map[uuid.UUID]*LearnerProfile),
		profilesByUser: make(map[uuid.UUID][]uuid.UUID),
		learnerSkills:  make(map[uuid.UUID][]LearnerSkillState),
		sessions:       make(map[uuid.UUID]*Session),
		sessionItems:   make(map[uuid.UUID][]SessionItem),
		results:        make(map[uuid.UUID][]ExerciseResult),
		streaks:        make(map[uuid.UUID]*LearnerStats),
	}
}

// ============================================================
// Seed Data
// ============================================================

func (s *MemStore) Seed() {
	s.skills = []Skill{
		{SkillID: "grammar.alphabet.cyrillic", Category: "grammar", Subcategory: "alphabet", CEFRLevel: "A1", DisplayNameEn: "Cyrillic Alphabet", DisplayNameRu: "Кириллица"},
		{SkillID: "grammar.nouns.gender", Category: "grammar", Subcategory: "nouns", CEFRLevel: "A1", DisplayNameEn: "Noun Gender", DisplayNameRu: "Род существительных"},
		{SkillID: "grammar.cases.nominative", Category: "grammar", Subcategory: "cases", CEFRLevel: "A1", DisplayNameEn: "Nominative Case", DisplayNameRu: "Именительный падеж"},
		{SkillID: "grammar.verbs.present", Category: "grammar", Subcategory: "verbs", CEFRLevel: "A1", DisplayNameEn: "Present Tense", DisplayNameRu: "Настоящее время"},
		{SkillID: "grammar.cases.accusative", Category: "grammar", Subcategory: "cases", CEFRLevel: "A2", DisplayNameEn: "Accusative Case", DisplayNameRu: "Винительный падеж"},
		{SkillID: "grammar.cases.genitive", Category: "grammar", Subcategory: "cases", CEFRLevel: "A2", DisplayNameEn: "Genitive Case", DisplayNameRu: "Родительный падеж"},
		{SkillID: "grammar.cases.prepositional", Category: "grammar", Subcategory: "cases", CEFRLevel: "A2", DisplayNameEn: "Prepositional Case", DisplayNameRu: "Предложный падеж"},
		{SkillID: "grammar.verbs.past", Category: "grammar", Subcategory: "verbs", CEFRLevel: "A2", DisplayNameEn: "Past Tense", DisplayNameRu: "Прошедшее время"},
		{SkillID: "grammar.cases.dative", Category: "grammar", Subcategory: "cases", CEFRLevel: "B1", DisplayNameEn: "Dative Case", DisplayNameRu: "Дательный падеж"},
		{SkillID: "grammar.cases.instrumental", Category: "grammar", Subcategory: "cases", CEFRLevel: "B1", DisplayNameEn: "Instrumental Case", DisplayNameRu: "Творительный падеж"},
		{SkillID: "grammar.verbs.aspect", Category: "grammar", Subcategory: "verbs", CEFRLevel: "B1", DisplayNameEn: "Verbal Aspect", DisplayNameRu: "Вид глагола"},
		{SkillID: "vocab.greetings", Category: "vocabulary", Subcategory: "greetings", CEFRLevel: "A1", DisplayNameEn: "Greetings", DisplayNameRu: "Приветствия"},
		{SkillID: "vocab.family", Category: "vocabulary", Subcategory: "family", CEFRLevel: "A1", DisplayNameEn: "Family", DisplayNameRu: "Семья"},
		{SkillID: "vocab.food", Category: "vocabulary", Subcategory: "food", CEFRLevel: "A2", DisplayNameEn: "Food & Drink", DisplayNameRu: "Еда и напитки"},
		{SkillID: "vocab.travel", Category: "vocabulary", Subcategory: "travel", CEFRLevel: "A2", DisplayNameEn: "Travel", DisplayNameRu: "Путешествия"},
		{SkillID: "phonetics.vowels", Category: "phonetics", Subcategory: "vowels", CEFRLevel: "A1", DisplayNameEn: "Vowel Sounds", DisplayNameRu: "Гласные звуки"},
		{SkillID: "phonetics.consonants", Category: "phonetics", Subcategory: "consonants", CEFRLevel: "A1", DisplayNameEn: "Consonant Sounds", DisplayNameRu: "Согласные звуки"},
	}

	// Seed content atoms with real exercise data
	exercises := []struct {
		skill    string
		level    string
		exType   string
		diff     float64
		data     map[string]interface{}
	}{
		// Cyrillic matching
		{"grammar.alphabet.cyrillic", "A1", "matching", 0.2, map[string]interface{}{
			"promptEn": "Match the Cyrillic letters to their sounds",
			"matchPairs": []map[string]string{
				{"left": "А", "right": "ah"},
				{"left": "Б", "right": "b"},
				{"left": "В", "right": "v"},
				{"left": "Г", "right": "g"},
				{"left": "Д", "right": "d"},
			},
			"explanationEn": "These are the first 5 letters of the Russian alphabet.",
		}},
		// Greetings multiple choice
		{"vocab.greetings", "A1", "multiple_choice", 0.2, map[string]interface{}{
			"promptRu":      "Здравствуйте!",
			"promptEn":      "How do you say 'Hello' formally in Russian?",
			"correctAnswer": "Здравствуйте",
			"distractors":   []string{"Привет", "Пока", "Спасибо"},
			"explanationEn": "'Здравствуйте' is the formal greeting. 'Привет' is informal.",
			"hintSequence":  []string{"This is used in formal situations", "It literally means 'Be healthy'"},
		}},
		// Informal greetings
		{"vocab.greetings", "A1", "multiple_choice", 0.15, map[string]interface{}{
			"promptRu":      "Привет!",
			"promptEn":      "Which greeting is informal?",
			"correctAnswer": "Привет",
			"distractors":   []string{"Здравствуйте", "Добрый день", "Добрый вечер"},
			"explanationEn": "'Привет' is used with friends and people you know well.",
		}},
		// Accusative case fill blank
		{"grammar.cases.accusative", "A2", "fill_blank", 0.4, map[string]interface{}{
			"promptRu":      "Я вижу ___",
			"promptEn":      "Fill in the accusative form of 'книга' (book)",
			"correctAnswer": "книгу",
			"distractors":   []string{"книга", "книги", "книге"},
			"explanationEn": "Feminine nouns ending in -а change to -у in the accusative case.",
			"hintSequence":  []string{"The accusative case is used for direct objects", "Feminine -а → -у"},
		}},
		// Genitive case
		{"grammar.cases.genitive", "A2", "fill_blank", 0.5, map[string]interface{}{
			"promptRu":      "У меня нет ___",
			"promptEn":      "Fill in the genitive form of 'собака' (dog)",
			"correctAnswer": "собаки",
			"distractors":   []string{"собака", "собаку", "собаке"},
			"explanationEn": "The genitive case is used after 'нет' (no/not). Feminine -а → -и.",
			"hintSequence":  []string{"'Нет' requires the genitive case", "Feminine nouns: -а → -и"},
		}},
		// Prepositional case
		{"grammar.cases.prepositional", "A2", "fill_blank", 0.45, map[string]interface{}{
			"promptRu":      "Я живу в ___",
			"promptEn":      "Fill in the prepositional form of 'Москва' (Moscow)",
			"correctAnswer": "Москве",
			"distractors":   []string{"Москва", "Москву", "Москвы"},
			"explanationEn": "The prepositional case is used with 'в' (in) for locations. Feminine -а → -е.",
			"hintSequence":  []string{"After 'в' for location, use prepositional case", "Feminine -а → -е"},
		}},
		// Nominative case
		{"grammar.cases.nominative", "A1", "multiple_choice", 0.15, map[string]interface{}{
			"promptRu":      "Это ___.",
			"promptEn":      "Which is the correct nominative form?",
			"correctAnswer": "книга",
			"distractors":   []string{"книгу", "книги", "книге"},
			"explanationEn": "The nominative case is the base form used for subjects. 'Книга' = book.",
		}},
		// Present tense verb
		{"grammar.verbs.present", "A1", "fill_blank", 0.3, map[string]interface{}{
			"promptRu":      "Я ___ по-русски.",
			"promptEn":      "Fill in 'говорить' (to speak) in first person",
			"correctAnswer": "говорю",
			"distractors":   []string{"говоришь", "говорит", "говорим"},
			"explanationEn": "First person singular of 'говорить': я говорю (I speak).",
			"hintSequence":  []string{"First person = я (I)", "Second conjugation: -ю ending"},
		}},
		// Past tense
		{"grammar.verbs.past", "A2", "multiple_choice", 0.35, map[string]interface{}{
			"promptRu":      "Она ___ книгу.",
			"promptEn":      "She ___ a book. (read, past tense)",
			"correctAnswer": "читала",
			"distractors":   []string{"читал", "читали", "читало"},
			"explanationEn": "Past tense agrees with gender. She (она) → feminine ending -ла.",
		}},
		// Family vocab
		{"vocab.family", "A1", "matching", 0.2, map[string]interface{}{
			"promptEn": "Match the Russian family words with English",
			"matchPairs": []map[string]string{
				{"left": "мама", "right": "mom"},
				{"left": "папа", "right": "dad"},
				{"left": "сестра", "right": "sister"},
				{"left": "брат", "right": "brother"},
			},
			"explanationEn": "Basic family vocabulary. Notice 'мама' and 'папа' are similar to English!",
		}},
		// Food vocab
		{"vocab.food", "A2", "multiple_choice", 0.3, map[string]interface{}{
			"promptRu":      "Борщ",
			"promptEn":      "What is борщ?",
			"correctAnswer": "Beet soup",
			"distractors":   []string{"Bread", "Salad", "Pancakes"},
			"explanationEn": "Борщ is a traditional Ukrainian/Russian beet soup, often served with sour cream (сметана).",
		}},
		// Dialogue
		{"vocab.greetings", "A1", "dialogue", 0.2, map[string]interface{}{
			"dialogueLines": []map[string]string{
				{"speaker": "Официант", "textRu": "Здравствуйте! Добро пожаловать.", "textEn": "Hello! Welcome."},
				{"speaker": "Вы", "textRu": "Здравствуйте! Столик на двоих, пожалуйста.", "textEn": "Hello! A table for two, please."},
				{"speaker": "Официант", "textRu": "Конечно. Пожалуйста, следуйте за мной.", "textEn": "Of course. Please follow me."},
				{"speaker": "Вы", "textRu": "Спасибо!", "textEn": "Thank you!"},
			},
			"explanationEn": "A typical restaurant interaction using formal Russian.",
		}},
		// Noun gender
		{"grammar.nouns.gender", "A1", "multiple_choice", 0.25, map[string]interface{}{
			"promptRu":      "стол",
			"promptEn":      "What gender is 'стол' (table)?",
			"correctAnswer": "Masculine",
			"distractors":   []string{"Feminine", "Neuter"},
			"explanationEn": "Nouns ending in a consonant are typically masculine. Стол ends in -л (consonant).",
			"hintSequence":  []string{"Look at the ending of the word", "Consonant ending = masculine"},
		}},
		// Aspect
		{"grammar.verbs.aspect", "B1", "multiple_choice", 0.6, map[string]interface{}{
			"promptRu":      "Вчера я ___ книгу целый день.",
			"promptEn":      "Yesterday I ___ a book all day. (imperfective)",
			"correctAnswer": "читал",
			"distractors":   []string{"прочитал", "прочту", "читаю"},
			"explanationEn": "'Целый день' (all day) indicates an ongoing process → imperfective aspect.",
			"hintSequence":  []string{"Duration markers require imperfective", "читать (imperfective) vs прочитать (perfective)"},
		}},
		// Dative case
		{"grammar.cases.dative", "B1", "fill_blank", 0.55, map[string]interface{}{
			"promptRu":      "Я дал подарок ___.",
			"promptEn":      "I gave a gift to ___. (fill in: сестра → dative)",
			"correctAnswer": "сестре",
			"distractors":   []string{"сестра", "сестру", "сестры"},
			"explanationEn": "The dative case is used for indirect objects (recipient). Feminine -а → -е.",
			"hintSequence":  []string{"'Дать' (to give) needs dative for the recipient", "Feminine: -а → -е in dative"},
		}},
		// Travel vocab
		{"vocab.travel", "A2", "matching", 0.3, map[string]interface{}{
			"promptEn": "Match travel words with English translations",
			"matchPairs": []map[string]string{
				{"left": "аэропорт", "right": "airport"},
				{"left": "вокзал", "right": "train station"},
				{"left": "билет", "right": "ticket"},
				{"left": "поезд", "right": "train"},
			},
			"explanationEn": "Essential travel vocabulary. Notice 'аэропорт' is a cognate!",
		}},
	}

	for _, ex := range exercises {
		exType := ex.exType
		contentData, _ := json.Marshal(ex.data)
		s.content = append(s.content, ContentAtom{
			ID:            uuid.New(),
			ContentType:   "exercise",
			ExerciseType:  &exType,
			TargetSkills:  []string{ex.skill},
			CEFRLevel:     ex.level,
			SegmentTags:   []string{},
			DomainTags:    []string{"general"},
			Difficulty:    ex.diff,
			EstimatedTime: 40,
			ContentData:   contentData,
			CreatedAt:     time.Now(),
			QualityScore:  0.85,
		})
	}
}

// ============================================================
// Helpers
// ============================================================

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func generateToken(userID string, ttl time.Duration) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(ttl).Unix(),
		"iat": time.Now().Unix(),
	})
	return token.SignedString([]byte(jwtSecret))
}

func getUserIDFromCtx(r *http.Request) string {
	if v := r.Context().Value("userID"); v != nil {
		return v.(string)
	}
	return ""
}

// JWTAuth middleware
func jwtAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
			writeJSON(w, 401, map[string]string{"error": "missing_auth_token"})
			return
		}
		tokenStr := strings.TrimPrefix(auth, "Bearer ")
		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			return []byte(jwtSecret), nil
		})
		if err != nil || !token.Valid {
			writeJSON(w, 401, map[string]string{"error": "invalid_token"})
			return
		}
		claims := token.Claims.(jwt.MapClaims)
		sub, _ := claims["sub"].(string)
		ctx := r.Context()
		ctx = ctxWithUserID(ctx, sub)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

type ctxKey string

func ctxWithUserID(ctx interface{ Value(any) any }, id string) interface {
	Deadline() (time.Time, bool)
	Done() <-chan struct{}
	Err() error
	Value(any) any
} {
	return &userIDCtx{parent: ctx.(interface {
		Deadline() (time.Time, bool)
		Done() <-chan struct{}
		Err() error
		Value(any) any
	}), userID: id}
}

type userIDCtx struct {
	parent interface {
		Deadline() (time.Time, bool)
		Done() <-chan struct{}
		Err() error
		Value(any) any
	}
	userID string
}

func (c *userIDCtx) Deadline() (time.Time, bool) { return c.parent.Deadline() }
func (c *userIDCtx) Done() <-chan struct{}        { return c.parent.Done() }
func (c *userIDCtx) Err() error                   { return c.parent.Err() }
func (c *userIDCtx) Value(key any) any {
	if k, ok := key.(string); ok && k == "userID" {
		return c.userID
	}
	return c.parent.Value(key)
}

func calculateXP(isCorrect bool, difficulty float64) int {
	base := 10.0
	diffMult := 1.0 + difficulty*1.5
	acc := 0.3
	if isCorrect {
		acc = 1.0
	}
	return int(math.Round(base * diffMult * acc))
}

// ============================================================
// Main
// ============================================================

func main() {
	store := NewMemStore()
	store.Seed()

	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://localhost:3001", "http://localhost:3939", "http://localhost:*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]string{"status": "ok", "service": "russkiy-api-dev", "mode": "in-memory"})
	})

	r.Route("/v1", func(r chi.Router) {
		// === Public ===
		r.Post("/auth/register", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				Email    string `json:"email"`
				Password string `json:"password"`
				Locale   string `json:"locale"`
			}
			json.NewDecoder(r.Body).Decode(&req)
			if req.Email == "" || req.Password == "" {
				writeJSON(w, 400, map[string]string{"error": "email and password required"})
				return
			}
			if len(req.Password) < 8 {
				writeJSON(w, 400, map[string]string{"error": "password must be at least 8 characters"})
				return
			}
			store.mu.Lock()
			if _, exists := store.emailIndex[req.Email]; exists {
				store.mu.Unlock()
				writeJSON(w, 409, map[string]string{"error": "email already registered"})
				return
			}
			hash, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.MinCost)
			user := &User{
				ID:           uuid.New(),
				Email:        req.Email,
				PasswordHash: string(hash),
				CreatedAt:    time.Now(),
				AccountType:  "free",
				Locale:       req.Locale,
			}
			if user.Locale == "" {
				user.Locale = "en-US"
			}
			store.users[user.ID] = user
			store.emailIndex[req.Email] = user.ID
			store.mu.Unlock()

			access, _ := generateToken(user.ID.String(), 15*time.Minute)
			refresh, _ := generateToken(user.ID.String(), 30*24*time.Hour)
			writeJSON(w, 201, map[string]interface{}{
				"user":   user,
				"tokens": map[string]interface{}{"accessToken": access, "refreshToken": refresh, "expiresIn": 900},
			})
		})

		r.Post("/auth/token", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				Email    string `json:"email"`
				Password string `json:"password"`
			}
			json.NewDecoder(r.Body).Decode(&req)
			store.mu.RLock()
			uid, exists := store.emailIndex[req.Email]
			var user *User
			if exists {
				user = store.users[uid]
			}
			store.mu.RUnlock()
			if user == nil {
				writeJSON(w, 401, map[string]string{"error": "invalid credentials"})
				return
			}
			if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
				writeJSON(w, 401, map[string]string{"error": "invalid credentials"})
				return
			}
			access, _ := generateToken(user.ID.String(), 15*time.Minute)
			refresh, _ := generateToken(user.ID.String(), 30*24*time.Hour)
			writeJSON(w, 200, map[string]interface{}{
				"user":   user,
				"tokens": map[string]interface{}{"accessToken": access, "refreshToken": refresh, "expiresIn": 900},
			})
		})

		// Public skills catalog
		r.Get("/skills", func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, 200, store.skills)
		})
		r.Get("/skills/category", func(w http.ResponseWriter, r *http.Request) {
			cat := r.URL.Query().Get("category")
			var filtered []Skill
			for _, sk := range store.skills {
				if cat == "" || sk.Category == cat {
					filtered = append(filtered, sk)
				}
			}
			writeJSON(w, 200, filtered)
		})

		// === Protected ===
		r.Group(func(r chi.Router) {
			r.Use(jwtAuth)

			// Profiles
			r.Post("/profiles", func(w http.ResponseWriter, r *http.Request) {
				userIDStr := getUserIDFromCtx(r)
				userID, _ := uuid.Parse(userIDStr)
				var req struct {
					DisplayName string  `json:"displayName"`
					Segment     string  `json:"segment"`
					Domain      string  `json:"domain"`
					TargetLevel string  `json:"targetLevel"`
					WeeklyHours float64 `json:"weeklyHours"`
				}
				json.NewDecoder(r.Body).Decode(&req)

				profile := &LearnerProfile{
					ID:             uuid.New(),
					UserID:         userID,
					DisplayName:    req.DisplayName,
					Segment:        req.Segment,
					NativeLanguage: "en",
					Domain:         req.Domain,
					CurrentLevel:   "A1",
					TargetLevel:    req.TargetLevel,
					WeeklyHours:    req.WeeklyHours,
					CreatedAt:      time.Now(),
				}
				if profile.Domain == "" {
					profile.Domain = "general"
				}
				if profile.TargetLevel == "" {
					profile.TargetLevel = "B2"
				}

				store.mu.Lock()
				store.profiles[profile.ID] = profile
				store.profilesByUser[userID] = append(store.profilesByUser[userID], profile.ID)

				// Initialize skills
				now := time.Now()
				var skills []LearnerSkillState
				for _, sk := range store.skills {
					skills = append(skills, LearnerSkillState{
						LearnerID:     profile.ID.String(),
						SkillID:       sk.SkillID,
						Confidence:    0.0,
						Stability:     0.4,
						Difficulty:    0.3,
						NextReviewDue: &now,
						Status:        "new",
						ErrorTypes:    []string{},
					})
				}
				store.learnerSkills[profile.ID] = skills
				store.streaks[profile.ID] = &LearnerStats{LearnerID: profile.ID, CurrentLevel: 1}
				store.mu.Unlock()

				writeJSON(w, 201, profile)
			})

			r.Get("/profiles", func(w http.ResponseWriter, r *http.Request) {
				userIDStr := getUserIDFromCtx(r)
				userID, _ := uuid.Parse(userIDStr)
				store.mu.RLock()
				pids := store.profilesByUser[userID]
				var profiles []*LearnerProfile
				for _, pid := range pids {
					if p, ok := store.profiles[pid]; ok {
						profiles = append(profiles, p)
					}
				}
				store.mu.RUnlock()
				if profiles == nil {
					profiles = make([]*LearnerProfile, 0)
				}
				writeJSON(w, 200, profiles)
			})

			r.Get("/profiles/{id}", func(w http.ResponseWriter, r *http.Request) {
				id, _ := uuid.Parse(chi.URLParam(r, "id"))
				store.mu.RLock()
				p, ok := store.profiles[id]
				store.mu.RUnlock()
				if !ok {
					writeJSON(w, 404, map[string]string{"error": "profile not found"})
					return
				}
				writeJSON(w, 200, p)
			})

			// Stats
			r.Get("/stats", func(w http.ResponseWriter, r *http.Request) {
				userIDStr := getUserIDFromCtx(r)
				userID, _ := uuid.Parse(userIDStr)
				store.mu.RLock()
				pids := store.profilesByUser[userID]
				var stats *LearnerStats
				if len(pids) > 0 {
					stats = store.streaks[pids[0]]
				}
				var skills []LearnerSkillState
				if len(pids) > 0 {
					skills = store.learnerSkills[pids[0]]
				}
				store.mu.RUnlock()
				if stats == nil {
					stats = &LearnerStats{CurrentLevel: 1}
				}

				mastered := 0
				learning := 0
				for _, sk := range skills {
					if sk.Status == "mastered" {
						mastered++
					} else if sk.Status != "new" {
						learning++
					}
				}

				writeJSON(w, 200, map[string]interface{}{
					"currentLevel":  stats.CurrentLevel,
					"totalXp":       stats.TotalXP,
					"currentStreak": stats.CurrentStreak,
					"totalSkills":   len(skills),
					"masteredCount": mastered,
					"learningCount": learning,
				})
			})

			// Skills
			r.Get("/skills/me", func(w http.ResponseWriter, r *http.Request) {
				userIDStr := getUserIDFromCtx(r)
				userID, _ := uuid.Parse(userIDStr)
				store.mu.RLock()
				pids := store.profilesByUser[userID]
				var skills []LearnerSkillState
				if len(pids) > 0 {
					skills = store.learnerSkills[pids[0]]
				}
				store.mu.RUnlock()
				if skills == nil {
					skills = make([]LearnerSkillState, 0)
				}
				writeJSON(w, 200, skills)
			})

			r.Get("/skills/weak", func(w http.ResponseWriter, r *http.Request) {
				userIDStr := getUserIDFromCtx(r)
				userID, _ := uuid.Parse(userIDStr)
				store.mu.RLock()
				pids := store.profilesByUser[userID]
				var skills []LearnerSkillState
				if len(pids) > 0 {
					allSkills := store.learnerSkills[pids[0]]
					for _, sk := range allSkills {
						if sk.Status != "new" && sk.Confidence < 0.5 {
							skills = append(skills, sk)
						}
					}
				}
				store.mu.RUnlock()

				// Sort by confidence ascending and limit to 5
				sort.Slice(skills, func(i, j int) bool {
					return skills[i].Confidence < skills[j].Confidence
				})
				if len(skills) > 5 {
					skills = skills[:5]
				}
				if skills == nil {
					skills = make([]LearnerSkillState, 0)
				}
				writeJSON(w, 200, skills)
			})

			// Sessions
			r.Post("/sessions/generate", func(w http.ResponseWriter, r *http.Request) {
				var req struct {
					LearnerID         uuid.UUID `json:"learnerId"`
					TimeBudgetMinutes int       `json:"timeBudgetMinutes"`
				}
				json.NewDecoder(r.Body).Decode(&req)
				if req.TimeBudgetMinutes <= 0 {
					req.TimeBudgetMinutes = 15
				}

				sessionID := uuid.New()
				session := &Session{
					ID:        sessionID,
					LearnerID: req.LearnerID,
					Status:    "active",
					StartedAt: time.Now(),
				}

				store.mu.Lock()
				store.sessions[sessionID] = session

				// Pick exercises from content pool
				maxItems := int(math.Ceil(float64(req.TimeBudgetMinutes) / 1.5))
				if maxItems < 5 {
					maxItems = 5
				}
				if maxItems > len(store.content) {
					maxItems = len(store.content)
				}
				if maxItems > 15 {
					maxItems = 15
				}

				// Assign roles
				roles := assignRoles(maxItems)

				var items []SessionItem
				var itemsWithContent []SessionItemWithContent
				for i := 0; i < maxItems; i++ {
					ca := store.content[i%len(store.content)]
					item := SessionItem{
						ID:        uuid.New(),
						SessionID: sessionID,
						Position:  i,
						ContentID: ca.ID,
						SkillID:   ca.TargetSkills[0],
						Role:      roles[i],
						Completed: false,
					}
					items = append(items, item)
					itemsWithContent = append(itemsWithContent, SessionItemWithContent{
						SessionItem: item,
						Content:     &ca,
					})
				}
				store.sessionItems[sessionID] = items
				store.mu.Unlock()

				writeJSON(w, 201, map[string]interface{}{
					"id":           sessionID,
					"learnerId":    req.LearnerID,
					"status":       "active",
					"currentIndex": 0,
					"totalXp":      0,
					"startedAt":    session.StartedAt,
					"items":        itemsWithContent,
				})
			})

			r.Get("/sessions/{id}/state", func(w http.ResponseWriter, r *http.Request) {
				id, _ := uuid.Parse(chi.URLParam(r, "id"))
				store.mu.RLock()
				session, ok := store.sessions[id]
				items := store.sessionItems[id]
				store.mu.RUnlock()
				if !ok {
					writeJSON(w, 404, map[string]string{"error": "session not found"})
					return
				}

				var itemsWithContent []SessionItemWithContent
				for _, item := range items {
					iwc := SessionItemWithContent{SessionItem: item}
					for ci := range store.content {
						if store.content[ci].ID == item.ContentID {
							c := store.content[ci]
							iwc.Content = &c
							break
						}
					}
					itemsWithContent = append(itemsWithContent, iwc)
				}

				writeJSON(w, 200, map[string]interface{}{
					"id":           session.ID,
					"learnerId":    session.LearnerID,
					"status":       session.Status,
					"currentIndex": session.CurrentIndex,
					"totalXp":      session.TotalXP,
					"startedAt":    session.StartedAt,
					"items":        itemsWithContent,
				})
			})

			r.Post("/sessions/{id}/submit", func(w http.ResponseWriter, r *http.Request) {
				sessionID, _ := uuid.Parse(chi.URLParam(r, "id"))
				var req struct {
					ContentID      uuid.UUID `json:"contentId"`
					Response       string    `json:"response"`
					CorrectAnswer  string    `json:"correctAnswer"`
					IsCorrect      bool      `json:"isCorrect"`
					ResponseTimeMs int       `json:"responseTimeMs"`
					HintLevelUsed  int       `json:"hintLevelUsed"`
				}
				json.NewDecoder(r.Body).Decode(&req)

				// Find content difficulty
				diff := 0.5
				for _, c := range store.content {
					if c.ID == req.ContentID {
						diff = c.Difficulty
						break
					}
				}
				xp := calculateXP(req.IsCorrect, diff)

				result := ExerciseResult{
					ContentID:      req.ContentID,
					Response:       req.Response,
					CorrectAnswer:  req.CorrectAnswer,
					IsCorrect:      req.IsCorrect,
					ResponseTimeMs: req.ResponseTimeMs,
					HintLevelUsed:  req.HintLevelUsed,
					XPEarned:       xp,
					Timestamp:      time.Now(),
				}

				store.mu.Lock()
				store.results[sessionID] = append(store.results[sessionID], result)
				if session, ok := store.sessions[sessionID]; ok {
					session.CurrentIndex++
					session.TotalXP += xp
					results := store.results[sessionID]
					correct := 0
					for _, r := range results {
						if r.IsCorrect {
							correct++
						}
					}
					session.AccuracyRate = float64(correct) / float64(len(results))
				}
				store.mu.Unlock()

				writeJSON(w, 200, map[string]interface{}{
					"xpEarned":  xp,
					"isCorrect": req.IsCorrect,
				})
			})

			r.Post("/sessions/{id}/complete", func(w http.ResponseWriter, r *http.Request) {
				sessionID, _ := uuid.Parse(chi.URLParam(r, "id"))
				store.mu.Lock()
				session, ok := store.sessions[sessionID]
				if ok {
					now := time.Now()
					session.Status = "completed"
					session.CompletedAt = &now
					session.Duration = int(now.Sub(session.StartedAt).Seconds())

					// Update streak
					if stats, ok := store.streaks[session.LearnerID]; ok {
						stats.TotalSessions++
						stats.TotalXP += session.TotalXP
						stats.CurrentStreak++
						if stats.CurrentStreak > stats.LongestStreak {
							stats.LongestStreak = stats.CurrentStreak
						}
					}
				}
				results := store.results[sessionID]
				store.mu.Unlock()

				if !ok {
					writeJSON(w, 404, map[string]string{"error": "session not found"})
					return
				}

				correct := 0
				skillSet := make(map[string]bool)
				for _, r := range results {
					if r.IsCorrect {
						correct++
					}
				}
				items := store.sessionItems[sessionID]
				for _, item := range items {
					skillSet[item.SkillID] = true
				}
				var skills []string
				for s := range skillSet {
					skills = append(skills, s)
				}

				writeJSON(w, 200, map[string]interface{}{
					"sessionId":       sessionID,
					"totalExercises":  len(results),
					"correctCount":    correct,
					"accuracyRate":    session.AccuracyRate,
					"totalXp":         session.TotalXP,
					"skillsPracticed": skills,
					"duration":        session.Duration,
					"streakDays":      1,
				})
			})

			r.Get("/sessions/history", func(w http.ResponseWriter, r *http.Request) {
				userIDStr := getUserIDFromCtx(r)
				userID, _ := uuid.Parse(userIDStr)
				store.mu.RLock()
				pids := store.profilesByUser[userID]
				var sessions []Session
				for _, s := range store.sessions {
					for _, pid := range pids {
						if s.LearnerID == pid && s.Status == "completed" {
							sessions = append(sessions, *s)
						}
					}
				}
				store.mu.RUnlock()
				if sessions == nil {
					sessions = make([]Session, 0)
				}
				writeJSON(w, 200, sessions)
			})

			// Leaderboard stub
			r.Get("/leaderboard", func(w http.ResponseWriter, r *http.Request) {
				writeJSON(w, 200, map[string]interface{}{
					"weekly": []map[string]interface{}{
						{"rank": 1, "displayName": "Мария", "xp": 2450, "streak": 14},
						{"rank": 2, "displayName": "Алексей", "xp": 2100, "streak": 12},
						{"rank": 3, "displayName": "You", "xp": 0, "streak": 0},
					},
				})
			})

			// Teacher stubs
			r.Post("/teacher/cohorts", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 201, map[string]string{"status": "created"}) })
			r.Get("/teacher/cohorts", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, []interface{}{}) })
			r.Get("/teacher/cohorts/{id}/heatmap", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]interface{}{}) })
			r.Post("/teacher/assignments", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 201, map[string]string{"status": "created"}) })
			r.Get("/teacher/students/{id}/report", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]interface{}{}) })
		})
	})

	port := "8080"
	fmt.Println(`
  ██████  ██    ██ ███████ ███████ ██   ██ ██ ██    ██
  ██   ██ ██    ██ ██      ██      ██  ██  ██  ██  ██
  ██████  ██    ██ ███████ ███████ █████   ██   ████
  ██   ██ ██    ██      ██      ██ ██  ██  ██    ██
  ██   ██  ██████  ███████ ███████ ██   ██ ██    ██

  ⚡ DEV SERVER — In-Memory Mode (no PostgreSQL needed)
  📚 Seeded with`, len(store.content), `content atoms &`, len(store.skills), `skills`)
	log.Printf("🚀 Dev server starting on http://localhost:%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func assignRoles(count int) []string {
	if count <= 0 {
		return nil
	}
	roles := make([]string, count)
	switch {
	case count <= 3:
		roles[0] = "warmup"
		for i := 1; i < count-1; i++ {
			roles[i] = "core"
		}
		if count > 1 {
			roles[count-1] = "cooldown"
		}
	case count <= 5:
		roles[0] = "warmup"
		roles[1] = "ramp"
		for i := 2; i < count-1; i++ {
			roles[i] = "core"
		}
		roles[count-1] = "cooldown"
	default:
		roles[0] = "warmup"
		roles[1] = "warmup"
		roles[2] = "ramp"
		reliefIdx := count/2 + 1
		for i := 3; i < reliefIdx; i++ {
			roles[i] = "core"
		}
		if reliefIdx < count {
			roles[reliefIdx] = "relief"
		}
		for i := reliefIdx + 1; i < count-1; i++ {
			roles[i] = "core"
		}
		roles[count-1] = "cooldown"
	}
	return roles
}
