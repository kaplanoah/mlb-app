#!/bin/bash
# Probe only: makes a tree's WNBA Worker answer the league's feeds from the probe's fixtures.
set -euo pipefail
probe_root=$1
tree=$2
source_dir="$tree/apps/wnba/worker/src"
cp "$probe_root/probe/fixture-fetch.js" "$source_dir/probe-fixture-fetch.js"
cp "$probe_root/apps/wnba/tests/fixtures/2026-09-30-afternoon.json" "$source_dir/afternoon.json"
cp "$probe_root/apps/wnba/tests/fixtures/2026-10-01-games.json" "$source_dir/games.json"
{
  echo 'import "./probe-fixture-fetch.js";'
  cat "$source_dir/index.js"
} > "$source_dir/index.probe.js"
mv "$source_dir/index.probe.js" "$source_dir/index.js"
