#!/usr/bin/env python3
"""Reference solution — walks every gate. For the hiring team, not for candidates."""
import base64, hashlib, hmac, json, sys, time, urllib.request, urllib.error, http.cookiejar

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8788"
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(jar),
    urllib.request.HTTPRedirectHandler(),
    urllib.request.ProxyHandler({}),
)

def call(path, method="GET", body=None, headers=None, raw=False):
    data = body.encode() if isinstance(body, str) else body
    req = urllib.request.Request(BASE + path, data=data, method=method)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        r = opener.open(req)
        txt = r.read().decode()
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        r = e
    return r.status, (txt if raw else (json.loads(txt) if txt.strip().startswith("{") else txt)), dict(r.headers)

print("gate 1 — follow the broken href")
st, _, hdr = call("/apply/jobs?gh_jid=", raw=True)
print(f"  {st} · next = {hdr.get('X-Application-Next')}")

print("gate 2 — read the header, decode the id from the posting")
st, doc, _ = call("/.well-known/hiring.json")
token = doc["session"]["token"]
internal = base64.b64decode("OWE0YzE3").decode()          # lifted from the JD footer
print(f"  session token {token[:12]}… · internal id {internal}")
st, _, _ = call(f"/apply/jobs?gh_jid={internal}", raw=True)
print(f"  entry {st}")

print("gate 3 — recover the withheld steps")
st, schema, _ = call("/api/form-schema?include=all")
names = [f["name"] for s in schema["steps"] for f in s.get("fields", [])]
print(f"  {len(schema['steps'])}/{schema['total_steps']} steps · {len(names)} fields")

print("gate 4 — widen the config scope, then grant → attach")
st, cfg, _ = call("/api/config?scope=full")
st, grant, _ = call(cfg["attach"]["grant_url"], "POST")
st, att, _ = call(cfg["attach"]["commit_url"], "POST",
                  json.dumps({"resume_url": "https://github.com/example"}),
                  {"Content-Type": "application/json", "X-Attach-Grant": grant["grant"]})
print(f"  {st} · attachment {att['attachment_id'][:20]}…")

print("gate 5 — sign the body and post it")
app = {
    "full_name": "Reference Candidate",
    "email": "ref@example.com",
    "location": "Dehradun, UTC+5:30",
    "primary_url": "https://github.com/example",
    "years": 9,
    "scope": "Engineering lead",
    "largest_system": "A durable job runner handling roughly forty million executions a month, "
                      "owned end to end from the storage layer through the replay semantics.",
    "tradeoff": "Held a synchronous write path for eighteen months against loud pressure to "
                "make it async, because we had no idempotency story yet and duplicate side "
                "effects would have been unrecoverable. Shipping keys first changed my mind.",
    "wrong_about": "That schema migrations should always be backwards compatible. The "
                   "compatibility window itself became the thing nobody could reason about, "
                   "and a short planned outage would have cost us far less than two years of it.",
    "attachment_id": att["attachment_id"],
}
raw = json.dumps(app)                                       # sign these exact bytes
sig = hmac.new(token.encode(), raw.encode(), hashlib.sha256).hexdigest()
st, res, _ = call("/api/applications", "POST", raw,
                  {"Content-Type": "application/json", "X-App-Signature": sig})
print(f"  {st} · {res.get('confirmation_code')}")
print(f"  {res.get('disclosure', {}).get('headline')}")

st, status, _ = call(res["status_url"])
print(f"  status → {status['state']} (real: {status['real']})")
