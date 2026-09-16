# ClassPilot backend (Python)

FastAPI port of the app's former Next.js API routes. Owns all business logic,
persistence (SQLite), Gemini calls, and the autonomous weekly-report
scheduler. The Next.js app (see the repo root) is a pure frontend that proxies
`/api/*` requests here via `next.config.ts` rewrites.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Copy `.env.example` from the repo root to `.env` (or otherwise export the
listed variables) - at minimum `GEMINI_API_KEY` is required for any AI
generation endpoint to work.

## Run

```bash
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

The API is served under `/api/...`, matching the routes the frontend expects.
Run the Next.js dev server (`npm run dev`, from the repo root) alongside it;
its rewrites will forward `/api/*` to `http://127.0.0.1:8000` by default
(override with `BACKEND_URL`).

## Layout

- `main.py` - FastAPI app, router wiring, startup scheduler
- `routers/` - one module per route group (units, submissions, students, hint, reports)
- `schemas.py` - Pydantic request/response models (mirrors the frontend's `lib/schemas.ts`)
- `db.py` - SQLite persistence (same `classpilot.db` file/schema as before)
- `gemini_client.py` - Gemini API calls (structured generation + embeddings)
- `rag.py` - document chunking, embedding, and retrieval for the per-unit knowledge base
- `weak_topics.py` - topic-performance aggregation over graded submissions
- `reports.py` - weekly report compilation
- `errors.py` - exception handlers so error responses stay `{"error": "..."}` shaped
- `scheduler.py` - in-process autonomous weekly-report loop (`REPORT_INTERVAL_MS`)
