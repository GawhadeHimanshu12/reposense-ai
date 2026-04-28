# RepoSense AI

AI-powered GitHub repository analyzer that delivers actionable insights on code quality, security, and maintainability with privacy-friendly analytics.

## Tech Stack

| Layer     | Technology                                          |
|-----------|-----------------------------------------------------|
| Frontend  | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend   | Python 3.11, FastAPI, SQLAlchemy 2 (async), Alembic |
| Database  | PostgreSQL 15+                                      |
| Cache     | Redis 7                                             |
| AI        | Anthropic Claude / OpenAI / Gemini                  |
| Auth      | JWT + Google/GitHub OAuth                           |
| Analytics | Plausible (no cookies)                              |

## Project Structure

```
reposense-ai/
├── frontend/               # React + Vite app
│   ├── src/
│   │   ├── components/     # UI + feature components
│   │   ├── hooks/          # React Query hooks
│   │   ├── pages/          # Route-level pages
│   │   ├── services/       # API clients
│   │   ├── store/          # Zustand state
│   │   └── types/          # TypeScript types
│   └── ...
├── backend/                # FastAPI app
│   ├── app/
│   │   ├── api/v1/         # REST endpoints
│   │   ├── core/           # Config, security, deps
│   │   ├── db/             # Models, migrations, session
│   │   ├── schemas/        # Pydantic schemas
│   │   └── services/       # GitHub & AI services
│   └── ...
├── scripts/                # DB init SQL
└── docker-compose.yml
```

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local frontend dev)
- Python 3.11+ (for local backend dev)

### 1. Clone & configure

```bash
git clone <repo-url>
cd reposense-ai

# Backend env
cp backend/.env.example backend/.env
# Edit backend/.env — set SECRET_KEY, Google/GitHub/AI keys

# Frontend env
cp frontend/.env.example frontend/.env
```

### 2. Start with Docker Compose

```bash
docker compose up -d
```

- Frontend: http://localhost:80
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs (debug only)

### 3. Local development (without Docker)

**Backend:**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

- Frontend dev server: http://localhost:3000

## Google OAuth Setup

1. Create OAuth credentials in Google Cloud Console
2. Set **Authorized redirect URI**: `http://localhost:8000/api/v1/auth/google/callback`
3. Copy Client ID/Secret into `backend/.env`

## GitHub OAuth Setup

1. Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. Set **Homepage URL**: `http://localhost:3000`
3. Set **Callback URL**: `http://localhost:8000/api/v1/auth/github/callback`
4. Copy Client ID and Secret into `backend/.env`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Register with email/password |
| POST | `/api/v1/auth/login` | Login, get JWT tokens |
| GET  | `/api/v1/auth/github/url` | GitHub OAuth redirect URL |
| GET  | `/api/v1/auth/github/callback` | GitHub OAuth callback |
| GET  | `/api/v1/users/me` | Current user profile |
| GET  | `/api/v1/users/me/stats` | Current user stats |
| DELETE | `/api/v1/users/me` | Soft delete account |
| GET  | `/api/v1/repositories/` | List user repositories |
| POST | `/api/v1/repositories/sync` | Sync from GitHub |
| POST | `/api/v1/repositories/{id}/analyze` | Trigger AI analysis |
| GET  | `/api/v1/repositories/{id}/analyses` | List analyses |

## Running Tests

```bash
cd backend
pytest --cov=app tests/
```

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | JWT signing key (32+ chars) |
| `DATABASE_URL` | Yes | PostgreSQL async URL |
| `REDIS_URL` | Yes | Redis connection URL |
| `GOOGLE_CLIENT_ID` | OAuth | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | OAuth | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | OAuth | GitHub OAuth client secret |
| `ANTHROPIC_API_KEY` | AI | Claude API key |
| `OPENAI_API_KEY` | AI | OpenAI API key |
| `GOOGLE_API_KEY` | AI | Gemini API key |

### Frontend (`frontend/.env`)

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend URL (default: `http://localhost:8000`) |
| `VITE_APP_NAME` | App display name |
| `VITE_PLAUSIBLE_DOMAIN` | Analytics domain |
| `VITE_GITHUB_ISSUES_URL` | Issue reporting URL |

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for Railway/Vercel/Docker production setup.
