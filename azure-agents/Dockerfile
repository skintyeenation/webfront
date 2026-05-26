FROM ubuntu:24.04
ENV TARGETARCH="linux-x64"
ENV DOCKER_HOST=tcp://localhost:2375


RUN apt update && \
  apt upgrade -y && \
  apt install -y curl git jq libicu74 coreutils nano openssh-client openssh-server ca-certificates gnupg && \
  install -m 0755 -d /etc/apt/keyrings && \
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
  chmod a+r /etc/apt/keyrings/docker.gpg && \
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" > /etc/apt/sources.list.d/docker.list && \
  apt update && \
  apt install -y docker-ce-cli docker-buildx-plugin
# Rollback: replace Docker CE lines above with:
#   apt install -y docker.io && \
#   mkdir -p /usr/local/lib/docker/cli-plugins && \
#   BUILDX_VERSION=0.19.3 && \
#   curl -sL "https://github.com/docker/buildx/releases/download/v${BUILDX_VERSION}/buildx-v${BUILDX_VERSION}.linux-arm64" \
#     -o /usr/local/lib/docker/cli-plugins/docker-buildx && \
#   chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx

# Install Azure CLI
RUN curl -sL https://aka.ms/InstallAzureCLIDeb | bash

WORKDIR /azp/

COPY ./start.sh /usr/local/bin/start.sh
RUN sed -i 's/\r$//' /usr/local/bin/start.sh && chmod +x /usr/local/bin/start.sh

# Create agent user and set up home directory
RUN useradd -m -d /home/agent agent
RUN chown -R agent:agent /azp /home/agent

RUN getent group docker || groupadd docker && \
    usermod -aG docker agent

USER agent

#USER root
# Another option is to run the agent as root.
# ENV AGENT_ALLOW_RUNASROOT="true"

ENTRYPOINT [ "/usr/local/bin/start.sh" ]