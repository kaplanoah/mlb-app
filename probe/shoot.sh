#!/bin/bash
# Probe only: opens one served version in the simulator's Safari, waits for the store, and prints
# a downscaled screenshot as base64, with how much of each tenth of the screen is drawn.
set -euo pipefail
name=$1
url=$2
wait_seconds=$3
out="$RUNNER_TEMP/shots"
mkdir -p "$out"
xcrun simctl openurl "$PHONE_UDID" "$url"
sleep "$wait_seconds"
xcrun simctl io "$PHONE_UDID" screenshot --type=png "$out/$name.png"
node "$GITHUB_WORKSPACE/probe/measure.mjs" "$out/$name.png"
sips -Z 640 "$out/$name.png" --out "$out/$name-small.png" > /dev/null
echo "BEGIN-PNG $name"
base64 -b 120 -i "$out/$name-small.png"
echo "END-PNG $name"
