#!/bin/bash
#
# Build and launch on the iOS simulator without Simulator.app.
#
# `npm run ios` (react-native run-ios) unconditionally runs
#   open "$(xcode-select -p)/Applications/Simulator.app"
# at node_modules/@react-native-community/cli-platform-apple/build/commands/
# runCommand/runOnSimulator.js:45 — purely so a window appears for the user.
# No CLI flag skips it, and Xcode 26/27 no longer bundles Simulator.app at that
# path, so the command fails before the build ever starts.
#
# The `open` call is cosmetic: booting happens separately via `xcrun simctl
# boot`. Everything below is the same work the CLI would have done
# (see .../runCommand/installApp.js), minus the window.

set -euo pipefail

UDID="${1:-booted}"
SCHEME="${SCHEME:-MyApp}"
CONFIG="${CONFIG:-Debug}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DERIVED="$ROOT/ios/build"
APP="$DERIVED/Build/Products/$CONFIG-iphonesimulator/MyApp.app"

# 1. Boot headless. Fails harmlessly if already booted.
echo "==> Booting $UDID"
xcrun simctl boot "$UDID" 2>/dev/null || true

# 2. Build.
echo "==> Building $SCHEME ($CONFIG, iphonesimulator)"
xcodebuild \
  -workspace "$ROOT/ios/MyApp.xcworkspace" \
  -scheme "$SCHEME" \
  -configuration "$CONFIG" \
  -sdk iphonesimulator \
  -derivedDataPath "$DERIVED" \
  build

# 3. Install and launch, reading the bundle id straight out of the built app.
echo "==> Installing $APP"
xcrun simctl install "$UDID" "$APP"

BUNDLE_ID=$(/usr/libexec/PlistBuddy -c 'Print:CFBundleIdentifier' "$APP/Info.plist")
echo "==> Launching $BUNDLE_ID"
xcrun simctl launch "$UDID" "$BUNDLE_ID"

cat <<EOF

Done. No window will appear — the app is running on the booted simulator.

  Logs:    xcrun simctl spawn $UDID log stream --predicate 'processImagePath CONTAINS "MyApp"'
  Screenshot: xcrun simctl io $UDID screenshot /tmp/myapp.png

Start Metro first in another terminal:  npm start
EOF
