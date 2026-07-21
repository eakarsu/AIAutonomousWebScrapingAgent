#!/usr/bin/env bash
set -euo pipefail
r="$(cd "$(dirname "$0")/.."&&pwd)";[[ -f "$r/.env" ]]||cp "$r/.env.example" "$r/.env";(cd "$r/backend"&&npm ci);(cd "$r/frontend"&&npm ci)
