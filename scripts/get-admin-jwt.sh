#!/usr/bin/env bash
# get-admin-jwt.sh
# 관리자 JWT 토큰 발급 (대화형 입력)
#
# 사용법:
#   ./scripts/get-admin-jwt.sh
#
# 예시:
#   ./scripts/get-admin-jwt.sh
#   → 이메일: admin@example.com
#   → 비밀번호: (입력 시 화면에 표시되지 않음)
#
# 출력된 JWT를 .env.local의 SUPABASE_ADMIN_JWT=...에 추가하세요.

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

# 대화형 입력
read -rp "이메일: " EMAIL
echo ""
read -rsp "비밀번호: " PASSWORD
echo ""

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "ERROR: 이메일과 비밀번호를 모두 입력해야 합니다." >&2
  exit 1
fi

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"

if [[ -z "$SUPABASE_URL" || -z "$ANON_KEY" ]]; then
  echo "ERROR: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not set" >&2
  exit 1
fi

RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")

JWT=$(echo "$RESPONSE" | jq -r '.access_token // empty')
REFRESH=$(echo "$RESPONSE" | jq -r '.refresh_token // empty')

if [[ -z "$JWT" || "$JWT" == "null" ]]; then
  echo "ERROR: Login failed" >&2
  echo "$RESPONSE" | jq . >&2
  exit 1
fi

echo ""
echo "✅ Login successful"
echo ""
echo "Add the following line to your .env.local:"
echo ""
echo "SUPABASE_ADMIN_JWT=${JWT}"
echo ""
echo "Or use it directly with --jwt flag:"
echo "  ./scripts/invoke-function.sh <function> '{}' --jwt ${JWT:0:40}..."
