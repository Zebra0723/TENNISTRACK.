"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "idle" | "dispatching" | "running" | "success" | "error";
type Theme = "light" | "dark";

interface StatusResponse {
  status: string | null;
  conclusion: string | null;
  htmlUrl: string | null;
  url: string | null;
}

const GITHUB_REPO_URL = "https://github.com/Zebra0723/AutoDeploy";

const STEPS = [
  { key: "queued", label: "Queued" },
  { key: "checkout", label: "Checking out repository" },
  { key: "build", label: "Building & deploying" },
  { key: "done", label: "Live" },
];

/* ---------- Icons (SVG, emoji-free) ---------- */
function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0" stopColor="#d83b23" />
          <stop offset="1" stopColor="#ef7f2e" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" stroke="url(#g)" strokeWidth="1.6" />
      <path d="M16 8 L23 20 H9 Z" fill="url(#g)" />
      <circle cx="16" cy="22.5" r="1.9" fill="#1d1410" />
    </svg>
  );
}
function Spinner() {
  return (
    <svg className="spin" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
      <path d="M8 1.5 A6.5 6.5 0 0 1 14.5 8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function Chevron() {
  return (
    <svg className="chev" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M4 2.5 L8 6 L4 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconSun() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </svg>
  );
}
function IconMoon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.3 6.3 0 0 0 10.5 10.5z" />
    </svg>
  );
}
function IconGitHub() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.85 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.79.62-3.38-1.22-3.38-1.22-.46-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.56 2.36 1.11 2.94.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.05 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05a9.4 9.4 0 0 1 5 0c1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.92-2.34 4.79-4.57 5.04.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2z" />
    </svg>
  );
}
function ChipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

