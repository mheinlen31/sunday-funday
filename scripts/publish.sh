#!/bin/bash
# Refresh ESPN keeper values, then commit + push so GitHub Pages updates.
set -e
cd "$(dirname "$0")/.."
python3 scripts/refresh_data.py
git add js/data.js
git commit -m "Refresh keeper values $(date +%Y-%m-%d)" || echo "values unchanged — nothing to publish"
git push
