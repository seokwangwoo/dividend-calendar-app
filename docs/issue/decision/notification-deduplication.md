# 설계 결정: 알림 중복 방지 전략

> **상태: 🔄 부분 구현** — `last_triggered_at` 상태 머신 구현됨; `sent_via_email_at` 컬럼 존재 여부 미확인

## 결정일
2026-05-06

## 질문
목표 배당수익률 알림이 조건 충족 상태가 지속될 때 중복 발송되지 않도록 어떻게 제어할 것인가?

## 결정
**상태 변화 기반(옵션 B) + 알림/이메일 통합 레코드 관리**

### 상세 로직
1. **룰 평가 시 현재 조건 충족 여부 계산**
2. **`alert_rules` 테이블에 `last_condition_met` BOOLEAN 추가**
   - 이전 평가: false → 이번 평가: true → **알림 생성**
   - 이전 평가: true → 이번 평가: true → **알림 생성 안 함**
   - 이전 평가: true → 이번 평가: false → 상태만 갱신, 알림 없음
   - 이전 평가: false → 이번 평가: false → 상태만 갱신, 알림 없음
3. **배당 변경 알림 중복 방지**
   - `(stock_id, dividend_event_id, notification_type)` 기준으로 `notifications` 테이블 조회
   - 이미 동일 알림이 존재하면 생성하지 않음

### 알림/이메일 통합 관리
- `notifications` 테이블 1개로 통합
- `sent_via_email_at` (TIMESTAMP, NULL) 필드 추가
   - NULL이면 이메일 미발송
   - 값이 있으면 해당 시각에 이메일 발송 완료
- 사용자 설정에 따라 앱 내 알림은 항상 생성, 이메일은 선택적으로 발송

## 근거
- 사용자가 "KDDI 3.5% 이상이 되면 알려줘"라고 설정한 의도는 **"3.5%를 돌파하는 순간"**을 포착하는 것입니다.
- 3.5%가 2주간 유지되는 동안 매일 알림이 오면 사용자는 알림을 끄게 됩니다.
- `last_condition_met` 컬럼은 단순하면서도 명확한 상태 기계를 구현합니다.

## 영향 범위
- `docs/dividend_calendar_mvp_plan.md` — 8.7 목표 배당수익률 알림, 8.12 알림 발송, 13. 알림 정책, 10.1 alert_rules/notifications 테이블
- DB 마이그레이션:
  - `alert_rules.last_condition_met` BOOLEAN DEFAULT FALSE
  - `notifications.sent_via_email_at` TIMESTAMP NULL

## 관련 이슈
- #notification
- #deduplication
- #alert-rules
