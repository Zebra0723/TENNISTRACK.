// Supabase commands: prepare, auth, create-table, apply-migrations, rls, test.

import path from "node:path";
import { logger, color } from "../lib/logger.js";
import { ask, confirm } from "../lib/prompt.js";
import {
  exists,
  readFileSafe,
  writeIfMissing,
  writeFileWithBackup,
  ensureDir,
} from "../lib/filesystem.js";
import { upsertEnvLine, envKeys } from "../lib/envParser.js";
import { ensureSecretsIgnored } from "../lib/gitSafety.js";
import { detectFramework, isNextLike } from "../lib/frameworkDetection.js";
import { readPackageJson, detectPackageManager, installCommand, hasDependency } from "../lib/packageManager.js";
import { run, commandExists } from "../lib/commandRunner.js";
import { supabaseInstalled, supabaseInitialized, readSupabaseRef } from "../lib/supabaseCli.js";
import {
  parseTableDescription,
  generateCreateTableSql,
  migrationFilename,
} from "../lib/migrationGenerator.js";
import { rlsPolicyMigration } from "../templates/migrationTemplates.js";
import { supabaseBrowserClient } from "../templates/supabaseClient.js";
import { supabaseServerClient } from "../templates/supabaseServer.js";
import { authSetupMarkdown } from "../templates/authSetupMd.js";
import { loadConfig } from "../lib/config.js";

const MIGRATIONS_DIR = path.join("supabase", "migrations");
const PUBLIC_URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const PUBLIC_ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
const SERVICE_KEY = "SUPABASE_SERVICE_ROLE_KEY";

// Ensure a set of env placeholders exist in .env.example (and keys in .env.local).
function ensureEnvPlaceholders(keys: string[]): void {
  let example = readFileSafe(".env.example") ?? "";
  for (const k of keys) {
    if (!envKeys(example).includes(k)) example = upsertEnvLine(example, k, "");
  }
  writeFileWithBackup(".env.example", example);
}

export async function supabasePrepare(): Promise<void> {
  logger.heading("Prepare Supabase for this project");

  const pkg = readPackageJson();
  const pm = detectPackageManager();

  // 1. Install @supabase/supabase-js if missing.
  if (!hasDependency(pkg, "@supabase/supabase-js")) {
    const { cmd, args } = installCommand(pm, "@supabase/supabase-js");
    logger.info(`Installing @supabase/supabase-js with ${cmd}...`);
    const res = await run(cmd, args, { interactive: true });
    if (res.ok) logger.success("Installed @supabase/supabase-js.");
    else logger.warn(`Could not install automatically. Run:  ${cmd} ${args.join(" ")}`);
  } else {
    logger.success("@supabase/supabase-js is already installed.");
  }

  // 2. Client files.
  const clientDir = "lib";
  ensureDir(clientDir);
  const browserPath = path.join(clientDir, "supabaseClient.ts");
  const serverPath = path.join(clientDir, "supabaseServer.ts");
  if (writeIfMissing(browserPath, supabaseBrowserClient)) logger.success(`Created ${browserPath} (browser-safe client).`);
  else logger.info(`${browserPath} already exists — left it untouched.`);
  if (writeIfMissing(serverPath, supabaseServerClient)) logger.success(`Created ${serverPath} (server-only client).`);
  else logger.info(`${serverPath} already exists — left it untouched.`);

  // 3. Env placeholders.
  ensureEnvPlaceholders([PUBLIC_URL_KEY, PUBLIC_ANON_KEY, SERVICE_KEY]);
  logger.success(`Added env placeholders to .env.example: ${PUBLIC_URL_KEY}, ${PUBLIC_ANON_KEY}, ${SERVICE_KEY}.`);
  ensureSecretsIgnored();

  // 4. supabase/migrations folder.
  ensureDir(MIGRATIONS_DIR);
  logger.success(`Ensured ${MIGRATIONS_DIR}/ exists for your SQL migrations.`);

  logger.blank();
  logger.warn(`${SERVICE_KEY} is a powerful server-only secret — never import it into browser/client code.`);
  logger.info("Next: paste your real values with `setup-agent env add NEXT_PUBLIC_SUPABASE_URL=...` etc.");
}

