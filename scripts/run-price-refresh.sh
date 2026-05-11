#!/usr/bin/env bash
# run-price-refresh.sh
# 주식 가격 일괄 갱신 실행
#
# 사용법:
#   ./scripts/run-price-refresh.sh [--dry-run] [--limit N]
#
# 예시:
#   ./scripts/run-price-refresh.sh --dry-run
#   ./scripts/run-price-refresh.sh --limit 100

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DRY_RUN="false"
LIMIT="null"

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN="true"
      ;;
    --limit)
      LIMIT_ARG="true"
      ;;
    *)
      if [[ "${LIMIT_ARG:-}" == "true" ]]; then
        LIMIT="$arg"
        LIMIT_ARG="false"
      fi
      ;;
  esac
done

PAYLOAD=$(jq -n --argjson dr "$DRY_RUN" --argjson lim "$LIMIT" '{dryRun: $dr, limit: $lim}')

"${SCRIPT_DIR}/invoke-function.sh" process-price-refresh "$PAYLOAD"
