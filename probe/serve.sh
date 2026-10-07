#!/bin/bash
# Probe only: builds the WNBA Worker as one commit had it, with the probe script in its page, and
# serves it with wrangler dev on a port of its own, under the throwaway key "probe".
set -euo pipefail
label=$1
commit=$2
port=$3
dir="$RUNNER_TEMP/tree-$label"
git -C "$GITHUB_WORKSPACE" worktree add --detach "$dir" "$commit"
cd "$dir"
echo "$label is $(git log -1 --format='%h %s')"
grep -n 'will-change' shared/page/pager.css || echo "$label: pager.css has no will-change"
npm ci --no-audit --no-fund --loglevel=error
node "$GITHUB_WORKSPACE/probe/inject.mjs" apps/wnba/page/index.html
bash "$GITHUB_WORKSPACE/probe/use-fixtures.sh" "$GITHUB_WORKSPACE" .
npm run build -- wnba
cd apps/wnba/worker
nohup wrangler dev --ip 127.0.0.1 --port "$port" --var APP_KEY:probe \
  --persist-to "$RUNNER_TEMP/state-$label" > "$RUNNER_TEMP/wrangler-$label.log" 2>&1 &
for attempt in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$port/robots.txt" > /dev/null 2>&1; then
    echo "$label serving on $port"
    curl -sS -o /dev/null -w "$label page answers %{http_code}\n" "http://127.0.0.1:$port/probe/"
    exit 0
  fi
  sleep 2
done
cat "$RUNNER_TEMP/wrangler-$label.log"
exit 1
