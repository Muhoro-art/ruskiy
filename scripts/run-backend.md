# Running the backend end-to-end (Postgres + Redis + API)

Requires Docker Desktop running (its Linux/WSL engine fully started).

## 1. Start infra (fresh volume auto-applies migrations 001–012)

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
# to RESET the DB and re-run migrations: add `down -v` first
# docker compose -f infra/docker/docker-compose.yml down -v
```

The `migrations/` folder is mounted at `/docker-entrypoint-initdb.d`, so on a
fresh `postgres_data` volume every `*.sql` runs in order on first boot
(including 011_curriculum_progress and 012_teacher_and_streak_fix).

## 2. Run the API with a persistent signing key

```bash
cd services/api
cp .env.example .env   # or set env inline
JWT_PRIVATE_KEY_PATH=./jwt.pem \
DATABASE_URL='postgres://russkiy:russkiy@localhost:5432/russkiy?sslmode=disable' \
REDIS_URL='redis://localhost:6379' \
go run ./cmd/server
```

Look for: "Connected to Redis — token revocation, lockout, and rate limiting are
shared and durable" and "Loaded RSA key pair from ./jwt.pem".

## 3. Exercise the curriculum-progress sync

```bash
# register -> capture access token
TOK=$(curl -s -XPOST localhost:8080/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@russkiy.dev","password":"password123"}' | jq -r .tokens.accessToken)

# PUT progress
curl -s -XPUT localhost:8080/v1/curriculum/progress \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"lessons":{"a1-alphabet:0":{"mastered":true,"bestScore":1,"attempts":1,"seenQuestionIds":[]}},"exams":{},"topics":{}}'

# GET it back
curl -s localhost:8080/v1/curriculum/progress -H "Authorization: Bearer $TOK"

# real leaderboard (any authenticated user)
curl -s localhost:8080/v1/leaderboard -H "Authorization: Bearer $TOK"
```

Restart the API and re-register a second time — the refresh-token revocation /
lockout state now lives in Redis, and tokens still validate because the RSA key
is loaded from `jwt.pem` (not regenerated).
