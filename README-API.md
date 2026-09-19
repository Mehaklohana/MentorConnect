# MentorConnect API

This project now includes an Express/PostgreSQL API. The static frontend still has its original localStorage demo mode; the API is the server-side foundation for production data.

## Setup

1. Install Node.js 18+ and PostgreSQL 14+.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` and a strong `JWT_SECRET`.
3. Run `npm install`.
4. Create the database, then run `npm run db:init` from a shell with `DATABASE_URL` available.
5. Start the API with `npm run dev` or `npm start`.

The health check is `GET http://localhost:3000/api/health`.

## Main endpoints

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET/PATCH /api/users/me`
- `GET /api/mentors`
- `GET/POST /api/messages/:userId`
- `GET/POST /api/sessions`
- `GET/PATCH /api/career`
- `GET /api/communities`
- `POST /api/communities/:id/join`
- `GET/POST /api/communities/:id/posts`
- `GET/POST /api/posts/:id/comments`
- `GET/POST /api/billing`
- `GET /api/ai/status` — reports whether Gemini is configured
- `POST /api/ai/chat` — AI career coach (Gemini proxy; requires `GEMINI_API_KEY` in `.env`)

Send the JWT returned by signup/login as `Authorization: Bearer <token>`.

This demo API uses a mock billing confirmation endpoint. Payment processing should be connected to Stripe or another provider before production use.

## AI coach (Gemini)

The "Mentor AI" chat panel in the app talks to Gemini through this server, so the API key stays server-side:

1. Get a free API key at [Google AI Studio](https://aistudio.google.com/apikey).
2. Put it in `.env` as `GEMINI_API_KEY=...` (optionally set `GEMINI_MODEL`, default `gemini-2.0-flash`).
3. Restart the API. `GET /api/ai/status` should return `{"configured":true,...}`.

Without a key (or when the API is not running, e.g. the page is opened as a plain static file), the chat automatically falls back to the built-in offline coach engine in `platform.js` — everything keeps working, just with canned intelligence.
