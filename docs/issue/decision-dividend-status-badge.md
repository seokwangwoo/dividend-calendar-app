# 설계 결정: 배당 데이터 상태 배지 정의

> **상태: ✅ 해결됨** — `formatDividendStatus()` 구현 및 RPC에서 `review_status = 'approved'` 필터 적용 완료

## 결정일
2026-05-06

## 질문
와이어프레임의 "예상/확정/지급완료/미정/검수완료" 배지와 기획서의 `dividend_status` + `review_status` 두 Enum 간 불일치를 어떻게 해결할 것인가?

## 결정
**옵션 C: 사용자 화면에는 `review_status = approved`인 데이터만 노출하며, 배지는 `dividend_status` 단일 기준으로 표시합니다.**

### 사용자 화면 배지 매핑
| 배지 | `dividend_status` |
|------|-------------------|
| 예상 | `forecast`, `estimated` |
| 확정 | `confirmed`, `resolved` |
| 지급 완료 | `paid` |
| 미정 | `unknown` |

### 관리자 화면
- `review_status`(`pending`/`approved`/`rejected`)는 **관리자 검수 화면 전용**으로 분리합니다.
- MVP 사용자 화면에는 pending/rejected 데이터나 "검수 중" 힌트를 노출하지 않습니다.
- 와이어프레임 종목 상세의 "상태: 검수 완료" 배지는 제거합니다.
- 대신 종목 상세의 **데이터 출처 카드** 하단에 소규모 텍스트로 "검수 상태: 검수 완료"를 표시합니다.

## 근거
- 사용자는 "이 배당이 확정된 것인가, 예상인가"만 궁금해합니다. 검수 상태는 데이터 품질 보증의 내부 프로세스입니다.
- `approved` 데이터만 사용자 화면에 반영한다는 기획서 원칙(8.11)과 일치합니다.
- 데이터 출처 카드에 검수 상태를 소극적으로 노출하여 신뢰도는 유지합니다.

## 영향 범위
- `docs/dividend_calendar_mvp_plan.md` — 8.11 관리자 검수, 10.2 Enum 정의
- `docs/dividend_app_wireframe.md` — #7 상태 배지, #8 종목 상세 데이터 출처
- DB: `dividend_events.review_status`는 내부 필터 조건으로만 사용

## 관련 이슈
- #data-status
- #review-workflow
- #badge-ui
