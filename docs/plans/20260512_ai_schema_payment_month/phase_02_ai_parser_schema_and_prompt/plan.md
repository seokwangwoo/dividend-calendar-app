# Phase 02: AI Parser Schema and Prompt

## Goal

AI 추출 출력 스키마에서 `expected_payment_date`를 제거하고, `expected_payment_year`, `expected_payment_month`, `fiscal_month`를 추가한다. 공시에 지급일이 명시되지 않으면 `fiscal_year`, `fiscal_month`, `event_type`을 기반으로 예상 지급 년월을 추론하는 로직을 구현한다.

## Prerequisites

- Phase 01 Database Schema Migration Completion Criteria are met.
- `parse_disclosure` RPC가 기존에 동작하는 상태 (마이그레이션 완료 후 컬럼 불일치로 일시적으로 깨질 수 있음)

## Implementation Scope

- `supabase/functions/_shared/pdf-ai-parser.ts` 타입 및 스키마 수정
- AI 프롬프트(`buildDividendExtractionPrompt`) 날짜 추출 규칙 변경
- 공시 내 지급일 부재 시 예측 로직 추가
- `DividendReviewInsert` 타입 수정
- `parse_disclosure` RPC/Edge Function 수정

## Core Tasks

1. **AI 출력 타입 수정 (`pdf-ai-parser.ts`)**
   - `AiDividendEvent`에서 `expected_payment_date` 제거
   - `AiDividendEvent`에 `expected_payment_year: number | null` 추가
   - `AiDividendEvent`에 `fiscal_month: number | null` 추가
   - `expected_payment_month`는 기존 유지
   - `DividendReviewInsert`에서 `extracted_payment_date` 제거, `extracted_payment_year`, `extracted_fiscal_month` 추가

2. **AI 프롬프트 수정**
   - JSON 스키마 예시에서 `expected_payment_date` 제거, `expected_payment_year`, `fiscal_month` 추가
   - "支払開始予定日", "効力発生日", "支払開始日" → `expected_payment_year`와 `expected_payment_month`로 매핑하도록 판단 기준 변경
   - 정확한 날짜가 없고 "6月下旬", "12月予定"처럼 월만 있으면 `expected_payment_month`에 월 숫자를 넣고 `payment_date_text`에 원문을 넣도록 유지
   - 연도가 애매하면 `fiscal_year`, `published_at`, 원문 문맥을 보고 판단하되, 확실하지 않으면 `expected_payment_year = null`로 두고 warnings에 이유를 쓰도록 유지

3. **지급일 예측 로직 구현**
   - `deriveExpectedPaymentYearMonth(event: AiDividendEvent): { year: number | null; month: number | null }` 함수 추가
   - 입력: `fiscal_year`, `fiscal_month`, `event_type`
   - 규칙 (일본 기업 일반적 패턴):
     - `event_type = 'year_end'`:
       - `fiscal_month = 3` → `expected_payment_month = 6`, `expected_payment_year = fiscal_year`
       - `fiscal_month = 9` → `expected_payment_month = 12`, `expected_payment_year = fiscal_year`
       - `fiscal_month = 12` → `expected_payment_month = 3`, `expected_payment_year = fiscal_year + 1`
       - 그 외 → `fiscal_month + 3` (연도 넘어가면 +1)
     - `event_type = 'interim'`:
       - `fiscal_month = 3` → `expected_payment_month = 12`, `expected_payment_year = fiscal_year - 1`
       - `fiscal_month = 9` → `expected_payment_month = 6`, `expected_payment_year = fiscal_year`
       - `fiscal_month = 12` → `expected_payment_month = 9`, `expected_payment_year = fiscal_year`
       - 그 외 → `fiscal_month - 3` (연도 넘어가면 -1)
     - `event_type`이 `special`, `commemorative`, `other`, `annual_total` 등 → 예측하지 않고 `null` 유지
   - 이 예측은 **AI 추출 결과 후처리**로 수행. 즉, AI가 `expected_payment_year/month`를 추출하지 못했을 때(`null`)만 적용.
   - `fiscal_month`가 `null`이면 예측 불가.

4. **정규화 및 삽입 로직 수정**
   - `normalizeAiEvent`에서 `expected_payment_date` 정규화 제거, `expected_payment_year`, `fiscal_month` 정규화 추가
   - `buildDividendReviewInsert`에서 `extracted_payment_date` 제거, `extracted_payment_year`, `extracted_fiscal_month` 매핑
   - `extracted_payment_year`가 AI 출력에 없으면 예측 로직 결과를 사용

5. **parse_disclosure RPC/Edge Function 수정**
   - `supabase/functions/parse-disclosure/index.ts`는 RPC를 호출하는 thin wrapper이므로, 실제 로직은 SQL `parse_disclosure` 함수 또는 Edge Function `process-jobs`의 `parse_disclosure_pdf_ai` 핸들러에 있음
   - `process-jobs`의 `parse_disclosure_pdf_ai` 핸들러가 `pdf-ai-parser.ts`를 호출하므로, 핸들러 자체는 큰 수정 없이 정상 동작해야 함
   - SQL `parse_disclosure` 함수(마이그레이션에 정의)도 `dividend_reviews` 삽입 시 새 컬럼을 반영하도록 수정

## Test Plan

- `npm run lint` (pdf-ai-parser.ts)
- `npm run typecheck` (아직 타입 미생성 상태이므로, parser 낸 함수 시그니처만 수동 확인)
- 수동 검증: 로컬 또는 스테이징 환경에서 `parse_disclosure` Edge Function을 호출하여, `expected_payment_date`가 없고 `expected_payment_year/month`, `fiscal_month`가 포함된 JSON이 반환되는지 확인
- 예측 로직 단위 테스트: `deriveExpectedPaymentYearMonth`에 대한 간단한 테스트 케이스 작성 (Phase 07에서 확장)

## Completion Criteria

- `pdf-ai-parser.ts`의 `AiDividendEvent`에 `expected_payment_date`가 없고, `expected_payment_year`, `fiscal_month`가 있다.
- AI 프롬프트에 새 스키마와 날짜 추출 규칙이 반영되어 있다.
- 지급일이 없는 공시에 대해 `fiscal_month`와 `event_type` 기반으로 `expected_payment_year/month`가 추론된다.
- `parse_disclosure` 호출 후 `dividend_reviews` 행에 `extracted_payment_year`, `extracted_fiscal_month`가 채워진다.

## Excluded From This Phase

- Admin UI 수정
- 사용자 facing RPC/UI 수정
- 승인 파이프라인 로직 수정
- Supabase 타입 재생성
