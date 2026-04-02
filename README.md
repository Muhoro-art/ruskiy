# Russkiy

Adaptive Russian language learning platform built exclusively for English speakers — powered by spaced repetition (FSRS), AI-driven session composition, and pronunciation coaching.

## Architecture

```
apps/
  web/          → Next.js 15 + React 19 + Tailwind 4
  mobile/       → Expo SDK 52 + React Native 0.76

services/
  api/          → Go (chi) REST API
  ml/           → FastAPI error classifier + pronunciation scoring

packages/
  shared/       → Shared TypeScript types

infra/
  docker/       → Docker Compose (Postgres, Redis, Kafka, Meilisearch)
```

## Features

- **Adaptive engine** — real-time learner model that reconfigures every session based on strengths and weaknesses
- **Spaced repetition (FSRS)** — science-backed scheduling with Krashen's i+1, desirable difficulty, and Vygotsky's ZPD
- **Pronunciation coaching** — speech recognition trained on English-accented Russian with phoneme-level feedback
- **Teacher dashboard** — cohort management, weakness heatmaps, assignments, and student reports
- **Learner segments** — tailored content for toddlers, kids, teens, university students, migrants, and seniors
- **Placement test** — adaptive initial assessment to determine CEFR level

## Prerequisites

- Node.js ≥ 20
- Go 1.23
- Python 3.11+
- Docker & Docker Compose

## Getting Started

### 1. Start infrastructure

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

This starts PostgreSQL (5432), Redis (6379), Kafka (9094), and Meilisearch (7700).

### 2. API server

```bash
cd services/api
cp .env.example .env
go run cmd/server/main.go
```

Runs on `http://localhost:8080`.

### 3. ML service

```bash
cd services/ml
pip install -r requirements.txt
uvicorn src.main:app --port 8090
```

Runs on `http://localhost:8090`.

### 4. Web app

```bash
npm install
npm run dev:web
```

Runs on `http://localhost:3000`.

### 5. Mobile app

```bash
npm run dev:mobile
```

Opens Expo DevTools — scan the QR code with Expo Go.

## API

All endpoints are under `/v1`. Public routes:

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/auth/register` | Register |
| POST | `/auth/token` | Login |
| POST | `/auth/refresh` | Refresh token |
| GET | `/skills` | Skills catalog |

Authenticated routes (JWT):

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/sessions/generate` | Generate adaptive session |
| POST | `/sessions/{id}/submit` | Submit session answers |
| POST | `/sessions/{id}/complete` | Complete session |
| GET | `/stats` | Learner statistics |
| GET | `/skills/me` | Learner's skills |
| GET | `/skills/weak` | Weak skills |
| POST | `/placement/generate` | Start placement test |
| GET | `/leaderboard` | Leaderboard |

Teacher routes require the teacher role.

## Environment Variables

```env
PORT=8080
DATABASE_URL=postgres://russkiy:russkiy@localhost:5432/russkiy?sslmode=disable
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-this-to-a-secure-random-string
JWT_ACCESS_TTL_MINUTES=15
JWT_REFRESH_TTL_DAYS=30
ENVIRONMENT=development
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Web | Next.js 15, React 19, Tailwind CSS 4 |
| Mobile | Expo 52, React Native 0.76, Expo Router |
| API | Go, chi, pgx, golang-jwt |
| ML | Python, FastAPI, pymorphy3, NumPy |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Events | Kafka (KRaft) |
| Search | Meilisearch |

## License

All rights reserved.
