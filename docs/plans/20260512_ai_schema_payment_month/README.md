# AI 스키마 결산월 및 예상지급년월 마이그레이션

## Purpose

AI가 추출하는 배당 공시 데이터의 지급 시점 표현을 `expected_payment_date`(정확한 날짜)에서 `expected_payment_year` + `expected_payment_month`로 전환하고, 결산 월(`fiscal_month`)을 추가한다. 공시에 지급일이 명시되지 않으면 결산 연도/월과 중간/기말 구분을 기반으로 예상 지급 년월을 자동 추론한다. 이 변경을 사용자 화면과 Admin 리뷰 파이프라인 전반에 반영한다.

## Source Specifications

- `docs/dividend_app_mvp_backend_spec.md`
- `docs/dividend_app_wireframe.md`
- `docs/plans/260508_pdf_ai_dividend_collection_mvp/`

Coverage summary:

- [Plan Spec Coverage](./spec_coverage.md)

## Fixed Stack

| Area | Decision |
|---|---|
| Frontend | Next.js App Router |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase PostgreSQL |
| API | Supabase Client, PostgREST, RPC |
| Custom backend | Supabase Edge Functions |
| AI Parser | OpenAI GPT-4o (pdf-ai-parser.ts) |

## Scope

Must include:

- AI 출력 스키마에서 `expected_payment_date` 제거 및 `expected_payment_year`, `expected_payment_month`, `fiscal_month` 추가
- `dividend_reviews` 테이블: `extracted_payment_date` 제거, `extracted_payment_year`, `extracted_fiscal_month` 추가
- `dividend_events` 테이블: `expected_payment_date` 제거, `expected_payment_year`, `fiscal_month` 추가, `payment_year` 제거
- 공시에 지급일이 없을 때 `fiscal_year`, `fiscal_month`, `event_type`으로 `expected_payment_year/month`를 예측하는 로직
- `parse_disclosure`, `approve_dividend_review`, `reject_dividend_review` RPC 및 Edge Function 수정
- Admin `/admin/dividend-reviews` AI抽出값에 `status` 표시 및 지급 년월/결산월 필드 반영
- 사용자 화면의 홈, 캘린더, 포트폴리오, 종목 상세 등 `expected_payment_date`를 참조하는 모든 RPC와 UI 마이그레이션
- Supabase 타입 재생성 및 테스트 수정

Excluded from this plan:

- 배당 지급일 예측 규칙의 외부 데이터 소스 연동(예: 과거 배당 이력 기반 머신러닝)
- `dividend_events`에 `payment_year`와 `expected_payment_year`를 동시에 유지하는 하위 호환 레이어
- 새로운 배당 종류(분기배당 등)에 대한 예측 규칙 추가
- E2E 테스트 환경 재구축

## Phase Order

1. [Phase 01: Database Schema Migration](./phase_01_database_schema_migration/plan.md)
2. [Phase 02: AI Parser Schema and Prompt](./phase_02_ai_parser_schema_and_prompt/plan.md)
3. [Phase 03: Approval Pipeline and Server Logic](./phase_03_approval_pipeline_and_server_logic/plan.md)
4. [Phase 04: Admin UI Update](./phase_04_admin_ui_update/plan.md)
5. [Phase 05: User-Facing RPC Migration](./phase_05_user_facing_rpc_migration/plan.md)
6. [Phase 06: User-Facing UI Migration](./phase_06_user_facing_ui_migration/plan.md)
7. [Phase 07: Types and Tests](./phase_07_types_and_tests/plan.md)

## Development Rules

- Implement phases in order unless a blocker requires a narrow prerequisite task.
- Keep all user-owned data behind Supabase RLS.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- `expected_payment_date`와 `payment_year` 컬럼은 Phase 01에서 제거되므로, 이후 phase에서는 절대 참조하지 않는다.
- 예측 로직은 `pdf-ai-parser.ts` 낸 Edge Function 레벨에서 수행하고, DB에는 결과값만 저장한다.
- `fiscal_month`는 1~12의 정수이며, 공시에 명시되지 않으면 AI가 원문 맥락에서 추론하되 확실하지 않으면 `null`로 둔다.

## Common Domain Terms

| Term | Meaning |
|---|---|
| fiscal_month | 회사의 결산 월(1~12). 예: 3월 결산 기업 → 3 |
| expected_payment_year | AI 추출 또는 추론된 예상 배당 지급 연도 |
| expected_payment_month | AI 추출 또는 추론된 예상 배당 지급 월(1~12) |
| payment_year | (Deprecated) 기존에 dividend_events에 있던 사용자 화면 집계 키. 본 계획에서 expected_payment_year로 대첵 |

## Plan Completion Definition

The plan is complete when:

- `expected_payment_date` 컬럼이 `dividend_reviews`와 `dividend_events`에서 완전히 제거되고, `expected_payment_year`, `expected_payment_month`, `fiscal_month`가 추가된다.
- AI 파서가 새 스키마에 맞춰 JSON을 출력하고, 지급일이 없는 공시에 대해 결산 정보 기반으로 예상 지급 년월을 추론한다.
- Admin 리뷰 상세 화면에서 AI抽出값에 status가 표시되고, 지급 년월/결산월이 정확히 반영된다.
- 사용자 화면의 홈, 캘린더, 포트폴리오, 종목 상세가 `expected_payment_year/month` 기반으로 정상 동작한다.
- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test`가 모두 통과한다.

## Document Maintenance

- If the implementation diverges from these files, update the affected phase document before continuing.
- Keep each phase document below 500 lines.
- Add follow-up work to a later plan rather than expanding current plan scope.
