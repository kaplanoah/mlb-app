#!/bin/bash
# Probe only: opens one served version in the simulator's Safari, waits for the store, and keeps
# a screenshot, a small JPEG of it, and how much of each tenth of the screen is drawn.
set -euo pipefail
name=$1
url=$2
wait_seconds=$3
out="$RUNNER_TEMP/shots"
mkdir -p "$out"
xcrun simctl openurl "$PHONE_UDID" "$url"
sleep "$wait_seconds"
xcrun simctl io "$PHONE_UDID" screenshot --type=png "$out/$name.png"
node "$GITHUB_WORKSPACE/probe/measure.mjs" "$out/$name.png" | tee -a "$out/measure.txt"
sips -Z 520 -s format jpeg -s formatOptions 55 "$out/$name.png" --out "$out/$name-small.jpg" > /dev/null
