# 수동 E2E 동작확인 가이드 (Phase 06 완료 기준)

> **목표**: Yanoshin API → 공시 수집 → PDF 다운로드 → AI 파싱 → Admin 승인 → `dividend_events` 생성까지 수동으로 한 바퀴 돌려보기

---

## 0. 사전 준비

### 0-1. 환경 변수 로드
프로젝트 루트에서 `.env.local` 을 로드합니다.

```bash
cd /home/seo/OneDrive/linux/projects/dividend-calendar-app
source .env.local
```

### 0-2. 관리자 계정 확인
브라우저에서 `http://localhost:3000/auth/login` 으로 접속해 **admin 권한** 계정으로 로그인합니다.  
`profiles.role = 'admin'` 이어야 `/admin` 페이지에 접근할 수 있습니다.

### 0-3. stocks 테이블 확인 (중요)
수집한 공시의 티커가 `stocks` 테이블에 등록되어 있어야 `stock_id` 가 연결됩니다.  
Supabase Studio SQL Editor 에서 확인:

```sql
SELECT ticker, name FROM stocks LIMIT 20;
```

없다면 미리 등록하거나, Yanoshin API에서 수집된 공시는 `stock_id = null` 로 저장됩니다.

---

## 1. 공시 수집 (collect-disclosures)

`collect-disclosures` Edge Function 을 `SUPABASE_SERVICE_ROLE_KEY` 로 호출합니다.

### 방법 A — `recent` 모드 (최근 공시)
```bash
curl -s -X POST "${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/collect-disclosures" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"mode":"recent","limit":10}' | jq .
```

### 방법 B — 특정 날짜
```bash
curl -s -X POST "${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/collect-disclosures" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-05-09","limit":10}' | jq .
```

### 방법 C — 특정 티커만
```bash
curl -s -X POST "${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/collect-disclosures" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"condition":"7203","limit":5}' | jq .
```

### 응답 확인 포인트
| 필드 | 의미 |
|---|---|
| `results[].inserted` | `true` 면 신규 저장, `false` 면 이미 존재하는 `external_id` |
| `results[].jobCreated` | `true` 면 `download_disclosure_pdf` Job 생성됨 |
| `results[].skipped` | 키워드 필터링(`配当`, `決算短信` 등)으로 제외됨 |

---

## 2. PDF 다운로드 (process-jobs 1차)

수집 성공 시 `jobs` 테이블에 `type = 'download_disclosure_pdf'` 가 생성됩니다.

```bash
curl -s -X POST "${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-jobs" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"batch_size":5}' | jq .
```

### 확인 포인트
- `completed` 카운트가 1 이상 증가
- `disclosures.parse_status` → `downloaded`
- `disclosures.storage_path` 에 `disclosures/{ticker}/{date}/{external_id}.pdf` 형식의 경로 설정
- PDF 저장 성공 시 **자동으로** `parse_disclosure_pdf_ai` Job 생성

Supabase Studio 에서 확인:

```sql
SELECT id, external_id, ticker, title, parse_status, storage_path, last_parse_error
FROM disclosures
ORDER BY created_at DESC
LIMIT 5;
```

---

## 3. AI 파싱 (process-jobs 2차)

PDF 다운로드 완료 후 `jobs` 테이블에 `type = 'parse_disclosure_pdf_ai'` 가 생깁니다.

```bash
curl -s -X POST "${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-jobs" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"batch_size":5}' | jq .
```

### 확인 포인트
- `completed` 카운트 증가
- `disclosures.parse_status` → `parsed`
- `dividend_reviews` 테이블에 AI 추출 결과 생성

Supabase Studio 에서 확인:

```sql
SELECT
  dr.id,
  dr.status,
  dr.event_type,
  dr.change_type,
  dr.extracted_dividend_per_share,
  dr.confidence_score,
  dr.warning_message,
  s.ticker,
  d.title
FROM dividend_reviews dr
LEFT JOIN stocks s ON s.id = dr.stock_id
LEFT JOIN disclosures d ON d.id = dr.disclosure_id
ORDER BY dr.created_at DESC
LIMIT 10;
```

### 문제 발생 시 체크리스트
| 증상 | 확인 위치 |
|---|---|
| 파싱 실패 | `jobs.last_error`, `disclosures.last_parse_error` |
| OpenAI 오류 | Supabase Dashboard → Edge Functions Logs |
| 환경 변수 누락 | `OPENAI_API_KEY`, `OPENAI_MODEL`(기본 gpt-4o) 설정 여부 |

---

