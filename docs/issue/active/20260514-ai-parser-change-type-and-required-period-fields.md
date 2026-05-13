---
status: open
type: feature
created: 2026-05-14
resolved:
priority: high
labels: [pdf-ai, parser, dividend-data, approval-pipeline]
---

# AI 파서 change_type 판단 제거 및 필수 기간 필드 강화

## 개요 (Overview)

현재 PDF AI 파서는 `change_type`, 결산 연도/월, 예상 지급 연도/월을 AI 출력 스키마에 포함하고, 일부 값이 없을 때 `null`을 허용합니다. 이 때문에 증배/감배/무배 같은 변경 분류가 공시 문맥 또는 AI의 `previous_dividend_per_share` 해석에 의존할 수 있고, 결산 정보 및 지급 예정 년월이 누락된 후보가 관리자 검수 단계까지 들어올 수 있습니다. AI는 배당금, 기간, 상태, 근거 텍스트를 추출하는 데 집중하고, `change_type`은 승인된 `dividend_events`의 직전연도 동기 이벤트와 비교해 서버 로직에서 결정해야 합니다.

## 재현 방법 (Reproduction Steps)

1. [`supabase/functions/_shared/pdf-ai-parser.ts`](/home/seo/projects/dividend-calendar-app/supabase/functions/_shared/pdf-ai-parser.ts:153)을 확인합니다.
2. `AiDividendEvent`가 `change_type`, `fiscal_year`, `fiscal_month`, `expected_payment_year`, `expected_payment_month`를 모두 AI 이벤트 필드로 선언하지만 기간/지급 필드는 `number | null`로 허용하는 것을 확인합니다.
3. [`buildDividendExtractionPrompt`](/home/seo/projects/dividend-calendar-app/supabase/functions/_shared/pdf-ai-parser.ts:415)의 JSON 스키마 예시와 판단 기준을 확인합니다.
4. 프롬프트가 `change_type` enum 전체를 AI에게 출력하게 하고, “새 금액 > 이전 금액”, “특별배당 발생”, “날짜나 지급월만 변경” 같은 변경 분류 판단을 직접 지시하는 것을 확인합니다.
5. [`buildReviewRows`](/home/seo/projects/dividend-calendar-app/supabase/functions/_shared/pdf-ai-parser.ts:1777)를 확인합니다.
6. AI가 `expected_payment_year/month`를 둘 다 제공하지 않고 `fiscal_month`가 있을 때만 지급 년월을 추론하며, 그 외에는 `null`이 review row로 저장될 수 있는 것을 확인합니다.
7. [`approve_dividend_review_for_reviewer`](/home/seo/projects/dividend-calendar-app/supabase/migrations/20260513030000_ai_schema_payment_month_phase_03.sql:189)를 확인합니다.
8. 승인 로직은 `v_review.change_type`이 있으면 그대로 사용하고, 없을 때만 기존 `dividend_events`에서 최신 승인 이벤트를 찾아 fallback 계산합니다.

## 예상 vs 실제 (Expected vs Actual)

### Current Values

| Context | Value |
|---------|-------|
| AI 출력 필드 | `change_type`이 `"increase"`, `"decrease"`, `"unchanged"`, `"no_dividend"`, `"resumed"`, `"special"`, `"commemorative"`, `"forecast_revision"`, `"data_update"`, `"none"`, `"unknown"` 중 하나로 AI에게 요구됨 |
| AI 프롬프트 | `change_type 판단` 섹션에서 AI에게 금액 비교, 무배, 복배, 특별/기념배당, 날짜 변경을 판단하도록 지시 |
| 기간 필드 | `fiscal_year`, `fiscal_month`, `expected_payment_year`, `expected_payment_month`가 AI 이벤트 타입과 프롬프트에서 `null` 허용 |
| 지급 년월 후처리 | `expected_payment_year`와 `expected_payment_month`가 모두 없고 `fiscal_month`가 있을 때만 추론 |
| 승인 시 change_type | review row에 `change_type`이 있으면 AI 값을 그대로 사용 |

### Root Data Comparison

| Table / Column | Current Behavior | Expected Behavior | Notes |
|----------------|------------------|-------------------|-------|
| `dividend_reviews.change_type` | AI가 출력한 변경 분류가 저장될 수 있음 | AI 출력에서 제거하거나 항상 서버 산출값만 저장 | 검수 후보에는 산출 근거를 `raw_payload`/warnings로 남길 수 있음 |
| `dividend_events.change_type` | 승인 시 `v_review.change_type` 우선 | 해당 티커의 직전연도 같은 배당 구분(`interim`, `year_end`)과 비교해 `increase`, `decrease`, `no_dividend`, `none`만 결정 | 직전연도 동기 이벤트가 없으면 `none` |
| `dividend_reviews.fiscal_year` / `extracted_fiscal_month` | 누락 가능 | 결산 연도와 결산 월은 필수 | AI 추출 실패 시 review 생성 실패 또는 needs_manual_check 정책 필요 |
| `dividend_reviews.extracted_payment_year` / `extracted_payment_month` | 누락 가능 | 필수 | 정확한 지급일이 없으면 결산 연도/월 기준 추론 |
| `dividend_events.expected_payment_year` / `expected_payment_month` | 일부 제약/정책에서만 요구 | 승인 이벤트에는 항상 필요 | 사용자 캘린더 집계 키이므로 누락 방지 |

