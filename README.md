# Hollowpoint — an application process that is also the screen

A deployable job application flow with five gates between the posting and a
submitted application. No database, no build step. Everything is stateless —
sessions, grants and attachments are all HMAC-signed blobs verified against one
secret.

## Deploy

```bash
npm install
npx wrangler pages deploy public --project-name=hollowpoint-apply
```

Then set the signing secret, or every deployment shares the default one:

```bash
npx wrangler pages secret put HP_SECRET --project-name=hollowpoint-apply
```

Local: `npm run dev` → http://127.0.0.1:8788

Git-connected projects: build command empty, output directory `public`. The
`functions/` directory is picked up automatically.

## Layout

```
public/index.html          the posting — carries the broken link and the encoded id
public/access.html         alternate route for anyone the puzzle locks out
public/apply/index.html    form shell
public/assets/app.js       schema-driven client; window.__HP__ is the handle
functions/_middleware.js   gate 1 + gate 2 + session issuance
functions/_lib.js          HMAC, cookies, signed blobs
functions/api/*            schema, config, attach flow, submit, status
solve.py                   reference solution — do not ship publicly
```

## The five gates

| # | Where | Tests |
|---|---|---|
| 1 | Posting link: anchor text and `href` disagree, and the id in the text is the public ref, not the internal one | Reads before clicking |
| 2 | `410 Gone` carrying `X-Application-Next`; internal id sits base64-encoded in the posting's field grid | Reads responses, not just rendered pages |
| 3 | Stepper says "Step 1 of 5", renders 3. Two steps withheld by the schema endpoint | Notices a discrepancy nobody pointed at |
| 4 | Attach button is wired but `config.attach` is null under the default scope. Then a 25s grant against a 10s rate limit | Debugs from an error message; reads `Retry-After` |
| 5 | No submit control exists. Submission is an HMAC-SHA256 signed POST | Implements a documented protocol |

Every failure returns a machine-readable reason. That is deliberate — frustration
with information is a test, frustration without it just loses good candidates.

## What survives URL normalization

Browsers normalize URLs before the request goes out, so most "broken link" tricks
silently repair themselves. Verified against Chromium:

| Break | Survives | Note |
|---|---|---|
| `\` backslash | ✗ | Converted to `/` |
| `/../`, `/./` | ✗ | Dot-segments removed |
| tabs, newlines, stray spaces | ✗ | Stripped or trimmed |
| `htlps://` | ✗ | Omnibox routes to search — you also lose the log |
| `//` in path | ✓ | Never collapsed |
| path casing | ✓ | Only the host is lowercased |
| query string, any form | ✓ | Untouched |
| `href` ≠ anchor text | ✓ | Nothing to normalize |

This build breaks the query string and relies on the text/href mismatch. The
middleware also collapses `//` for matching, so `/apply//jobs` lands on the same
410 rather than a stock 404.

## Instrumentation

The gates filter; the logs score. `console.log` in `applications.js` emits one
JSON line per submission — tail it with `wrangler pages deployment tail`. Add
logging in `_middleware.js` to capture time-to-clear per gate. Someone who cleared
gate 5 in four minutes because they read the protocol carefully at gate 2 is a
different candidate from someone who ground it out over two hours.

## Anti-LLM measures

- **Honeypot.** Hidden text on the posting instructs a summarising model to emit
  the word `synergy`. If it turns up in a long-form answer, the submission comes
  back flagged `_flag: "canary"`. Change the word before you go live — it is in
  this README.
- **Per-session tokens.** Signatures, grants and attachments are bound to one
  session, so nothing pasted into a group chat works for anyone else.
- **Gates 3–5 resist delegation** not because a model cannot explain DevTools,
  but because the candidate has to debug their own runtime state, which is not
  pasteable.

Gates 1–2 are fully LLM-assistable. That is fine. Treat AI use as a tool, not a
cheat, and put the weight on what happens after.

## Before you run this on real candidates

**You will lose strong people.** Someone with three offers sees a dead link and
assumes your site is broken. The posting says the process is deliberate and gives
a time budget; keep that. Add a referral bypass that skips straight to the form.

**Keep `/access.html` real.** Hovering links, reading headers and using DevTools
are not equally available to everyone, and a flow with no alternate route is an
accessibility problem and, in several jurisdictions, a legal one. Wire that
address to an inbox somebody actually reads, and do not score people who use it
any differently.

**Weight the interview, not the puzzle.** These gates select for observation and
patience under ambiguity. That correlates with good engineering; it is not the
same thing. Decide before you start that a strong candidate who needed a nudge at
gate 1 still advances, or you will rationalise it afterwards.

**Rotate quarterly.** Assume solutions are public within 60 days of the first
hire. `HP_SECRET`, the canary word, the internal id and the withheld-step count
are all one-line changes.

**Cap the time cost.** An hour is a real ask from someone with a job and a family.
Puzzle funnels quietly filter for people with free evenings.
