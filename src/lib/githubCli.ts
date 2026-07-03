// Wrapper around the GitHub CLI (`gh`). We prefer official CLI login flows and
// never store GitHub tokens ourselves.

import { commandExists, run } from "./commandRunner.js";

export function ghInstalled(): boolean {
  return commandExists("gh");
}

export async function ghLoggedIn(): Promise<boolean> {
  if (!ghInstalled()) return false;
  const res = await run("gh", ["auth", "status"]);
  return res.ok;
}

// Non-secret account label (login name) if available.
export async function ghAccount(): Promise<string | undefined> {
  if (!ghInstalled()) return undefined;
  const res = await run("gh", ["api", "user", "--jq", ".login"]);
  return res.ok ? res.stdout.trim() : undefined;
}
