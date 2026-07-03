// Vercel helper commands.

import { logger, color } from "../lib/logger.js";
import { vercelInstalled, vercelLoggedIn, vercelLink, readVercelLink } from "../lib/vercelCli.js";
import { readFileSafe, exists } from "../lib/filesystem.js";
import { envKeys } from "../lib/envParser.js";
import { readPackageJson } from "../lib/packageManager.js";
import { envLocalIgnored } from "../lib/gitSafety.js";
import { updateConfig } from "../lib/config.js";
import { envSyncVercel } from "./env.js";

export async function vercelLinkCmd(): Promise<void> {
  logger.heading("Link project to Vercel");

  if (!vercelInstalled()) {
    logger.error("The Vercel CLI isn't installed.");
    logger.hint("Install it:  npm i -g vercel");
    return;
  }
  if (!(await vercelLoggedIn())) {
    logger.error("You're not logged in to Vercel.");
    logger.hint("Run:  vercel login");
    return;
  }

  const link = readVercelLink();
  if (link.linked) {
    logger.success(`Already linked to ${color.bold(link.projectName ?? link.projectId ?? "a Vercel project")}.`);
    return;
  }

  logger.info("Opening the Vercel link flow. This only writes a local .vercel/ folder — it's safe.");
  const ok = await vercelLink();
  if (!ok) {
    logger.warn("Linking didn't complete. You can run `vercel link` manually any time.");
    return;
  }
  const fresh = readVercelLink();
  updateConfig({ vercel: { connected: true, projectId: fresh.projectId, projectName: fresh.projectName } });
  logger.success(`Linked to Vercel project ${color.bold(fresh.projectName ?? fresh.projectId ?? "")}.`);
}

// `setup-agent vercel env sync` — reuse the shared implementation.
export async function vercelEnvSync(opts: { target?: string } = {}): Promise<void> {
  await envSyncVercel(opts);
}

// `setup-agent vercel env check` — compare required keys (from .env.example) to
// what appears configured. We can't read secret values, only key presence.
export async function vercelEnvCheck(): Promise<void> {
  logger.heading("Vercel env check");

  const required = envKeys(readFileSafe(".env.example") ?? "");
  if (!required.length) {
    logger.info("No .env.example found (or it's empty), so I can't tell which keys are required.");
    logger.hint("Run `setup-agent env add KEY=value` to build up an .env.example automatically.");
    return;
  }

  logger.info("Keys your project appears to require (from .env.example):");
  required.forEach((k) => logger.info(`  • ${k}`));
  logger.blank();

  if (!readVercelLink().linked) {
    logger.warn("Project isn't linked to Vercel, so I can't compare against what's set there.");
    logger.hint("Run `setup-agent vercel link`, then `setup-agent vercel env sync` to push them.");
    return;
  }
  logger.hint("To push these to Vercel: `setup-agent vercel env sync --target production`.");
  logger.info("(No secret values are read or shown by this command.)");
}

// `setup-agent vercel deploy-check` — read-only readiness assessment.
export async function vercelDeployCheck(): Promise<void> {
  logger.heading("Deployment readiness check");

  const problems: string[] = [];
  const notes: string[] = [];

  // 1. Linked?
  const link = readVercelLink();
  if (link.linked) notes.push(`Linked to Vercel project ${link.projectName ?? link.projectId}.`);
  else problems.push("Not linked to Vercel yet — run `setup-agent vercel link`.");

  // 2. Build script present?
  const pkg = readPackageJson();
  if (pkg?.scripts?.build) notes.push(`Found a build script: "${pkg.scripts.build}".`);
  else problems.push('No "build" script in package.json — most frameworks need one to deploy.');

  // 3. Required env keys present locally?
  const required = envKeys(readFileSafe(".env.example") ?? "");
  const localKeys = new Set(envKeys(readFileSafe(".env.local") ?? ""));
  const missing = required.filter((k) => !localKeys.has(k));
  if (required.length && missing.length) {
    problems.push(`Missing env values locally: ${missing.join(", ")}. Remember to also set them on Vercel.`);
  } else if (required.length) {
    notes.push("All documented env keys are present in .env.local.");
  }

  // 4. Secrets safe?
  if (exists(".env.local") && !envLocalIgnored()) {
    problems.push(".env.local is not gitignored — fix with `setup-agent doctor --fix` before deploying.");
  }

  logger.blank();
  notes.forEach((n) => logger.success(n));
  problems.forEach((p) => logger.warn(p));

  logger.blank();
  if (!problems.length) {
    logger.success("Looks ready to deploy! When you want to ship it, run:  vercel --prod");
  } else {
    logger.info(`Found ${problems.length} thing(s) to sort out before deploying. I did NOT deploy anything.`);
  }
}
