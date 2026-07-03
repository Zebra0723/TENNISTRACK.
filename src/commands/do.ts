// The plain-English command. Routes an instruction to built-in commands, shows
// the plan, confirms risky steps, then executes safe ones.

import { logger, color } from "../lib/logger.js";
import { confirm } from "../lib/prompt.js";
import { routePlainEnglish, type Intent, type RouteStep } from "../lib/plainEnglishRouter.js";
import * as connect from "./connect.js";
import * as env from "./env.js";
import * as vercel from "./vercel.js";
import * as github from "./github.js";
import * as supabase from "./supabase.js";
import { doctor } from "./doctor.js";

async function runIntent(step: RouteStep): Promise<void> {
  const intent: Intent = step.intent;
  switch (intent) {
    case "connect.github": return connect.connectGithub();
    case "connect.vercel": return connect.connectVercel();
    case "connect.supabase": return connect.connectSupabase();
    case "connect.status": return connect.connectStatus();
    case "env.check": return env.envCheck();
    case "env.add-bulk": return env.envAddBulk();
    case "env.sync-vercel": return env.envSyncVercel({});
    case "vercel.link": return vercel.vercelLinkCmd();
    case "vercel.deploy-check": return vercel.vercelDeployCheck();
    case "github.status": return github.githubStatus();
    case "github.create-repo": return github.githubCreateRepo();
    case "supabase.prepare": return supabase.supabasePrepare();
    case "supabase.setup-auth": return supabase.supabaseSetupAuth();
    case "supabase.create-table": return supabase.supabaseCreateTable(step.payload ?? "");
    case "supabase.rls-basic": return supabase.supabaseRlsBasic();
    case "supabase.apply-migrations": return supabase.supabaseApplyMigrations();
    case "supabase.test": return supabase.supabaseTest();
    case "doctor": return doctor();
    case "stub.stripe":
      return stub("Stripe test payments");
    case "stub.resend":
      return stub("Resend email sending");
    case "stub.clerk":
      return stub("Clerk authentication");
    case "stub.uploadthing":
      return stub("UploadThing file uploads");
    default:
      logger.warn(`No handler for intent "${intent}" yet.`);
  }
}

function stub(name: string): void {
  logger.heading(name);
  logger.info(`${name} isn't wired up in v1 yet — it's on the roadmap.`);
  logger.hint("For now, add its API keys with `setup-agent env add KEY=value` and I'll keep them safe.");
}

export async function doCommand(instruction: string): Promise<void> {
  const text = (instruction ?? "").trim();
  if (!text) {
    logger.error('Tell me what to do, e.g.  setup-agent do "add supabase to this project"');
    return;
  }

  const result = routePlainEnglish(text);
  if (!result.matched) {
    logger.warn(result.note ?? "I couldn't understand that.");
    logger.hint("Try `setup-agent --help`, or rephrase. Examples: \"add supabase\", \"sync env to vercel\", \"is this ready to deploy\".");
    return;
  }

  // Show the plan.
  logger.heading("Here's my plan");
  result.steps.forEach((s, i) => {
    const tag = s.risky ? color.yellow(" (needs confirmation)") : "";
    logger.info(`  ${i + 1}. ${s.label}${tag}`);
  });
  logger.blank();

  // If any step needs clarification we can't safely proceed with, surface it.
  const needsClarify = result.steps.find((s) => s.clarify);
  if (needsClarify?.clarify) {
    logger.warn("I need a bit more detail first:");
    logger.info(`  ${needsClarify.clarify}`);
    logger.hint(`Re-run with specifics, e.g.  setup-agent supabase create-table "profiles: username text, bio text"`);
    return;
  }

  // Execute steps in order, confirming risky ones.
  for (const step of result.steps) {
    if (step.risky) {
      const ok = await confirm(`Step "${step.label}" can make outside changes. Run it?`);
      if (!ok) {
        logger.info(`Skipped: ${step.label}`);
        continue;
      }
    }
    logger.blank();
    await runIntent(step);
  }

  logger.blank();
  logger.success("Done with your request.");
}
