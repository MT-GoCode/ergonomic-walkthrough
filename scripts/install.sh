#!/bin/bash
# Build the app and install it to ~/Applications, registering .walkthrough with Finder.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run dist
app=~/Applications/Walkthrough.app
rm -rf "$app"
ditto dist/mac-arm64/Walkthrough.app "$app"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app"
echo "installed $app"
