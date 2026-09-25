ARG IMAGE=ghcr.io/artemy-and/tabwalk-server:latest
FROM ${IMAGE}

# GitHub mounts the workspace and job summary files owned by the runner user
USER root

ENTRYPOINT ["node", "/app/apps/server/dist/ci.js"]
