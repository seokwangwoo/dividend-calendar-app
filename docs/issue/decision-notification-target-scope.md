# 설계 결정: 배당 변경 알림 발송 대상 범위

> **상태: ✅ 해결됨** — 배당 변경 알림 helper가 `holdings.deleted_at IS NULL` active holder만 대상으로 생성하도록 구현됨

## 결정일
2026-05-06

## 질문
배당 변경 알림(증배/감배/무배 등)을 사용자가 보유하지 않은 종목에 대해서도 발송할 것인가?

## 결정
**보유 종목에 한해서만 배당 변경 알림을 발송합니다.**

### 상세
- `dividend_events`가 승인(`review_status = 'approved'`)되면, 해당 `stock_id`를 **active holding으로 보유 중인 사용자**만 대상으로 알림을 생성합니다.
- 보유하지 않은 종목의 배당 변경은 알림 대상에서 제외됩니다. 목표수익률 알림 룰만 설정한 미보유 사용자도 MVP 배당 변경 알림 대상에 포함하지 않습니다.
- SQL 예시:
  ```sql
  select distinct h.user_id
  from holdings h
  where h.stock_id = {dividend_event_stock_id}
    and h.deleted_at is null
  ```

### 알림 생성 흐름
```text
배당 데이터 승인
  ↓
해당 종목을 active holding으로 보유한 사용자 목록 조회 (holdings.deleted_at IS NULL)
  ↓
각 사용자별로 알림 생성 (notifications 테이블 INSERT)
  ↓
사용자 설정에 따라 앱 내 알림 + 이메일 발송
```

### Phase 2 확장 가능성
- "관심 종목 등록" 기능 도입 시, 보유 종목 + 관심 종목 모두 알림 대상으로 확장 가능합니다.
- 이 경우 `watchlist` 테이블이 추가되며, `holdings`와 `watchlist`를 UNION하여 대상 사용자를 조회합니다.

## 근거
- 이 앱의 핵심 가치는 **"내 포트폴리오의 배당 현금흐름 관리"**입니다.
- 사용자가 보유하지 않은 종목의 배당 변경 알림은 투자 정보 앱(Yahoo Finance 등)의 기능과 겹치며, 서비스 정체성을 흐립니다.
- 보유 종목 기준 필터링은 `holdings` 테이블 INNER JOIN으로 간단히 구현 가능합니다.
- 모든 사용자에게 모든 배당 변경을 보내는 경우, 50개 종목 × 수천 명 사용자 규모에서 알림 탭이 스팸처럼 변질될 수 있습니다.

## 영향 범위
- `docs/dividend_calendar_mvp_plan.md` — 8.8 배당 변경 알림, 13. 알림 발송 조건
- `docs/dividend_app_wireframe.md` — #10 알림 목록 화면
- 알림 생성 로직: `dividend_events` 승인 트리거/배치에서 `holdings` 조인 및 `deleted_at IS NULL` 필터 필요

## 관련 이슈
- #notification
- #dividend-change
- #holdings-filter
