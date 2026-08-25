import { session, noSession, json } from "../_lib.js";

const STEPS = [
  {
    id: 1, key: "basics", title: "Basics", enabled: true,
    fields: [
      { name: "full_name", label: "Full name", type: "text", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "location", label: "Where you're based", type: "text", required: true,
        hint: "City and UTC offset." },
    ],
  },
  {
    id: 2, key: "profile", title: "Profile", enabled: true,
    fields: [
      { name: "primary_url", label: "Primary profile", type: "url", required: true,
        hint: "GitHub, GitLab, a personal site — wherever your work actually lives." },
      { name: "secondary_url", label: "Secondary profile", type: "url", required: false },
    ],
  },
  {
    id: 3, key: "shape", title: "Shape of the work", enabled: true,
    fields: [
      { name: "years", label: "Years building software", type: "number", required: true },
      { name: "scope", label: "Scope you're aiming at", type: "select", required: true,
        options: ["Staff engineer", "Engineering lead", "CTO"] },
      { name: "largest_system", label: "Largest thing you've owned end to end",
        type: "textarea", required: true, maxlength: 600 },
    ],
  },
  {
    id: 4, key: "judgement", title: "Judgement", enabled: false,
    fields: [
      { name: "tradeoff", type: "textarea", required: true, maxlength: 900,
        label: "A decision you made that was correct and unpopular",
        hint: "What you gave up, and what would have changed your mind." },
      { name: "wrong_about", type: "textarea", required: true, maxlength: 900,
        label: "Something you believed about building software in 2021 that you no longer believe" },
    ],
  },
  {
    id: 5, key: "attach", title: "Attach résumé", enabled: false,
    fields: [
      { name: "resume_url", label: "Résumé or profile link", type: "url", required: true,
        hint: "A link. Nothing is uploaded — we don't take files." },
    ],
  },
];

export async function onRequestGet({ request, env }) {
  const s = await session(request, env);
  if (!s) return noSession();

  const url = new URL(request.url);
  const all = url.searchParams.get("include") === "all";

  const steps = STEPS.map((step) => {
    if (all || step.enabled) return { ...step, enabled: true };
    // Reduced view: the step exists, but the server won't say what's in it.
    return { id: step.id, key: step.key, enabled: false, withheld: true };
  });

  return json({
    version: "2026.08.3",
    total_steps: STEPS.length,
    returned: all ? "all" : "enabled_only",
    steps,
    ...(all ? {} : {
      _note: `${STEPS.filter((s) => !s.enabled).length} step(s) withheld from this view.`,
      _params: { include: ["enabled_only (default)", "all"] },
    }),
  }, 200, { "X-Application-Stage": "3" });
}
