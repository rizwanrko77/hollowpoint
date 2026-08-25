import {
  session, noSession, json, signBlob, cookies, cookieString, isSecure,
} from "../../_lib.js";

const TTL_MS = 25_000;
const MIN_INTERVAL_MS = 10_000;

export async function onRequestPost({ request, env }) {
  const s = await session(request, env);
  if (!s) return noSession();

  const now = Date.now();
  const last = Number(cookies(request).hp_grant_at || 0);
  const waited = now - last;

  if (last && waited < MIN_INTERVAL_MS) {
    const retryAfter = Math.ceil((MIN_INTERVAL_MS - waited) / 1000);
    return json({
      error: "rate_limited",
      detail: `Grants are issued at most once every ${MIN_INTERVAL_MS / 1000} seconds.`,
      retry_after_seconds: retryAfter,
      fix: "Read the Retry-After header and wait. A tight retry loop will not get through this.",
    }, 429, {
      "Retry-After": String(retryAfter),
      "Set-Cookie": cookieString("hp_grant_at", String(last), { secure: isSecure(request), maxAge: 60 }),
    });
  }

  const expires_at = now + TTL_MS;
  const grant = await signBlob(env, { sid: s.sid, exp: expires_at, kind: "attach" });

  return json({
    grant,
    expires_at: new Date(expires_at).toISOString(),
    ttl_seconds: TTL_MS / 1000,
    next: "POST /api/attach with header X-Attach-Grant",
  }, 200, {
    "Set-Cookie": cookieString("hp_grant_at", String(now), { secure: isSecure(request), maxAge: 60 }),
    "X-Application-Stage": "4",
  });
}

export const onRequestGet = () =>
  json({ error: "method_not_allowed", detail: "Grants are issued on POST." }, 405,
       { Allow: "POST" });
