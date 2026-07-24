#!/usr/bin/env bash
set -euo pipefail
r="$(cd "$(dirname "${BASH_SOURCE[0]}")/.."&&pwd)";set -a;source "$r/.env";set +a;case "${CONFIRM_DEMO_SEED:-}" in yes|YES);;*)echo 'Guarded non-production demo seed only.'>&2;exit 2;;esac;[[ "${NODE_ENV:-development}" != production ]]||{ echo 'Guarded non-production demo seed only.'>&2;exit 2;};cd "$r/backend"&&node seeds/seed.js
