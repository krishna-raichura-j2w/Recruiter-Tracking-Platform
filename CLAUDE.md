# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

J2W Recruiter Tracking is a full-stack recruitment pipeline management platform for Joules to Watts (J2W). It tracks candidates from sourcing through client submission across a multi-role workflow.

## Commands

### Backend

```bash
cd backend

# Install dependencies (uses uv)
uv sync

# Run dev server
uvicorn app:app --reload --port 8000

# Run full API test suite (requires server running on :8000)
python3 ../test_api.py --base http://localhost:8000
```

### Frontend

```bash
cd frontend

npm install
npm run dev        # Dev server on :5173
npm run build      # tsc -b && vite build
npm run lint       # ESLint
npm run preview    # Preview production build
```

## Architecture

**Backend:** FastAPI + SQLAlchemy (SQLite) with feature-based module structure under `backend/features/`. Each feature module has `routes.py`, `schema.py`, and `service.py`. All database models live in `backend/infra/models.py`. App wiring (router registration, CORS, startup seed data) is in `backend/app.py`. Config and env var defaults are in `backend/core/config.py`.

**Frontend:** React 19 + TypeScript + Vite, TailwindCSS for styling. All pages are in `frontend/src/pages/`. A single Axios instance in `frontend/src/api/client.ts` handles auth token injection (JWT stored in localStorage as `j2w_auth`). Auth state is managed in `frontend/src/context/AuthContext.tsx`.

**API prefix:** All backend routes are under `/api`.

**Frontend→Backend:** Hardcoded to `http://localhost:8000/api` in `frontend/src/api/client.ts`.

## Domain Model & Workflow

Candidate pipeline status flow:
```
sourced → pool_verified → handed_to_recruiter → call_in_progress →
ready_for_validation → validated → submitted_to_client → interview_stage → offer/joined
```

Six user roles with gated access at each stage:
- `sourcing_partner` — creates candidates
- `caller` — logs calls, records assessments
- `validator` — approves/rejects for submission
- `kam` — submits to client
- `pod_lead` — manages team
- `admin` — full access

**Scoring logic** (from BRD): Technical Score = 50% × avg(Resume-Skill Match, Role Articulation). Soft-Skill Score = avg(Communication, Self Articulation, Paraphrasing, Confidence). Overall = avg(Technical, Soft-Skill). Auto-recommendation thresholds: ≥4.0 = "Strong Submit", ≥3.25 = "Consider", <3.25 = "Hold".

## AI Integration

`backend/features/resume_extract/` and `backend/features/jd_extract/` use Azure OpenAI (gpt-4o-mini) to parse PDFs and job descriptions. Configured via environment variables: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_MODEL`.

## Key Environment Variables

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Token signing (has dev default) |
| `DATABASE_URL` | Defaults to `sqlite:///./j2w_tracker.db` |
| `AZURE_OPENAI_*` | Resume/JD extraction |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Email notifications |

## Reference

`docs/BRD.md` contains the full business requirements including scoring formulas, role permissions, and workflow rules.
