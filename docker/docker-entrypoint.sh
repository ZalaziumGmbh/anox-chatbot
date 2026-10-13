#!/bin/bash

# Check if STORAGE_DIR is set
if [ -z "$STORAGE_DIR" ]; then
    echo "================================================================"
    echo "⚠️  ⚠️  ⚠️  WARNING: STORAGE_DIR environment variable is not set! ⚠️  ⚠️  ⚠️"
    echo ""
    echo "Not setting this will result in data loss on container restart since"
    echo "the application will not have a persistent storage location."
    echo "It can also result in weird errors in various parts of the application."
    echo ""
    echo "Please run the container with the official docker command at"
    echo "https://docs.anythingllm.com/installation-docker/quickstart"
    echo ""
    echo "⚠️  ⚠️  ⚠️  WARNING: STORAGE_DIR environment variable is not set! ⚠️  ⚠️  ⚠️"
    echo "================================================================"
fi

if [ "${MANAGED_RUNTIME:-false}" = "true" ]; then
  cd /app/server/ || exit 1
  export CHECKPOINT_DISABLE=1
  npx prisma generate --schema=./prisma/schema.prisma || exit 1
  npx prisma migrate deploy --schema=./prisma/schema.prisma || exit 1
  node /app/server/scripts/managed-bootstrap.cjs || exit 1
  node /app/server/index.js &
  server_pid=$!
  node /app/collector/index.js &
  collector_pid=$!
  stop_managed() {
    trap '' TERM INT
    kill -TERM "$server_pid" "$collector_pid" 2>/dev/null || true
    status=0
    wait "$server_pid" || status=1
    wait "$collector_pid" || status=1
    exit "$status"
  }
  trap stop_managed TERM INT
  wait -n "$server_pid" "$collector_pid"
  # One child exiting unexpectedly must not leave half a healthy application.
  kill -TERM "$server_pid" "$collector_pid" 2>/dev/null || true
  wait "$server_pid" "$collector_pid" 2>/dev/null || true
  exit 1
fi

{
  cd /app/server/ &&
    # Disable Prisma CLI telemetry (https://www.prisma.io/docs/orm/tools/prisma-cli#how-to-opt-out-of-data-collection)
    export CHECKPOINT_DISABLE=1 &&
    npx prisma generate --schema=./prisma/schema.prisma &&
    npx prisma migrate deploy --schema=./prisma/schema.prisma &&
    if [ "${MANAGED_RUNTIME:-false}" = "true" ]; then
      node /app/server/scripts/managed-bootstrap.cjs
    fi &&
    node /app/server/index.js
} &
{ node /app/collector/index.js; } &
wait -n
exit $?
