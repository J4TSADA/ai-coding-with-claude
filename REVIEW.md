# REVIEW.md

Review the diff in passes, in this order. One pass at a time.
For every finding give: file:line · problem · why it matters · suggested fix.

## Pass 1 — Logic
- Does the code do what the tests claim? Any branch with no test?
- Off-by-one at boundaries (severity levels, 2-hour merge window, 6-hour expiry).
- Time zones: stored in UTC, shown in Bangkok time. `now` passed in, never read inside logic.
- Units: depth and levels are whole centimetres.

## Pass 2 — Security & PII
- Every input validated at the boundary (`src/app.ts`).
- No phone numbers or other personal data in responses, logs, or errors.
- Public submissions are rate-limited per IP.
- Anything shown to the public says it is user-reported, not an official warning.

## Pass 3 — Compliance with the spec
- Every requirement in docs/specs/<feature>.md is implemented and tested.
- Nothing implemented that is out of scope.
- The diff matches docs/plans/<feature>.md. Unplanned changes are explained.

## Human pass — Intent & Risk (not delegated)
- Does this match the intent?
- If it breaks, how bad is it, and can we roll back?
- Can I explain this code to a teammate?
