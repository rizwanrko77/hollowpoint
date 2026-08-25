# Reference solutions — internal only

Do not put this file in `public/`. It is served from nowhere; keep it that way.

## Gate 1 — the link
Posting shows `…/apply/jobs?gh_jid=RE-8FF31` as text; the `href` is
`/apply/jobs?gh_jid=` (empty). Both routes 410. Copying the visible text is the
first correction; it is not sufficient.

## Gate 2 — the 410
Response carries `X-Application-Next: /.well-known/hiring.json`. That document
issues the session cookie + token and states the id is "encoded, not hidden".
The posting's field grid ends with `X-Internal-Ref: OWE0YzE3` → base64 →
`9a4c17`. Entry: `/apply/jobs?gh_jid=9a4c17`.

## Gate 3 — the withheld steps
Stepper reads "Step 1 of 5" with three pips. `GET /api/form-schema` returns
steps 4 and 5 as `{enabled:false, withheld:true}` with `_params` documenting
`include=all`. Three valid routes, all accepted:
  - `GET /api/form-schema?include=all`
  - `localStorage.setItem('hp.schema.override','all')` then reload
  - `window.__HP__.setStepEnabled(4, true)`
Navigating to `#/step/4` reveals the step *exists* but not its fields — a hint,
not a solution.

## Gate 4 — the attach button
Button is bound; it throws because `config.attach` is null. `GET /api/config`
returns `available_scopes: ["public","full"]`. Fix with
`window.__HP__.loadConfig({scope:'full'})` or fetch `?scope=full` directly, then
the client runs grant → commit itself. Grants live 25s; a second grant inside 10s
returns 429 with `Retry-After`.

## Gate 5 — submit
No submit control exists. Per `/.well-known/hiring.json`:
  `X-App-Signature = hex(HMAC-SHA256(key=session token, message=exact raw body))`
POST that to `/api/applications`. Server rejects missing fields from the withheld
steps, long-form answers under 80 chars, and forged attachment ids. Success sets
`hp_done`, so an open form tab flips to the receipt on its own.

`solve.py` walks all five end to end: `python3 solve.py https://your-deploy.pages.dev`

## Scoring signals worth capturing
- Time between first 410 and first correct `gh_jid` — pure observation.
- Which gate-3 route they took. Direct URL param vs console vs localStorage says
  something about how they poke at systems.
- Number of 429s eaten at gate 4. Reading `Retry-After` vs hammering.
- Attempts at gate 5 before a valid signature. Two or three is healthy; twenty
  means they were guessing rather than reading.
- `_flag: "canary"` on the submission — page was pasted into a model wholesale.
