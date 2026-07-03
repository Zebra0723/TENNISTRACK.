// Thin wrapper around child_process for running external CLIs (git, gh, vercel,
// supabase). Captures output so we can redact secrets before logging.

import { spawn, spawnSync } from "node:child_process";

export interface RunResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd?: string;
  // Extra environment variables (merged over process.env).
  env?: Record<string, string>;
  // If true, inherit stdio so the child can be interactive (e.g. `gh auth login`).
  interactive?: boolean;
  // Text piped to the child's stdin.
  input?: string;
}

// Is a command available on PATH?
export function commandExists(cmd: string): boolean {
  const probe = process.platform === "win32" ? "where" : "which";
  const res = spawnSync(probe, [cmd], { stdio: "ignore" });
  return res.status === 0;
}

// Run a command and capture output (non-interactive by default).
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: opts.interactive ? "inherit" : ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    if (!opts.interactive) {
      child.stdout?.on("data", (d) => (stdout += d.toString()));
      child.stderr?.on("data", (d) => (stderr += d.toString()));
      if (opts.input !== undefined) {
        child.stdin?.write(opts.input);
        child.stdin?.end();
      }
    }

    child.on("error", (err) => {
      resolve({ ok: false, code: null, stdout, stderr: stderr || String(err) });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}
