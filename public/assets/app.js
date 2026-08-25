/* Hollowpoint application client.
   Everything here is inspectable on purpose. window.__HP__ is the handle. */
(function () {
  "use strict";

  var DRAFT_KEY = "hp.draft";
  var OVERRIDE_KEY = "hp.schema.override";

  var HP = (window.__HP__ = {
    version: "2026.08.3",
    schema: null,
    config: null,
    data: {},
    attachment_id: null,
    step: 1,

    loadSchema: loadSchema,
    loadConfig: loadConfig,
    setStepEnabled: setStepEnabled,
    payload: payload,
    go: go,
    reset: function () {
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(OVERRIDE_KEY);
      location.reload();
    },
  });

  var $panel = document.getElementById("panel");
  var $stepper = document.getElementById("stepper");

  // ---------- storage ----------

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        data: HP.data, attachment_id: HP.attachment_id, step: HP.step,
      }));
    } catch (e) { /* private mode; not fatal */ }
  }

  function loadDraft() {
    try {
      var d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
      HP.data = d.data || {};
      HP.attachment_id = d.attachment_id || null;
      HP.step = d.step || 1;
    } catch (e) { /* ignore */ }
  }

  // ---------- api ----------

  async function api(url, opts) {
    var res = await fetch(url, Object.assign({ credentials: "same-origin" }, opts || {}));
    var body = null;
    try { body = await res.json(); } catch (e) { /* non-json */ }
    return { ok: res.ok, status: res.status, headers: res.headers, body: body };
  }

  async function loadSchema(opts) {
    opts = opts || {};
    var all = opts.all || localStorage.getItem(OVERRIDE_KEY) === "all";
    var r = await api("/api/form-schema" + (all ? "?include=all" : ""));
    if (!r.ok) throw new Error("form-schema " + r.status + ": " + JSON.stringify(r.body));
    HP.schema = r.body;
    return HP.schema;
  }

  async function loadConfig(opts) {
    opts = opts || {};
    var r = await api("/api/config" + (opts.scope ? "?scope=" + encodeURIComponent(opts.scope) : ""));
    if (!r.ok) throw new Error("config " + r.status);
    HP.config = r.body;
    return HP.config;
  }

  /* Enables a withheld step. The client cannot invent fields it was never sent,
     so this refetches the full schema and then renders. */
  async function setStepEnabled(id, on) {
    if (on === false) {
      var s = stepById(id); if (s) s.enabled = false; render(); return HP.schema;
    }
    await loadSchema({ all: true });
    localStorage.setItem(OVERRIDE_KEY, "all");
    render();
    return HP.schema;
  }

  function stepById(id) {
    return (HP.schema && HP.schema.steps || []).filter(function (s) { return s.id === id; })[0];
  }

  function visibleSteps() {
    return (HP.schema && HP.schema.steps || []).filter(function (s) { return s.enabled; });
  }

  function totalSteps() {
    return (HP.schema && HP.schema.total_steps) || 5;
  }

  // ---------- assembled payload ----------

  function payload() {
    var out = {};
    Object.keys(HP.data).forEach(function (k) {
      if (k === "resume_url") return; // becomes attachment_id
      out[k] = HP.data[k];
    });
    if (HP.attachment_id) out.attachment_id = HP.attachment_id;
    return out;
  }

  // ---------- rendering ----------

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderStepper() {
    var vis = visibleSteps();
    var html = HP.step === "review"
      ? '<span class="stepper-count">Review</span>'
      : '<span class="stepper-count">Step ' + HP.step + " of " + totalSteps() + "</span>";
    vis.forEach(function (s) {
      html += '<button type="button" class="pip" data-go="' + s.id + '"' +
        (s.id === HP.step ? ' aria-current="true"' : "") +
        (s.id < HP.step ? ' data-done="1"' : "") + ">" + esc(s.title || s.key) + "</button>";
    });
    if (HP.step === "review") {
      html += '<button type="button" class="pip" aria-current="true">Review</button>';
    }
    $stepper.innerHTML = html;
  }

  function fieldHtml(f) {
    var v = HP.data[f.name] == null ? "" : HP.data[f.name];
    var h = '<div class="f">';
    h += '<label for="' + f.name + '">' + esc(f.label) + (f.required ? "" : ' <span class="hint">— optional</span>') + "</label>";
    if (f.hint) h += '<p class="hint" id="' + f.name + '-hint">' + esc(f.hint) + "</p>";
    var described = f.hint ? ' aria-describedby="' + f.name + '-hint"' : "";

    if (f.type === "textarea") {
      h += '<textarea id="' + f.name + '" name="' + f.name + '" maxlength="' + (f.maxlength || 900) + '"' + described + ">" + esc(v) + "</textarea>";
      h += '<div class="count" data-count-for="' + f.name + '"></div>';
    } else if (f.type === "select") {
      h += '<select id="' + f.name + '" name="' + f.name + '"' + described + '><option value="">Choose one</option>';
      (f.options || []).forEach(function (o) {
        h += '<option value="' + esc(o) + '"' + (v === o ? " selected" : "") + ">" + esc(o) + "</option>";
      });
      h += "</select>";
    } else if (f.name === "resume_url") {
      h += '<div class="attach-row">';
      h += '<input id="resume_url" name="resume_url" type="url" value="' + esc(v) + '" placeholder="https://" ' + described + ">";
      h += '<button type="button" class="btn" id="attach-btn">Attach link</button>';
      h += "</div>";
      h += '<div class="attach-state" id="attach-state"></div>';
    } else {
      h += '<input id="' + f.name + '" name="' + f.name + '" type="' + esc(f.type || "text") + '" value="' + esc(v) + '"' + described + ">";
    }
    return h + "</div>";
  }

  function renderStep(step) {
    var h = '<div class="step-head"><h1>' + esc(step.title) + "</h1></div>";
    (step.fields || []).forEach(function (f) { h += fieldHtml(f); });

    var vis = visibleSteps();
    var idx = vis.map(function (s) { return s.id; }).indexOf(step.id);
    var isLastVisible = idx === vis.length - 1;
    var allEnabled = vis.length === totalSteps();

    h += '<div class="nav">';
    if (idx > 0) h += '<button type="button" class="btn ghost" data-go="' + vis[idx - 1].id + '">Back</button>';
    if (!isLastVisible) {
      h += '<button type="button" class="btn" data-go="' + vis[idx + 1].id + '">Continue</button>';
    } else if (allEnabled) {
      h += '<button type="button" class="btn" data-go="review">Review</button>';
    } else {
      h += '<button type="button" class="btn" data-go="review">Review</button>';
    }
    h += "</div>";
    return h;
  }

  function renderWithheld(id) {
    return '<div class="step-head"><p class="eyebrow">step ' + id + '</p><h1>Withheld from this view.</h1></div>' +
      '<p class="hint">Step ' + id + ' exists in the form schema, but this client requested the ' +
      'reduced view and the server did not send its fields. Nothing is broken and nothing is ' +
      'hidden from you — the schema endpoint documents how to ask for the whole thing.</p>' +
      '<div class="nav"><button type="button" class="btn ghost" data-go="1">Back to step 1</button></div>';
  }

  function renderReview() {
    var vis = visibleSteps();
    var missing = totalSteps() - vis.length;
    var h = '<div class="step-head"><p class="eyebrow">final</p><h1>Review</h1></div>';

    h += '<div class="review"><dl class="fields-rule">';
    vis.forEach(function (s) {
      (s.fields || []).forEach(function (f) {
        if (f.name === "resume_url") return;
        var v = HP.data[f.name];
        h += '<div class="field"><dt>' + esc(f.name) + "</dt><dd>" +
          (v ? esc(String(v).slice(0, 120)) + (String(v).length > 120 ? "…" : "") : '<span class="sub">— empty</span>') +
          "</dd></div>";
      });
    });
    h += '<div class="field"><dt>attachment_id</dt><dd>' +
      (HP.attachment_id ? esc(HP.attachment_id.slice(0, 28)) + "…" : '<span class="sub">— not attached</span>') +
      "</dd></div>";
    h += "</dl></div>";

    h += '<div class="review-final">';
    if (missing > 0) {
      h += "Review is incomplete: " + missing + " step" + (missing === 1 ? " is" : "s are") +
        " still withheld from this client. The server will reject an application that skips them.<br><br>";
    }
    h += "There is no submit control on this page. Submitting is a signed request; the " +
      "protocol is documented at <code>/.well-known/hiring.json</code>. This form element " +
      "carries the endpoint it expects.";
    h += "</div>";

    h += '<div class="nav"><button type="button" class="btn ghost" data-go="' +
      (vis.length ? vis[vis.length - 1].id : 1) + '">Back</button></div>';
    return h;
  }

  function renderDone(code) {
    return '<div class="done-card">' +
      '<p class="eyebrow">201 created</p>' +
      "<h1>Application submitted.</h1>" +
      '<div class="code">' + esc(code) + "</div>" +
      "<p>You cleared every gate in this flow:</p>" +
      "<ol>" +
      "<li>Corrected a link whose visible text and target disagreed.</li>" +
      "<li>Read a 410 as a signpost instead of a dead end.</li>" +
      "<li>Decoded the internal posting id out of the page.</li>" +
      "<li>Recovered two form steps this client was told to hide.</li>" +
      "<li>Diagnosed a button that failed on a withheld config key.</li>" +
      "<li>Used a 25-second grant against a 10-second rate limit.</li>" +
      "<li>Signed and posted a payload with no submit control in the DOM.</li>" +
      "</ol>" +
      '<div class="disclose">' +
      "<strong>This was not a real application.</strong>" +
      "<p>Hollowpoint is not a company, this is not a job, and nobody is going to read " +
      "what you wrote. It is a mock — a demonstration of an application process built " +
      "entirely out of obstacles. There is no next round and you will not hear back, " +
      "because there is nobody on the other end. Thanks for playing it through.</p>" +
      "</div></div>";
  }

  // ---------- attach flow (gate 4) ----------

  async function runAttach() {
    var input = document.getElementById("resume_url");
    var state = document.getElementById("attach-state");
    var link = (input.value || "").trim();

    function say(tone, msg) {
      state.className = "attach-state on";
      state.setAttribute("data-tone", tone);
      state.textContent = msg;
    }

    if (!link) { say("bad", "Enter a link first."); return; }

    // The button is wired. It fails because the config it needs was never delivered.
    if (!HP.config || !HP.config.attach) {
      var err = new Error(
        "HP-4001 attach unavailable: config.attach is null. GET /api/config returned " +
        'scope="' + ((HP.config && HP.config.scope) || "public") + '", which omits the attach ' +
        "endpoints. That response lists the scopes it will serve. window.__HP__.loadConfig() " +
        "is how this client asks."
      );
      err.name = "ConfigError";
      console.error(err);
      say("bad", "HP-4001 — attach unavailable. Details in the console.");
      return;
    }

    try {
      say("", "Requesting grant…");
      var g = await api(HP.config.attach.grant_url, { method: "POST" });

      if (g.status === 429) {
        var wait = g.headers.get("Retry-After") || (g.body && g.body.retry_after_seconds) || "?";
        say("bad", "HP-4029 — rate limited. Retry-After: " + wait + "s.");
        console.warn("Grant rate limited.", g.body);
        return;
      }
      if (!g.ok) { say("bad", "HP-4090 — grant failed (" + g.status + "). See console."); console.error(g.body); return; }

      say("", "Grant held, expires " + g.body.ttl_seconds + "s. Committing…");

      var c = await api(HP.config.attach.commit_url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Attach-Grant": g.body.grant },
        body: JSON.stringify({ resume_url: link }),
      });

      if (!c.ok) {
        say("bad", "HP-4" + c.status + " — " + ((c.body && c.body.error) || "attach failed") + ". See console.");
        console.error(c.body);
        return;
      }

      HP.attachment_id = c.body.attachment_id;
      HP.data.resume_url = link;
      saveDraft();
      say("ok", "Linked to " + c.body.host + ". Nothing was uploaded.");
    } catch (e) {
      say("bad", "Attach threw. See console.");
      console.error(e);
    }
  }

  // ---------- navigation ----------

  function collect() {
    var nodes = $panel.querySelectorAll("input, select, textarea");
    Array.prototype.forEach.call(nodes, function (n) {
      if (!n.name) return;
      HP.data[n.name] = n.value;
    });
    saveDraft();
  }

  function go(target) {
    collect();
    HP.step = target;
    if (target !== "review") location.hash = "#/step/" + target;
    else location.hash = "#/review";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function render() {
    var doneCode = readCookie("hp_done");
    if (doneCode) {
      $stepper.innerHTML = "";
      $stepper.style.display = "none";
      $panel.innerHTML = renderDone(doneCode);
      return;
    }

    renderStepper();

    if (HP.step === "review") { $panel.innerHTML = renderReview(); wire(); return; }

    var step = stepById(HP.step);
    if (!step) { HP.step = 1; step = stepById(1); }
    $panel.innerHTML = step.enabled ? renderStep(step) : renderWithheld(step.id);
    wire();
  }

  function wire() {
    Array.prototype.forEach.call($panel.querySelectorAll("[data-go]"), function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-go");
        go(v === "review" ? "review" : parseInt(v, 10));
      });
    });
    var attach = document.getElementById("attach-btn");
    if (attach) attach.addEventListener("click", runAttach);

    Array.prototype.forEach.call($panel.querySelectorAll("textarea"), function (t) {
      var c = $panel.querySelector('[data-count-for="' + t.name + '"]');
      function upd() { if (c) c.textContent = t.value.length + " / " + (t.maxLength > 0 ? t.maxLength : "—"); }
      t.addEventListener("input", upd); upd();
    });

    $panel.addEventListener("change", collect);
  }

  $stepper.addEventListener("click", function (e) {
    var b = e.target.closest("[data-go]");
    if (b) go(parseInt(b.getAttribute("data-go"), 10));
  });

  function readCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  // Watch for a completed submission made from outside this client.
  setInterval(function () {
    if (readCookie("hp_done") && !document.querySelector(".done-card")) render();
  }, 1500);

  // ---------- boot ----------

  (async function boot() {
    loadDraft();

    var m = location.hash.match(/#\/step\/(\d+)/);
    if (m) HP.step = parseInt(m[1], 10);
    else if (/#\/review/.test(location.hash)) HP.step = "review";

    try {
      await loadSchema();
      await loadConfig();
    } catch (e) {
      $panel.innerHTML = '<div class="step-head"><h1>Session lost.</h1></div>' +
        '<p class="hint">' + esc(e.message) + '</p>' +
        '<div class="nav"><a class="btn" href="/">Back to the posting</a></div>';
      console.error(e);
      return;
    }

    console.info(
      "%cHollowpoint application client " + HP.version,
      "font-weight:600",
      "\nwindow.__HP__ is the handle. The form schema, the config document and the " +
      "protocol at /.well-known/hiring.json are the three things worth reading."
    );

    render();
  })();
})();
