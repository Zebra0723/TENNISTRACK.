// Full setup health check. Read-only unless --fix is passed.

import { logger, color } from "../lib/logger.js";
import { detectFramework, frameworkLabel } from "../lib/frameworkDetection.js";
import { detectPackageManager, readPackageJson } from "../lib/packageManager.js";
import { getGitInfo, envLocalIgnored, ensureSecretsIgnored, isGitRepo } from "../lib/gitSafety.js";
import { ghInstalled, ghLoggedIn } from "../lib/githubCli.js";
import { vercelInstalled, vercelLoggedIn, readVercelLink } from "../lib/vercelCli.js";
import { supabaseInstalled, supabaseLoggedIn, readSupabaseRef } from "../lib/supabaseCli.js";
import { readFileSafe, exists, writeIfMissing, ensureDir } from "../lib/filesystem.js";
import { envKeys } from "../lib/envParser.js";
import { isDangerousPublicSecret } from "../lib/secrets.js";
import { AGENT_DIR } from "../lib/filesystem.js";
import { loadConfig, saveConfig } from "../lib/config.js";

type Level = "ok" | "warn" | "info";
interface Check {
  level: Level;
  message: string;
}

function line(c: Check): void {
  if (c.level === "ok") logger.success(c.message);
  else if (c.level === "warn") logger.warn(c.message);
  else logger.info(c.message);
}

export async function doctor(opts: { fix?: boolean } = {}): Promise<void> {
  logger.heading(opts.fix ? "Doctor (with --fix)" : "Doctor — project health check");
  const checks: Check[] = [];

  // Framework + package manager.
  const framework = detectFramework();
  const pm = detectPackageManager();
  checks.push({ level: "info", message: `Framework: ${frameworkLabel(framework)}  •  Package manager: ${pm}` });

  // Git.
  const git = await getGitInfo();
  if (git.isRepo) {
    checks.push({ level: "ok", message: `Git repo detected (branch: ${git.branch ?? "?"}).` });
    checks.push({
      level: git.remoteUrl ? "ok" : "info",
      message: git.remoteUrl ? `GitHub remote: ${git.remoteUrl}` : "No GitHub remote yet (run `setup-agent github create-repo`).",
    });
  } else {
    checks.push({ level: "warn", message: "Not a Git repo yet. Run `git init` or `setup-agent github create-repo`." });
  }

  // GitHub CLI.
  if (ghInstalled()) checks.push({ level: (await ghLoggedIn()) ? "ok" : "warn", message: (await ghLoggedIn()) ? "GitHub CLI: logged in." : "GitHub CLI installed but not logged in (`gh auth login`)." });
  else checks.push({ level: "info", message: "GitHub CLI not installed (optional, but recommended)." });

  // Vercel.
  if (vercelInstalled()) {
    const vAuth = await vercelLoggedIn();
    const link = readVercelLink();
    checks.push({ level: vAuth ? "ok" : "warn", message: vAuth ? "Vercel CLI: logged in." : "Vercel CLI installed but not logged in (`vercel login`)." });
    checks.push({ level: link.linked ? "ok" : "info", message: link.linked ? `Vercel project linked: ${link.projectName ?? link.projectId}.` : "Vercel project not linked (`setup-agent vercel link`)." });
  } else {
    checks.push({ level: "info", message: "Vercel CLI not installed (`npm i -g vercel`)." });
  }

  // Supabase.
  if (supabaseInstalled()) {
    const sAuth = await supabaseLoggedIn();
    const ref = readSupabaseRef() ?? loadConfig().supabase?.projectRef;
    checks.push({ level: sAuth ? "ok" : "warn", message: sAuth ? "Supabase CLI: logged in." : "Supabase CLI installed but not logged in (`supabase login`)." });
    if (ref) checks.push({ level: "ok", message: `Supabase project ref on file: ${ref}.` });
  } else {
    checks.push({ level: "info", message: "Supabase CLI not installed (optional)." });
  }

  // Env files.
  const hasLocal = exists(".env.local");
  const hasExample = exists(".env.example");
  checks.push({ level: hasLocal ? "ok" : "info", message: hasLocal ? ".env.local present." : "No .env.local yet (that's fine if you have no secrets)." });
  checks.push({ level: hasExample ? "ok" : "warn", message: hasExample ? ".env.example present." : "No .env.example (helps others know which vars are needed)." });

  // .gitignore safety.
  const ignored = envLocalIgnored();
  checks.push({ level: ignored ? "ok" : "warn", message: ignored ? ".env.local is gitignored (secrets safe)." : ".env.local is NOT gitignored — your secrets could be committed!" });

  // Suspicious env names.
  const allKeys = [...envKeys(readFileSafe(".env.local") ?? ""), ...envKeys(readFileSafe(".env.example") ?? "")];
  const dangerous = [...new Set(allKeys.filter(isDangerousPublicSecret))];
  if (dangerous.length) checks.push({ level: "warn", message: `Risky public-named secrets: ${dangerous.join(", ")} (visible in the browser!).` });

  // Package scripts.
  const pkg = readPackageJson();
  if (pkg?.scripts?.build) checks.push({ level: "ok", message: `Build script present: "${pkg.scripts.build}".` });
  else checks.push({ level: "warn", message: 'No "build" script in package.json (most deploys need one).' });

  // Deployment-ready summary.
  const deployBlockers = checks.filter((c) => c.level === "warn").length;

  // Print.
  logger.blank();
  checks.forEach(line);
  logger.blank();
  if (deployBlockers === 0) {
    logger.success("Everything essential looks good. Nice work!");
  } else {
    logger.info(`${deployBlockers} thing(s) worth attention above. ${opts.fix ? "Applying safe fixes..." : "Run `setup-agent doctor --fix` to auto-fix the safe ones."}`);
  }

  if (opts.fix) await applySafeFixes();
}

// Only performs conservative, non-destructive fixes.
async function applySafeFixes(): Promise<void> {
  logger.heading("Applying safe fixes");

  // 1. .setup-agent folder + config.
  ensureDir(AGENT_DIR);
  const cfg = loadConfig();
  cfg.framework = detectFramework();
  cfg.packageManager = detectPackageManager();
  cfg.projectName = readPackageJson()?.name ?? cfg.projectName;
  saveConfig(cfg);
  logger.success("Ensured .setup-agent/ exists with a basic config.");

  // 2. .env.example if missing.
  if (writeIfMissing(".env.example", "# Environment variables required by this project.\n# Real values go in .env.local (never committed).\n")) {
    logger.success("Created a starter .env.example.");
  }

  // 3. Ensure secrets are gitignored.
  if (!isGitRepo()) logger.info("(No Git repo yet — .gitignore will still be updated for when you create one.)");
  const added = ensureSecretsIgnored();
  if (added.length) logger.success(`Added ${added.join(", ")} to .gitignore.`);
  else logger.info(".gitignore already protects your secret files.");

  logger.blank();
  logger.success("Safe fixes complete. I avoided anything risky (no deletes, no network changes).");
}
