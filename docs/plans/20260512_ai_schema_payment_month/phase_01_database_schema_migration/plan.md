# Phase 01: Database Schema Migration

## Goal

`dividend_reviews`와 `dividend_events` 테이블에서 `expected_payment_date`와 `payment_year`를 제거하고, `expected_payment_year`, `expected_payment_month`, `fiscal_month`를 추가한다. 기존 데이터를 새 컬럼으로 마이그레이션하고, 제약조건과 인덱스를 재정의한다.

## Prerequisites

- 데이터베이스 백업 완료 (또는 개발 환경에서 실행)
- 기존 `docs/plans/260508_pdf_ai_dividend_collection_mvp/`의 Phase 01~05가 구현 완료된 상태

## Implementation Scope

- `dividend_reviews` 테이블 스키마 변경
- `dividend_events` 테이블 스키마 변경
- 기존 데이터 마이그레이션 SQL 작성
- 제약조건 및 인덱스 재정의
- 관련 RPC/함수 시그니처 변경 사항을 이해하기 위한 기초 작업

## Core Tasks

1. **dividend_reviews 스키마 변경**
   - `extracted_payment_date date` 컬럼 제거
   - `extracted_payment_year int` 컬럼 추가 (CHECK: 2000~2100)
   - `extracted_fiscal_month int` 컬럼 추가 (CHECK: 1~12, nullable)
   - `extracted_payment_month` 기존 유지
   - 기존 데이터 마이그레이션: `extracted_payment_date`가 있으면 `extracted_payment_year = extract(year from extracted_payment_date)`, `extracted_payment_month = extract(month from extracted_payment_date)`

2. **dividend_events 스키마 변경**
   - `expected_payment_date date` 컬럼 제거
   - `payment_year int` 컬럼 제거
   - `expected_payment_year int` 컬럼 추가 (CHECK: 2000~2100, nullable)
   - `fiscal_month int` 컬럼 추가 (CHECK: 1~12, nullable)
   - `expected_payment_month` 기존 유지
   - 기존 데이터 마이그레이션: `expected_payment_date`가 있으면 `expected_payment_year = extract(year from expected_payment_date)`, `expected_payment_month = extract(month from expected_payment_date)`. `payment_year` 값은 `expected_payment_year`로 복사.

3. **제약조건 및 인덱스 재정의**
   - `dividend_events_approved_payment_year_required` 제약조건 제거 또는 `expected_payment_year` 기반으로 변경
   - `idx_dividend_events_payment_year_month` 인덱스를 `expected_payment_year` 기반으로 재생성
   - `idx_dividend_events_stock_year` 등 `payment_year`를 참조하는 인덱스 수정
   - `idx_dividend_reviews_disclosure_event` 등 필요시 추가

4. **RLS 정책 확인**
   - 기존 RLS 정책은 컬럼 변경에 영향을 받지 않으나, `dividend_events`의 SELECT 정책에서 `payment_year is not null` 조건이 있다면 `expected_payment_year is not null`로 변경

## Test Plan

- `npx supabase db push` 또는 로컬 마이그레이션 실행
- `dividend_reviews`와 `dividend_events` 테이블의 기존 데이터가 `expected_payment_year`, `expected_payment_month`로 올바르게 이전되었는지 SQL로 확인
- `\d dividend_reviews` 및 `\d dividend_events`로 컬럼 목록 확인
- `npm run typecheck`는 Phase 07에서 실행 (아직 타입이 업데이트되지 않음)

## Completion Criteria

- `dividend_reviews`에 `extracted_payment_date`가 없고, `extracted_payment_year`, `extracted_fiscal_month`가 존재한다.
- `dividend_events`에 `expected_payment_date`와 `payment_year`가 없고, `expected_payment_year`, `fiscal_month`가 존재한다.
- 기존 데이터가 마이그레이션되어 `expected_payment_year`와 `expected_payment_month`에 값이 채워져 있다.
- 인덱스와 제약조건이 새 스키마에 맞게 재정의되었다.

## Excluded From This Phase

- AI 파서 코드 수정
- Admin UI 수정
- 사용자 facing RPC/UI 수정
- Supabase 타입 재생성 (Phase 07에서 수행)
