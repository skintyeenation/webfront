# Azure DevOps Build Agent - DigitalOcean Deployment Guide

## Overview

This document provides a complete guide for deploying a DigitalOcean droplet configured as an Azure DevOps build agent with Docker support for building container images.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Deployment Methods](#deployment-methods)
- [Pipeline Usage](#pipeline-usage)
- [Manual Deployment](#manual-deployment)
- [Configuration Reference](#configuration-reference)
- [Troubleshooting](#troubleshooting)
- [Maintenance](#maintenance)

---

## Architecture Overview

### Components

```
┌─────────────────────────────────────────────────────────┐
│ DigitalOcean Droplet: ADO-AzpAgent1                     │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ OS: Debian 12 (debian-12-x64)                       │ │
│ │ Region: SGP1 (Singapore)                            │ │
│ │ Size: s-1vcpu-1gb (1 vCPU, 1GB RAM)                │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ Installed Software:                                      │
│ ├─ Docker Engine (latest from get.docker.com)          │
│ ├─ Azure CLI (latest)                                   │
│ └─ Azure DevOps Agent (configured & running)           │
│                                                          │
│ Network Configuration:                                   │
│ ├─ Public IP: Assigned by DigitalOcean                 │
│ ├─ SSH Access: Via do_id_rsa key                       │
│ └─ No DNS configuration                                 │
└─────────────────────────────────────────────────────────┘
         │
         │ Communicates with
         ▼
┌─────────────────────────────────────────────────────────┐
│ Azure DevOps Organization                               │
│ ├─ Agent Pool: (configurable)                          │
│ ├─ Authentication: Personal Access Token (PAT)         │
│ └─ Capabilities: Docker, Azure CLI                     │
└─────────────────────────────────────────────────────────┘
```

### Deployment Flow

```
1. Create DO Droplet (via doctl)
   └─ Name: ADO-AzpAgent1
   └─ SSH Key: Pre-registered DO SSH key
   └─ Firewall: Default DO firewall rules

2. Install Docker
   └─ Method: curl -fsSL https://get.docker.com | sh
   └─ User permissions: Add root to docker group
   └─ Service: Enable and start docker daemon

3. Install Azure CLI
   └─ Method: Microsoft's installation script
   └─ Verify: az --version

4. Install Azure DevOps Agent
   └─ Download: Latest Linux x64 agent
   └─ Configure: Unattended mode with PAT token
   └─ Install service: systemd service
   └─ Start: Automatic agent startup
   └─ Verify: Agent appears online in ADO portal

5. Verification
   └─ Docker: docker --version
   └─ Azure CLI: az --version
   └─ ADO Agent: Service status check
```

---

## Prerequisites

### 1. Azure DevOps Setup

- **Organization URL**: Your Azure DevOps organization (e.g., `https://dev.azure.com/yourorg`)
- **Personal Access Token (PAT)**:
  - Scope: `Agent Pools (Read & Manage)`
  - Expiration: Set appropriately for your security policies
  - Store in Azure Key Vault or ADO variable group as `ADO_PAT_TOKEN`
- **Agent Pool**: Create or use existing pool (e.g., `devOps-pool`, `build-agents`)

### 2. DigitalOcean Setup

- **API Token**:
  - Required scopes: Read/Write
  - Store in variable group `digitalocean-config` as `DO_API_TOKEN`
- **SSH Key**:
  - Must be registered in DigitalOcean account
  - Store key ID/fingerprint as `DO_SSH_KEY_ID`
  - Private key stored in Azure Secure Files as `do_id_rsa`

### 3. Azure DevOps Variable Groups

#### `digitalocean-config`
```yaml
DO_API_TOKEN:      # DigitalOcean API token
DO_SSH_KEY_ID:     # SSH key fingerprint (e.g., "a1:b2:c3:...")
DO_REGION:         # sgp1 (Singapore)
DO_IMAGE:          # debian-12-x64
DO_SIZE:           # s-1vcpu-1gb
```

#### `build-agent-config` (New - to be created)
```yaml
ADO_ORG_URL:       # https://dev.azure.com/yourorg
ADO_POOL_NAME:     # devOps-pool (or your preferred pool)
ADO_PAT_TOKEN:     # Personal Access Token (secret)
CP_SERVER_USER:    # root (or your SSH user)
```

### 4. Azure Secure Files

- `do_id_rsa` - SSH private key for DigitalOcean droplet access

### 5. Tools Required in Pipeline Agent

- `doctl` - DigitalOcean CLI (from D:\Code\Azure\Pipelines\tools\doctl)
- `jq` - JSON processor (for parsing doctl output)

---

## Deployment Methods

### Method 1: Automated Pipeline Deployment (Recommended)

**Pipeline File**: `D:\Code\Azure\Azure-Build-Agents\DeployBuildAgent.yml`

#### Quick Start

1. Navigate to Azure DevOps Pipelines
2. Create new pipeline from `DeployBuildAgent.yml`
3. Configure parameters:
   - **agentName**: `ADO-AzpAgent1` (or custom name)
   - **agentPoolName**: Your target agent pool
   - **environmentType**: `prod` (or `dev`, `staging`)
4. Run pipeline
5. Wait 5-10 minutes for complete deployment
6. Verify agent appears online in Agent Pools

#### Pipeline Parameters

```yaml
parameters:
- name: agentName
  displayName: 'Build Agent Name'
  type: string
  default: 'ADO-AzpAgent1'

- name: agentPoolName
  displayName: 'Azure DevOps Agent Pool'
  type: string
  default: 'devOps-pool'

- name: environmentType
  displayName: 'Environment Type'
  type: string
  default: 'prod'
  values:
    - dev
    - staging
    - prod

- name: skipDropletCreation
  displayName: 'Skip Droplet Creation (if already exists)'
  type: boolean
  default: false

- name: reinstallAgent
  displayName: 'Reinstall ADO Agent (if already configured)'
  type: boolean
  default: false
```

#### Pipeline Stages

```yaml
Stages:
1. GatherPipelineTools
   └─ Collects doctl and helper scripts

2. CreateDroplet
   └─ Creates DO droplet via doctl
   └─ Outputs: PUBLIC_IP

3. InstallDocker
   └─ SSH into droplet
   └─ Installs Docker engine
   └─ Configures docker group permissions

4. InstallAzureCLI
   └─ Installs Azure CLI
   └─ Verifies installation

5. InstallADOAgent
   └─ Downloads ADO agent package
   └─ Configures agent with PAT token
   └─ Installs systemd service
   └─ Starts agent

6. VerifyDeployment
   └─ Checks Docker: docker --version
   └─ Checks Azure CLI: az --version
   └─ Checks ADO Agent: systemctl status vsts*
   └─ Outputs agent status
```

---

### Method 2: Manual Deployment

For manual deployment or troubleshooting, follow these steps:

#### Step 1: Create DigitalOcean Droplet

```bash
# Set variables
export DO_API_TOKEN="your_do_token"
export AGENT_NAME="ADO-AzpAgent1"
export DO_REGION="sgp1"
export DO_IMAGE="debian-12-x64"
export DO_SIZE="s-1vcpu-1gb"
export DO_SSH_KEY_ID="your_ssh_key_fingerprint"

# Authenticate doctl
doctl auth init --access-token "$DO_API_TOKEN"

# Create droplet
DROPLET_JSON=$(doctl compute droplet create "$AGENT_NAME" \
  --region "$DO_REGION" \
  --image "$DO_IMAGE" \
  --size "$DO_SIZE" \
  --ssh-keys "$DO_SSH_KEY_ID" \
  --wait \
  --output json)

# Extract public IP
PUBLIC_IP=$(echo "$DROPLET_JSON" | jq -r '.[0].networks.v4[] | select(.type=="public") | .ip_address')
echo "Droplet created with IP: $PUBLIC_IP"
```

#### Step 2: SSH into Droplet

```bash
# Wait for SSH to be available (30-60 seconds)
sleep 60

# SSH into droplet
ssh -o StrictHostKeyChecking=no root@$PUBLIC_IP
```

#### Step 3: Install Docker

```bash
# Update system
apt-get update

# Install Docker
curl -fsSL https://get.docker.com | sh

# Add root user to docker group
usermod -aG docker root

# Enable and start Docker service
systemctl enable docker
systemctl start docker

# Verify installation
docker --version
docker ps

# Test Docker (optional)
docker run hello-world
```

#### Step 4: Install Azure CLI

```bash
# Install prerequisites
apt-get install -y ca-certificates curl apt-transport-https lsb-release gnupg

# Download and install Microsoft signing key
mkdir -p /etc/apt/keyrings
curl -sLS https://packages.microsoft.com/keys/microsoft.asc | \
  gpg --dearmor | \
  tee /etc/apt/keyrings/microsoft.gpg > /dev/null
chmod go+r /etc/apt/keyrings/microsoft.gpg

# Add Azure CLI repository
AZ_DIST=$(lsb_release -cs)
echo "deb [arch=`dpkg --print-architecture` signed-by=/etc/apt/keyrings/microsoft.gpg] https://packages.microsoft.com/repos/azure-cli/ $AZ_DIST main" | \
  tee /etc/apt/sources.list.d/azure-cli.list

# Install Azure CLI
apt-get update
apt-get install -y azure-cli

# Verify installation
az --version
```

#### Step 5: Install Azure DevOps Agent

```bash
# Set variables
export ADO_ORG_URL="https://dev.azure.com/yourorg"
export ADO_PAT_TOKEN="your_pat_token"
export ADO_POOL_NAME="devOps-pool"
export AGENT_NAME="ADO-AzpAgent1"

# Create agent directory
mkdir -p /opt/azagent
cd /opt/azagent

# Download latest agent (check https://github.com/microsoft/azure-pipelines-agent/releases for latest version)
AGENT_VERSION="3.236.1"  # Update to latest version
wget https://vstsagentpackage.azureedge.net/agent/${AGENT_VERSION}/vsts-agent-linux-x64-${AGENT_VERSION}.tar.gz

# Extract agent
tar zxvf vsts-agent-linux-x64-${AGENT_VERSION}.tar.gz

# Configure agent (unattended)
./config.sh \
  --unattended \
  --url "$ADO_ORG_URL" \
  --auth pat \
  --token "$ADO_PAT_TOKEN" \
  --pool "$ADO_POOL_NAME" \
  --agent "$AGENT_NAME" \
  --replace \
  --acceptTeeEula

# Install service
./svc.sh install

# Start service
./svc.sh start

# Check status
./svc.sh status
```

#### Step 6: Verify Installation

```bash
# Check Docker
docker --version
docker info
docker ps

# Check Azure CLI
az --version

# Check ADO Agent service
systemctl status vsts.agent.$(basename $ADO_ORG_URL).$(echo $ADO_POOL_NAME | sed 's/ /-/g').$(hostname)

# View agent logs (if needed)
journalctl -u vsts.agent.* -f
```

---

## Configuration Reference

### Droplet Specifications

| Setting | Value | Notes |
|---------|-------|-------|
| Name | ADO-AzpAgent1 | Configurable via pipeline parameter |
| Region | sgp1 | Singapore datacenter |
| Image | debian-12-x64 | Debian 12 (Bookworm) |
| Size | s-1vcpu-1gb | 1 vCPU, 1GB RAM, 25GB SSD |
| Network | Public IPv4 | No DNS configuration |
| SSH Access | Via do_id_rsa | Root user access |

### Software Versions

| Software | Version | Installation Method |
|----------|---------|---------------------|
| Debian | 12 (Bookworm) | DO base image |
| Docker | Latest | get.docker.com script |
| Azure CLI | Latest | Microsoft APT repository |
| ADO Agent | Latest (3.236.x) | Direct download from Azure |

### Network & Security

**Firewall Rules**: Default DigitalOcean firewall
- SSH (22): Inbound from anywhere
- Docker daemon (2375/2376): Not exposed (local only)
- ADO Agent: Outbound HTTPS to Azure DevOps

**SSH Access**:
- User: `root`
- Key: `do_id_rsa` (from Azure Secure Files)
- Port: 22 (default)

**Security Considerations**:
- Consider creating a non-root user for agent execution
- Configure DO Cloud Firewall to restrict SSH access
- Rotate PAT tokens regularly
- Enable automatic security updates:
  ```bash
  apt-get install -y unattended-upgrades
  dpkg-reconfigure --priority=low unattended-upgrades
  ```

---

## Pipeline Usage

### Running the Pipeline

1. **Via Azure DevOps UI**:
   - Navigate to Pipelines
   - Select "DeployBuildAgent"
   - Click "Run pipeline"
   - Configure parameters
   - Click "Run"

2. **Via Azure CLI**:
   ```bash
   az pipelines run \
     --name "DeployBuildAgent" \
     --org "https://dev.azure.com/yourorg" \
     --project "YourProject" \
     --parameters agentName=ADO-AzpAgent2 agentPoolName=devOps-pool
   ```

### Pipeline Output

The pipeline will output:
- Droplet public IP address
- Docker version installed
- Azure CLI version installed
- ADO agent registration status
- Service status

### Multiple Agents

To deploy multiple build agents:

1. Run pipeline with different `agentName` parameter:
   - ADO-AzpAgent1
   - ADO-AzpAgent2
   - ADO-AzpAgent3

2. All agents will register to the same pool (unless `agentPoolName` is changed)

3. Azure DevOps will distribute jobs across available agents

---

## Troubleshooting

### Droplet Creation Issues

**Problem**: Droplet creation fails with "SSH key not found"

**Solution**:
```bash
# List your DO SSH keys
doctl compute ssh-key list

# Update DO_SSH_KEY_ID variable with correct fingerprint
```

**Problem**: Droplet creation fails with "insufficient quota"

**Solution**:
- Check your DigitalOcean account limits
- Delete unused droplets
- Contact DO support to increase quota

### Docker Installation Issues

**Problem**: Docker installation fails

**Solution**:
```bash
# SSH into droplet
ssh root@$PUBLIC_IP

# Check system logs
journalctl -xe

# Try manual installation
apt-get update
apt-get install -y docker.io

# Or use specific Docker version
apt-get install -y docker-ce=5:24.0.0-1~debian.12~bookworm
```

**Problem**: Docker daemon not starting

**Solution**:
```bash
# Check Docker service status
systemctl status docker

# View detailed logs
journalctl -u docker -n 50

# Restart Docker
systemctl restart docker

# Check for port conflicts
netstat -tuln | grep 2375
```

### Azure CLI Installation Issues

**Problem**: Azure CLI repository not found

**Solution**:
```bash
# Verify Debian release
lsb_release -a

# Manually set distribution
export AZ_DIST="bookworm"

# Re-add repository
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/microsoft.gpg] https://packages.microsoft.com/repos/azure-cli/ $AZ_DIST main" | \
  tee /etc/apt/sources.list.d/azure-cli.list

apt-get update
apt-get install -y azure-cli
```

### ADO Agent Issues

**Problem**: Agent fails to register

**Solution**:
```bash
# Verify PAT token has correct permissions
# Required: Agent Pools (Read & Manage)

# Check network connectivity
curl -I https://dev.azure.com/yourorg

# Try manual configuration
cd /opt/azagent
./config.sh remove
./config.sh  # Interactive mode for debugging
```

**Problem**: Agent shows offline in Azure DevOps

**Solution**:
```bash
# Check service status
systemctl status vsts.agent.*

# Restart service
systemctl restart vsts.agent.*

# View agent logs
journalctl -u vsts.agent.* -f

# Check for errors in agent directory
cat /opt/azagent/_diag/*.log
```

**Problem**: Agent capabilities not detected

**Solution**:
```bash
# Manually refresh capabilities
cd /opt/azagent
./svc.sh stop
./config.sh remove
./config.sh --unattended --url "$ADO_ORG_URL" --auth pat --token "$ADO_PAT_TOKEN" --pool "$ADO_POOL_NAME" --agent "$AGENT_NAME" --replace --acceptTeeEula
./svc.sh install
./svc.sh start

# Verify Docker is accessible to agent user
sudo -u svc_AzDevOps docker ps
```

### SSH Connection Issues

**Problem**: SSH connection refused

**Solution**:
```bash
# Wait longer for droplet initialization
sleep 120

# Verify droplet is running
doctl compute droplet list

# Check SSH service
ssh -v root@$PUBLIC_IP

# Reset SSH if needed (via DO console)
```

**Problem**: Permission denied (publickey)

**Solution**:
```bash
# Verify SSH key is correct
ssh-keygen -lf ~/.ssh/do_id_rsa

# Check DO SSH key registration
doctl compute ssh-key list

# Try with different key
ssh -i /path/to/correct/key root@$PUBLIC_IP
```

### Build Failures

**Problem**: Docker builds fail with "out of memory"

**Solution**:
- Upgrade droplet size to s-2vcpu-4gb or larger
- Use multi-stage builds to reduce memory usage
- Add swap space:
  ```bash
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ```

**Problem**: Docker builds fail with "no space left on device"

**Solution**:
```bash
# Clean up Docker
docker system prune -a -f --volumes

# Check disk usage
df -h
du -sh /var/lib/docker/*

# Consider upgrading droplet storage
```

---

## Maintenance

### Regular Maintenance Tasks

#### Weekly
- Check agent status in Azure DevOps portal
- Monitor droplet resource usage (CPU, memory, disk)
- Review agent logs for errors

#### Monthly
- Update system packages:
  ```bash
  ssh root@$PUBLIC_IP
  apt-get update && apt-get upgrade -y
  ```
- Clean up Docker images:
  ```bash
  docker system prune -a -f
  ```
- Rotate SSH keys (if required by security policy)

#### Quarterly
- Review and rotate PAT tokens
- Update Azure DevOps agent to latest version
- Review droplet size and adjust if needed
- Audit agent pool usage and capacity

### Updating Azure DevOps Agent

```bash
# SSH into droplet
ssh root@$PUBLIC_IP

# Stop agent service
cd /opt/azagent
./svc.sh stop

# Remove old agent
./config.sh remove

# Download new agent version
cd /opt
mv azagent azagent.backup
mkdir azagent && cd azagent

AGENT_VERSION="3.240.0"  # Update to desired version
wget https://vstsagentpackage.azureedge.net/agent/${AGENT_VERSION}/vsts-agent-linux-x64-${AGENT_VERSION}.tar.gz
tar zxvf vsts-agent-linux-x64-${AGENT_VERSION}.tar.gz

# Reconfigure agent
./config.sh --unattended --url "$ADO_ORG_URL" --auth pat --token "$ADO_PAT_TOKEN" --pool "$ADO_POOL_NAME" --agent "$AGENT_NAME" --replace --acceptTeeEula

# Reinstall and start service
./svc.sh install
./svc.sh start
./svc.sh status
```

### Upgrading Docker

```bash
# SSH into droplet
ssh root@$PUBLIC_IP

# Update package lists
apt-get update

# Upgrade Docker
apt-get install -y docker-ce docker-ce-cli containerd.io

# Restart Docker service
systemctl restart docker

# Verify
docker --version
```

### Upgrading Azure CLI

```bash
# SSH into droplet
ssh root@$PUBLIC_IP

# Upgrade Azure CLI
apt-get update
apt-get install --only-upgrade -y azure-cli

# Verify
az --version
```

### Scaling Considerations

**Horizontal Scaling** (Multiple Agents):
- Deploy additional agents with pipeline parameter `agentName=ADO-AzpAgent2`
- All agents can share same pool
- Recommended for high build volume

**Vertical Scaling** (Larger Droplets):
- For resource-intensive builds, consider:
  - s-2vcpu-4gb (2 vCPU, 4GB RAM) - Good for moderate builds
  - s-4vcpu-8gb (4 vCPU, 8GB RAM) - Good for complex builds
  - s-8vcpu-16gb (8 vCPU, 16GB RAM) - Good for parallel builds
- Update `DO_SIZE` variable before deployment

**Cost Optimization**:
- s-1vcpu-1gb: $6/month (~$0.009/hour)
- s-2vcpu-4gb: $18/month (~$0.027/hour)
- s-4vcpu-8gb: $36/month (~$0.054/hour)

### Monitoring

**Basic Monitoring** (via SSH):
```bash
# CPU and memory usage
top
htop  # Install: apt-get install -y htop

# Disk usage
df -h
du -sh /var/lib/docker/*

# Docker stats
docker stats --no-stream

# Agent logs
journalctl -u vsts.agent.* -f
```

**DigitalOcean Monitoring**:
- Enable monitoring in DO control panel
- View graphs for CPU, memory, disk I/O, bandwidth
- Set up alerts for resource thresholds

**Azure DevOps Monitoring**:
- View agent pool utilization
- Monitor job queue depth
- Review build success/failure rates

### Backup and Recovery

**Backup Strategy**:
- Agent configuration: Stored in Azure DevOps (can be reconfigured)
- Docker images: Stored in container registry (not on agent)
- No persistent data on agent (stateless design)

**Recovery Process**:
1. Delete failed droplet: `doctl compute droplet delete ADO-AzpAgent1`
2. Rerun deployment pipeline
3. Agent will re-register automatically
4. No data loss (stateless agent)

**Snapshots** (Optional):
```bash
# Create droplet snapshot via doctl
doctl compute droplet-action snapshot $DROPLET_ID --snapshot-name "ado-agent-baseline"

# Restore from snapshot
doctl compute droplet create ADO-AzpAgent1-restored --image $SNAPSHOT_ID --size s-1vcpu-1gb --region sgp1
```

---

## Advanced Configuration

### Using Non-Root User

For better security, configure agent to run as non-root user:

```bash
# Create dedicated user
useradd -m -s /bin/bash azagent
usermod -aG docker azagent

# Move agent directory
mv /opt/azagent /home/azagent/
chown -R azagent:azagent /home/azagent/azagent

# Configure agent as azagent user
su - azagent
cd /home/azagent/azagent
./config.sh --unattended --url "$ADO_ORG_URL" --auth pat --token "$ADO_PAT_TOKEN" --pool "$ADO_POOL_NAME" --agent "$AGENT_NAME"

# Install service as azagent user
./svc.sh install azagent
./svc.sh start
```

### Docker Registry Authentication

To enable builds that push to registries:

```bash
# Azure Container Registry
docker login youracr.azurecr.io -u $ACR_USER -p $ACR_TOKEN

# Docker Hub
docker login -u $DOCKERHUB_USER -p $DOCKERHUB_TOKEN

# Save credentials (will persist for agent)
cat ~/.docker/config.json
```

### Custom Agent Capabilities

Add custom capabilities for pipeline targeting:

```bash
cd /opt/azagent
./config.sh remove

# Add custom capabilities during configuration
./config.sh \
  --unattended \
  --url "$ADO_ORG_URL" \
  --auth pat \
  --token "$ADO_PAT_TOKEN" \
  --pool "$ADO_POOL_NAME" \
  --agent "$AGENT_NAME" \
  --addCapability "docker" "true" \
  --addCapability "azure-cli" "true" \
  --addCapability "region" "singapore" \
  --replace \
  --acceptTeeEula
```

### Docker BuildKit

Enable BuildKit for faster builds:

```bash
# Enable BuildKit globally
echo '{"features": {"buildkit": true}}' > /etc/docker/daemon.json
systemctl restart docker

# Or per-build in pipeline
export DOCKER_BUILDKIT=1
docker build ...
```

---

## Related Documentation

- [Azure DevOps Agent Documentation](https://learn.microsoft.com/en-us/azure/devops/pipelines/agents/linux-agent)
- [DigitalOcean API Documentation](https://docs.digitalocean.com/reference/api/)
- [Docker Installation Guide](https://docs.docker.com/engine/install/debian/)
- [Azure CLI Installation](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli-linux)

---

## Appendix: Pipeline Files

### File Locations

```
D:\Code\Azure\Azure-Build-Agents\
├── BUILD-AGENT-DEPLOYMENT.md         # This documentation
├── DeployBuildAgent.yml              # Main pipeline file
├── docker-compose.yml                # Local agent configuration
├── .env.dotproperties                # ADO credentials
└── templates\
    └── deploy-build-agent.yml        # Deployment template

D:\Code\Azure\Pipelines\
└── tools\
    └── doctl                         # DigitalOcean CLI (referenced by pipeline)
```

### Quick Reference Commands

```bash
# List all droplets
doctl compute droplet list

# Get droplet IP
doctl compute droplet get ADO-AzpAgent1 --format PublicIPv4 --no-header

# SSH into agent
ssh root@$(doctl compute droplet get ADO-AzpAgent1 --format PublicIPv4 --no-header)

# Delete droplet
doctl compute droplet delete ADO-AzpAgent1

# View agent status
systemctl status vsts.agent.*

# Restart agent
systemctl restart vsts.agent.*

# View agent logs
journalctl -u vsts.agent.* -f
```

---

## Support

For issues or questions:
1. Check [Troubleshooting](#troubleshooting) section
2. Review agent logs: `journalctl -u vsts.agent.* -n 100`
3. Check Azure DevOps agent pool for error messages
4. Review DigitalOcean droplet console for system issues

---

**Last Updated**: 2025-01-17
**Version**: 1.0
**Author**: Azure DevOps Team
