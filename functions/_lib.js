// Shared helpers. Files prefixed with "_" are not routed by Cloudflare Pages.

export const REQ = {
  public: "RE-8FF31",   // printed in the job description
  internal: "9a4c17",   // what gh_jid actually wants
  encoded: "OWE0YzE3",  // base64("9a4c17") — hidden in the JD footer
};

// Prompt-injection honeypot. Hidden in the JD; if it comes back in a
// submitted free-text field, the applicant pasted the page into an LLM.
export const CANARY = "synergy";

const enc = new TextEncoder();

function secretOf(env) {
  return (env && env.HP_SECRET) || "dev-secret-set-HP_SECRET-before-you-go-live";
}

export async function hmacHex(key, message) {
  const k = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newSid() {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((x) => x.toString(16).padStart(2, "0")).join("");
}

export const tokenForSid = (env, sid) => hmacHex(secretOf(env), `session:${sid}`);

export function cookies(request) {
  const out = {};
  (request.headers.get("Cookie") || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

export function cookieString(name, value, { maxAge = 21600, secure = true } = {}) {
  // Deliberately NOT HttpOnly — inspecting it in DevTools is part of the exercise.
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export const isSecure = (request) => new URL(request.url).protocol === "https:";

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

/** Returns { sid, token } or null. */
export async function session(request, env) {
  const sid = cookies(request).hp_sid;
  if (!sid || !/^[0-9a-f]{32}$/.test(sid)) return null;
  return { sid, token: await tokenForSid(env, sid) };
}

export const noSession = () =>
  json({
    error: "no_session",
    detail: "This endpoint requires an application session.",
    fix: "GET /.well-known/hiring.json first — it issues the session cookie.",
  }, 401);

// --- stateless signed blobs (used for attachment ids and grants) ---

const b64uEncode = (s) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uDecode = (s) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

export async function signBlob(env, obj) {
  const payload = b64uEncode(JSON.stringify(obj));
  const sig = (await hmacHex(secretOf(env), payload)).slice(0, 32);
  return `${payload}.${sig}`;
}

export async function verifyBlob(env, blob) {
  const [payload, sig] = String(blob || "").split(".");
  if (!payload || !sig) return null;
  const expect = (await hmacHex(secretOf(env), payload)).slice(0, 32);
  if (sig.length !== expect.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expect.charCodeAt(i);
  if (diff !== 0) return null;
  try { return JSON.parse(b64uDecode(payload)); } catch { return null; }
}

/** Confirmation code, deterministic from the session so status lookups are stateless. */
export async function confirmationCode(env, sid) {
  const h = await hmacHex(secretOf(env), `confirm:${sid}`);
  return `HP-${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`.toUpperCase();
}