export default function Home() {
  const [repository, setRepository] = useState("");
  const [gitRef, setGitRef] = useState("");
  const [production, setProduction] = useState(true);
  const [rootDir, setRootDir] = useState("");
  const [installCmd, setInstallCmd] = useState("");
  const [buildCmd, setBuildCmd] = useState("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [runUrl, setRunUrl] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme") as Theme | null;
    const sys: Theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(attr || sys);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("autodeploy-theme", next); } catch { /* ignore */ }
  };

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  useEffect(() => stopPolling, []);

  const activeStep = phase === "dispatching" ? 0 : phase === "running" ? 2 : phase === "success" ? 4 : -1;

  const poll = useCallback((runId: number) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/status?runId=${runId}`, { cache: "no-store" });
        const data: StatusResponse = await res.json();
        if (data.status === "completed") {
          stopPolling();
          if (data.conclusion === "success") { setLiveUrl(data.url); setPhase("success"); }
          else { setError(`Deployment ${data.conclusion ?? "failed"}. Open the build logs for details.`); setPhase("error"); }
        }
      } catch { /* transient */ }
    }, 4000);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repository.trim() || phase === "dispatching" || phase === "running") return;
    setError(null); setLiveUrl(null); setRunUrl(null); setPhase("dispatching");
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repository: repository.trim(), ref: gitRef.trim(), production,
          rootDirectory: rootDir.trim(), installCommand: installCmd.trim(), buildCommand: buildCmd.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Could not start the deployment."); setPhase("error"); return; }
      setRunUrl(data.htmlUrl ?? null); setPhase("running");
      if (typeof data.runId === "number") poll(data.runId);
    } catch { setError("Network error reaching the deploy service."); setPhase("error"); }
  };

  const busy = phase === "dispatching" || phase === "running";

  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">
          <Mark />
          <span className="brand-name">Auto<span className="brand-dot">·</span>Deploy</span>
        </div>
        <div className="topbar-actions">
          <a className="ghost-link" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer"><IconGitHub /> Repository</a>
          <button className="icon-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title="Toggle theme">
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </div>

      <header className="hero">
        <p className="eyebrow">Vercel deploy console</p>
        <h1>Ship any repository to <span className="accent">Vercel</span>, on command.</h1>
        <p className="lede">
          Name a GitHub repository and press deploy. AutoDeploy builds it on Vercel, streams the
          progress here, and hands back the live URL — no dashboards, no CLI, no waiting around.
        </p>
        <div className="chips">
          <span className="chip"><ChipIcon /> Any framework</span>
          <span className="chip"><ChipIcon /> Preview or production</span>
          <span className="chip"><ChipIcon /> Live build status</span>
        </div>
      </header>

      <div className="section-head"><p className="section-title">Deploy a repository</p></div>

      <form className="card" onSubmit={submit}>
        <div className="field">
          <label htmlFor="repo">Repository</label>
          <input id="repo" className="mono" type="text" placeholder="owner/name"
            value={repository} onChange={(e) => setRepository(e.target.value)}
            autoComplete="off" autoCapitalize="off" spellCheck={false} />
          <p className="hint">The GitHub repository to deploy, for example <code>Zebra0723/PhoenixRealm</code>.</p>
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="ref">Branch or tag <span className="opt">— optional</span></label>
            <input id="ref" className="mono" type="text" placeholder="default branch"
              value={gitRef} onChange={(e) => setGitRef(e.target.value)} autoComplete="off" spellCheck={false} />
          </div>
          <div className="field">
            <label htmlFor="root">Subfolder <span className="opt">— optional</span></label>
            <input id="root" className="mono" type="text" placeholder="repo root"
              value={rootDir} onChange={(e) => setRootDir(e.target.value)} autoComplete="off" spellCheck={false} />
          </div>
        </div>

        <div className="field">
          <div className="toggle-row">
            <div>
              <div className="toggle-label">Production deployment</div>
              <div className="toggle-sub">{production ? "Publishes to the production URL." : "Creates a preview URL only."}</div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={production} onChange={(e) => setProduction(e.target.checked)} aria-label="Production deployment" />
              <span className="track" />
            </label>
          </div>
        </div>

        <details className="advanced">
          <summary><Chevron /> Advanced build overrides</summary>
          <div className="body">
            <div className="field">
              <label htmlFor="install">Install command <span className="opt">— optional</span></label>
              <input id="install" className="mono" type="text" placeholder="npm install"
                value={installCmd} onChange={(e) => setInstallCmd(e.target.value)} autoComplete="off" spellCheck={false} />
            </div>
            <div className="field">
              <label htmlFor="build">Build command <span className="opt">— optional</span></label>
              <input id="build" className="mono" type="text" placeholder="npm run build"
                value={buildCmd} onChange={(e) => setBuildCmd(e.target.value)} autoComplete="off" spellCheck={false} />
            </div>
          </div>
        </details>

        <button className="btn" type="submit" disabled={busy || !repository.trim()}>
          {busy ? <><Spinner /> {phase === "dispatching" ? "Starting" : "Deploying"}</> : "Deploy"}
        </button>
      </form>

      {phase !== "idle" && (
        <section className="card" aria-live="polite">
          <div className="status-head">
            <span className="status-title">{phase === "success" ? "Deployment complete" : phase === "error" ? "Deployment stopped" : "Deploying"}</span>
            <span className={"badge " + (phase === "success" ? "ok" : phase === "error" ? "err" : "run")}>
              {phase === "success" ? "Live" : phase === "error" ? "Failed" : "Running"}
            </span>
          </div>
          <ol className="timeline">
            {STEPS.map((s, i) => {
              const cls = phase === "success" || i < activeStep ? "done" : i === activeStep ? "active" : "";
              return <li key={s.key} className={cls}>{s.label}</li>;
            })}
          </ol>
          {liveUrl && (
            <div className="result">
              <div className="result-label">Live URL</div>
              <a href={liveUrl} target="_blank" rel="noreferrer">{liveUrl}</a>
            </div>
          )}
          {error && <div className="error-box">{error}</div>}
          {runUrl && <p className="hint" style={{ marginTop: 16 }}><a className="link-muted" href={runUrl} target="_blank" rel="noreferrer">View the build logs</a></p>}
        </section>
      )}

      <div className="section-head"><p className="section-title">How it works</p></div>
      <div className="steps">
        <div className="step">
          <span className="step-num">1</span>
          <h3>Name the repository</h3>
          <p>Enter any GitHub repo as owner/name, pick a branch, and choose preview or production.</p>
        </div>
        <div className="step">
          <span className="step-num">2</span>
          <h3>It builds on Vercel</h3>
          <p>A GitHub Actions workflow checks out the code, detects the framework, and runs the build.</p>
        </div>
        <div className="step">
          <span className="step-num">3</span>
          <h3>Get the live URL</h3>
          <p>When the deploy finishes, the production URL appears here and in the run artifact.</p>
        </div>
      </div>

      <footer>
        <span>AutoDeploy · builds and deploys any repository to Vercel.</span>
        <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">View source</a>
      </footer>
    </main>
  );
}
