// Service connection commands + a combined status view.

import { logger, color } from "../lib/logger.js";
import { ask } from "../lib/prompt.js";
import { loadConfig, updateConfig } from "../lib/config.js";
import { detectFramework, frameworkLabel } from "../lib/frameworkDetection.js";
import { detectPackageManager, readPackageJson } from "../lib/packageManager.js";
import { ghInstalled, ghLoggedIn, ghAccount } from "../lib/githubCli.js";
import { vercelInstalled, vercelLoggedIn, vercelWhoami, readVercelLink } from "../lib/vercelCli.js";
import { supabaseInstalled, supabaseLoggedIn, readSupabaseRef } from "../lib/supabaseCli.js";
import { getGitInfo } from "../lib/gitSafety.js";

// Record basic, non-secret project metadata into config on any connect action.
function rememberProjectBasics(): void {
  const pkg = readPackageJson();
  updateConfig({
    projectName: pkg?.name,
    framework: detectFramework(),
    packageManager: detectPackageManager(),
  });
}

export async function connectGithub(): Promise<void> {
  logger.heading("Connect GitHub");
  rememberProjectBasics();

  if (!ghInstalled()) {
    logger.warn("The GitHub CLI (`gh`) isn't installed.");
    logger.info("It's the safest way to log in — GitHub handles the login and stores the token, not us.");
    logger.hint("Install it:  https://cli.github.com   (macOS: `brew install gh`)");
    logger.hint("Then run:  gh auth login   and re-run `setup-agent connect github`.");
    return;
  }

  if (await ghLoggedIn()) {
    const who = await ghAccount();
    logger.success(`GitHub CLI is installed and you're logged in${who ? ` as ${color.bold(who)}` : ""}.`);
    const git = await getGitInfo();
    updateConfig({
      github: { connected: true, detail: who, repoUrl: git.remoteUrl, defaultBranch: git.branch },
    });
    if (git.remoteUrl) logger.info(`This folder's GitHub remote: ${git.remoteUrl}`);
    else logger.hint("This folder has no GitHub remote yet. Run `setup-agent github create-repo` to make one.");
  } else {
    logger.warn("You're not logged in to GitHub yet.");
    logger.hint("Log in with:  gh auth login");
    logger.info("Follow the prompts (choose GitHub.com, HTTPS, and login with a browser). Then re-run this command.");
    updateConfig({ github: { connected: false } });
  }
}

export async function connectVercel(): Promise<void> {
  logger.heading("Connect Vercel");
  rememberProjectBasics();

  if (!vercelInstalled()) {
    logger.warn("The Vercel CLI isn't installed.");
    logger.hint("Install it:  npm i -g vercel");
    logger.hint("Then run:  vercel login   and re-run `setup-agent connect vercel`.");
    return;
  }

  if (await vercelLoggedIn()) {
    const who = await vercelWhoami();
    logger.success(`Vercel CLI is installed and you're logged in${who ? ` as ${color.bold(who)}` : ""}.`);
    const link = readVercelLink();
    if (link.linked) {
      logger.success(`This project is linked to Vercel project ${color.bold(link.projectName ?? link.projectId ?? "(unknown)")}.`);
      updateConfig({ vercel: { connected: true, detail: who, projectId: link.projectId, projectName: link.projectName } });
    } else {
      logger.warn("This project isn't linked to a Vercel project yet.");
      logger.hint("Run `setup-agent vercel link` to link it (this only creates local link files — safe).");
      updateConfig({ vercel: { connected: true, detail: who } });
    }
  } else {
    logger.warn("You're not logged in to Vercel yet.");
    logger.hint("Log in with:  vercel login");
    updateConfig({ vercel: { connected: false } });
  }
}

export async function connectSupabase(): Promise<void> {
  logger.heading("Connect Supabase");
  rememberProjectBasics();

  if (!supabaseInstalled()) {
    logger.warn("The Supabase CLI isn't installed.");
    logger.hint("Install it:  npm i -g supabase   (or `brew install supabase/tap/supabase`)");
    logger.hint("Then run:  supabase login   and re-run `setup-agent connect supabase`.");
    return;
  }

  const loggedIn = await supabaseLoggedIn();
  if (!loggedIn) {
    logger.warn("You're not logged in to Supabase yet.");
    logger.hint("Log in with:  supabase login   (it opens a browser and stores the token for you).");
  } else {
    logger.success("Supabase CLI is installed and you're logged in.");
  }

  // Let the user record a project ref (non-secret) so other commands can use it.
  let ref = readSupabaseRef();
  if (!ref) {
    ref = (await ask("Enter your Supabase project ref (from the dashboard URL), or leave blank to skip:")).trim();
  }
  if (ref) {
    updateConfig({ supabase: { connected: loggedIn, detail: ref, projectRef: ref } });
    logger.success(`Saved Supabase project ref ${color.bold(ref)} to local config (non-secret).`);
  } else {
    updateConfig({ supabase: { connected: loggedIn } });
  }

  logger.blank();
  logger.warn("Reminder: your Supabase SERVICE ROLE key must never be used in frontend/browser code.");
  logger.hint("Only put the service role key in server-only files, and only in .env.local (never committed).");
}

export async function connectStatus(): Promise<void> {
  logger.heading("Connection status");

  const framework = detectFramework();
  const pm = detectPackageManager();
  logger.item("Framework", frameworkLabel(framework));
  logger.item("Package manager", pm);
  logger.blank();

  // Tools present?
  const tools: Array<[string, boolean]> = [
    ["git", (await getGitInfo()).isRepo || true],
    ["GitHub CLI (gh)", ghInstalled()],
    ["Vercel CLI", vercelInstalled()],
    ["Supabase CLI", supabaseInstalled()],
  ];
  logger.info(color.bold("Tools:"));
  for (const [name, present] of tools) {
    logger.info(`  ${present ? color.green("installed") : color.yellow("missing  ")}  ${name}`);
  }
  logger.blank();

  // Services.
  const git = await getGitInfo();
  const ghAuthed = ghInstalled() ? await ghLoggedIn() : false;
  const vcAuthed = vercelInstalled() ? await vercelLoggedIn() : false;
  const vcLink = readVercelLink();
  const sbAuthed = supabaseInstalled() ? await supabaseLoggedIn() : false;
  const sbRef = readSupabaseRef() ?? loadConfig().supabase?.projectRef;

  logger.info(color.bold("Services:"));
  logger.info(`  GitHub:   ${statusText(ghAuthed, git.remoteUrl ? `linked (${git.remoteUrl})` : "logged in, no repo linked")}`);
  logger.info(`  Vercel:   ${statusText(vcAuthed, vcLink.linked ? `linked (${vcLink.projectName ?? vcLink.projectId})` : "logged in, not linked")}`);
  logger.info(`  Supabase: ${statusText(sbAuthed, sbRef ? `ref ${sbRef}` : "logged in")}`);

  logger.blank();
  logger.hint("Nothing above shows secret values. Run `setup-agent doctor` for a full health check.");
}

function statusText(connected: boolean, detail: string): string {
  return connected ? `${color.green("connected")} — ${detail}` : color.yellow("not connected");
}
