#!/usr/bin/env bash
# Run both studionet suites sequentially, logging each to /tmp.
# Each suite deploys its own fresh instance (gltest module fixture).
# Usage: bash scripts/run_studionet_suites.sh
set -uo pipefail
cd "$(dirname "$0")/.."

set -a
source "D:/Genlayer-project/wallet/.env"
set +a

echo "=== 1/2 adversarial ==="
gltest tests/integration/test_adversarial.py -v -s --network studionet 2>&1 | tee /tmp/gg_adversarial.log
echo "ADVERSARIAL_EXIT=${PIPESTATUS[0]}"

echo "=== 2/2 all methods ==="
gltest tests/integration/test_all_methods.py -v -s --network studionet 2>&1 | tee /tmp/gg_all_methods.log
echo "ALL_METHODS_EXIT=${PIPESTATUS[0]}"

echo "SUITES_DONE"
