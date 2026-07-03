# setup-agent

A **commandable developer setup agent** for people who build apps with Claude Code
but get stuck on the manual, outside-the-editor setup: connecting GitHub, Vercel,
and Supabase, wiring up environment variables, creating database tables, and
getting a project ready to deploy.

Claude Code writes your app's code. **setup-agent handles the plumbing** — the
account connections, env files, service config, and safety checks that can't be
done by editing files alone.

You can drive it two ways:

```bash
# Structured commands
setup-agent connect github
setup-agent env add NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
setup-agent supabase create-table "profiles: username text, bio text"
setup-agent doctor

# ...or plain English
setup-agent do "add supabase to this project"
setup-agent do "sync my env vars to vercel"
setup-agent do "is this app ready to deploy?"
```

It is **local, offline, and needs no AI API** — the plain-English mode is
rule-based. It never prints your secret values and never commits them.

---

## Install

```bash
# From this folder
npm install
npm run build
npm link          # makes `setup-agent` available everywhere

# then, inside any project folder:
setup-agent doctor
```

Prefer not to link globally? Use it directly:

```bash
node /path/to/setup-agent/dist/index.js doctor
# or during development, without building:
npm run dev -- doctor
```

### Recommended companion CLIs

setup-agent prefers official CLIs for login (so *they* store your tokens, not us):

- **GitHub CLI** — https://cli.github.com  (`gh auth login`)
- **Vercel CLI** — `npm i -g vercel`  (`vercel login`)
- **Supabase CLI** — `npm i -g supabase`  (`supabase login`)

They're optional — setup-agent tells you exactly what to install when it needs one.

---

## Quick start

```bash
cd my-app                     # a project you built with Claude Code
setup-agent doctor            # see what's set up and what's missing
setup-agent doctor --fix      # safely fix the easy stuff (gitignore, .env.example, config)

setup-agent connect github    # connect your accounts (once)
setup-agent connect vercel
setup-agent connect supabase

setup-agent do "add supabase auth and a profiles table"
```

---

## Commands

### Connect services
| Command | What it does |
| --- | --- |
| `setup-agent connect github` | Detects the GitHub CLI, checks login, records non-secret metadata. |
| `setup-agent connect vercel` | Detects the Vercel CLI, checks login + whether the project is linked. |
| `setup-agent connect supabase` | Detects the Supabase CLI, checks login, stores your project ref. |
| `setup-agent connect status` | Shows which services are connected and which tools are missing. |

### Environment variables
| Command | What it does |
| --- | --- |
| `setup-agent env add KEY=value` | Saves the real value to `.env.local`, adds a placeholder to `.env.example`, ensures it's gitignored. |
| `setup-agent env add-bulk` | Paste many `KEY=value` lines at once (values masked in output). |
| `setup-agent env check` | Compares `.env.local` vs `.env.example`, flags missing/risky keys. |
| `setup-agent env sync-vercel [--target production]` | Pushes vars to Vercel (confirms before production). |

### Vercel
| Command | What it does |
| --- | --- |
| `setup-agent vercel link` | Links this project to a Vercel project. |
| `setup-agent vercel env sync [--target ...]` | Syncs `.env.local` to Vercel. |
| `setup-agent vercel env check` | Shows which env keys appear required. |
| `setup-agent vercel deploy-check` | Read-only: is this project deploy-ready? (Never deploys.) |

### GitHub
| Command | What it does |
| --- | --- |
| `setup-agent github status` | Read-only git/GitHub status (never commits or pushes). |
| `setup-agent github create-repo` | Creates a repo from this folder (private by default; ensures secrets are gitignored first). |
| `setup-agent github link` | Points this folder at an existing GitHub repo (asks before changing the remote). |

