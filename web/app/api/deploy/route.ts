import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Config (overridable via env). Points at the repo that hosts the deploy bot.
const OWNER = process.env.GITHUB_OWNER || "Zebra0723";
const REPO = process.env.GITHUB_REPO || "AutoDeploy";
const WORKFLOW = process.env.GITHUB_WORKFLOW_FILE || "deploy-to-vercel.yml";
const WORKFLOW_REF = process.env.GITHUB_WORKFLOW_REF || "main";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_DISPATCH_TOKEN;

const API = "https://api.github.com";

function gh(path: string, init?: RequestInit) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "autodeploy-ui",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
}

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export async function POST(req: Request) {
  if (!TOKEN) {
    return NextResponse.json(
      { error: "Server not configured. Add a GITHUB_TOKEN environment variable (with Actions write access) in the Vercel project settings." },
      { status: 501 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const repository = String(body.repository || "").trim();
  if (!repository || !REPO_RE.test(repository)) {
    return NextResponse.json({ error: "Enter a repository as owner/name." }, { status: 400 });
  }

  // Only send inputs that are set. Passing an input the target workflow does
  // not declare makes GitHub reject the dispatch with a 422, so keep it lean.
  const inputs: Record<string, string> = {
    repository,
    production: body.production === false ? "false" : "true",
  };
  const optional: Record<string, unknown> = {
    ref: body.ref,
    root_directory: body.rootDirectory,
    install_command: body.installCommand,
    build_command: body.buildCommand,
  };
  for (const [key, value] of Object.entries(optional)) {
    const v = String(value ?? "").trim();
    if (v) inputs[key] = v;
  }

  const dispatchedAt = Date.now();

  const dispatch = await gh(`/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: WORKFLOW_REF, inputs }),
  });

  if (dispatch.status !== 204) {
    let detail = "";
    try { detail = (await dispatch.json())?.message || ""; } catch { /* ignore */ }
    return NextResponse.json(
      { error: `GitHub declined the deploy (${dispatch.status}). ${detail}`.trim() },
      { status: 502 },
    );
  }

  // Dispatch returns no run id, so find the run we just created.
  const run = await findRun(dispatchedAt);
  return NextResponse.json({
    ok: true,
    runId: run?.id ?? null,
    htmlUrl: run?.html_url ?? `https://github.com/${OWNER}/${REPO}/actions`,
  });
}

async function findRun(since: number): Promise<{ id: number; html_url: string } | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await gh(`/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=10`);
    if (res.ok) {
      const data = await res.json();
      const runs = (data.workflow_runs || []) as Array<{ id: number; html_url: string; created_at: string }>;
      const match = runs.find((r) => new Date(r.created_at).getTime() >= since - 10_000);
      if (match) return { id: match.id, html_url: match.html_url };
    }
  }
  return null;
}
