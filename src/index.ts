#!/usr/bin/env node
// setup-agent — a commandable developer setup agent.
// Connect GitHub / Vercel / Supabase and do safe project plumbing, either with
// structured commands or plain English (`setup-agent do "..."`).

import { Command } from "commander";
import { logger } from "./lib/logger.js";
import * as connect from "./commands/connect.js";
import * as env from "./commands/env.js";
import * as vercel from "./commands/vercel.js";
import * as github from "./commands/github.js";
import * as supabase from "./commands/supabase.js";
import { doctor } from "./commands/doctor.js";
import { doCommand } from "./commands/do.js";

const program = new Command();

program
  .name("setup-agent")
  .description("Connect services and handle project setup safely, by command or plain English.")
  .version("1.0.0");

// --- connect ---
const connectCmd = program.command("connect").description("Connect this project to a service");
connectCmd.command("github").description("Connect GitHub (via the GitHub CLI)").action(wrap(connect.connectGithub));
connectCmd.command("vercel").description("Connect Vercel (via the Vercel CLI)").action(wrap(connect.connectVercel));
connectCmd.command("supabase").description("Connect Supabase (via the Supabase CLI)").action(wrap(connect.connectSupabase));
connectCmd.command("status").description("Show which services are connected").action(wrap(connect.connectStatus));

// --- env ---
const envCmd = program.command("env").description("Manage environment variables safely");
envCmd
  .command("add <assignment>")
  .description('Add one variable, e.g. env add NEXT_PUBLIC_SUPABASE_URL=https://...')
  .action(wrap((a: string) => env.envAdd(a)));
envCmd.command("add-bulk").description("Paste several KEY=value lines at once").action(wrap(env.envAddBulk));
envCmd.command("check").description("Compare .env.local vs .env.example and flag risks").action(wrap(env.envCheck));
envCmd
  .command("sync-vercel")
  .description("Push .env.local variables to Vercel")
  .option("-t, --target <env>", "development | preview | production", "preview")
  .action(wrap((opts: { target?: string }) => env.envSyncVercel(opts)));

// --- vercel ---
const vercelCmd = program.command("vercel").description("Vercel helpers");
vercelCmd.command("link").description("Link this project to a Vercel project").action(wrap(vercel.vercelLinkCmd));
const vercelEnv = vercelCmd.command("env").description("Vercel environment variables");
vercelEnv
  .command("sync")
  .description("Sync .env.local to Vercel")
  .option("-t, --target <env>", "development | preview | production", "preview")
  .action(wrap((opts: { target?: string }) => vercel.vercelEnvSync(opts)));
vercelEnv.command("check").description("Check which env keys appear required").action(wrap(vercel.vercelEnvCheck));
vercelCmd.command("deploy-check").description("Assess whether the project looks deploy-ready").action(wrap(vercel.vercelDeployCheck));

// --- github ---
const githubCmd = program.command("github").description("GitHub helpers");
githubCmd.command("status").description("Show git/GitHub status (read-only)").action(wrap(github.githubStatus));
githubCmd.command("create-repo").description("Create a GitHub repo from this folder").action(wrap(github.githubCreateRepo));
githubCmd.command("link").description("Link this folder to an existing GitHub repo").action(wrap(github.githubLink));

// --- supabase ---
const supabaseCmd = program.command("supabase").description("Supabase helpers");
supabaseCmd.command("prepare").description("Add Supabase client files + env placeholders").action(wrap(supabase.supabasePrepare));
supabaseCmd.command("setup-auth").description("Prepare Supabase auth (+ AUTH_SETUP.md)").action(wrap(supabase.supabaseSetupAuth));
supabaseCmd
  .command("create-table <description...>")
  .description('Generate a migration from a description, e.g. "profiles: username text"')
  .option("--allow-destructive", "permit destructive SQL (you still edit it yourself)", false)
  .action(wrap((parts: string[], opts: { allowDestructive?: boolean }) => supabase.supabaseCreateTable(parts.join(" "), opts)));
supabaseCmd
  .command("apply-migrations")
  .description("Apply migrations to the remote database (with confirmation)")
  .option("--allow-destructive", "permit destructive migrations", false)
  .action(wrap((opts: { allowDestructive?: boolean }) => supabase.supabaseApplyMigrations(opts)));
supabaseCmd
  .command("rls-basic [table]")
  .description("Generate basic Row Level Security policies for a table")
  .action(wrap((table?: string) => supabase.supabaseRlsBasic(table)));
supabaseCmd.command("test").description("Check that Supabase is configured (no secrets shown)").action(wrap(supabase.supabaseTest));

// --- doctor ---
program
  .command("doctor")
  .description("Full setup health check (use --fix to apply safe fixes)")
  .option("--fix", "apply safe, non-destructive fixes", false)
  .action(wrap((opts: { fix?: boolean }) => doctor(opts)));

// --- do (plain English) ---
program
  .command("do <instruction...>")
  .description('Plain-English command, e.g. do "add supabase auth"')
  .action(wrap((parts: string[]) => doCommand(parts.join(" "))));

program.parseAsync(process.argv).catch((err) => {
  logger.error(`Something went wrong: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});

// Wrap async command actions with a consistent error handler so one failing
// command never dumps a raw stack trace on a non-coder.
function wrap<A extends unknown[]>(fn: (...args: A) => void | Promise<void>) {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  };
}
