"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "idle" | "dispatching" | "running" | "success" | "error";

interface StatusResponse {
  status: string | null;
  conclusion: string | null;
  htmlUrl: string | null;
  url: string | null;
}

const STEPS = [
  { key: "queued", label: "Queued" },
  { key: "checkout", label: "Checking out repository" },
  { key: "build", label: "Building & deploying" },
  { key: "done", label: "Live" },
];

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0" stopColor="#e0402b" />
          <stop offset="1" stopColor="#f2853a" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" stroke="url(#g)" strokeWidth="1.6" />
      <path d="M16 8 L23 20 H9 Z" fill="url(#g)" />
      <circle cx="16" cy="22.5" r="1.9" fill="#0b0908" />
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };
  useEffect(() => stopPolling, []);

  const activeStep =
    phase === "dispatching" ? 0
    : phase === "running" ? 2
    : phase === "success" ? 4
    : -1;

  const poll = useCallback((runId: number) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/status?runId=${runId}`, { cache: "no-store" });
        const data: StatusResponse = await res.json();
        if (data.status === "completed") {
          stopPolling();
          if (data.conclusion === "success") {
            setLiveUrl(data.url);
            setPhase("success");
          } else {
            setError(`Deployment ${data.conclusion ?? "failed"}. Open the run for details.`);
            setPhase("error");
          }
        }
      } catch {
        /* transient; keep polling */
      }
    }, 4000);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repository.trim() || phase === "dispatching" || phase === "running") return;
    setError(null);
    setLiveUrl(null);
    setRunUrl(null);
    setPhase("dispatching");
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repository: repository.trim(),
          ref: gitRef.trim(),
          production,
          rootDirectory: rootDir.trim(),
          installCommand: installCmd.trim(),
          buildCommand: buildCmd.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not start the deployment.");
        setPhase("error");
        return;
      }
      setRunUrl(data.htmlUrl ?? null);
      setPhase("running");
      if (typeof data.runId === "number") poll(data.runId);
    } catch {
      setError("Network error reaching the deploy service.");
      setPhase("error");
    }
  };

  const busy = phase === "dispatching" || phase === "running";

  return (
    <main className="shell">
      <div className="brand">
        <Mark />
        <span className="brand-name">Auto<span className="brand-dot">·</span>Deploy</span>
      </div>

      <header className="hero">
        <p className="eyebrow">Vercel deploy console</p>
        <h1>Ship any repo to <span className="accent">Vercel</span>, on command.</h1>
        <p className="lede">
          Name a repository, press deploy, and step back. The build runs on its own and the live
          URL lands right here when it is ready.
        </p>
      </header>

      <form className="card" onSubmit={submit}>
        <div className="field">
          <label htmlFor="repo">Repository</label>
          <input
            id="repo"
            className="mono"
            type="text"
            placeholder="owner/name"
            value={repository}
            onChange={(e) => setRepository(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
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
        <section className="card status" aria-live="polite">
          <div className="status-head">
            <span className="status-title">
              {phase === "success" ? "Deployment complete" : phase === "error" ? "Deployment stopped" : "Deploying"}
            </span>
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

          {runUrl && (
            <p className="hint" style={{ marginTop: 16 }}>
              <a className="link-muted" href={runUrl} target="_blank" rel="noreferrer">View the build logs</a>
            </p>
          )}
        </section>
      )}

      <footer>
        AutoDeploy runs a GitHub Actions workflow that builds and deploys your repository to Vercel.
      </footer>
    </main>
  );
}
