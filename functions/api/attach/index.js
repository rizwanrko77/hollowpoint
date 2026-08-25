import { session, noSession, json, signBlob, verifyBlob } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  const s = await session(request, env);
  if (!s) return noSession();

  const raw = request.headers.get("X-Attach-Grant");
  if (!raw) {
    return json({
      error: "grant_missing",
      detail: "This endpoint needs a grant in the X-Attach-Grant header.",
      fix: "POST /api/attach/grant first.",
    }, 400);
  }

  const grant = await verifyBlob(env, raw);
  if (!grant || grant.kind !== "attach") {
    return json({ error: "grant_invalid", detail: "The grant did not verify." }, 400);
  }
  if (grant.sid !== s.sid) {
    return json({
      error: "grant_foreign",
      detail: "That grant was issued to a different session.",
      fix: "Grants are not transferable. Issue your own.",
    }, 403);
  }
  if (Date.now() > grant.exp) {
    return json({
      error: "grant_expired",
      detail: "The grant expired before this request arrived.",
      expired_at: new Date(grant.exp).toISOString(),
      fix: "Request a grant and use it inside its TTL. Chain the two calls.",
    }, 410);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: "bad_json", detail: "Body must be JSON." }, 400); }

  const link = String(body.resume_url || "").trim();
  let parsed;
  try { parsed = new URL(link); } catch {
    return json({
      error: "resume_url_invalid",
      detail: "resume_url must be an absolute URL.",
      example: "https://github.com/yourname",
    }, 422);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return json({ error: "resume_url_scheme", detail: "Only http and https." }, 422);
  }

  const attachment_id = await signBlob(env, {
    sid: s.sid, url: parsed.toString(), at: Date.now(), kind: "attachment",
  });

  return json({
    attachment_id,
    host: parsed.host,
    detail: "Link recorded. Nothing was uploaded — this system does not accept files.",
    next: "Include attachment_id in the submitted application object.",
  }, 201, { "X-Application-Stage": "5" });
}
