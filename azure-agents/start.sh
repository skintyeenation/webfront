#!/bin/bash
# Entry point for the Skin Tyee Azure DevOps build-agent container.
# Downloads the agent binary on first boot, registers with the
# skintyeenation ADO org, and runs the agent loop.
#
# Required env vars (set via .env.skintyeenation):
#   AZP_URL          — https://dev.azure.com/skintyeenation
#   AZP_TOKEN        — Personal Access Token w/ "Agent Pools: Read & manage"
#   AZP_POOL         — agent pool name (e.g. "skintyee-pool")
#   AZP_AGENT_NAME   — display name for this agent (defaults to hostname)

set -e

AGENT_ALLOW_RUNASROOT="true"
export AGENT_ALLOW_RUNASROOT

if [ -z "${AZP_URL:-}" ]; then
  echo "✗ AZP_URL not set — bailing." >&2
  exit 1
fi
if [ -z "${AZP_TOKEN:-}" ]; then
  echo "✗ AZP_TOKEN not set — generate a PAT at" >&2
  echo "  ${AZP_URL}/_usersSettings/tokens with 'Agent Pools: Read & manage' scope," >&2
  echo "  then put it in .env.skintyeenation." >&2
  exit 1
fi
if [ -z "${AZP_POOL:-}" ]; then
  AZP_POOL="skintyee-pool"
  export AZP_POOL
fi
if [ -z "${AZP_AGENT_NAME:-}" ]; then
  AZP_AGENT_NAME=$(hostname)
  export AZP_AGENT_NAME
fi

echo "Checking for existing agent configuration..."
if [ -f .agent ]; then
  echo "Agent is already configured. Skipping configuration..."
else
  # Detect architecture
  ARCH=$(uname -m)
  if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    AGENT_ARCH="linux-arm64"
  else
    AGENT_ARCH="linux-x64"
  fi

  AGENT_VERSION="${AGENT_VERSION:-4.261.0}"
  echo "Downloading Azure Pipelines agent ${AGENT_VERSION} (${AGENT_ARCH})..."
  curl -LsS "https://download.agent.dev.azure.com/agent/${AGENT_VERSION}/vsts-agent-${AGENT_ARCH}-${AGENT_VERSION}.tar.gz" \
    | tar -xz

  echo "Configuring agent → ${AZP_URL} / pool=${AZP_POOL} / name=${AZP_AGENT_NAME}..."
  ./config.sh --unattended \
    --url "$AZP_URL" \
    --auth pat \
    --token "$AZP_TOKEN" \
    --pool "$AZP_POOL" \
    --agent "$AZP_AGENT_NAME" \
    --replace
fi

echo "Starting agent..."
./run.sh
