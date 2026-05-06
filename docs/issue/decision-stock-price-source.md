# 설계 결정: 목표 배당수익률 알림의 현재 주가 데이터 출처

## 결정일
2026-05-06

## 질문
목표 배당수익률 알림의 계산에 필요한 "현재 주가"를 MVP에서 어떻게 확보할 것인가?

## 결정
**Stooq 무제 CSV 엔드포인트를 하루 1회 호출하여 전날 종가를 기준으로 계산합니다.**

### 상세
- **API**: Stooq 무제 CSV (`https://stooq.com/q/d/l/?s={ticker}&i=d`)
- **호출 주체**: Cloudflare Cron Trigger → Worker
- **호출 주기**: 매일 1회 (전날 종가 기준)
- **키 관리**: `.env` 및 Cloudflare Worker Secrets(`STOOQ_API_KEY`)로 관리, git 미커밋
- **티커 매핑**: Worker 낶부 하드코딩 매핑 테이블 사용 (예: `9433` → `9433.JP`)

### Fall-back 정책
- API 실패 시: 마지막 캐시 가격을 유지하되, UI에 "N일 전 종가 기준"으로 노출
- 3일 연속 실패 시: 관리자에게 알림 발송

## 근거
- Stooq 무제 엔드포인트는 Rate Limit이 없어 MVP 비용 목표(월 $0~$5)에 부합합니다.
- 전날 종가 기준은 "실시간 초단위 반영" 제외 결정과 일치합니다.
- 3일 연속 실패 알림으로 데이터 품질 저하를 조기에 감지할 수 있습니다.

## 영향 범위
- `docs/dividend_calendar_mvp_plan.md` — 8.7 목표 배당수익률 알림, 11. 기술 설계
- DB 스키마: `stock_prices` 또는 `stocks` 캐시 컬럼 필요
- Cron 스케줄 정의 필요

## 관련 이슈
- #stock-price
- #notification
- #stooq-api
