# 와이어프레임 표시값-데이터베이스 매핑 사양

## 1. 목적

이 문서는 `docs/dividend_app_wireframe.md`에 정의된 각 화면의 표시값이 어떤 데이터베이스 테이블, 컬럼, RPC, 클라이언트 계산식에서 만들어지는지 정의합니다.

범위는 일반 사용자 화면과 관리자 배당 검수 화면입니다. 사용자 화면의 배당 데이터는 원칙적으로 `dividend_events.review_status = 'approved'`만 사용합니다. `dividend_reviews`의 AI 후보 데이터는 관리자 화면에서만 노출합니다.

## 2. 공통 데이터 규칙

| 항목 | 규칙 |
|---|---|
| 사용자 범위 | Supabase Auth의 `auth.uid()`와 `profiles.id`, `holdings.user_id`, `user_settings.user_id`, `notification_rules.user_id`, `notifications.user_id`를 연결해 현재 사용자 데이터만 조회합니다. |
| 보유 종목 범위 | `holdings.deleted_at is null`인 레코드만 사용자 화면에 표시합니다. |
| 배당 이벤트 범위 | 사용자 화면 집계와 상세는 `dividend_events.review_status = 'approved'`를 사용합니다. |
| 연도 기준 | 홈/포트폴리오/캘린더/종목 상세의 "올해"는 `expected_payment_year` 기준입니다. |
| 월 기준 | MVP 캘린더와 홈의 이번 달/다음 배당은 `expected_payment_month` 기준입니다. |
| 세율 | `nisa = 0`, `tokutei = 0.20315`, `general = 0.20315`를 사용합니다. |
| 통화 | MVP는 `JPY` 고정 표시를 기본으로 하며, 종목 단위는 `stocks.currency`를 보관합니다. |
| 배당 데이터 미확보 | `stocks.expected_annual_dividend_per_share is null` 또는 승인 배당 이벤트 합계가 없으면 "配当データ確認中" 계열 문구를 표시합니다. |
| 상장 폐지 | `stocks.support_status = 'delisted'`는 검색 결과에서 제외하고, 이미 보유 중인 포트폴리오 카드에는 상장 폐지 배지를 표시합니다. |

> 주의: 설계 정책상 `annual_total`은 사용자 현금흐름 합계에 포함하지 않습니다. 현재 사용자 RPC는 주로 `review_status`, `expected_payment_year/month`, `dividend_per_share`로 집계하므로, 승인 파이프라인 또는 데이터 계약에서 payable 이벤트만 사용자 집계 대상이 되도록 보장해야 합니다.

## 3. 핵심 계산식

| 표시값 | 계산식 |
|---|---|
| 보유별 연 세전 배당 | `sum(dividend_events.dividend_per_share) * holdings.quantity` |
| 보유별 예상 세금 | `연 세전 배당 * 계좌 세율` |
| 보유별 연 세후 배당 | `연 세전 배당 * (1 - 계좌 세율)` |
| 세전 배당수익률 | `stocks.expected_annual_dividend_per_share / stocks.current_price * 100` |
| 세후 배당수익률 | `stocks.expected_annual_dividend_per_share * (1 - 계좌 세율) / stocks.current_price * 100` |
| 포트폴리오 세후 수익률 | `연 세후 배당 합계 / sum(holdings.quantity * holdings.average_purchase_price) * 100` |
| 목표 달성률 | `annual_after_tax_amount / user_settings.annual_dividend_goal_amount * 100` |

## 4. 홈 화면

데이터 진입점: `src/features/dividends/queries.ts`의 `getHomeSummary(year)` → DB RPC `public.get_home_summary(p_year int)`.

