// Rule-based plain-English command router. No AI, no network — just ordered
// keyword rules mapping an instruction to one or more built-in intents.

export type Intent =
  | "connect.github"
  | "connect.vercel"
  | "connect.supabase"
  | "connect.status"
  | "env.check"
  | "env.add-bulk"
  | "env.sync-vercel"
  | "vercel.link"
  | "vercel.deploy-check"
  | "github.status"
  | "github.create-repo"
  | "supabase.prepare"
  | "supabase.setup-auth"
  | "supabase.create-table"
  | "supabase.rls-basic"
  | "supabase.apply-migrations"
  | "supabase.test"
  | "doctor"
  | "stub.stripe"
  | "stub.resend"
  | "stub.clerk"
  | "stub.uploadthing";

export interface RouteStep {
  intent: Intent;
  // Plain-English description of what this step will do.
  label: string;
  // Risky steps must be confirmed before running.
  risky: boolean;
  // Optional captured payload (e.g. a table description).
  payload?: string;
  // If set, we need to ask the user this before we can act.
  clarify?: string;
}

export interface RouteResult {
  matched: boolean;
  steps: RouteStep[];
  // A friendly note shown to the user (e.g. why we chose these steps).
  note?: string;
}

interface Rule {
  test: (s: string) => boolean;
  build: (original: string) => RouteStep[];
}

const has = (s: string, ...words: string[]) => words.every((w) => s.includes(w));
const any = (s: string, ...words: string[]) => words.some((w) => s.includes(w));

