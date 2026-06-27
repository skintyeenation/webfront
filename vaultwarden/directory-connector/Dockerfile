# Bitwarden Directory Connector (bwdc) CLI, packaged to run as a scheduled
# Azure Container Apps Job - syncs Entra members + groups into the Vaultwarden
# org (ADR-19, Phase A). See ../entra-sync.md.
#
# SCAFFOLD: the bwdc release URL + headless config need first-run verification
# (bwdc stores directory config in an appdata data.json - see sync.sh). Pin
# BWDC_VERSION to a real release tag from
# https://github.com/bitwarden/directory-connector/releases.
FROM debian:12-slim

ARG BWDC_VERSION=2024.10.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip jq libsecret-1-0 \
 && rm -rf /var/lib/apt/lists/*

# Download + install the Linux bwdc CLI.
RUN curl -fsSL -o /tmp/bwdc.zip \
      "https://github.com/bitwarden/directory-connector/releases/download/v${BWDC_VERSION}/bwdc-linux-${BWDC_VERSION}.zip" \
 && unzip /tmp/bwdc.zip -d /usr/local/bin \
 && chmod +x /usr/local/bin/bwdc \
 && rm /tmp/bwdc.zip \
 && bwdc --version || true

COPY sync.sh /usr/local/bin/sync.sh
RUN chmod +x /usr/local/bin/sync.sh

# appdata (data.json with the directory config) lives here - mount an Azure
# Files volume so the one-time config survives Job runs.
ENV BITWARDENCLI_CONNECTOR_APPDATA_DIR=/bwdc-data
ENV BITWARDENCLI_CONNECTOR_PLAINTEXT_SECRETS=true

ENTRYPOINT ["/usr/local/bin/sync.sh"]