## 기술적 원인 분석 (Technical Root Cause)

- `AiDividendEvent` 타입은 `change_type`을 필수 필드로 선언하고, `fiscal_year`, `fiscal_month`, `expected_payment_year`, `expected_payment_month`는 `number | null`로 선언합니다.
- 프롬프트의 이벤트 스키마 예시는 `change_type` enum 전체를 포함하고, `fiscal_year`, `fiscal_month`, `expected_payment_year`, `expected_payment_month`를 `number | null`로 안내합니다.
- 프롬프트의 `change_type 판단` 섹션은 AI에게 증배/감배/무배/복배/특별/기념/예상수정/데이터변경/none/unknown을 직접 판단하라고 지시합니다.
- `normalizeEvent()`는 AI가 유효한 `change_type`을 주면 그대로 받아들이고, 잘못된 값이면 `"unknown"`으로 보정합니다.
- `buildReviewRows()`는 AI가 지급 예정 년월을 둘 다 누락한 경우에만 `deriveExpectedPaymentYearMonth()`를 호출합니다. 한쪽만 누락되거나 `fiscal_month`가 누락되면 지급 년월이 완성되지 않을 수 있습니다.
- 승인 RPC는 `p_override.changeType` 다음으로 `v_review.change_type`을 우선 사용합니다. 즉 AI가 저장한 `change_type`이 있으면 서버의 기존 이벤트 비교 로직이 실행되지 않습니다.
- 현재 fallback 비교도 “직전연도 같은 배당 구분”이 아니라 같은 종목/이벤트 타입의 최신 승인 이벤트를 `fiscal_year desc, updated_at desc`로 찾습니다. 요구사항은 `dividend_events`에서 해당 티커의 직전연도 배당을 중간/기말 각각 비교하는 것입니다.

## 영향 범위 (Impact)

- **User experience**: 잘못된 `change_type`이 승인되면 증배/감배/무배 알림이 잘못 생성될 수 있고, 사용자는 배당 변경을 오해할 수 있습니다.
- **Affected screens**: `/admin/dividend-reviews`, `/admin/dividend-reviews/[eventId]`, 사용자 홈/캘린더/종목 상세의 승인 배당 표시, 알림 목록.
- **Tests**: `pdf-ai-parser.test.ts`, `parser-fixtures.test.ts`, `admin-review-pipeline.test.ts`, `notification-approval.spec.ts` 계열 테스트의 기대값 수정이 필요합니다.
- **Data integrity**: 승인된 `dividend_events.change_type`, `expected_payment_year`, `expected_payment_month`, `fiscal_month`가 사용자 집계와 알림 생성의 기준이므로 누락/오분류가 장기 데이터 품질에 영향을 줍니다.

## 제안하는 해결 방향 (Proposed Solutions)

### 1. 서버 산출 전용 change_type으로 전환 (권장)

**Description**: AI 출력 스키마와 프롬프트에서 `change_type` 및 `previous_dividend_per_share` 기반 변경 판단 지시를 제거합니다. `buildReviewRows()` 또는 승인 RPC에서 해당 종목의 `fiscal_year - 1` 및 같은 `event_type`(`interim`, `year_end`) 승인 이벤트를 조회해 현재 배당금과 비교합니다. 직전연도 동기 이벤트가 없으면 `none`, 현재 배당금이 0이면 `no_dividend`, 현재 > 전년이면 `increase`, 현재 < 전년이면 `decrease`, 동일하면 `none`으로 저장합니다.

**Pros**: AI 판단 변동성을 제거하고, 변경 알림 기준이 DB의 승인 데이터로 일관됩니다. 요구사항과 가장 직접적으로 맞습니다.

**Cons / Risks**: 기존 `resumed`, `special`, `commemorative`, `unchanged`, `forecast_revision`, `data_update`, `unknown`에 의존하는 알림/UI/테스트 기대값 정리가 필요합니다. 특별/기념 배당은 `change_type`이 아니라 `dividend_type` 또는 `raw_payload.components`로 표현해야 합니다.

**Recommended?**: 예.

### 2. review 생성 시 서버 산출, 승인 시 재계산 검증