| 와이어프레임 표시값 | UI/타입 필드 | 원천 DB/RPC | 산출 방식 |
|---|---|---|---|
| 안녕하세요 | 정적 문구 | 없음 | 현재 구현은 사용자명 대신 `こんにちは` 고정 문구를 표시합니다. |
| 올해 예상 세후 배당 | `annualDividend.afterTaxAmount` | `holdings`, `dividend_events` | 현재 사용자 보유 종목의 승인 이벤트 중 `expected_payment_year = p_year`인 `dividend_per_share * quantity * (1 - tax_rate)` 합계 |
| 세전 금액 | `annualDividend.beforeTaxAmount` | `holdings`, `dividend_events` | `dividend_per_share * quantity` 합계 |
| 예상 세금 | `annualDividend.estimatedTaxAmount` | `holdings.account_type` | `dividend_per_share * quantity * tax_rate` 합계 |
| 연간 목표 | `annualGoal.targetAmount` | `user_settings.annual_dividend_goal_amount` | NULL이면 목표 프롬프트 표시 |
| 목표 대비 % | `annualGoal.achievementRate` | RPC 계산값 | `afterTaxAmount / targetAmount * 100` |
| 이번 달 예상 입금액 | `currentMonthDividend.afterTaxAmount` | `dividend_events.expected_payment_month` | 현재 월과 `p_year`에 해당하는 승인 이벤트의 세후 합계 |
| 다음 배당 예정 종목/날짜/금액/상태 | `nextDividend` | `stocks`, `holdings`, `dividend_events` | 현재 월 이후 승인 이벤트를 지급연월 오름차순, 세후금액 내림차순으로 1건 선택. 같은 이벤트에 여러 계좌를 보유하면 금액을 합산 |
| 최근 배당 변경 | `recentDividendChange` | `dividend_events.change_type` | 보유 종목의 승인 이벤트 중 `increase/decrease/no_dividend/special/commemorative/resumed`를 `updated_at desc`로 1건 선택 |
| 빈 상태 | `holdingCount` | `holdings` | `holdingCount = 0`이면 온보딩 CTA 표시 |

## 5. 포트폴리오 화면

데이터 진입점: `getHoldings()`와 `getPortfolioSummary(accountType, year)`.

| 와이어프레임 표시값 | UI/타입 필드 | 원천 DB/RPC | 산출 방식 |
|---|---|---|---|
| 보유 종목 N개 | `PortfolioSummary.holdingCount` | RPC `get_portfolio_summary` | 현재 사용자 `holdings.deleted_at is null` 카운트 |
| 올해 세후 배당 | `annualAfterTaxAmount` | `holdings`, `dividend_events` | 보유 종목별 승인 이벤트 주당 배당 합계 * 수량 * 세후율 |
| 포트폴리오 세후 수익률 | `averageAfterTaxYield` | `holdings.average_purchase_price` | `연 세후 배당 합계 / 총 취득금액 * 100` |
| 필터 | `account_type` | `holdings.account_type` | `all/nisa/tokutei/general` |
| 정렬 | 클라이언트 상태 | `sortHoldings` | 세후 배당액순, 종목코드순, 최근 추가순 |
| 카드 종목명/코드 | `stock.name`, `stock.ticker` | `stocks.name`, `stocks.ticker` | `holdings.stock_id = stocks.id` 조인 |
| 수량/계좌 | `quantity`, `account_type` | `holdings.quantity`, `holdings.account_type` | 보유 레코드 단위로 표시 |
| 평균 취득가 | `average_purchase_price` | `holdings.average_purchase_price` | 카드에 `N株 @ ¥가격` 형태 표시 |
| 연 세후 배당 | 클라이언트 계산 | `stocks.dividend_events` | 해당 연도의 승인 이벤트 주당 배당 합계 * 수량 * 세후율 |
| 배당 데이터 확보 중 | `hasNoDividendData` | 승인 이벤트 합계 | 승인 이벤트 합계가 없으면 금액 대신 표시 |
| 상장 폐지 | `stock.support_status` | `stocks.support_status` | `delisted`이면 배지 표시 |
| 빈 상태 | `filteredHoldings.length` | `holdings` | 선택 필터에 해당 보유가 없으면 CTA 표시 |

## 6. 종목 검색 화면

데이터 진입점: `searchStocks(query)`.

| 표시값 | 원천 DB | 조건/산출 |
|---|---|---|
| 종목명/코드 | `stocks.name`, `stocks.ticker` | 검색어 prefix로 `ticker/name/name_en ilike` |
| 시장 구분 | `stocks.market_segment` | 값이 있으면 표시 |
| 예상 배당수익률 | `stocks.expected_dividend_yield` | `supported` 종목에서 표시 가능 |
| 배당 데이터 확보 중 | `stocks.support_status`, `expected_annual_dividend_per_share` | `unsupported` 또는 배당 데이터 NULL일 때 안내 |
| 검색 제외 | `stocks.support_status` | 검색은 `supported`, `unsupported`만 포함하고 `delisted` 제외 |

