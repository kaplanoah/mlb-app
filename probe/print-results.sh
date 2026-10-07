#!/bin/bash
# Probe only: prints what each page reported and how much of each screenshot is drawn, then each
# small screenshot as base64 between markers, last, so the end of the job log holds them all.
out="$RUNNER_TEMP/shots"
cat "$RUNNER_TEMP/phone.txt"
for label in broken fixed head; do
  echo "== $label wrangler errors"
  grep -iE 'error|exception|fail' "$RUNNER_TEMP/wrangler-$label.log" | head -20 || true
  echo "== $label reports"
  grep -o 'probe-report/[^ ]*' "$RUNNER_TEMP/wrangler-$label.log" | sed 's|probe-report/||' |
    node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{for(const l of s.trim().split("\n"))if(l)console.log("REPORT",decodeURIComponent(l))})' || true
done
cat "$out/measure.txt"
for file in "$out"/*-small.jpg; do
  name=$(basename "$file" -small.jpg)
  echo "BEGIN-PNG $name"
  base64 -b 120 -i "$file"
  echo "END-PNG $name"
done
