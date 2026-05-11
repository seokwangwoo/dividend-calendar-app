# 설계 결정: 목표 배당수익률 알림의 현재 주가 데이터 출처

> **상태: ✅ 구현 완료** — `process-price-refresh` Edge Function 및 GitHub Actions Cron 기반 주가 수집 파이프라인 구현 완료

## 결정일
2026-05-06 (업데이트: 2026-05-11)

## 질문
목표 배당수익률 알림의 계산에 필요한 "현재 주가"를 MVP에서 어떻게 확보할 것인가?

## 결정
**Stooq JSON 엔드포인트를 개별 티커 호출로 하루 1회 갱신합니다. GitHub Actions Cron → `process-price-refresh` Edge Function (chunk 단위 처리).**

### 상세
- **API**: Stooq JSON (`https://stooq.com/q/l/?s={ticker}.JP&f=sd2t2ohlcv&h&e=json`)
- **호출 주체**: GitHub Actions Cron (`refresh-stock-prices.yml`)
- **처리 주체**: `process-price-refresh` Edge Function (chunk=50 tickers, `jobs` 테이블 기반)
- **호출 주기**: 평일 00:00 JST (전날 종가 기준)
- **대상**: 전체 상장주 중 `delisted` 제외 (~4,000 tickers)
- **지연**: 티커당 200ms (burst 방지)
- **키 관리**: Edge Function 환경 변수, git 미커밋
- **인증**: `SUPABASE_SERVICE_ROLE_KEY` 또는 `API_SECRET` (service-to-service only)

### Fall-back 정책
- API 실패 시: 마지막 캐시 가격을 유지하되, UI에 "N일 전 종가 기준"으로 노출
- 3일 연속 실패 시: 관리자에게 알림 발송 (`get_stocks_with_consecutive_price_refresh_failures`)
- Chunk 실패 시: retry 3회 (5min → 15min → 45min backoff)

## 변경 이력
- 2026-05-06: 초기 결정 — Cloudflare Worker + CSV batch
- 2026-05-11: 변경 — GitHub Actions + Edge Function + JSON 개별 호출. 이유: ① 쉼표 분리 batch가 Stooq에서 미동작, ② `jobs` 테이블 기반 retry/모니터링 일관성, ③ 4,000개 티커 처리를 위한 chunk 분할 필요

## 근거
- Stooq 묶음(batch) 호출은 실제 동작하지 않아 개별 호출로 변경
- 전날 종가 기준은 "실시간 초단위 반영" 제외 결정과 일치
- `jobs` 테이블 기반 처리로 retry, 모니터링, timeout 방지 일괄 대응
- 3일 연속 실패 알림으로 데이터 품질 저하를 조기에 감지

## 영향 범위
- `docs/dividend_calendar_mvp_plan.md` — 8.7 목표 배당수익률 알림, 11. 기술 설계
- `docs/plans/260511_full_japanese_market_coverage/phase_02_bulk_price_refresh_pipeline/plan.md`
- DB 스키마: `stocks.current_price`, `stocks.price_updated_at`, `stock_price_refresh_logs`
- Cron: `.github/workflows/refresh-stock-prices.yml`

## 관련 이슈
- #stock-price
- #notification
- #stooq-api
- #full-market-coverage