export async function supabaseSetupAuth(): Promise<void> {
  logger.heading("Set up Supabase authentication");

  const framework = detectFramework();
  if (!isNextLike(framework)) {
    logger.info(`Detected ${framework}. The generated helpers assume Next.js, but the guidance still applies.`);
  }

  // Make sure the base client setup exists.
  if (!hasDependency(readPackageJson(), "@supabase/supabase-js")) {
    logger.info("Supabase client isn't set up yet — running prepare first.");
    await supabasePrepare();
    logger.blank();
  }

  ensureEnvPlaceholders([PUBLIC_URL_KEY, PUBLIC_ANON_KEY, SERVICE_KEY]);

  // Generate AUTH_SETUP.md with concrete URLs.
  const localUrl = "http://localhost:3000";
  const cfg = loadConfig();
  const productionUrl = cfg.vercel?.projectName ? `https://${cfg.vercel.projectName}.vercel.app` : undefined;
  const md = authSetupMarkdown({ localUrl, productionUrl });
  const backup = writeFileWithBackup("AUTH_SETUP.md", md);
  if (backup) logger.success(`Updated AUTH_SETUP.md (previous version backed up to ${backup}).`);
  else logger.success("Created AUTH_SETUP.md with step-by-step auth instructions.");

  logger.blank();
  logger.info("What you need to do in the Supabase dashboard (also written to AUTH_SETUP.md):");
  logger.info(`  1. Set Site URL to your production URL (${productionUrl ?? "your Vercel URL"}).`);
  logger.info(`  2. Add redirect URLs for local (${localUrl}/**) and production (.../**).`);
  logger.info("  3. Enable the sign-in providers you want (Email, Google, GitHub, ...).");
  logger.blank();
  logger.hint("Automatic redirect-URL updates aren't done without your confirmation — the safe manual steps are above.");
}

export async function supabaseCreateTable(
  description: string,
  opts: { allowDestructive?: boolean } = {},
): Promise<void> {
  logger.heading("Create a Supabase table migration");

  let desc = description?.trim() ?? "";
  if (!desc) {
    desc = (await ask('Describe the table (e.g. "profiles: username text, bio text"):')).trim();
  }

  const parsed = parseTableDescription(desc);
  if (parsed.vague) {
    logger.warn(`I couldn't safely build that table — ${parsed.reason}.`);
    logger.hint('Try something like:  setup-agent supabase create-table "lesson_progress with user_id, lesson_id, completed, xp"');
    return;
  }

  // Warn about (and never perform) destructive intent unless explicitly allowed.
  if (/\bdrop\b|\bdelete\b|\btruncate\b/i.test(desc) && !opts.allowDestructive) {
    logger.warn("Your description mentions a destructive operation. I only generate additive migrations.");
    logger.hint("Re-run with --allow-destructive if you truly intend destructive SQL (you'll still edit it yourself).");
  }

  const sql = generateCreateTableSql(parsed);
  ensureDir(MIGRATIONS_DIR);
  const filename = migrationFilename(parsed.tableName, new Date());
  const filePath = path.join(MIGRATIONS_DIR, filename);
  writeFileWithBackup(filePath, sql);

  logger.success(`Created migration ${color.bold(filePath)}.`);
  logger.info(`Table: ${color.bold(parsed.tableName)} with columns: id, ${parsed.columns.map((c) => c.name).join(", ")}, created_at, updated_at.`);
  logger.blank();
  logger.info("The migration is additive only (no DROP/DELETE). Review it, then apply with:");
  logger.hint("  setup-agent supabase apply-migrations   (or in the Supabase SQL editor)");
}

