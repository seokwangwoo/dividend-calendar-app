# Plan Audit and Revision Agent

## Purpose

이 파일은 `docs/plans/260505_mvp_1st_dev/` 내 모든 Phase 플랜 문서를 감사하고 수정하는 루프를 정의합니다.

서브에이전트가 각 문서를 감사하여 피드백을 생성하고, 메인에이전트가 피드백을 적용해 기존 포맷 그대로 수정합니다. 서브에이전트 감사가 모든 파일에 대해 PASS를 반환할 때까지 반복합니다.

---

## 대상 파일

```
docs/plans/260505_mvp_1st_dev/README.md
docs/plans/260505_mvp_1st_dev/phase_01_project_foundation.md
docs/plans/260505_mvp_1st_dev/phase_02_database_auth_rls.md
docs/plans/260505_mvp_1st_dev/phase_03_portfolio_dividend_calculation.md
docs/plans/260505_mvp_1st_dev/phase_04_home_calendar_core_ui.md
docs/plans/260505_mvp_1st_dev/phase_05_notifications_and_settings.md
docs/plans/260505_mvp_1st_dev/phase_06_admin_review_and_data_pipeline.md
docs/plans/260505_mvp_1st_dev/phase_07_mvp_acceptance_testing.md
```

---

## 에이전트 역할 정의

### 서브에이전트: Auditor

**역할**: 각 Phase 파일을 읽고 아래 감사 기준에 따라 문제를 찾아 구조화된 피드백을 반환합니다.

**호출 방법**: 메인에이전트가 서브에이전트를 `general-purpose` 또는 `Explore` 타입으로 호출합니다.

**입력**: 감사할 파일 목록 또는 단일 파일 경로.

**출력 포맷**:

```
## Audit Result: <파일명>

Status: PASS | FAIL

### Issues
- [CRITICAL] <섹션명>: <문제 설명> — <수정 제안>
- [MINOR] <섹션명>: <문제 설명> — <수정 제안>

### Notes
- <메모 (선택)>
```

- `Status: PASS` — 파일에 수정이 필요한 문제가 없음.
- `Status: FAIL` — 하나 이상의 CRITICAL 또는 MINOR 문제가 존재함.
- 모든 파일이 PASS면 전체 감사 결과는 `ALL PASS`.

---

## 감사 기준

서브에이전트는 다음 기준으로 각 파일을 검토합니다.

### 1. 포맷 완전성

- 각 Phase 파일에는 다음 섹션이 있어야 합니다:
  - `## Goal`
  - `## Prerequisites`
  - `## Implementation Scope`
  - `## Test Plan`
  - `## Completion Criteria`
  - `## Excluded From This Phase`
- `README.md`는 Phase 목록, MVP 스택, 스코프, 완료 정의를 포함해야 합니다.
- 파일은 500줄 이하여야 합니다.

### 2. Phase 간 일관성

- Phase N의 Prerequisites는 Phase N-1 Completion Criteria와 대응해야 합니다.
- Phase N에서 "Excluded"로 명시한 항목은 적절한 후속 Phase에서 다뤄져야 합니다.
- README Phase 순서와 각 파일의 Prerequisites가 일치해야 합니다.

### 3. 도메인 값 일관성

- 계좌 유형: `nisa`, `tokutei`, `general` — 모든 파일에서 동일하게 사용.
- 세율: NISA 0%, tokutei/general 20.315% — 혼선 없어야 함.
- `dividend_events.review_status`: `pending`, `approved`, `rejected` — 사용처에서 일관되어야 함.
- `dividend_events.status`: `estimated`, `confirmed`, `paid`, `undecided` — 혼용 금지.
- `未定`은 항상 null amount + `status = 'undecided'`로 처리, 0 저장 금지.
- Amount basis: `before_tax`, `after_tax` — 필터 값과 혼용 금지.

### 4. 스키마-RPC 정합성

