// Shared types for setup-agent.

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "unknown";

export type Framework =
  | "next"
  | "vite"
  | "remix"
  | "astro"
  | "sveltekit"
  | "nuxt"
  | "create-react-app"
  | "node"
  | "unknown";

export interface ServiceStatus {
  connected: boolean;
  // Human-readable, non-secret detail (e.g. repo URL, project name, project ref).
  detail?: string;
}

export interface AgentConfig {
  version: number;
  projectName?: string;
  framework?: Framework;
  packageManager?: PackageManager;
  github?: ServiceStatus & { repoUrl?: string; defaultBranch?: string };
  vercel?: ServiceStatus & { projectId?: string; projectName?: string };
  supabase?: ServiceStatus & { projectRef?: string };
  // Optional later services — stored as simple status flags only.
  stripe?: ServiceStatus;
  resend?: ServiceStatus;
  clerk?: ServiceStatus;
  uploadthing?: ServiceStatus;
  updatedAt?: string;
}

export interface ParsedEnvVar {
  key: string;
  value: string;
}