## 7. 보유 종목 등록/편집 및 등록 완료

주요 액션: `createHolding`, `updateHolding`, `softDeleteHolding`.

| 표시/입력값 | 원천/저장 컬럼 | 비고 |
|---|---|---|
| 선택 종목 | `holdings.stock_id` | `stocks.id` 참조 |
| 보유 수량 | `holdings.quantity` | 0보다 큰 숫자 |
| 평균 취득가 | `holdings.average_purchase_price` | 0 이상 숫자 |
| 계좌 종류 | `holdings.account_type` | `nisa/tokutei/general` |
| 예상 계산 카드 | 클라이언트 `calculateHoldingDividend` | 선택 종목의 `stocks.expected_annual_dividend_per_share`, `current_price`, 입력 수량, 계좌 세율로 즉시 계산 |
| 등록 완료 예상 연간 세후 배당 | 클라이언트 계산 결과 | 저장 직후 선택 입력값으로 계산한 `afterTaxAmount` |
| 삭제 | `holdings.deleted_at` | 물리 삭제가 아니라 soft delete |

## 8. 배당 캘린더 화면

데이터 진입점: `getDividendCalendar(year, basis, accountType, "payment_month")`, `getDividendMonthDetail(...)`.

| 표시값 | UI/타입 필드 | 원천 DB/RPC | 산출 방식 |
|---|---|---|---|
| 연도 선택 | `p_year` | RPC 파라미터 | 기본값은 현재 연도 |
| 세후/세전 기준 | `p_amount_basis` | RPC 파라미터 | `after_tax`면 세후, `before_tax`면 세전 |
| 계좌 필터 | `p_account_type` | `holdings.account_type` | `all/nisa/tokutei/general` |
| 월별 금액 | `CalendarMonth.amount` | `dividend_events.expected_payment_month` | 선택 연도/월 승인 이벤트의 세전 또는 세후 합계 |
| 월별 건수 | `CalendarMonth.eventCount` | `dividend_events` | 선택 월 이벤트 건수 |
| 월 상세 총 세전/세금/세후 | `MonthDetail` | RPC `get_dividend_month_detail` | 해당 월 이벤트별 금액 합계 |
| 상세 카드 종목/코드 | `stockName`, `ticker` | `stocks` | 배당 이벤트의 종목 조인 |
| 상세 카드 계좌/수량 | `accountType`, `quantity` | `holdings` | 보유 레코드 단위 표시 |
| 상세 카드 날짜 문구 | `displayDateText` | `expected_payment_year/month` | 지급연월이 있으면 `YYYY年M月`, 없으면 `未定` |
| 상태 배지 | `status` | `dividend_events.status` | `estimated/confirmed/paid/undecided` |
| 빈 상태 | `initialHoldingCount`, `eventCount` | `holdings`, RPC 결과 | 보유 0건이면 종목 추가 CTA, 보유는 있으나 이벤트가 없으면 조건 없음 안내 |

## 9. 종목 상세 화면

데이터 진입점: `getStockDetail(stockId, year)` → DB RPC `public.get_stock_detail`.

| 표시값 | UI/타입 필드 | 원천 DB/RPC | 산출 방식 |
|---|---|---|---|
| 종목명/코드/통화 | `stock.name/ticker/currency` | `stocks` | `p_stock_id`로 단일 종목 조회 |
| 현재 주가 | `stock.currentPrice` | `stocks.current_price` | 가격 수집 파이프라인에서 갱신 |
| 예상 연간 배당/주 | `stock.expectedAnnualDividendPerShare` | `stocks.expected_annual_dividend_per_share` | 종목 마스터/승인 파이프라인 동기화 값 |
| 예상 배당수익률 | `stock.expectedDividendYield` | `stocks.expected_dividend_yield` | 현재가와 예상 연간 배당 기반 저장값 |
| 내 보유 정보 | `userHoldings[]` | `holdings` | 현재 사용자, 해당 종목, 미삭제 보유만 |
| 보유별 연 세후/세전 배당 | `annualAfterTaxAmount`, `annualBeforeTaxAmount` | `dividend_events`, `holdings` | 해당 연도 승인 이벤트 주당 배당 합계 * 수량 * 세율 |
| 배당 스케줄 | `dividendSchedule[]` | `dividend_events` | 해당 종목/연도 승인 이벤트 전체 |
| 배당금/주 | `dividendPerShare` | `dividend_events.dividend_per_share` | NULL이면 `未定` |
| 데이터 소스 | `source` | `dividend_events.source_type/source_url/source_published_at/review_status` | 해당 연도의 최신 승인 이벤트 중 `source_type is not null` 1건 |
| 알림 설정 버튼 활성화 | `hasDividendData` | `stocks.expected_annual_dividend_per_share` | NULL이면 비활성화 및 안내 문구 표시 |

