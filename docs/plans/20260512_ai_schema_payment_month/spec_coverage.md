# Spec Coverage

## Covered by This Plan

| Source Spec | Coverage |
|---|---|
| `docs/dividend_app_mvp_backend_spec.md` | `dividend_events` 스키마 변경 (`expected_payment_date` → `expected_payment_year/month`), `payment_year` 제거, 승인 파이프라인 수정 |
| `docs/dividend_app_wireframe.md` | 사용자 화면 날짜 표시 변경 (정확한 날짜 → 년/월), Admin AI抽出값 레이아웃 변경 |
| `docs/plans/260508_pdf_ai_dividend_collection_mvp/` | AI 출력 스키마 변경, `parse_disclosure` 로직 변경, 예측 로직 추가 |

## Key Decisions

- `expected_payment_date`와 `payment_year`는 완전히 제거되며, 하위 호환 레이어는 제공하지 않는다.
- 지급일 예측은 `fiscal_month`, `fiscal_year`, `event_type`을 기반으로 한 규칙 기반 로직으로, Edge Function(`pdf-ai-parser.ts`)에서 수행한다.
- `fiscal_month`는 1~12의 정수이며, AI가 추출하지 못하면 `null`로 둔다.
- Admin UI의 AI抽出값에 `status` 필드를 추가하여 공시 상태를 한눈에 파악할 수 있게 한다.
- 사용자 facing 쿼리는 `expected_payment_year`와 `expected_payment_month`를 기반으로 집계 및 필터링한다.
