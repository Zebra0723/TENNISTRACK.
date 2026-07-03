// Wrapper around the Supabase CLI. Service role keys must never be logged.

import path from "node:path";
import { commandExists, run } from "./commandRunner.js";
import { exists, readFileSafe } from "./filesystem.js";

export function supabaseInstalled(): boolean {
  return commandExists("supabase");
}

export async function supabaseLoggedIn(): Promise<boolean> {
  if (!supabaseInstalled()) return false;
  // `supabase projects list` requires auth; success implies logged in.
  const res = await run("supabase", ["projects", "list"]);
  return res.ok;
}

// A project is "linked" when supabase/.temp/project-ref (or config) exists.
export function readSupabaseRef(cwd = process.cwd()): string | undefined {
  const refFile = path.join(cwd, "supabase", ".temp", "project-ref");
  if (exists(refFile)) {
    const ref = readFileSafe(refFile)?.trim();
    if (ref) return ref;
  }
  return undefined;
}

export function supabaseInitialized(cwd = process.cwd()): boolean {
  return exists(path.join(cwd, "supabase", "config.toml"));
}
