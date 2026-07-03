// Wrapper around the Vercel CLI. Tokens are never printed; we rely on the CLI's
// own stored auth.

import path from "node:path";
import { commandExists, run } from "./commandRunner.js";
import { exists, readFileSafe } from "./filesystem.js";

export function vercelInstalled(): boolean {
  return commandExists("vercel") || commandExists("vc");
}

function bin(): string {
  return commandExists("vercel") ? "vercel" : "vc";
}

export async function vercelLoggedIn(): Promise<boolean> {
  if (!vercelInstalled()) return false;
  const res = await run(bin(), ["whoami"]);
  return res.ok;
}

export async function vercelWhoami(): Promise<string | undefined> {
  if (!vercelInstalled()) return undefined;
  const res = await run(bin(), ["whoami"]);
  return res.ok ? res.stdout.trim() : undefined;
}

// A project is "linked" when a .vercel/project.json exists locally.
export interface VercelLink {
  linked: boolean;
  projectId?: string;
  projectName?: string;
}

export function readVercelLink(cwd = process.cwd()): VercelLink {
  const p = path.join(cwd, ".vercel", "project.json");
  if (!exists(p)) return { linked: false };
  try {
    const parsed = JSON.parse(readFileSafe(p) ?? "{}") as {
      projectId?: string;
      projectName?: string;
      name?: string;
    };
    return { linked: true, projectId: parsed.projectId, projectName: parsed.projectName || parsed.name };
  } catch {
    return { linked: true };
  }
}

// Run `vercel link` interactively (safe: it only creates local link metadata).
export async function vercelLink(cwd = process.cwd()): Promise<boolean> {
  const res = await run(bin(), ["link"], { cwd, interactive: true });
  return res.ok;
}

// Add a single env var to a Vercel environment via `vercel env add`.
// The value is piped via stdin so it never appears in the process arg list.
export async function vercelEnvAdd(
  key: string,
  value: string,
  target: "development" | "preview" | "production",
  cwd = process.cwd(),
): Promise<{ ok: boolean; message: string }> {
  const res = await run(bin(), ["env", "add", key, target], { cwd, input: value + "\n" });
  // Vercel exits non-zero if the key already exists; surface that gently.
  if (!res.ok && /already exists/i.test(res.stderr + res.stdout)) {
    return { ok: false, message: "already exists" };
  }
  return { ok: res.ok, message: res.ok ? "added" : "failed" };
}
