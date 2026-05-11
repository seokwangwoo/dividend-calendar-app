#!/usr/bin/env bash
# run-process-pending-emails.sh
# 대기 중인 이메일 알림 발송
#
# 사용법:
#   ./scripts/run-process-pending-emails.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Processing pending email notifications"
"${SCRIPT_DIR}/invoke-function.sh" process-pending-emails '{}'