## 4. Admin 페이지에서 확인 및 승인

### 4-1. 개발 서버 실행
```bash
npm run dev
```

### 4-2. 리뷰 목록 접속
브라우저에서 로그인 후 아래 URL로 이동:

```
http://localhost:3000/admin/dividend-reviews
```

- 기본 필터: `pending` + `needs_manual_check`
- 정렬: `urgent` → `high` → `normal` → `low`

### 4-3. 상세 확인
- `詳細・操作` 클릭 → `/admin/dividend-reviews/{review_id}`
- `署名付きURLを生成（5分間有効）` → 원본 PDF 열기
- AI 추출값 확인:
  - 1株配当（抽出） / 前回配当
  - 権利確定日 / 権利落ち日
  - 支払予定日 / 支払予定月
  - エビデンステキスト / WARNING

### 4-4. 승인 (承認する)
- 필요시 입력 필드를 **override** (수정)
- `支払日` 이 없고 `支払月` 만 있는 경우 → **`支払年` 필수 입력**
- `承認する` 버튼 클릭

### 4-5. 승인 결과 확인
- `dividend_reviews.status` → `approved`
- `dividend_reviews.created_dividend_event_id` 에 이벤트 ID 생성
- `dividend_events` 테이블에 승인된 행 추가
- 사용자 화면(`/app/home`, `/app/calendar`)에 반영됨

### 4-6. 却下 (必要時)
- 却下理由 입력 → `却下する`
- `status` → `rejected` (사용자 화면에 표시되지 않음)

---

## 전체 데이터 흐름

```
Yanoshin TDnet API
        ↓
  collect-disclosures
        ↓
  disclosures (parse_status: pending)
        ↓
  jobs (type: download_disclosure_pdf)
        ↓
  process-jobs — 다운로드 핸들러
        ↓
  Supabase Storage (disclosures bucket)
        ↓
  jobs (type: parse_disclosure_pdf_ai)  ← 자동 생성
        ↓
  process-jobs — 파싱 핸들러
        ↓
  OpenAI Responses API
        ↓
  dividend_reviews (status: pending / needs_manual_check)
        ↓
  /admin/dividend-reviews
        ↓
  承認 → approve-dividend-review Edge Function
        ↓
  dividend_events (사용자 표시 대상)
```

---

## 트러블슈팅

### collect-disclosures 401/403
- `.env.local` 의 `SUPABASE_SERVICE_ROLE_KEY` 가 유효한지 확인
- Edge Function 배포 상태 확인: `npx supabase functions list`

### PDF 다운로드 실패 (download_disclosure_pdf)
- `document_url` 이 TDnet 에서 아직 접근 가능한지 확인
- `jobs` 의 `attempts` → 최대 3회 재시도 후 `failed`
- 수동 재시도: `jobs.status = 'pending'`, `attempts = 0` 로 업데이트 후 `process-jobs` 재실행

### AI 파싱 결과가 이상함
- `dividend_reviews.raw_payload` → OpenAI 원본 응답 확인
- `text_extraction_method` 가 `extracted_text` 인지 `direct_pdf_fallback` 인지 확인
- PDF 가 이미지 기반(스캔본)이면 텍스트 추출 실패 → 품질 저하

### admin 페이지 접근 불가
- 로그인 세션 유무 확인
- SQL 로 권한 확인:
  ```sql
  SELECT id, role, status FROM profiles WHERE id = '<your-user-id>';
  ```
- `role = 'admin'` 이 아니면 `/app/home` 으로 리다이렉트됨

---

## 한 줄로 전체 실행 (테스트용)

```bash
# 1) 환경 변수 로드
source .env.local

# 2) 최근 공시 5개 수집
curl -s -X POST "${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/collect-disclosures" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"mode":"recent","limit":5}' | jq '.results[] | {inserted, jobCreated, externalId}'

# 3) PDF 다운로드 + AI 파싱 (2회 실행)
for i in 1 2; do
  echo "=== process-jobs run $i ==="
  curl -s -X POST "${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-jobs" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"batch_size":5}' | jq '{claimed, completed, retried, failed}'
done

# 4) 생성된 dividend_reviews 확인
echo "=== Latest dividend_reviews ==="
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/dividend_reviews?select=id,status,event_type,change_type,extracted_dividend_per_share,confidence_score,disclosures(title)&order=created_at.desc&limit=5" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | jq .
```

> **주의**: 실제 OpenAI API 호출이 발생하므로 비용이 청구될 수 있습니다. 테스트 시 `limit` 을 작게(1~3) 유지하세요.