// Rules are evaluated in order; the FIRST matching rule wins (except a couple
// of combined intents that push multiple steps).
const rules: Rule[] = [
  // --- Deployment readiness (multi-step) ---
  {
    test: (s) =>
      (any(s, "deploy", "deployment", "ship", "production") && any(s, "ready", "prepare", "check")) ||
      has(s, "ready", "deploy"),
    build: () => [
      { intent: "doctor", label: "Run a full health check of your project", risky: false },
      { intent: "vercel.deploy-check", label: "Check whether it looks ready to deploy on Vercel", risky: false },
    ],
  },

  // --- Connect flows (explicit "connect"/"log in"/"sign in") ---
  {
    test: (s) => any(s, "connect", "log in", "login", "sign in", "authenticate") && s.includes("github"),
    build: () => [{ intent: "connect.github", label: "Connect this project to GitHub", risky: false }],
  },
  {
    test: (s) => any(s, "connect", "log in", "login", "sign in", "authenticate") && s.includes("vercel"),
    build: () => [{ intent: "connect.vercel", label: "Connect this project to Vercel", risky: false }],
  },
  {
    test: (s) =>
      any(s, "connect", "log in", "login", "sign in", "authenticate") &&
      s.includes("supabase") &&
      !any(s, "auth", "table", "rls"),
    build: () => [{ intent: "connect.supabase", label: "Connect this project to Supabase", risky: false }],
  },

  // --- Status / which services ---
  {
    test: (s) =>
      any(s, "which service", "what service", "what's connected", "whats connected", "connection status") ||
      (has(s, "are", "connected")) ||
      (any(s, "show", "list") && s.includes("connect")),
    build: () => [{ intent: "connect.status", label: "Show which services are connected", risky: false }],
  },

  // --- Supabase auth ---
  {
    test: (s) => s.includes("supabase") && s.includes("auth"),
    build: () => [{ intent: "supabase.setup-auth", label: "Set up Supabase authentication", risky: false }],
  },
  {
    test: (s) => (s.includes("auth") || has(s, "sign", "up") || has(s, "log", "in")) && !s.includes("vercel") && !s.includes("github"),
    build: () => [{ intent: "supabase.setup-auth", label: "Set up Supabase authentication", risky: false }],
  },

  // --- Supabase RLS ---
  {
    test: (s) => any(s, "rls", "row level security", "row-level security", "security policy", "security policies"),
    build: () => [{ intent: "supabase.rls-basic", label: "Generate basic Row Level Security policies", risky: false }],
  },

  // --- Create table ---
  {
    test: (s) => any(s, "create table", "make a table", "make table", "new table", "add a table") || (s.includes("table") && any(s, "create", "make", "add", "generate")) || has(s, "save", "progress") || has(s, "store", "data"),
    build: (original) => {
      const payload = extractTableDescription(original);
      const clarify = payload ? undefined : "What should the table be called and what fields should it have? For example: \"lesson_progress with user_id, lesson_id, completed, xp\".";
      return [
        {
          intent: "supabase.create-table",
          label: payload ? `Create a Supabase migration for: ${payload}` : "Create a Supabase table (needs details)",
          risky: false,
          payload,
          clarify,
        },
      ];
    },
  },

  // --- Apply migrations (risky: touches remote DB) ---
  {
    test: (s) => any(s, "apply migration", "run migration", "push migration", "apply the migration", "migrate the database", "run migrations"),
    build: () => [{ intent: "supabase.apply-migrations", label: "Apply Supabase migrations to the remote database", risky: true }],
  },

  // --- Test supabase ---
  {
    test: (s) => s.includes("supabase") && any(s, "test", "work", "working", "connection"),
    build: () => [{ intent: "supabase.test", label: "Test whether Supabase is configured correctly", risky: false }],
  },

  // --- Add / set up Supabase (prepare) ---
  {
    test: (s) => s.includes("supabase") && any(s, "add", "set up", "setup", "prepare", "use", "install", "for this"),
    build: () => [{ intent: "supabase.prepare", label: "Add Supabase to this project (client files + env placeholders)", risky: false }],
  },

  // --- Env: sync to Vercel ---
  {
    test: (s) =>
      (any(s, "sync", "push", "upload", "send", "add") && s.includes("env") && s.includes("vercel")) ||
      has(s, "env", "to", "vercel"),
    build: (original) => {
      const steps: RouteStep[] = [];
      if (any(original.toLowerCase(), "local", "and vercel", "both")) {
        steps.push({ intent: "env.add-bulk", label: "Add the env variables to your local .env.local", risky: false });
      }
      steps.push({ intent: "env.sync-vercel", label: "Sync env variables to Vercel", risky: true });
      return steps;
    },
  },

  // --- Env: check / missing ---
  {
    test: (s) => s.includes("env") && any(s, "check", "missing", "compare", "verify", "audit"),
    build: () => [{ intent: "env.check", label: "Check your env variables for missing or risky keys", risky: false }],
  },

  // --- Env: add (bulk) ---
  {
    test: (s) => s.includes("env") && any(s, "add", "paste", "set", "put"),
    build: () => [{ intent: "env.add-bulk", label: "Add env variables to .env.local (and placeholders to .env.example)", risky: false }],
  },

  // --- Vercel link ---
  {
    test: (s) => s.includes("vercel") && any(s, "link", "connect", "set up", "setup"),
    build: () => [{ intent: "vercel.link", label: "Link this project to Vercel", risky: false }],
  },

  // --- GitHub: create repo / push (risky) ---
  {
    test: (s) => s.includes("github") && any(s, "create", "make", "new repo", "put", "push", "upload") || any(s, "create a repo", "make a repo", "new repository"),
    build: () => [{ intent: "github.create-repo", label: "Create a GitHub repo from this folder", risky: true }],
  },

  // --- GitHub status ---
  {
    test: (s) => s.includes("github") && any(s, "status", "check", "logged in", "connected"),
    build: () => [{ intent: "github.status", label: "Show GitHub connection status", risky: false }],
  },

  // --- Doctor / health ---
  {
    test: (s) => any(s, "doctor", "health check", "check everything", "what's wrong", "whats wrong", "diagnose", "is everything ok"),
    build: () => [{ intent: "doctor", label: "Run a full project health check", risky: false }],
  },

  // --- Stubs for later services ---
  {
    test: (s) => s.includes("stripe") || has(s, "payment"),
    build: () => [{ intent: "stub.stripe", label: "Stripe support (coming soon)", risky: false }],
  },
  {
    test: (s) => s.includes("resend") || has(s, "email"),
    build: () => [{ intent: "stub.resend", label: "Resend email support (coming soon)", risky: false }],
  },
  {
    test: (s) => s.includes("clerk"),
    build: () => [{ intent: "stub.clerk", label: "Clerk auth support (coming soon)", risky: false }],
  },
  {
    test: (s) => s.includes("uploadthing") || any(s, "file upload", "upload files", "file uploads"),
    build: () => [{ intent: "stub.uploadthing", label: "UploadThing file uploads (coming soon)", risky: false }],
  },
];

// Try to pull a table description out of a free-form instruction.
export function extractTableDescription(original: string): string | undefined {
  // Look for "table for X", "table called X ...", or an explicit "name: cols".
  const patterns = [
    /table\s+(?:for|called|named)\s+(.+)$/i,
    /(?:create|make|add|generate)\s+(?:a\s+)?(.+?\bwith\b.+)$/i,
    /table[:\-]\s*(.+)$/i,
  ];
  for (const re of patterns) {
    const m = original.match(re);
    if (m && m[1]) {
      const candidate = m[1].trim();
      // Only accept if it looks like it contains field-ish detail.
      if (/[,]|\bwith\b|\bhaving\b|:/i.test(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

export function routePlainEnglish(instruction: string): RouteResult {
  const s = instruction.toLowerCase().trim();
  if (!s) return { matched: false, steps: [], note: "Please describe what you'd like to do." };

  for (const rule of rules) {
    if (rule.test(s)) {
      const steps = rule.build(instruction);
      if (steps.length) return { matched: true, steps };
    }
  }
  return {
    matched: false,
    steps: [],
    note: "I couldn't match that to a known setup task. Try `setup-agent --help` to see available commands.",
  };
}
