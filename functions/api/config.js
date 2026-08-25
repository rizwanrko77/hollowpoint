import { session, noSession, json } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  const s = await session(request, env);
  if (!s) return noSession();

  const scope = new URL(request.url).searchParams.get("scope") || "public";

  const base = {
    scope,
    app_name: "Hollowpoint Applications",
    autosave: true,
    max_resume_url_length: 300,
  };

  if (scope === "full") {
    return json({
      ...base,
      attach: {
        grant_url: "/api/attach/grant",
        commit_url: "/api/attach",
        grant_ttl_seconds: 25,
        grant_min_interval_seconds: 10,
        flow: [
          "POST /api/attach/grant — returns a short-lived grant.",
          "POST /api/attach with header X-Attach-Grant and body {resume_url} — returns attachment_id.",
          "The grant expires. Get it, use it, don't sit on it.",
        ],
      },
    }, 200, { "X-Application-Stage": "4" });
  }

  return json({
    ...base,
    attach: null,
    available_scopes: ["public", "full"],
    _note: "scope=public omits keys the form needs. Session-bound scopes are not restricted; they are just not the default.",
  }, 200, { "X-Application-Stage": "4" });
}
