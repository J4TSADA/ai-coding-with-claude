# CLAUDE.md

น้ำท่วมไหม: a teaching example (TypeScript, Node 22+). Not an official flood warning service; all data is made up.
No framework: `src/app.ts` routes, `src/server.ts` is a thin `node:http` wrapper.

## Commands

- Install: `npm install`
- Test all: `npm test` · one file: `npx vitest run tests/app.test.ts` · by name: `npx vitest run -t "severity"`
- Types: `npm run lint` (tsc, no emit)
- Run: `npm run dev` (port 3000)

## Rules you must not break

- Depth and water level are integers in centimetres. Never floats.
- Store times in UTC; show them in Bangkok time with `toBangkokIso`.
- A reporter's phone number never appears in any response or log.
- Imports use the `.ts` extension (`./stations.ts`), as in existing files.

## Mistakes you make in this repo

<!-- Add one line every time the AI repeats a mistake. -->
- Reading `Date.now()` or `new Date()` inside logic. Pass `now` in as a parameter so tests can control time.

## How we work

- Read `docs/specs/<feature>.md` before starting a feature.
- Commit `docs/plans/<feature>.md` before implementing, then tick steps as you finish them.
- Write the failing test first. Never edit tests to make them pass; stop and ask instead.
- Stop and ask when the spec is unclear. Don't guess.