### Supabase
| Command | What it does |
| --- | --- |
| `setup-agent supabase prepare` | Installs `@supabase/supabase-js`, creates browser + server client files, adds env placeholders. |
| `setup-agent supabase setup-auth` | Prepares auth and writes an `AUTH_SETUP.md` with exact dashboard steps + redirect URLs. |
| `setup-agent supabase create-table "..."` | Turns a plain description into a safe, additive SQL migration. |
| `setup-agent supabase rls-basic [table]` | Generates "users can only touch their own rows" RLS policies. |
| `setup-agent supabase apply-migrations` | Applies migrations to the remote DB (confirms first; blocks destructive SQL). |
| `setup-agent supabase test` | Checks that Supabase env vars are configured (no secrets shown). |

### Doctor & plain English
| Command | What it does |
| --- | --- |
| `setup-agent doctor` | Full health check: framework, package manager, git, services, env, scripts, deploy-readiness. |
| `setup-agent doctor --fix` | Applies only safe, non-destructive fixes. |
| `setup-agent do "..."` | Plain-English: matches your request to commands, shows a plan, confirms risky steps. |

---

## Examples a beginner can copy-paste

```bash
# Add Supabase to a Next.js app and make a table for saved progress
setup-agent supabase prepare
setup-agent supabase create-table "lesson_progress with user_id, lesson_id, completed, xp"
setup-agent supabase rls-basic lesson_progress

# Store your keys safely (real values only in .env.local, never committed)
setup-agent env add NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
setup-agent env add NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
setup-agent env add SUPABASE_SERVICE_ROLE_KEY   # prompts, hidden input

# Push env vars up to Vercel (asks before touching production)
setup-agent vercel link
setup-agent vercel env sync --target production

# Or just say what you want:
setup-agent do "check if my env variables are missing"
setup-agent do "set up supabase auth"
setup-agent do "is this ready to deploy?"
```

---

## Safety (what it will and won't do)

- **Never prints secret values** — everything is masked (`••••••• (23 chars)`).
- **Never stores raw secrets in config** — `.setup-agent/config.json` holds only
  non-secret metadata (project name, framework, repo URL, project refs).
- **Always gitignores `.env.local`** before any GitHub action.
- **Warns loudly** when a private-looking secret is named `NEXT_PUBLIC_` (which
  would leak it to the browser).
- **Never runs destructive SQL** unless you pass `--allow-destructive`.
- **Backs up any file before overwriting** it (into `.setup-agent/backups/`).
- **Confirms** before production env changes or remote database migrations.

## What it intentionally does NOT do (v1)

- No web dashboard or browser UI — it's a local command-line tool.
- It does not replace Claude Code — Claude Code builds your app's features.
- No paid APIs and no required AI model.
- Stripe, Resend, Clerk, and UploadThing are recognized but stubbed for a later
  version (it'll safely store their keys today).

## Config folder

setup-agent keeps local state in `.setup-agent/`:

```
.setup-agent/
  config.json     # non-secret project + connection metadata
  backups/        # timestamped backups of files it changed
  logs/
```

---

## Bonus: one-command Vercel deploy bot

This repo also ships a GitHub Actions workflow,
[`.github/workflows/deploy-to-vercel.yml`](.github/workflows/deploy-to-vercel.yml),
that deploys **any** of your GitHub repos to Vercel on command and hands you back
the live URL as a downloadable artifact.

1. Add a `VERCEL_TOKEN` secret to this repo (and `GH_PAT` to deploy other/private repos).
2. **Actions → Deploy to Vercel → Run workflow**, type the `owner/name` of the repo, Run.
3. When it finishes, the live URL is in the run summary and in the
   **`deployment-result`** artifact (`deployment-url.txt`).

---

## Development

```bash
npm install
npm run build     # compile TypeScript to dist/
npm test          # run the vitest suite
npm run dev -- <command>   # run from source without building
```

Tests cover env parsing, secret masking, dangerous env-name detection, config
loading/scrubbing, migration filename + SQL generation, and plain-English routing.
