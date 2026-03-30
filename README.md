# csa-be — CSA App Backend

Node.js 20 + Express 4 REST API hosted on Render.com.

## Run locally

**Prerequisites:** [Node.js 20 LTS](https://nodejs.org)

```bash
# 1. Install dependencies
npm install

# 2. Create the local environment file (gitignored, never committed)
copy .env.example .env      # Windows
# cp .env.example .env      # macOS / Linux

# Edit .env and set at minimum:
#   PORT=3000
#   JOB_SECRET=any-local-secret
#   DATABASE_URL=   (leave empty to use in-memory mock data)

# 3. Start the server
node server.js
```

The server starts on http://localhost:3000.
With no `DATABASE_URL` set, the server runs in **mock mode** (in-memory data,
no database required) — ideal for local front-end development.

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP port | `3000` |
| `DATABASE_URL` | Supabase `postgres://` connection string | *(mock mode if absent)* |
| `CORS_ORIGIN` | Allowed origin (GitHub Pages URL) | `http://localhost:5500` |
| `JOB_SECRET` | Bearer token for `POST /api/job/run` | — |

See `.env.example` for a full template.

## Project structure

```
server.js          — HTTP server entry point
app.js             — Express app factory (middleware + routes)
routes/            — one file per resource
mock/data.js       — in-memory data store (used when DATABASE_URL is absent)
.env.example       — environment variable template
```

## Deploy to Render.com

1. Create a **Web Service** pointing to this repository, root directory `/`.
2. Runtime: **Node 20**, start command: `node server.js`.
3. Add all variables from `.env.example` in the Render dashboard.
4. Update `CORS_ORIGIN` to the GitHub Pages URL once the frontend is live.