## 10. 목표 배당수익률 알림 설정 화면

데이터 진입점: `getStockById(stockId)`, `getNotificationRulesForStock(stockId)`.

| 표시/입력값 | 원천/저장 컬럼 | 규칙 |
|---|---|---|
| 기준 | `notification_rules.basis` | MVP는 hidden input으로 `before_tax_yield` 고정 |
| 조건 | `notification_rules.operator` | `gte` 또는 `lte` |
| 목표 수익률 | `notification_rules.target_yield` | 퍼센트 숫자, 예: 3.5 |
| 앱 내 알림 | `notification_rules.notify_in_app` | 체크박스 |
| 이메일 알림 | `notification_rules.notify_email` | 체크박스 |
| 활성/비활성 | `notification_rules.status` | 활성 룰은 `active`, 비활성화 시 `disabled` |
| 기존 룰 표시 | `notification_rules` + `stocks` | 종목별 활성 룰은 MVP에서 최대 1개 정책 |
| 설정 가능 여부 | `stocks.expected_annual_dividend_per_share` | NULL이면 입력과 저장 버튼 비활성화 |

## 11. 알림 목록 화면

데이터 진입점: `getNotifications(filter)`.

| 표시값 | 원천 DB | 조건/산출 |
|---|---|---|
| 필터 탭 | `notifications.type` | 전체, `yield_target`, 데이터 업데이트, 배당 변경 그룹 |
| 제목 | `notifications.title` | 알림 생성 시 저장 |
| 본문 요약 | `notifications.body` | 첫 2줄을 공백으로 이어 표시 |
| 종목 코드/명 | `stocks.ticker`, `stocks.name` | `notifications.stock_id = stocks.id` |
| 읽음 상태 | `notifications.status` | `unread`이면 未読, 그 외 既読 |
| 생성 시간 | `notifications.created_at` | `ja-JP` 날짜/시간 포맷 |
| 오늘/이번 주/이전 그룹 | `notifications.created_at` | 오늘 0시 이후, 최근 7일, 그 이전 |
| 채널 | `notifications.channel` | 목록은 `channel = 'in_app'`만 조회 |
| 모두 읽음/단건 읽음 | `notifications.status`, `read_at` | 액션에서 read 처리 |

배당 변경 필터는 `dividend_increase`, `dividend_decrease`, `no_dividend`, `special_dividend`를 포함합니다.

## 12. 설정 화면

데이터 진입점: `getCurrentUserSettings()`.

| 표시/입력값 | 원천/저장 컬럼 | 비고 |
|---|---|---|
| 계정 이메일 | Supabase Auth user email | `auth.getUser()` 결과 |
| 이메일 알림 ON/OFF | `user_settings.email_notification_enabled` | 체크박스 |
| 앱 내 알림 ON/OFF | `user_settings.in_app_notification_enabled` | 체크박스 |
| 기본 금액 표시 | `user_settings.default_amount_basis` | `after_tax` 또는 `before_tax` |
| 통화 | `user_settings.currency` | MVP는 `JPY` read-only |
| 연간 세후 배당 목표액 | `user_settings.annual_dividend_goal_amount` | 홈 목표 카드와 연결 |
| 목표수익률 관리 링크 | `notification_rules` | `/app/settings/yield-targets`에서 활성 룰 목록 관리 |

## 13. 관리자 배당 검수 화면

데이터 진입점: `listDividendReviews(filters)`와 검수 액션 RPC/Edge Function.

