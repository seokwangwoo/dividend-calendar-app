# 설계 결정: 배당 캘린더 월 집계 기준 및 날짜 표현

## 결정일
2026-05-06

## 질문
캘린더의 "월"은 어떤 기준으로 집계하고, 날짜가 불확실한 경우("하순", "末日", "未定") DB에 어떻게 저장할 것인가?

## 결정
**월 집계는 `estimated_payment_month` 기준. DB는 `payment_start_date` NULL 허용 + `estimated_payment_month` 필수. 캘린더 UI는 월별 리스트 뷰를 기본으로 합니다.**

### 상세
1. **집계 기준**: 사용자가 "2026년 6월"을 선택하면 `estimated_payment_month = 6`인 모든 배당을 6월에 집계합니다.
2. **DB 저장**:
   - `payment_start_date`: DATE, NULL 허용 (확정된 경우만 입력)
   - `estimated_payment_month`: INTEGER(1~12), 필수
   - 날짜 불확실 시 `payment_start_date`는 NULL로 두고 텍스트는 UI에서 변환하여 표시
3. **UI 형태**: 와이어프레임처럼 **월별 카드 리스트 뷰**를 기본으로 합니다. 달력 그리드는 Phase 2로 미룹니다.

### 날짜 표현 예시
| 공시 표현 | `payment_start_date` | UI 표현 |
|-----------|---------------------|---------|
| 6月30日 | 2026-06-30 | 6月30日 |
| 6月下旬 | NULL | 6月下旬予定 |
| 6月末 | NULL | 6月末予定 |
| 未定 | NULL | 未定 |

## 근거
- `estimated_payment_month`로 월 집계가 단순하고 쿼리 성능이 좋습니다.
- 날짜 불확실 시 임의의 DATE를 넣으면 잘못된 집계(예: 6月下旬를 6/21로 넣으면 "21일"로 오인)를 유발합니다.
- 리스트 뷰는 달력 그리드보다 구현이 단순하고 "월별 현금흐름"이라는 서비스 핵심 가치에 충분합니다.

## 영향 범위
- `docs/dividend_calendar_mvp_plan.md` — 8.5 배당 캘린더, 10.1 dividend_events 테이블
- `docs/dividend_app_wireframe.md` — #7 배당 캘린더 화면
- DB 마이그레이션: `dividend_events.estimated_payment_month` NOT NULL 설정 필요

## 관련 이슈
- #calendar
- #date-precision
- #payment-month
