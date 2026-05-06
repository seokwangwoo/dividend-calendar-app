# 설계 결정: 관리자 검수 화면 범위

## 결정일
2026-05-06

## 질문
기획서에는 관리자 검수 기능은 Must이지만 관리자 화면은 Should입니다. MVP에서 어떤 범위의 관리자 화면을 개발할 것인가?

## 결정
**최소 버전의 관리자 화면(옵션 B)을 MVP에 포함합니다.**

### 포함 기능
- `/admin` 라우트 (Next.js App Router 내)
- `dividend_events` 목록 테이블 (종목명, 배당금, 지급월, 상태, 출처)
- 새 배당 데이터 입력 폼 (종목 선택, 금액, 지급월, 상태, 출처 URL)
- 상태 변경 드롭다운 (`pending` → `approved` / `rejected`)

### 제외 기능 (Phase 2)
- 원문 공시 보기 (PDF/XBRL 렌더링)
- Confidence score 표시
- 파싱 결과 변경 전/후 비교
- 검수 이력 로그

### 인증/인가
- `users` 테이블에 `is_admin` BOOLEAN (DEFAULT FALSE) 추가
- `/admin` 접근 시 미들웨어에서 `is_admin = TRUE` 확인, 아니면 403 리다이렉트

## 근거
- MVP 완료 기준 #8: "관리자가 배당 데이터를 등록/수정/승인할 수 있다"를 충족해야 합니다.
- Supabase Studio만으로는 외래키, Enum, 날짜 포맷 등에서 오타와 무결성 위반 위험이 큽니다.
- 초기 Seed 데이터 축적(30~50개 종목)은 관리자 화면 없이는 비현실적입니다.
- 와이어프레임의 풀기능 검수 화면은 개발 비용이 크므로 Phase 2로 미룹니다.

## 영향 범위
- `docs/dividend_calendar_mvp_plan.md` — 8.11 관리자 검수, 9. 화면 구성, 10.1 users 테이블
- `docs/dividend_app_wireframe.md` — #12 관리자 검수 화면
- DB 마이그레이션: `users.is_admin`
- Next.js middleware: `/admin/*` 접근 제어

## 관련 이슈
- #admin-ui
- #review-workflow
- #mvp-scope
