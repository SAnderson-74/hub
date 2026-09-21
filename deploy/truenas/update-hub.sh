#!/usr/bin/env bash
# Redeploys the TrueNAS app "hub" when a newer image is published.
# Run as root from a TrueNAS cron job (System > Advanced Settings > Cron Jobs), e.g. every 10 minutes.
set -euo pipefail

APP="${APP:-hub}"
SERVICES=("ts" "hub")
changed=0

for service in "${SERVICES[@]}"; do
  container="ix-${APP}-${service}-1"
  image="$(docker inspect --format '{{.Config.Image}}' "$container" 2>/dev/null)" || {
    logger -t hub-update "container $container not found; is the app running?"
    exit 0
  }
  running="$(docker inspect --format '{{.Image}}' "$container")"
  docker pull --quiet "$image" > /dev/null
  latest="$(docker image inspect --format '{{.Id}}' "$image")"
  if [[ "$running" != "$latest" ]]; then
    logger -t hub-update "$service: new image for $image"
    changed=1
  fi
done

if [[ "$changed" -eq 1 ]]; then
  logger -t hub-update "redeploying $APP"
  midclt call -j app.redeploy "$APP" > /dev/null
  logger -t hub-update "redeployed $APP"
fi
