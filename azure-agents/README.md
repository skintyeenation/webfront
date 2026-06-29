# azure-agents

Self-hosted **Azure Pipelines build agent** for the
`dev.azure.com/skintyeenation` organization, packaged as a Docker
container. Forked from the multi-org `props-agents` setup, narrowed
to the Skin Tyee tenant.

The agent runs locally (laptop, band office workstation, or any Linux
box) and announces itself to Azure DevOps as available. Any pipeline
configured with `pool: name: skintyee-pool` will dispatch to this
agent instead of waiting in Microsoft's free-tier hosted-agent queue.

## Why this exists

Microsoft's hosted agents are shared, free up to 1,800 min/mo per
private project, and have a queue that can run 10–15 minutes deep
during peak hours (see
[`../docs/devops/sharepoint-pipeline-postmortem.md`](../docs/devops/sharepoint-pipeline-postmortem.md)
for a real example where the SharePoint publisher waited that long).
Running a self-hosted agent on local hardware skips the queue
entirely, with no parallelism limit.

Trade-off: you have to keep a container running. For the SharePoint
docs publisher (one run per docs push), the laptop's idle.

## One-time setup

### 1. Create the agent pool in Azure DevOps

```bash
az pipelines pool show \
  --org https://dev.azure.com/skintyeenation \
  --pool-name skintyee-pool 2>/dev/null \
  || echo "Pool doesn't exist — create at https://dev.azure.com/skintyeenation/_settings/agentpools"
```

Or in the UI: <https://dev.azure.com/skintyeenation/_settings/agentpools>
→ **Add pool** → name `skintyee-pool` → **Self-hosted** → **Create**.

### 2. Generate a Personal Access Token (PAT)

The PAT is what authenticates the agent to ADO.

1. <https://dev.azure.com/skintyeenation/_usersSettings/tokens> →
   **+ New Token**.
2. **Name:** `azure-agents (laptop)` or similar.
3. **Expiration:** 90 days (rotate via the same UI when it expires).
4. **Scopes:** Custom defined → **Agent Pools** → check
   **Read & manage**.
