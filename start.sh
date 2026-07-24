#!/usr/bin/env bash
set -euo pipefail
r="$(cd "$(dirname "$0")"&&pwd)";cd "$r";[[ -f .env ]]||{ echo 'Copy .env.example to .env.'>&2;exit 1;};[[ -d backend/node_modules && -d frontend/node_modules ]]||{ echo 'Run scripts/bootstrap.sh.'>&2;exit 1;};set -a;source .env;set +a
: "${OPENROUTER_API_KEY:?OPENROUTER_API_KEY is required}" "${OPENROUTER_MODEL:?OPENROUTER_MODEL is required}"
[[ "${OPENROUTER_BASE_URL:-${OPENAI_BASE_URL:-}}" == "https://openrouter.ai/api/v1" ]]||{ echo 'OPENROUTER_BASE_URL must be https://openrouter.ai/api/v1.'>&2;exit 1;}
for port in "$PORT" "$FRONTEND_PORT";do lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1&&{ echo "Port $port is occupied." >&2;exit 1;}||true;done
if [ "${MIGRATE_ON_START:-false}" = true ];then case "${ALLOW_SCHEMA_MIGRATION:-}" in 1|true);;*)echo 'Explicit schema migration acknowledgement is required.'>&2;exit 1;;esac;bash ./scripts/migrate.sh;node backend/scripts/create-admin.js;fi
(cd backend&&npm start)&b=$!;(cd frontend&&BROWSER=none PORT="${FRONTEND_PORT:-3000}" npm start)&f=$!;cleanup(){ kill "$b" "$f" 2>/dev/null||true;};trap cleanup EXIT INT TERM;wait "$b" "$f"
