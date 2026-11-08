#!/bin/sh
#
# Behavioural checks for the overview include, run by the workflow's `check`
# job. The actual assertions live in integration-check.js; this wrapper only
# anchors the working directory and reports the node version in the log.
#
set -eu

cd "$(dirname "$0")/.."

echo "node $(node --version)"
node scripts/integration-check.js