5. Click **Create**, copy the token **immediately** (it's only shown once).

### 3. Configure the agent

```bash
cd azure-agents
cp .env.skintyeenation.example .env.skintyeenation
# Edit .env.skintyeenation — paste the PAT into AZP_TOKEN.
# (The file is .gitignored, won't be committed.)
```

### 4. Start the agent

**macOS first-time setup (once per machine):**

```bash
bash mac-setup.sh
```

This installs `socat` to bridge the macOS Docker socket onto a TCP
port the container can reach, plus a Ruby version that fastlane
builds need.

**Then:**

```bash
docker compose up -d
docker compose logs -f azp-agent-skintyeenation
```

On first run, the agent downloads its binary, registers with ADO,
and starts listening. You'll see lines like:

```
Connecting to the server.
2026-05-26 12:00:00Z: Listening for Jobs
```

### 5. Verify in Azure DevOps

<https://dev.azure.com/skintyeenation/_settings/agentpools> →
**skintyee-pool** → **Agents** tab → should show your agent as
**Online**.

### 6. Point a pipeline at it

In any `azure-pipelines/*.yml`, replace:

```yaml
pool:
  vmImage: ubuntu-latest
```

with:

```yaml
pool:
  name: skintyee-pool
```

Next pipeline run dispatches to your self-hosted agent. Hosted-agent
minutes stop being consumed for that pipeline.

## Pipelines switched to `skintyee-pool`

The Azure DevOps org ran out of hosted free minutes, so the
Container-App deploys were moved onto this self-hosted agent:

| Pipeline | Pool | Notes |
|---|---|---|
| `azure-pipelines/Deployments/deploy-web.yml` | **`skintyee-pool`** | web-prod (headless Next.js site). `az acr build` runs the Docker build in ACR, so the agent only needs the Azure CLI. |
| `azure-pipelines/Deployments/deploy-api.yml` | **`skintyee-pool`** | api-prod (NestJS). Same `az acr build` pattern. |
| `azure-pipelines/Deployments/deploy-app-web.yml` | `vmImage: ubuntu-latest` (unchanged) | **Left on hosted** — it builds the Expo app with Node/pnpm, which this agent image doesn't install. (Out of minutes → deploy `app.skintyee.ca` manually: `cd app && npx expo export:web` then `swa deploy app/web-build`.) |
| `azure-pipelines/Builds/build-desktop.yml` | `vmImage` win/linux/macOS (unchanged) | **Blocked on hosted minutes.** To build on this agent it needs the Electron toolchain (Node + `libfuse2`/`fakeroot` for Linux, `wine64`+`mono` for the Windows `.exe`); macOS `.dmg` can only build on a Mac. Plan in [`app/docs/desktop-electron.md`](../app/docs/desktop-electron.md#building-without-microsoft-hosted-minutes-self-hosted-agent). |
| Other `deploy-*.yml` (guacamole, vaultwarden, lookup, …) | `vmImage: ubuntu-latest` (unchanged) | Switch individually if/when they hit the minute limit. |

So a `git push` to `master` touching `website/web/**` or `packages/**`
now deploys web-prod via the local agent — zero hosted minutes. The
agent host must be running when the push lands; otherwise the run
queues until the agent is online (or deploy manually with
`az acr build` + `az containerapp update`).

## Manual setup checklist — everything you'll need

Everything that isn't in this repo, and where it lives.

### Things you'll need to create / configure manually

| Item | Where | Why |
|---|---|---|
| Agent pool `skintyee-pool` in ADO | <https://dev.azure.com/skintyeenation/_settings/agentpools> → **Add pool → Self-hosted** | The container registers into this pool; pipelines reference it via `pool: name: skintyee-pool` |
| Personal Access Token (PAT) | <https://dev.azure.com/skintyeenation/_usersSettings/tokens> → **+ New Token** | Authenticates the agent to ADO so it can register and pick up jobs |
| `.env.skintyeenation` file (local) | This directory, copy from `.env.skintyeenation.example` | Holds the PAT + other env vars — **git-ignored**, never commit |
| Docker Desktop / Docker Engine | Installed on the host machine | Runs the agent container |
| socat + Ruby (macOS only) | Run `bash mac-setup.sh` once | Bridges the macOS Docker socket onto a TCP port the container can reach; Ruby is needed if you'll ever run fastlane in the agent |

### Secrets + env vars

The agent has **one secret** and three plain config values. All four
live in `.env.skintyeenation` (template in
`.env.skintyeenation.example`).

| Variable | Value | Secret? | Notes |
|---|---|---|---|
| `AZP_URL` | `https://dev.azure.com/skintyeenation` | No — public | Same for everyone in this org |
| `AZP_TOKEN` | PAT generated above | **Yes** | Scope: `Agent Pools (Read & manage)` only — *not* Code, not Build, not Release. Lifetime: 90 days max recommended. |
| `AZP_POOL` | `skintyee-pool` | No | Must match the pool name created in the ADO UI |
| `AZP_AGENT_NAME` | e.g. `skintyee-agent-1` | No | Display name for this agent. Set in `docker-compose.yml`, not in the env file. |

`docker-compose.yml` also references `DOCKER_HOST` (not a secret —
just routing config for talking to the host Docker daemon).

### Where the PAT should also live (besides the local env file)

**1Password → IT/Admin vault** — paste a copy with the title
`Azure DevOps — agent PAT (skintyee-pool)`. This way:

- If the laptop running the agent gets wiped, you can reproduce the
  setup without re-generating (until the PAT expires).
- If multiple admins need to run agents, they share the same PAT
  from 1Password (or each generate their own — either works).

> If you'd rather just regenerate the PAT each time a new machine
> hosts an agent (and skip the 1Password copy), that's fine too —
> the regeneration takes 30 seconds.

### What's NOT in this project (clarifying scope)

- **Other monorepo secrets** (Google Maps API key, Anthropic API key,
  WordPress DB password, etc.) live with the packages that use them
  (`app/.env`, `lookup/.env`, ADO variable group `skintyee-website`)
  and are documented in those packages' own READMEs. They're
  unrelated to running the build agent.
- **Pipeline variable groups** (`sharepoint-docs`, `mirror-github`,
  `skintyee-website`) are configured **inside ADO**, not via this
  agent's env. The agent just runs whatever the pipeline tells it to;
  it doesn't need direct access to those secrets.
- **Entra ID app credentials** (`it-project-docs-publisher`,
  `skintyeenation-admin-cli`) — the agent doesn't auth as either of
  these. Pipelines that need Microsoft Graph tokens use the federated
  service connection at runtime; the agent is just the execution host.

## Day-to-day operation

| Action | Command |
|---|---|
| Stop the agent | `docker compose stop` |
| Start it again | `docker compose start` |
| Restart | `docker compose restart` |
| See live logs | `docker compose logs -f azp-agent-skintyeenation` |
| Rebuild the image after editing the Dockerfile | `docker compose build --no-cache && docker compose up -d` |
| Wipe and re-register | `docker compose down -v && docker compose up -d` (the `-v` removes the volume containing the registered-agent state — useful if the PAT changed or you renamed the pool) |

## Operational notes

- **PAT rotation.** The PAT in `.env.skintyeenation` expires (90 days
  by default). When it does, generate a new one in ADO, update the
  env file, and `docker compose down -v && docker compose up -d` to
  re-register. Calendar reminder ~7 days before expiry is wise.
- **Memory.** `mem_limit: 4g` in docker-compose is fine for the
  SharePoint publisher (pandoc + jq + curl). Bump it if you start
  running heavier workflows (Docker builds, fastlane for app
  signing).
- **macOS Docker socket.** The container talks to the host Docker
  daemon via TCP (`tcp://host.docker.internal:2375`) — that's what
  `mac-setup.sh` enables via `socat`. On Linux you'd mount
  `/var/run/docker.sock` instead.
- **Multiple agents.** To run more than one (parallelism), duplicate
  the service block in `docker-compose.yml` with different
  `container_name` + `AZP_AGENT_NAME` + volume.

## Security model

- The PAT in `.env.skintyeenation` has **Agent Pools (Read & manage)**
  scope only — it can register, deregister, and pick up jobs from
  pools you own. It **can't** push code, edit pipelines, or read
  secrets.
- Compromised PAT impact: an attacker could deregister your agent
  (annoying but not destructive) or register a rogue agent (which
  would then receive any job dispatched to `skintyee-pool` — including
  the SharePoint publisher's federated identity tokens). Mitigate by:
  - Keeping the PAT short-lived (90 days).
  - Never committing `.env.skintyeenation`.
  - Watching the agents list in ADO for unexpected entries.
- The agent itself runs as the non-root `agent` user inside the
  container (see Dockerfile).

## What's where

| File | Purpose |
|---|---|
| `Dockerfile` | Ubuntu 24.04 + Docker CLI + Azure CLI + ADO agent prereqs |
| `docker-compose.yml` | Single-service spec for the skintyeenation agent |
| `start.sh` | Container entry point — downloads agent, registers, runs |
| `.env.skintyeenation.example` | Template for the real env file |
| `.env.skintyeenation` | Real env (with PAT) — **git-ignored** |
| `mac-setup.sh` | macOS host prep — socat + Ruby |
| `agent.env.example` | Generic env template (kept for reference) |
| `BUILD-AGENT-DEPLOYMENT.md` | Long-form deployment guide inherited from props-agents — see if `start.sh` doesn't cover your scenario |

## Provenance

Copied from `props-agents` (the multi-org agent setup shared with the
`dotproperties` / `chanzwade` / `richardfellows` orgs) on 2026-05-26,
narrowed to a single-org setup and stripped of other-org credentials.
See [`../docs/devops/agents.md`](../docs/devops/agents.md) for the
broader "when to self-host" decision context.
