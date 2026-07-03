// Load, create, and save the local .setup-agent/config.json.
// This file only ever holds NON-secret connection metadata.

import fs from "node:fs";
import path from "node:path";
import { AGENT_DIR, LOG_DIR, BACKUP_DIR, ensureDir, exists } from "./filesystem.js";
import type { AgentConfig } from "../types.js";

export const CONFIG_PATH = path.join(AGENT_DIR, "config.json");
const CONFIG_VERSION = 1;

// Keys that must never appear in the config file, even if a caller tries.
const FORBIDDEN_KEY_HINTS = ["SECRET", "TOKEN", "PASSWORD", "KEY", "SERVICE_ROLE", "PRIVATE"];

export function defaultConfig(): AgentConfig {
  return { version: CONFIG_VERSION };
}

export function loadConfig(): AgentConfig {
  if (!exists(CONFIG_PATH)) return defaultConfig();
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as AgentConfig;
    if (typeof parsed !== "object" || parsed === null) return defaultConfig();
    parsed.version ??= CONFIG_VERSION;
    return parsed;
  } catch {
    // Corrupt config should never crash the tool; fall back to defaults.
    return defaultConfig();
  }
}

// Defensive scrub: strip any accidentally-secret-looking top-level string values.
function scrub(config: AgentConfig): AgentConfig {
  const clone: Record<string, unknown> = JSON.parse(JSON.stringify(config));
  for (const [k, v] of Object.entries(clone)) {
    const upper = k.toUpperCase();
    if (typeof v === "string" && FORBIDDEN_KEY_HINTS.some((h) => upper.includes(h))) {
      delete clone[k];
    }
  }
  return clone as unknown as AgentConfig;
}

export function saveConfig(config: AgentConfig): void {
  ensureDir(AGENT_DIR);
  ensureDir(LOG_DIR);
  ensureDir(BACKUP_DIR);
  const safe = scrub(config);
  safe.version = CONFIG_VERSION;
  // updatedAt is set by callers who pass a timestamp; we don't generate one here
  // to keep this module deterministic and testable.
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(safe, null, 2) + "\n", "utf8");
}

// Convenience: apply a partial update and persist.
export function updateConfig(patch: Partial<AgentConfig>): AgentConfig {
  const current = loadConfig();
  const next = { ...current, ...patch };
  saveConfig(next);
  return next;
}
