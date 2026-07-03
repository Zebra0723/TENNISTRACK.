// Detect the package manager and read package.json scripts/deps.

import fs from "node:fs";
import path from "node:path";
import { exists } from "./filesystem.js";
import type { PackageManager } from "../types.js";

export interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function readPackageJson(cwd = process.cwd()): PackageJson | null {
  const p = path.join(cwd, "package.json");
  if (!exists(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

export function detectPackageManager(cwd = process.cwd()): PackageManager {
  if (exists(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (exists(path.join(cwd, "yarn.lock"))) return "yarn";
  if (exists(path.join(cwd, "bun.lockb")) || exists(path.join(cwd, "bun.lock"))) return "bun";
  if (exists(path.join(cwd, "package-lock.json"))) return "npm";
  // Fall back to npm if a package.json exists at all.
  if (exists(path.join(cwd, "package.json"))) return "npm";
  return "unknown";
}

// Build the "install a dependency" command for the detected manager.
export function installCommand(pm: PackageManager, pkg: string): { cmd: string; args: string[] } {
  switch (pm) {
    case "pnpm":
      return { cmd: "pnpm", args: ["add", pkg] };
    case "yarn":
      return { cmd: "yarn", args: ["add", pkg] };
    case "bun":
      return { cmd: "bun", args: ["add", pkg] };
    default:
      return { cmd: "npm", args: ["install", pkg] };
  }
}

export function hasDependency(pkgJson: PackageJson | null, dep: string): boolean {
  if (!pkgJson) return false;
  return Boolean(pkgJson.dependencies?.[dep] || pkgJson.devDependencies?.[dep]);
}
