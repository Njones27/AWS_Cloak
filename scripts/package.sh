#!/usr/bin/env bash
# Builds the zip that gets uploaded to the Chrome Web Store.
# Only the files the extension needs at runtime go in, so tests and docs stay out.
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(node -p "require('./manifest.json').version")
mkdir -p dist
out="dist/aws-cloak-${version}.zip"
rm -f "$out"
zip -r -q "$out" manifest.json icons popup src -x '*.DS_Store'
echo "$out"
