// Best-effort framework detection from package.json + known config files.

import path from "node:path";
import { exists } from "./filesystem.js";
import { readPackageJson, type PackageJson } from "./packageManager.js";
import type { Framework } from "../types.js";

function dep(pkg: PackageJson | null, name: string): boolean {
  if (!pkg) return false;
  return Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

export function detectFramework(cwd = process.cwd()): Framework {
  const pkg = readPackageJson(cwd);

  if (
    dep(pkg, "next") ||
    exists(path.join(cwd, "next.config.js")) ||
    exists(path.join(cwd, "next.config.mjs")) ||
    exists(path.join(cwd, "next.config.ts"))
  ) {
    return "next";
  }
  if (dep(pkg, "@remix-run/react") || dep(pkg, "@remix-run/node")) return "remix";
  if (dep(pkg, "astro")) return "astro";
  if (dep(pkg, "@sveltejs/kit")) return "sveltekit";
  if (dep(pkg, "nuxt") || dep(pkg, "nuxt3")) return "nuxt";
  if (dep(pkg, "vite")) return "vite";
  if (dep(pkg, "react-scripts")) return "create-react-app";
  if (pkg) return "node";
  return "unknown";
}

// Whether this framework treats NEXT_PUBLIC_ style prefixes as public.
export function isNextLike(framework: Framework): boolean {
  return framework === "next";
}

export function frameworkLabel(framework: Framework): string {
  const labels: Record<Framework, string> = {
    next: "Next.js",
    vite: "Vite",
    remix: "Remix",
    astro: "Astro",
    sveltekit: "SvelteKit",
    nuxt: "Nuxt",
    "create-react-app": "Create React App",
    node: "Node.js",
    unknown: "Unknown",
  };
  return labels[framework];
}
