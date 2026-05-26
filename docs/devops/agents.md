# Azure DevOps agents — self-hosted to save on costs + skip queues

ADO Pipelines runs on **Microsoft-hosted agents** by default — a pool
of fresh Ubuntu / Windows / macOS VMs spun up per pipeline run. Free
tier for private projects: **1,800 minutes/month**, **one parallel
job**. The Skin Tyee pipelines (SharePoint docs publish today, the
future website deploy + app build) sit well under the minute cap,
**but the one-job parallelism + the queue's variable response time
are the real bottlenecks** — see the live example in
[`sharepoint-pipeline-postmortem.md`](./sharepoint-pipeline-postmortem.md)
where a docs run waited 15 minutes for an agent.

The fix: run a self-hosted agent on a laptop or workstation we
already own. No queue, no monthly cap.

## How we do it: `azure-agents/` (in this repo)

The monorepo ships a Docker-Compose stack at
[`../../azure-agents/`](../../azure-agents/) that builds and runs the
ADO agent container. It's narrowed from the multi-org
[`props-agents`](https://github.com/dotproperties/props-agents)
project (which runs agents for `dotproperties` / `chanzwade` /
`richardfellows`) to a single-org configuration for `skintyeenation`.

Full setup walkthrough + day-to-day commands:
**[`azure-agents/README.md`](../../azure-agents/README.md)**.

TL;DR — first time:

1. Create the `skintyee-pool` agent pool at
   <https://dev.azure.com/skintyeenation/_settings/agentpools> → **Add pool** → Self-hosted.
2. Generate a PAT with **Agent Pools (Read & manage)** scope at
   <https://dev.azure.com/skintyeenation/_usersSettings/tokens>.
3. ```bash
   cd azure-agents
   cp .env.skintyeenation.example .env.skintyeenation
   # paste the PAT into AZP_TOKEN inside that file
   bash mac-setup.sh   # macOS only — installs socat + Ruby host prereqs
   docker compose up -d
   ```
4. Confirm the agent shows **Online** at
   <https://dev.azure.com/skintyeenation/_settings/agentpools> → **skintyee-pool** → **Agents**.
5. In any pipeline YAML, switch from:

   ```yaml
   pool:
     vmImage: ubuntu-latest
   ```

   to:

   ```yaml
   pool:
     name: skintyee-pool
   ```

That pipeline now runs on the self-hosted agent. Hosted minutes stop
being consumed for it, and there's no queue wait.

## When to self-host vs stay on hosted

You only **need** to self-host when:

- **Hosted-agent queue waits become disruptive** — the SharePoint
  publisher case (we hit this; 15-min waits with 9 runs in 30 minutes).
- **Hosted minutes get expensive** — only kicks in if a pipeline runs
  constantly (e.g. CI on every commit, all day) or with multi-job
  parallelism beyond the free tier.
- **The pipeline needs network access to the band's internal
  infrastructure** — VPN, on-prem services, a database that's not
  publicly reachable.
- **Cross-platform mobile builds** — Xcode signing for the app
  requires a Mac, and Microsoft-hosted Mac minutes are billed at a
  10× multiplier vs Linux.
- **A workflow needs persistent state between runs** — cached Docker
  layers, large datasets, npm/pnpm cache hits — hosted agents start
  from scratch every time.

## Cost comparison (current scale: ~20 docs pushes/day, weekly site deploy)

| Approach | Monthly $$ | Notes |
|---|---|---|
| **Microsoft-hosted (status quo)** | **CAD $0** | Under the 1,800 min free tier. But: one parallel job + variable queue waits. Free quota for new private orgs gets throttled aggressively after burst runs ([`sharepoint-pipeline-postmortem.md`](./sharepoint-pipeline-postmortem.md) §6). |
| **Self-hosted on a laptop / band-office workstation** | **CAD $0** | Hardware we already own. Container running idle costs nothing measurable. One-time setup: ~30 min ([`azure-agents/README.md`](../../azure-agents/README.md)). |
| **Self-hosted on the WordPress production VM** | **CAD $0** incremental | Existing prod VM already paid for. Co-locates agent with prod — fine for docs/website deploys, *not* for builds that pull in lots of dependencies (would compete with WordPress for memory). |
| **Self-hosted on a dedicated Azure VM** | ~CAD $7/mo (B1ls) | Worth it only if pipeline volume grows 10× or we need 24/7 uptime independent of the laptop being open. |
| **Buy additional Microsoft-hosted parallel jobs** | ~CAD $54/mo per parallel job | Only consider if self-hosting maintenance becomes burdensome (it shouldn't — Docker-Compose is set-and-forget). |

**Recommended posture:**

- **Default → self-hosted via `azure-agents/`** for pipelines that
  benefit from skipping the queue (e.g., docs publisher — short runs,
  frequent pushes).
- **Keep Microsoft-hosted as fallback** for ad-hoc / one-off
  pipelines, or when the self-hosted agent is down.
- **Revisit dedicated Azure VM** when pipeline volume sustainably
  exceeds what the laptop can comfortably handle (probably never at
  current scale).

## Operational checklist after enabling self-hosted

- [ ] PAT generated, expires set to ≤ 90 days, **calendar reminder** for rotation 7 days before.
- [ ] `azure-agents/` cloned to the host machine; `docker compose up -d` running.
- [ ] Agent visible at <https://dev.azure.com/skintyeenation/_settings/agentpools> → skintyee-pool → Agents → **Online**.
- [ ] `pool: name: skintyee-pool` set in every pipeline YAML you want to migrate (start with `azure-pipelines/publish-docs-to-sharepoint.yml`).
- [ ] First pipeline run on self-hosted **succeeded** (check the logs at <https://dev.azure.com/skintyeenation/devops/_build>).
- [ ] `.env.skintyeenation` containing the PAT is **not** committed (already covered by `azure-agents/.gitignore`).

## Multi-agent / scaling

If/when one agent isn't enough (parallel jobs from CI bursts), the
pattern is to duplicate the service block in
`azure-agents/docker-compose.yml`:

```yaml
services:
  azp-agent-skintyeenation:
    ...
  azp-agent-skintyeenation-2:    # second agent
    build: .
    image: skintyee-azp-agent
    container_name: azp-agent-skintyeenation-2
    mem_limit: 4g
    restart: always
    env_file:
      - .env.skintyeenation       # same PAT, different agent name
    environment:
      - AZP_AGENT_NAME=skintyee-agent-2
      - DOCKER_HOST=tcp://host.docker.internal:2375
    volumes:
      - azp-agent-skintyeenation-2-data:/azp

volumes:
  azp-agent-skintyeenation-data:
  azp-agent-skintyeenation-2-data:
```

Both agents register against `skintyee-pool` with distinct names; ADO
dispatches jobs across them.

## See also

- [`../../azure-agents/README.md`](../../azure-agents/README.md) — the
  in-repo Docker-Compose stack, setup walkthrough, day-to-day
  commands, PAT rotation, security model.
- [`sharepoint-pipeline-postmortem.md`](./sharepoint-pipeline-postmortem.md) —
  the live example of how the hosted-agent queue made the docs
  publisher unusable.
- [Microsoft's self-hosted Linux agent docs](https://learn.microsoft.com/azure/devops/pipelines/agents/v2-linux) —
  underlying install if you'd rather skip Docker and configure raw.
- [`props-agents`](https://github.com/dotproperties/props-agents) —
  the upstream multi-org project this was forked from.
