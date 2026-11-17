FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates curl ffmpeg fonts-liberation git gnupg htop less libappindicator1 libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libgfortran5 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 locales lsb-release procps tzdata wget xdg-utils make \
    && rm -rf /var/lib/apt/lists/*
RUN git config --system --add safe.directory /workspace
WORKDIR /workspace

# Match the host user so manual Git and parallel worktrees share file ownership.
RUN if ! getent group 1000 >/dev/null; then groupadd --gid 1000 dev; fi \
    && useradd --create-home --non-unique --uid 1000 --gid 1000 --shell /bin/bash dev
ENV PATH="/home/dev/.local/bin:${PATH}"

