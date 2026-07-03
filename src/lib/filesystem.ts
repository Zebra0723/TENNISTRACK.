// Filesystem helpers with a safety-first bent: always back up before overwriting
// an existing file, and keep everything scoped to the current project directory.

import fs from "node:fs";
import path from "node:path";

export const AGENT_DIR = ".setup-agent";
export const BACKUP_DIR = path.join(AGENT_DIR, "backups");
export const LOG_DIR = path.join(AGENT_DIR, "logs");

export function exists(p: string): boolean {
  return fs.existsSync(p);
}

export function readFileSafe(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

export function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

// Deterministic-ish backup name. We intentionally avoid Date.now() elsewhere,
// but backups need uniqueness; a high-resolution counter keeps names unique
// within a run without leaking wall-clock into deterministic code paths.
let backupCounter = 0;
function backupSuffix(): string {
  backupCounter += 1;
  const hr = process.hrtime.bigint().toString(36);
  return `${hr}-${backupCounter}`;
}

// Copy an existing file into .setup-agent/backups before it is modified.
// Returns the backup path, or null if there was nothing to back up.
export function backupFile(filePath: string): string | null {
  if (!exists(filePath)) return null;
  ensureDir(BACKUP_DIR);
  const base = path.basename(filePath);
  const dest = path.join(BACKUP_DIR, `${base}.${backupSuffix()}.bak`);
  fs.copyFileSync(filePath, dest);
  return dest;
}

// Write a file, backing up any existing content first. Returns the backup path
// (if a previous version existed) so callers can tell the user.
export function writeFileWithBackup(filePath: string, contents: string): string | null {
  const backup = backupFile(filePath);
  const dir = path.dirname(filePath);
  if (dir && dir !== ".") ensureDir(dir);
  fs.writeFileSync(filePath, contents, "utf8");
  return backup;
}

// Create a file only if it does not already exist. Returns true if created.
export function writeIfMissing(filePath: string, contents: string): boolean {
  if (exists(filePath)) return false;
  const dir = path.dirname(filePath);
  if (dir && dir !== ".") ensureDir(dir);
  fs.writeFileSync(filePath, contents, "utf8");
  return true;
}

// Append a line to a text file (creating it if needed), avoiding duplicates.
export function ensureLineInFile(filePath: string, line: string): boolean {
  const existing = readFileSafe(filePath) ?? "";
  const lines = existing.split(/\r?\n/).map((l) => l.trim());
  if (lines.includes(line.trim())) return false;
  const needsNewline = existing.length > 0 && !existing.endsWith("\n");
  fs.writeFileSync(filePath, existing + (needsNewline ? "\n" : "") + line + "\n", "utf8");
  return true;
}
