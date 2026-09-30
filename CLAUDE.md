# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Node 22+. No build step: `tsx` and vitest run TypeScript directly.

```bash
npm test                          # vitest run, all tests
npx vitest run tests/app.test.ts  # one file
npx vitest run -t "<test name>"   # one test by name
npm run lint                      # tsc --noEmit (type check only)
npm run dev                       # server on http://localhost:3000
```

## Must never break

- **Never send data to a real flood system**, especially ROOP TAN JAI Flood Watch (`flood-api.rooptanjai.com`). GET is allowed. POST and DELETE are not. Keep that hostname out of code and tests. Test only against `localhost`.
- Don't edit `NOTICE` in `src/app.ts`. Every public response must include it. Anything a user reports must be labeled user-reported, not an official warning.
- Never log or return personal data (phone, name, exact address, IP). Log IDs instead.
- Anything that handles user input follows the `security-baseline` skill.

## Easy mistakes in this repo

- Calling `new Date()` in logic. Use `ctx.now`. Tests pin `now = 2026-09-30T12:30:00Z`.
- Using floats for depth or water level. Always use integer centimetres.
- Storing times with +07:00. Store UTC, and show Bangkok time only through `toBangkokIso`.
- Leaving off the `.ts` extension on imports (NodeNext ESM).
- Calling `console.*` inside `handle()`. Return `log` on the `Response` instead, and `server.ts` prints it.
- Using a module-level store or rate limiter in tests. Build `ctx` with `makeCtx()` every time.
- Reading the IP from `X-Forwarded-For`. It comes from `req.socket.remoteAddress` only.
- Adding a runtime dependency or persistence (file, DB). Storage is in-memory only.
- Touching files the spec says to leave alone: `data/stations.json`, `src/stations.ts`, `src/districts.ts`, `src/time.ts`.

## How to work

- The spec is the source of truth: `docs/specs/flood-reports.md`, with requirements RPT-REQ-001 to 021. The intent is in `docs/intent/`. When the spec is unclear, ask instead of guessing.
- Test logic by calling `handle()` directly, not through a server. Only `tests/server.test.ts` starts a real server, on `127.0.0.1` port 0.
- Run `npm test` and `npm run lint` before reporting a task done.
- Issues: GitHub (J4TSADA/ai-coding-with-claude) via `gh`. See `docs/agents/issue-tracker.md`.
- Triage labels: `docs/agents/triage-labels.md`. Domain docs (`CONTEXT.md`, `docs/adr/`): `docs/agents/domain.md`.
