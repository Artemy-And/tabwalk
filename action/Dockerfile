ARG IMAGE=ghcr.io/artemy-and/tabwalk-server:0.4.1
FROM ${IMAGE}

# GitHub mounts the workspace and job summary files owned by the runner user
USER root

# GitHub builds with this Dockerfile's directory as its context.
COPY entrypoint.sh /app/tabwalk-action.sh
ENTRYPOINT ["/bin/sh", "/app/tabwalk-action.sh"]
