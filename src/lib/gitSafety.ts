// Git-related safety checks. We never commit or push here — we only inspect
// state and make sure secret files are ignored before any GitHub action.

import path from "node:path";
import { exists, readFileSafe, ensureLineInFile } from "./filesystem.js";
import { run, commandExists } from "./commandRunner.js";

const SECRET_FILES = [".env", ".env.local", ".env.*.local"];

export function isGitRepo(cwd = process.cwd()): boolean {
  return exists(path.join(cwd, ".git"));
}

function readGitignore(cwd = process.cwd()): string {
  return readFileSafe(path.join(cwd, ".gitignore")) ?? "";
}

// Is a given path ignored according to a simple line-match of .gitignore?
// (Good enough for the exact patterns we care about; not a full parser.)
export function isIgnored(pattern: string, cwd = process.cwd()): boolean {
  const lines = readGitignore(cwd)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.includes(pattern) || lines.includes(pattern.replace(/^\//, ""));
}

export function envLocalIgnored(cwd = process.cwd()): boolean {
  return isIgnored(".env.local", cwd) || isIgnored(".env*", cwd) || isIgnored(".env.*.local", cwd);
}

// Ensure the common secret files are present in .gitignore. Returns the list of
// patterns that were newly added.
export function ensureSecretsIgnored(cwd = process.cwd()): string[] {
  const gitignorePath = path.join(cwd, ".gitignore");
  const added: string[] = [];
  for (const pattern of SECRET_FILES) {
    if (!isIgnored(pattern, cwd)) {
      if (ensureLineInFile(gitignorePath, pattern)) added.push(pattern);
    }
  }
  return added;
}

export interface GitInfo {
  isRepo: boolean;
  branch?: string;
  remoteUrl?: string;
}

// Inspect the repo without mutating anything.
export async function getGitInfo(cwd = process.cwd()): Promise<GitInfo> {
  if (!isGitRepo(cwd) || !commandExists("git")) return { isRepo: false };
  const branchRes = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
  const remoteRes = await run("git", ["remote", "get-url", "origin"], { cwd });
  return {
    isRepo: true,
    branch: branchRes.ok ? branchRes.stdout : undefined,
    remoteUrl: remoteRes.ok ? remoteRes.stdout : undefined,
  };
}
