#!/bin/sh
# Build the distributable zip: dist/assetmap-vX.Y.Z.zip
# Contains only what colleagues need to run the map offline (no tools, tests, example).
set -eu
cd "$(dirname "$0")/.."
V=$(tr -d ' \n' < VERSION)
grep -q "AM.VERSION = '$V'" app/main.js || { echo "app/main.js AM.VERSION does not match VERSION ($V)"; exit 1; }
grep -q "## \[$V\]" CHANGELOG.md || { echo "CHANGELOG.md has no entry for $V"; exit 1; }
NAME="assetmap-v$V"
OUT="dist/$NAME"
rm -rf "$OUT" "dist/$NAME.zip"
mkdir -p "$OUT"
cp -R index.html app geo README.md CHANGELOG.md LICENSE THIRD-PARTY.md VERSION "$OUT/"
# only the synthetic samples — never whatever else (incidents, real CSVs) sits in data/
mkdir -p "$OUT/data"
for f in employees.csv assets.csv types.csv settings.csv incident-sample.csv; do cp "data/$f" "$OUT/data/"; done
[ -d tiles ] && cp -R tiles "$OUT/"
find "$OUT" -name '.DS_Store' -delete
(cd dist && zip -qr -X "$NAME.zip" "$NAME")
echo "built dist/$NAME.zip ($(du -h "dist/$NAME.zip" | cut -f1))"
