import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNER = process.env.GITHUB_OWNER || "Zebra0723";
const REPO = process.env.GITHUB_REPO || "AutoDeploy";
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
    },
    cache: "no-store",
  });
}

export async function GET(req: Request) {
  if (!TOKEN) return NextResponse.json({ error: "Server not configured." }, { status: 501 });

  const runId = new URL(req.url).searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "Missing runId." }, { status: 400 });

  const res = await gh(`/repos/${OWNER}/${REPO}/actions/runs/${runId}`);
  if (!res.ok) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  const run = await res.json();

  let url: string | null = null;
  if (run.status === "completed" && run.conclusion === "success") {
    url = await extractDeployedUrl(Number(runId));
  }

  return NextResponse.json({
    status: run.status ?? null,
    conclusion: run.conclusion ?? null,
    htmlUrl: run.html_url ?? null,
    url,
  });
}

// Read the deploy job's logs and pull out the deployed Vercel URL.
async function extractDeployedUrl(runId: number): Promise<string | null> {
  try {
    const jobsRes = await gh(`/repos/${OWNER}/${REPO}/actions/runs/${runId}/jobs`);
    if (!jobsRes.ok) return null;
    const jobs = (await jobsRes.json()).jobs as Array<{ id: number }>;
    if (!jobs?.length) return null;

    const logsRes = await gh(`/repos/${OWNER}/${REPO}/actions/jobs/${jobs[0].id}/logs`);
    if (!logsRes.ok) return null;
    const text = await logsRes.text();

    const explicit = text.match(/Deployed:\s*(https:\/\/[^\s]+)/);
    if (explicit) return explicit[1].trim();
    const anyVercel = text.match(/https:\/\/[a-z0-9-]+\.vercel\.app/gi);
    if (anyVercel?.length) return anyVercel[anyVercel.length - 1];
    return null;
  } catch {
    return null;
  }
}
