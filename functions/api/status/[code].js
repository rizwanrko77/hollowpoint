import { session, noSession, json, confirmationCode } from "../../_lib.js";

export async function onRequestGet({ request, env, params }) {
  const s = await session(request, env);
  if (!s) return noSession();

  const expected = await confirmationCode(env, s.sid);
  const given = String(params.code || "").toUpperCase();

  if (given !== expected) {
    return json({
      error: "unknown_code",
      detail: "No submission under that code for this session.",
    }, 404);
  }

  return json({
    confirmation_code: expected,
    state: "received",
    real: false,
    detail: "Received and acknowledged. This is a demonstration posting — no review will follow.",
  });
}
