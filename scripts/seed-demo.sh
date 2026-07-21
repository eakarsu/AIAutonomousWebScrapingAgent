#!/usr/bin/env bash
set -euo pipefail
[[ "${CONFIRM_DEMO_SEED:-}" == yes && "${NODE_ENV:-development}" != production ]]||{ echo 'Guarded non-production demo seed only.'>&2;exit 2;};cd "$(dirname "$0")/../backend"&&node seeds/seed.js
