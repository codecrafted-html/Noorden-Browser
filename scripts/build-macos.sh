#!/bin/bash
# Build from the unmodified, vendored MIT snapshot plus the Noorder changes.
set -euo pipefail
cd "$(dirname "$0")/.."
root=$PWD
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
git archive HEAD:macos | tar -x -C "$stage"
cd "$stage"
git apply --no-index "$root/scripts/noorder-macos.patch"
arch=${SEARCH_ARCH:-$(uname -m)}
case "$arch" in arm64) out=build ;; x86_64) out=build/intel ;; *) exit 2 ;; esac
version=$(cat VERSION)
[[ "$version" == "$(node -p "require(process.argv[1]).version" "$root/package.json")" ]]
./build.sh release dmg
app="$out/Noorder Browser.app"
codesign --verify --deep --strict "$app"
[[ "$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Contents/Info.plist")" == be.noorder.browser.webkit ]]
[[ -s "$app/Contents/Resources/Search-LICENSE.txt" ]]
dest="$root/dist"; mkdir -p "$dest"
base="Noorder-Browser-${version}-macOS-${arch}"
cp "$out/Noorder Browser.dmg" "$dest/$base.dmg"
cp "$out/Noorder Browser.zip" "$dest/$base.zip"
pkgbuild --component "$app" --install-location /Applications --identifier be.noorder.browser.webkit.pkg --version "$version" "$dest/$base.pkg"
if [[ "$arch" == "$(uname -m)" ]]; then
  swift test --filter 'AddressTests|VaultAndUpdaterTests'
fi
