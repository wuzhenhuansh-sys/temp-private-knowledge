#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-luban-private-knowledge:local}"
CONTAINER_NAME="${CONTAINER_NAME:-luban-private-knowledge}"
HOST_PORT="${HOST_PORT:-4002}"
CONTAINER_PORT="${CONTAINER_PORT:-8787}"
ENV_FILE="${ENV_FILE:-.env}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but was not found in PATH." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Environment file '$ENV_FILE' was not found." >&2
  exit 1
fi

echo "Building image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" .

if docker ps -a --format '{{.Names}}' | grep -Fxq "$CONTAINER_NAME"; then
  echo "Removing existing container: $CONTAINER_NAME"
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi

echo "Starting container: $CONTAINER_NAME"
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "$HOST_PORT:$CONTAINER_PORT" \
  --env-file "$ENV_FILE" \
  "$IMAGE_NAME"

echo "Container is running."
echo "  name: $CONTAINER_NAME"
echo "  port: $HOST_PORT -> $CONTAINER_PORT"
echo "  logs: docker logs -f $CONTAINER_NAME"
