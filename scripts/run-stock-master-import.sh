#!/usr/bin/env bash
# run-stock-master-import.sh
# JPX 주식 마스터 CSV 임포트 실행
#
# 사용법:
#   ./scripts/run-stock-master-import.sh <storage-file-path> [--dry-run]
#
# .env.local에 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.
#
# 예시:
#   ./scripts/run-stock-master-import.sh imports/stock-master/202506_list_of_tse_listed_issues.csv --dry-run
#   ./scripts/run-stock-master-import.sh imports/stock-master/202506_list_of_tse_listed_issues.csv

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env.local not found" >&2
  exit 1
fi

while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  export "$key=${value//\"/}"
done < "$ENV_FILE"

FILE_PATH="${1:-}"
DRY_RUN="false"

if [[ "$FILE_PATH" == "--dry-run" ]]; then
  echo "Usage: $0 <storage-file-path> [--dry-run]" >&2
  exit 1
fi

if [[ -z "$FILE_PATH" ]]; then
  echo "Usage: $0 <storage-file-path> [--dry-run]" >&2
  echo "Example: $0 imports/stock-master/202506_list_of_tse_listed_issues.csv" >&2
  exit 1
fi

if [[ "${2:-}" == "--dry-run" ]]; then
  DRY_RUN="true"
fi

PAYLOAD=$(jq -n --arg fp "$FILE_PATH" --argjson dr "$DRY_RUN" '{filePath: $fp, dryRun: $dr}')

"${SCRIPT_DIR}/invoke-function.sh" parse-stock-master-csv "$PAYLOAD"
