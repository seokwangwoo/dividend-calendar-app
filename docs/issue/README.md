# 이슈 및 결정 관리

`docs/issue/`는 제품 버그, 기술 부채, 설계 결정(ADR)을 마크다운으로 관리하는 공간입니다.

## 폴더 구조

```
docs/issue/
├── README.md              ← 현재 파일 (인덱스)
├── active/                ← 미해결 이슈/버그
├── archive/               ← 해결되거나 폐기된 이슈
└── decision/              ← 설계 결정 문서 (ADR)
```

## 미해결 이슈 (Open)

| 이슈 | 유형 | 생성일 |
|------|------|--------|
| [승인 배당 이벤트 기반 종목 예상 배당 동기화 및 산식 근거 표시 필요](active/20260514-stock-expected-dividend-sync-and-simulation-basis.md) | bug | 2026-05-14 |
| [종목 상세 데이터 소스 미표시 필요](active/20260514-stock-detail-hide-source.md) | bug | 2026-05-14 |
| [AI 파서 change_type 판단 제거 및 필수 기간 필드 강화](active/20260514-ai-parser-change-type-and-required-period-fields.md) | feature | 2026-05-14 |

## 해결된 이슈 (Recently Resolved)

| 이슈 | 유형 | 해결일 |
|------|------|--------|
| [종목 검색 라우트 누락](archive/20260510-missing-stock-search-route-for-alert-entry.md) | feature | 2026-05-12 |
| [캘린더 기준 전환 UI가 MVP 정책과 충돌](archive/20260510-calendar-basis-switch-mvp-scope-mismatch.md) | bug | 2026-05-12 |
| [알림 기준 UI가 MVP 단일 기준 정책과 충돌](archive/20260510-notification-rule-basis-mvp-scope-mismatch.md) | bug | 2026-05-12 |
| [알림 평가 yield 불일치](archive/20260510-notification-evaluation-yield-mismatch.md) | bug | 2026-05-12 |
| [홈/포트폴리오 배당 금액 불일치](archive/20260506-home-portfolio-dividend-mismatch.md) | bug | 2026-05-07 |
| [TDnet PDF 텍스트 추출 개선 및 OpenAI fallback 입력 방식 수정 필요](archive/20260511-tdnet-pdf-text-extraction-openai-fallback.md) | bug | 2026-05-11 |

## 설계 결정 (ADRs)

| 결정 | 영역 | 상태 |
|------|------|------|
| [관리자 검수 화면](decision/admin-review-ui.md) | ui | accepted |
| [연간 배당 목표](decision/annual-dividend-goal.md) | product | accepted |
| [캘린더 집계 기준](decision/calendar-aggregation.md) | ui | accepted |
| [데이터 파이프라인 SPOF](decision/data-pipeline-spof.md) | infra | accepted |
| [배당 상태 배지](decision/dividend-status-badge.md) | ui | accepted |
| [배당 연도 기준](decision/dividend-year-basis.md) | data | accepted |
| [다계좌 집계](decision/multi-account-aggregation.md) | product | accepted |
| [다음 배당 로직](decision/next-dividend-logic.md) | product | accepted |
| [알림 중복 방지](decision/notification-deduplication.md) | notification | accepted |
| [알림 대상 범위](decision/notification-target-scope.md) | notification | accepted |
| [온볇ィング/빈 상태](decision/onboarding-empty-state.md) | ui | accepted |
| [포트폴리오 수익률 계산](decision/portfolio-yield-calculation.md) | product | accepted |
| [설정 범위](decision/settings-scope.md) | product | accepted |
| [오래된 주가 알림 정책](decision/stale-price-alert-policy.md) | notification | accepted |
| [주가 소스](decision/stock-price-source.md) | data | accepted |

---

## 문서 템플릿

### 새 이슈 작성 시

파일명: `active/YYYYMMDD-<짧은설명>.md`

```markdown
---
status: open
type: bug
created: YYYY-MM-DD
priority: medium
labels: []
---

# 제목

## 개요
...
```

### 해결 후

1. `status: resolved`로 변경
2. `resolved: YYYY-MM-DD` 기록
3. `active/` → `archive/` 이동

### 설계 결정 작성 시

파일명: `decision/<영역>-<설명>.md`

```markdown
---
status: accepted
type: decision
created: YYYY-MM-DD
---

# 설계 결정: 제목
...
```
