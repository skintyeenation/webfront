# Azure DevOps agents — when to self-host

ADO Pipelines runs on **Microsoft-hosted agents** by default — a pool
of fresh Ubuntu / Windows / macOS VMs spun up per pipeline run. Free
tier for private projects: **1,800 minutes/month**. Our current
pipelines (SharePoint docs publish, future website deploy) consume
well under that.

You only need a **self-hosted agent** when:

- ADO hosted minutes get expensive — typically only kicks in if a
  pipeline runs constantly (e.g. on every commit, all day).
- The pipeline needs network access to the band's internal
  infrastructure (VPN, on-prem services, a database that's not
  publicly reachable).
- You're running cross-platform mobile builds (Xcode signing, etc.)
  on dedicated hardware that the band already owns.
- A workflow needs to keep state between runs (cached Docker layers,
  large datasets) — hosted agents start from scratch every time.

## If/when you do need self-hosted

The Nation's existing **`props-agents`** repo
(<https://github.com/dotproperties/props-agents>) already runs ADO
build agents in Docker, connecting to the `dotproperties` /
`chanzwade` / `richardfellows` orgs. Same operational pattern works
for `skintyeenation`:

1. Clone `props-agents` to a Linux box (the band office workstation,
   or a small Azure VM, or the WordPress production host if it has
   spare capacity — see [`../wordpress-runbook.md`](../wordpress-runbook.md)
   for what's deployed there).
2. Create a **Personal Access Token (PAT)** in ADO with **Agent
   Pools (Read & manage)** scope.
3. Set the PAT + org URL + agent pool name in `props-agents`' env
   config; `docker compose up -d`.
4. Confirm the agent appears in ADO **Organization Settings → Agent
   pools → Default → Agents** as Online.

5. In any pipeline YAML, switch from:

   ```yaml
   pool:
     vmImage: ubuntu-latest
   ```

   to:

   ```yaml
   pool:
     name: Default        # or whatever pool the agent registered into
   ```

6. The pipeline now runs on the self-hosted agent. Hosted minutes
   stop being consumed for that pipeline.

## Cost comparison

For our scale (≤ 20 pushes / day to the docs publisher + ≤ 1 website
deploy / week):

- **Hosted agents:** ~600-800 min/month → free.
- **Self-hosted on the WordPress prod VM:** $0 incremental (the VM
  is already paid for). One-time setup: ~1 hour.
- **Self-hosted on a dedicated Azure VM:** B1ls VM is ~CAD $7/mo;
  not worth it for our pipeline volume.

**Recommendation: stay on hosted agents until the free tier runs
out.** Re-evaluate self-hosting if pipeline volume grows 10×.

## See also

- [`props-agents` README](https://github.com/dotproperties/props-agents/blob/master/README.md) —
  the Docker-Compose stack that runs the agent containers, including
  Docker-in-Docker support and configurable memory limits.
- [Microsoft's self-hosted Linux agent docs](https://learn.microsoft.com/azure/devops/pipelines/agents/v2-linux)
  — for the underlying install if you'd rather skip `props-agents`
  and configure raw.