**Description**: `buildReviewRows()`에서 AI 결과를 review row로 만들 때 서버가 `change_type`을 산출해 저장하고, 승인 RPC에서도 동일 알고리즘으로 재계산해 review 값과 다르면 승인 시 산출값으로 덮어씁니다.

**Pros**: 관리자 목록에서 변경 분류를 미리 볼 수 있고, 승인 시점 데이터 변경에도 대응할 수 있습니다.

**Cons / Risks**: Edge Function에서 기존 `dividend_events` 조회 의존성이 생기며, review 생성과 승인 RPC에 같은 알고리즘을 중복 구현하거나 공유해야 합니다.

**Recommended?**: 서버 검수 UI에서 사전 표시가 필요하면 선택할 수 있습니다.

### 3. 승인 시점 전용 산출

**Description**: review 단계에는 `change_type`을 비워두고, 승인 RPC에서만 직전연도 동기 이벤트를 조회해 `dividend_events.change_type`을 결정합니다.

**Pros**: 구현 범위가 작고 데이터 최종 반영 시점의 승인 이벤트 기준으로 계산됩니다.

**Cons / Risks**: 관리자 검수 화면에서 승인 전 변경 분류를 표시할 수 없습니다. review row 기반 우선순위나 알림 예상 표시가 있다면 별도 보완이 필요합니다.

**Recommended?**: 빠른 안정화가 목표라면 가능하지만, 운영 가시성은 1번 또는 2번보다 낮습니다.

## 구현 수용 기준 (Acceptance Criteria)

1. AI 프롬프트와 타입에서 `change_type` 판단을 AI에게 맡기지 않습니다.
2. 결산 연도(`fiscal_year`)와 결산 월(`fiscal_month`)은 배당 이벤트 후보에서 필수입니다.
3. `expected_payment_year`와 `expected_payment_month`는 배당 이벤트 후보에서 필수입니다.
4. 정확한 지급일이 없으면 결산 연도/월 및 `event_type` 기준으로 예상 지급 연도/월을 추론합니다.
5. `change_type`은 `dividend_events`의 같은 종목, 직전연도, 같은 배당 구분을 비교해 서버에서만 결정합니다.
6. 직전연도 동기 배당 이벤트가 없으면 `change_type = 'none'`으로 처리합니다.
7. 변경 분류는 최소 `increase`, `decrease`, `no_dividend`, `none`만 생성합니다.
8. 중간배당과 기말배당은 각각 따로 전년 동기 배당과 비교합니다.
9. 관련 단위/통합 테스트가 AI 출력 `change_type` 의존을 제거하고, 전년 동기 비교 케이스를 검증합니다.

## 관련 파일 (Related Files)

- [`supabase/functions/_shared/pdf-ai-parser.ts`](/home/seo/projects/dividend-calendar-app/supabase/functions/_shared/pdf-ai-parser.ts) — AI 출력 타입, 프롬프트, validation, review row 생성
- [`supabase/migrations/20260513030000_ai_schema_payment_month_phase_03.sql`](/home/seo/projects/dividend-calendar-app/supabase/migrations/20260513030000_ai_schema_payment_month_phase_03.sql) — 승인 RPC의 `change_type` 결정 및 `dividend_events` upsert
- [`supabase/migrations/20260505005000_phase_06_admin_review_pipeline.sql`](/home/seo/projects/dividend-calendar-app/supabase/migrations/20260505005000_phase_06_admin_review_pipeline.sql) — 기존 `derive_dividend_change_type` 함수 정의
- [`src/features/disclosures/event-comparison.ts`](/home/seo/projects/dividend-calendar-app/src/features/disclosures/event-comparison.ts) — 기존 승인 이벤트 비교 유틸리티
- [`src/features/disclosures/pdf-ai-parser.test.ts`](/home/seo/projects/dividend-calendar-app/src/features/disclosures/pdf-ai-parser.test.ts) — AI 파서 단위 테스트
- [`src/features/disclosures/parser-fixtures.test.ts`](/home/seo/projects/dividend-calendar-app/src/features/disclosures/parser-fixtures.test.ts) — 공시 fixture 기반 파서 테스트
- [`tests/integration/admin/phase-05-approval-pipeline.test.ts`](/home/seo/projects/dividend-calendar-app/tests/integration/admin/phase-05-approval-pipeline.test.ts) — 승인 파이프라인 테스트
- [`tests/e2e/admin-approval-pipeline.spec.ts`](/home/seo/projects/dividend-calendar-app/tests/e2e/admin-approval-pipeline.spec.ts) — 관리자 승인 E2E 테스트

## 라벨 제안 (Suggested Labels)

- `feature`
- `pdf-ai`
- `parser`
- `dividend-data`
- `approval-pipeline`
- `high-priority`