| 와이어프레임 표시값 | 원천 DB | 설명 |
|---|---|---|
| 검수 상태 | `dividend_reviews.status` | `pending`, `needs_manual_check`, `approved`, `rejected` |
| 우선순위 | `dividend_reviews.review_priority` 또는 joined disclosure priority | `low/normal/high/urgent` |
| 종목 | `stocks.ticker`, `stocks.name` | `dividend_reviews.stock_id` 조인 |
| 공시 제목/공시일 | `disclosures.title`, `disclosures.published_at` | `dividend_reviews.disclosure_id` 조인 |
| 회계연도/월 | `dividend_reviews.extracted_fiscal_year/month` | AI 후보/관리자 수정값 |
| 지급연도/월 | `dividend_reviews.extracted_payment_year/month` | 승인 시 `dividend_events.expected_payment_year/month`로 복사 |
| 배당 종류 | `dividend_reviews.extracted_event_type` | 승인 시 `dividend_events.event_type` |
| 배당금/주 | `dividend_reviews.extracted_dividend_per_share` | 승인 시 `dividend_events.dividend_per_share` |
| 직전 배당금/주 | `dividend_reviews.previous_dividend_per_share` | 승인 시 `dividend_events.previous_dividend_per_share` |
| 변경유형 | `dividend_reviews.change_type` 또는 승인 시 서버 산출 | 승인 이벤트의 `dividend_events.change_type` |
| 기준일/권리락일 | `extracted_record_date`, `extracted_ex_dividend_date` | 승인 시 `record_date`, `ex_dividend_date` |
| 신뢰도 | `confidence_score` | AI 추출 신뢰도 |
| 경고 | `warnings`, `warning_message`, `evidence_text` | 관리자 판단 보조 |
| PDF/원문 | `disclosures.document_url`, `storage_path` | signed URL 또는 외부 URL로 확인 |
| 승인 결과 | `created_dividend_event_id` | 승인 시 생성된 `dividend_events.id` 참조 |

승인 후 사용자 화면에 반영되는 핵심 복사 관계는 다음과 같습니다.

| 후보 컬럼 | 승인 이벤트 컬럼 |
|---|---|
| `dividend_reviews.stock_id` | `dividend_events.stock_id` |
| `extracted_fiscal_year` | `fiscal_year` |
| `extracted_fiscal_month` | `fiscal_month` |
| `extracted_payment_year` | `expected_payment_year` |
| `extracted_payment_month` | `expected_payment_month` |
| `extracted_event_type` | `event_type` |
| `extracted_dividend_per_share` | `dividend_per_share` |
| `previous_dividend_per_share` | `previous_dividend_per_share` |
| `extracted_record_date` | `record_date` |
| `extracted_ex_dividend_date` | `ex_dividend_date` |
| `raw_payload` | `raw_payload` |
| `disclosure_id` 관련 출처 | `source_type`, `source_url`, `source_published_at` |

## 14. 화면별 주요 코드 위치

| 화면 | 코드 위치 |
|---|---|
| 홈 | `src/app/app/home/page.tsx`, `src/features/dividends/queries.ts` |
| 포트폴리오 | `src/app/app/portfolio/page.tsx`, `src/features/holdings/queries.ts`, `src/features/holdings/components/portfolio-client.tsx` |
| 종목 검색 | `src/app/app/stocks/search/page.tsx`, `src/features/stocks/queries.ts` |
| 보유 등록/편집 | `src/features/holdings/components/new-holding-form.tsx`, `edit-holding-form.tsx`, `src/features/holdings/actions.ts` |
| 캘린더 | `src/app/app/calendar/page.tsx`, `src/features/calendar/components/calendar-client.tsx` |
| 종목 상세 | `src/app/app/stocks/[stockId]/page.tsx` |
| 알림 설정 | `src/app/app/stocks/[stockId]/notification-rule/page.tsx`, `src/features/notifications/actions.ts` |
| 알림 목록 | `src/app/app/notifications/page.tsx`, `src/features/notifications/queries.ts` |
| 설정 | `src/app/app/settings/page.tsx`, `src/features/settings/queries.ts`, `src/features/settings/actions.ts` |
| 관리자 검수 | `src/app/admin/dividend-reviews/page.tsx`, `src/features/admin/review-queries.ts`, `src/features/admin/review-actions.ts` |
| 사용자 RPC | `supabase/migrations/20260513040000_ai_schema_payment_month_phase_05.sql` |

