#!/bin/bash
# Refresh ESPN keeper values, then commit + push so GitHub Pages updates.
set -e
cd "$(dirname "$0")/.."
python3 scripts/refresh_data.py
# bump asset versions so league browsers never serve a stale mix of files
STAMP=$(date +%Y%m%d%H%M)
sed -i '' -E "s/\?v=[A-Za-z0-9]+/?v=$STAMP/g" index.html
git add js/data.js index.html
git commit -m "Refresh keeper values $(date +%Y-%m-%d)" || echo "values unchanged — nothing to publish"
git push
