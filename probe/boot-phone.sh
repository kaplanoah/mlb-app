#!/bin/bash
# Probe only: boots the newest iPhone on the newest iOS runtime the runner has, in dark mode.
set -euo pipefail
xcode-select -p
xcodebuild -version
xcrun simctl list runtimes
runtimes=$(xcrun simctl list runtimes -j)
runtime=$(node -e '
  const { runtimes } = JSON.parse(process.argv[1]);
  const ios = runtimes.filter((r) => r.platform === "iOS" && r.isAvailable);
  ios.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
  console.log(ios.at(-1).identifier);
' "$runtimes")
device_type=$(node -e '
  const { runtimes } = JSON.parse(process.argv[1]);
  const runtime = runtimes.find((r) => r.identifier === process.argv[2]);
  const phones = runtime.supportedDeviceTypes.filter((t) => /^iPhone \d+ Pro$/.test(t.name));
  const pick = phones.at(-1) ?? runtime.supportedDeviceTypes.filter((t) => t.productFamily === "iPhone").at(-1);
  console.log(pick.identifier);
' "$runtimes" "$runtime")
echo "Runtime $runtime, device $device_type"
udid=$(xcrun simctl create probe-phone "$device_type" "$runtime")
xcrun simctl boot "$udid"
xcrun simctl bootstatus "$udid" -b
xcrun simctl ui "$udid" appearance dark
echo "PHONE_UDID=$udid" >> "$GITHUB_ENV"
