#!/usr/bin/env bash
# run-evaluate-notifications.sh
# 알림 규칙 평가 및 발송
#
# 사용법:
#   ./scripts/run-evaluate-notifications.sh [--dry-run]
#
# 예시:
#   ./scripts/run-evaluate-notifications.sh --dry-run
#   ./scripts/run-evaluate-notifications.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DRY_RUN="false"
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="true"
fi

PAYLOAD=$(jq -n --argjson dr "$DRY_RUN" '{dryRun: $dr}')

echo "Evaluating notification rules (dryRun=${DRY_RUN})"
"${SCRIPT_DIR}/invoke-function.sh" evaluate-notification-rules "$PAYLOAD"
