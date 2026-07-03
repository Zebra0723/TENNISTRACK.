// GitHub project commands. We never commit or push secrets; .env.local is always
// gitignored before any repo is created.

import { logger, color } from "../lib/logger.js";
import { ask, confirm } from "../lib/prompt.js";
import { getGitInfo, ensureSecretsIgnored, isGitRepo } from "../lib/gitSafety.js";
import { ghInstalled, ghLoggedIn } from "../lib/githubCli.js";
import { run, commandExists } from "../lib/commandRunner.js";
import { updateConfig } from "../lib/config.js";

export async function githubStatus(): Promise<void> {
  logger.heading("GitHub status");

  const info = await getGitInfo();
  if (!info.isRepo) {
    logger.warn("This folder is not a Git repository yet.");
    logger.hint("Create one with:  git init   then `setup-agent github create-repo`.");
    return;
  }
  logger.item("Git repo", "yes");
  logger.item("Current branch", info.branch ?? "(unknown)");
  logger.item("Remote (origin)", info.remoteUrl ?? "(none)");

  if (ghInstalled()) {
    logger.item("GitHub CLI", (await ghLoggedIn()) ? color.green("logged in") : color.yellow("not logged in"));
  } else {
    logger.item("GitHub CLI", color.yellow("not installed"));
  }
  logger.blank();
  logger.info("This command only reads state — it never commits or pushes.");
}

export async function githubCreateRepo(): Promise<void> {
  logger.heading("Create a GitHub repository");

  // Safety first: make sure secrets can't be pushed.
  const added = ensureSecretsIgnored();
  if (added.length) logger.success(`Made sure ${added.join(", ")} are gitignored before touching GitHub.`);

  if (!isGitRepo()) {
    logger.info("This folder isn't a Git repo yet. Initializing one...");
    const init = await run("git", ["init"]);
    if (!init.ok) {
      logger.error("Could not run `git init`. Is git installed?");
      return;
    }
  }

  const existing = await getGitInfo();
  if (existing.remoteUrl) {
    logger.warn(`This folder already has a remote: ${existing.remoteUrl}`);
    logger.hint("If you want a different repo, use `setup-agent github link` instead.");
    return;
  }

  if (!ghInstalled()) {
    logger.error("The GitHub CLI (`gh`) isn't installed, so I can't create the repo for you.");
    logger.hint("Install it from https://cli.github.com, run `gh auth login`, then try again.");
    return;
  }
  if (!(await ghLoggedIn())) {
    logger.error("You're not logged in to GitHub.");
    logger.hint("Run `gh auth login` first, then re-run this command.");
    return;
  }

  const defaultName = process.cwd().split("/").pop() ?? "my-app";
  const name = (await ask(`Repository name [${defaultName}]:`, defaultName)) || defaultName;
  const visibility = (await ask("Visibility — private or public? [private]:", "private")).toLowerCase().startsWith("pub")
    ? "public"
    : "private";

  logger.blank();
  logger.info(`I'll create a ${color.bold(visibility)} repo named ${color.bold(name)} and set it as your 'origin' remote.`);
  const ok = await confirm("Proceed?", true);
  if (!ok) {
    logger.info("Cancelled. Nothing was created.");
    return;
  }

  // `gh repo create` with --source pushes existing commits; we use --push only if there is a commit.
  const args = ["repo", "create", name, `--${visibility}`, "--source", ".", "--remote", "origin"];
  const res = await run("gh", args, { interactive: true });
  if (!res.ok) {
    logger.error("GitHub repo creation did not complete. See the output above.");
    return;
  }

  const info = await getGitInfo();
  updateConfig({ github: { connected: true, repoUrl: info.remoteUrl, defaultBranch: info.branch } });
  logger.success(`Created ${visibility} repo ${color.bold(name)} and linked it as origin.`);
  logger.hint("Your .env.local is gitignored, so no secrets were included. Push your code with `git push -u origin HEAD`.");
}

export async function githubLink(): Promise<void> {
  logger.heading("Link an existing GitHub repository");

  if (!isGitRepo()) {
    logger.info("Initializing a Git repo first...");
    await run("git", ["init"]);
  }
  ensureSecretsIgnored();

  const info = await getGitInfo();
  if (info.remoteUrl) {
    logger.warn(`This folder already points to: ${info.remoteUrl}`);
    const change = await confirm("Replace it with a different repo?");
    if (!change) {
      logger.info("Keeping the existing remote. Nothing changed.");
      return;
    }
  }

  const url = (await ask("Paste the GitHub repo URL (https://github.com/you/repo.git):")).trim();
  if (!url) {
    logger.info("No URL provided. Nothing changed.");
    return;
  }

  const ok = await confirm(`Set 'origin' to ${url}?`, true);
  if (!ok) {
    logger.info("Cancelled.");
    return;
  }

  if (!commandExists("git")) {
    logger.error("git isn't installed.");
    return;
  }
  // Remove existing origin (if any) then add.
  if (info.remoteUrl) await run("git", ["remote", "remove", "origin"]);
  const add = await run("git", ["remote", "add", "origin", url]);
  if (!add.ok) {
    logger.error("Could not set the remote. Check the URL and try again.");
    return;
  }
  const fresh = await getGitInfo();
  updateConfig({ github: { connected: true, repoUrl: fresh.remoteUrl, defaultBranch: fresh.branch } });
  logger.success(`Linked this folder to ${url} (as 'origin').`);
  logger.hint("Nothing was pushed. When ready: `git push -u origin HEAD`.");
}