- Phase 02에 정의된 테이블 컬럼명과 Phase 03~06 RPC 입출력 필드명이 일치해야 합니다.
- RPC 입력에서 `auth.uid()`로 사용자를 추론하는 경우 별도 `p_user_id` 파라미터를 요구하지 않아야 합니다.
- RLS 정책이 Phase 02에 명시된 테이블 모두를 커버해야 합니다.

### 5. 보안 규칙

- `SUPABASE_SERVICE_ROLE_KEY`가 브라우저 노출 가능한 경로에 사용되어서는 안 됩니다.
- 서비스 역할 키를 사용하는 Edge Function은 반드시 JWT 및 admin role 검증을 명시해야 합니다.

### 6. 표현 규칙

- 사용자 화면에서 투자 권유 표현이 없어야 합니다.
- 금지 표현 목록 (`買いシグナル`, `売りシグナル`, `今すぐ買い`, `今すぐ売り`, `必ず上がる`, `確実に儲かる`) 이 플랜 본문에 규범으로 언급된 경우에만 허용됩니다.
- 세금 고지 문구: `税額および税引後配当額は概算です。` 관련 스크린에 표기 의무가 명시되어야 합니다.

### 7. 기술 실현 가능성

- 단일 Phase 내 태스크가 지나치게 광범위해 Phase 범위를 초과하지 않아야 합니다.
- Supabase Edge Function, RLS, Storage 등 제약 조건에 반하는 구현 방향은 없어야 합니다.

---

## 메인에이전트: Reviser

**역할**: 서브에이전트 피드백을 수신하고, 기존 파일 포맷을 유지하면서 FAIL 항목을 수정합니다.

**원칙**:
- 포맷 수정: 기존 섹션 구조, 헤딩 레벨, 테이블/코드블록 스타일을 유지합니다.
- 스코프 수정: MVP 1st 범위를 초과하는 내용은 추가하지 않습니다.
- 최소 수정: CRITICAL → MINOR 순으로 처리하며, 감사 피드백 외의 내용을 자의적으로 수정하지 않습니다.
- 500줄 제한: 수정 후 파일이 500줄을 초과하면 내용을 요약하거나 Phase 07 Follow-Up에 이관합니다.
- 언어: 기존 파일의 언어(영어)를 유지합니다.

---

## 실행 루프

```
Loop:
  1. 메인에이전트가 서브에이전트(Auditor)를 호출합니다.
     - 대상: 위 "대상 파일" 목록 전체 또는 이전 루프에서 FAIL된 파일.

  2. 서브에이전트가 각 파일에 대해 Audit Result를 반환합니다.

  3. 메인에이전트가 결과를 확인합니다.
     - 모든 파일이 PASS → 루프 종료. 사용자에게 완료 보고.
     - FAIL 파일 존재 → 4단계로 진행.

  4. 메인에이전트가 FAIL 파일을 수정합니다.
     - CRITICAL 문제 우선 처리.
     - 수정 시 기존 포맷 유지.
     - 수정 완료 후 1단계로 돌아갑니다.

루프 상한: 최대 5회. 5회 이후에도 FAIL이 남으면 미해결 항목을 사용자에게 보고합니다.
```

---

## 완료 조건

다음 조건이 모두 충족되면 작업이 완료됩니다:

- 대상 파일 8개 모두 서브에이전트 감사에서 `Status: PASS`.
- 수정된 파일이 500줄 이하.
- 기존 포맷(섹션 구조, 헤딩, 코드블록 스타일)이 유지됨.
- MVP 1st 외부 스코프가 추가되지 않음.

---

## 사용 예시

메인에이전트는 서브에이전트를 다음과 같이 호출합니다:

```
감사 대상: docs/plans/260505_mvp_1st_dev/ 내 모든 Phase 파일.

각 파일에 대해 agent.md의 "감사 기준" 섹션에 따라 감사를 수행하고,
규정된 "Audit Result" 포맷으로 결과를 반환하세요.
```

수정 후 재감사 호출 예시:

```
이전 루프에서 FAIL된 파일: phase_02_database_auth_rls.md, phase_04_home_calendar_core_ui.md.

수정된 파일에 대해 동일한 감사 기준으로 재감사를 수행하고 결과를 반환하세요.
```
