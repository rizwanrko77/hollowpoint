import {
  REQ, newSid, tokenForSid, session, cookies,
  cookieString, isSecure, json,
} from "./_lib.js";

const SHELL = (title, body) => `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/style.css">
</head><body class="notice">${body}</body></html>`;

function gonePage(url, given) {
  const reason = given === null
    ? "This URL carried no <code>gh_jid</code> parameter at all."
    : given === ""
    ? "The <code>gh_jid</code> parameter arrived empty."
    : `<code>${escapeHtml(given)}</code> is not an internal posting id.`;

  return SHELL("Posting not reachable — Hollowpoint", `
<main class="notice-card">
  <p class="status-line"><span class="status-code">410</span> <span>Gone</span></p>
  <h1>This posting is not reachable from this URL.</h1>
  <p class="notice-body">${reason} Internal posting ids are six hexadecimal
  characters. The public reference <code>${REQ.public}</code> is not one.</p>
  <p class="notice-body dim">The posting itself is still open. It is reachable from
  a URL you can construct. Nothing here is broken — this response is the intended one.</p>
  <p class="notice-foot">Response headers on this request carry the next step.</p>
  <p class="notice-foot"><a href="/">Back to the posting</a> &nbsp;·&nbsp; <a href="/access.html">Trouble getting through?</a></p>
</main>`);
}

function lockedPage() {
  return SHELL("Application locked — Hollowpoint", `
<main class="notice-card">
  <p class="status-line"><span class="status-code">403</span> <span>Forbidden</span></p>
  <h1>No application session.</h1>
  <p class="notice-body">The application form is served only to sessions that arrived
  through the posting link with a valid internal id.</p>
  <p class="notice-foot"><a href="/">Back to the posting</a> &nbsp;·&nbsp; <a href="/access.html">Trouble getting through?</a></p>
</main>`);
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const html = (body, status, extra = {}) => new Response(body, {
  status,
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...extra },
});

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  // Collapse repeated slashes for matching only, so /apply//jobs still lands here.
  const path = url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  const secure = isSecure(request);

  // ---- /.well-known/hiring.json : issues the session + documents the protocol
  if (path === "/.well-known/hiring.json") {
    const existing = cookies(request).hp_sid;
    const sid = existing && /^[0-9a-f]{32}$/.test(existing) ? existing : newSid();
    const token = await tokenForSid(env, sid);

    return json({
      posting: {
        public_ref: REQ.public,
        status: "open",
        entry: "/apply/jobs?gh_jid={internal_id}",
        internal_id_format: "six lowercase hex characters",
        internal_id_hint:
          "The posting footer carries it. It is encoded, not hidden — the string you want is not the string that is printed.",
      },
      session: {
        token,
        cookie: "hp_sid",
        note: "Keep this token. Every signed request below is keyed with it.",
      },
      protocol: {
        signing: {
          algorithm: "HMAC-SHA256",
          key: "the session token above, as a UTF-8 string",
          message: "the exact raw request body you are about to send, byte for byte",
          encoding: "lowercase hex",
          header: "X-App-Signature",
        },
        submit: {
          method: "POST",
          url: "/api/applications",
          content_type: "application/json",
          body: "one JSON object keyed by the field names in GET /api/form-schema",
          required_headers: ["Content-Type", "X-App-Signature"],
          note: "There is no submit control in the form. This is the submit control.",
        },
        scopes: {
          detail: "Some endpoints return a reduced document by default.",
          usage: "?scope=full on /api/config, ?include=all on /api/form-schema",
        },
      },
      support: "/access.html",
    }, 200, {
      "Set-Cookie": cookieString("hp_sid", sid, { secure }),
      "X-Application-Stage": "1",
    });
  }

  // ---- Gate 1: the posting link
  if (path === "/apply/jobs") {
    const given = url.searchParams.get("gh_jid");

    if (given === REQ.internal) {
      const existing = cookies(request).hp_sid;
      const sid = existing && /^[0-9a-f]{32}$/.test(existing) ? existing : newSid();
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/apply/",
          "Set-Cookie": cookieString("hp_sid", sid, { secure }),
          "Cache-Control": "no-store",
        },
      });
    }

    return html(gonePage(url, given), 410, {
      "X-Application-Next": "/.well-known/hiring.json",
      "X-Application-Stage": "0",
    });
  }

  // ---- Guard the form itself
  if (path === "/apply" || path.startsWith("/apply/")) {
    if (!(await session(request, env))) return html(lockedPage(), 403);
  }

  return next();
}