export async function supabaseRlsBasic(tableName?: string): Promise<void> {
  logger.heading("Generate basic Row Level Security policies");

  let table = tableName?.trim();
  if (!table) {
    table = (await ask("Which table should these policies protect?")).trim();
  }
  if (!table) {
    logger.warn("No table name given. Nothing was generated.");
    return;
  }

  const ownerCol = (await ask("Which column holds the owner's user id? [user_id]:", "user_id")) || "user_id";
  const sql = rlsPolicyMigration(table, ownerCol);
  ensureDir(MIGRATIONS_DIR);
  const filePath = path.join(MIGRATIONS_DIR, migrationFilename(`${table}_rls`, new Date()));
  writeFileWithBackup(filePath, sql);

  logger.success(`Created RLS migration ${color.bold(filePath)}.`);
  logger.info(`These policies let each signed-in user read and write only the rows where ${ownerCol} equals their own id.`);
  logger.hint("Review it, then apply with `setup-agent supabase apply-migrations`. Not applied automatically.");
}

export async function supabaseApplyMigrations(opts: { allowDestructive?: boolean } = {}): Promise<void> {
  logger.heading("Apply Supabase migrations");

  if (!supabaseInstalled()) {
    logger.error("The Supabase CLI isn't installed, so I can't apply migrations.");
    logger.hint("Install it:  npm i -g supabase   then `supabase login`.");
    return;
  }
  const ref = readSupabaseRef() ?? loadConfig().supabase?.projectRef;
  if (!supabaseInitialized() && !ref) {
    logger.warn("This project isn't linked to a Supabase project.");
    logger.hint("Run `setup-agent connect supabase` and `supabase link --project-ref <ref>` first.");
    return;
  }

  // List what would be applied.
  const dir = MIGRATIONS_DIR;
  if (!exists(dir)) {
    logger.info("No migrations folder found. Create a migration first with `setup-agent supabase create-table`.");
    return;
  }
  const files = (readFileSafe("/dev/null"), await listMigrations(dir));
  if (!files.length) {
    logger.info("No migration files to apply.");
    return;
  }
  logger.info("Migrations found:");
  files.forEach((f) => logger.info(`  • ${f}`));

  // Guard against destructive SQL unless explicitly allowed.
  const destructive = await anyDestructive(dir, files);
  if (destructive && !opts.allowDestructive) {
    logger.error("One or more migrations contain destructive SQL (DROP/DELETE/TRUNCATE).");
    logger.hint("Re-run with --allow-destructive if you are absolutely sure.");
    return;
  }

  logger.blank();
  logger.warn("This will push these migrations to your REMOTE Supabase database.");
  const ok = await confirm("Apply them now?");
  if (!ok) {
    logger.info("Cancelled. No migrations were applied.");
    return;
  }

  const res = await run("supabase", ["db", "push"], { interactive: true });
  if (res.ok) logger.success("Migrations applied successfully.");
  else logger.error("Applying migrations failed. See the output above.");
}

export async function supabaseTest(): Promise<void> {
  logger.heading("Test Supabase configuration");

  const example = envKeys(readFileSafe(".env.example") ?? "");
  const local = new Set(envKeys(readFileSafe(".env.local") ?? ""));
  const needed = [PUBLIC_URL_KEY, PUBLIC_ANON_KEY];
  const missing = needed.filter((k) => !local.has(k));

  if (missing.length) {
    logger.warn(`Missing required Supabase env values in .env.local: ${missing.join(", ")}.`);
    logger.hint("Add them with `setup-agent env add NEXT_PUBLIC_SUPABASE_URL=...` (and the anon key).");
    return;
  }
  logger.success("Both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are present in .env.local.");

  if (!example.includes(PUBLIC_URL_KEY)) {
    logger.hint("Tip: run `setup-agent supabase prepare` to document these in .env.example too.");
  }

  // Optional lightweight reachability check via the CLI (no secrets printed).
  if (supabaseInstalled() && commandExists("supabase")) {
    logger.info("Supabase CLI detected — your local setup looks good.");
  }
  logger.blank();
  logger.success("Supabase looks configured. (This checks configuration; it does not read your secret values.)");
}

// --- helpers ---
import fs from "node:fs";
async function listMigrations(dir: string): Promise<string[]> {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return [];
  }
}
async function anyDestructive(dir: string, files: string[]): Promise<boolean> {
  for (const f of files) {
    const content = readFileSafe(path.join(dir, f)) ?? "";
    if (/\bdrop\b|\bdelete\b|\btruncate\b/i.test(content)) return true;
  }
  return false;
}
