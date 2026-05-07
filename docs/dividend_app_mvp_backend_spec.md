# 배당앱 MVP 백엔드 설계 사양서

## 핵심 요약

MVP 백엔드는 **별도 NestJS/FastAPI 서버 없이 Supabase 중심**으로 설계하는 것이 가장 저렴합니다.

프론트엔드는 **Next.js + Tailwind CSS**로 구성하고, 백엔드는 다음 조합을 추천합니다.

```text
Next.js + Tailwind CSS
+ Supabase Auth
+ Supabase PostgreSQL
+ Supabase Row Level Security
+ Supabase RPC
+ Supabase Edge Functions
+ Supabase Storage
+ Supabase Studio
+ GitHub Actions Cron
+ Resend
```

이 방식은 기존 백엔드 설계의 핵심인 **사용자별 포트폴리오 관리, 일본 주식 배당 데이터 관리, 세후 배당 계산, 월별 배당 캘린더, 목표수익률 알림, 배당 변경 알림, 관리자 검수**를 유지하면서도 운영비와 개발 복잡도를 줄이는 구조입니다.

---

# 1. 서비스 개요

## 1.1 서비스 목적

배당앱은 사용자가 보유한 일본 주식의 배당 정보를 등록하고, **올해 예상 세후 배당금**, **이번 달 예상 입금액**, **월별 배당 캘린더**, **목표 배당수익률 도달 알림**, **배당 변경 알림**을 확인할 수 있는 서비스입니다.

MVP에서는 복잡한 투자 분석보다 다음 기능에 집중합니다.

| 핵심 기능 | 설명 |
|---|---|
| 포트폴리오 등록 | 보유 종목, 수량, 평균 취득가, 계좌 종류 저장 |
| 세후 배당 계산 | 계좌 종류별 예상 세금과 세후 배당금 계산 |
| 홈 요약 | 올해 세후 배당, 이번 달 입금액, 다음 배당 예정 표시 |
| 배당 캘린더 | 월별 예상 배당 입금액 표시 |
| 목표수익률 알림 | 사용자가 설정한 배당수익률 조건 도달 시 알림 |
| 배당 변경 알림 | 증배, 감배, 무배, 특별배당 발생 시 알림 |
| 관리자 검수 | 수집/입력된 배당 데이터 승인, 수정, 거절 |

---

# 2. 전체 기술 스택

## 2.1 Frontend

| 영역 | 기술 |
|---|---|
| Framework | Next.js |
| Styling | Tailwind CSS |
| Language | TypeScript |
| Data Fetching | TanStack Query 또는 Supabase Client |
| Form | React Hook Form + Zod |
| Auth Client | Supabase JS |
| Hosting | Vercel 또는 Cloudflare Pages |

### 추천

MVP에서는 **Next.js App Router + Tailwind CSS + Supabase Client** 조합을 사용합니다.

```text
app/
  auth/
  app/
    home/
    portfolio/
    calendar/
    notifications/
    settings/
  admin/
```

---

## 2.2 Backend

| 영역 | 기술 | 설명 |
|---|---|---|
| Auth | Supabase Auth | 회원가입, 로그인, JWT 발급 |
| Database | Supabase PostgreSQL | 핵심 데이터 저장 |
| Authorization | Supabase RLS | 사용자별 데이터 접근 제어 |
| API | Supabase PostgREST | 기본 CRUD API 자동 제공 |
| Complex API | Supabase RPC | 홈 요약, 캘린더 계산 등 |
| Custom Logic | Supabase Edge Functions | 관리자 승인, 알림 생성, 외부 수집 처리 |
| File Storage | Supabase Storage | 공시 원문 PDF/XBRL 저장 |
| Admin | Supabase Studio | MVP 관리자 검수 대체 |
| Scheduler | GitHub Actions Cron | 정기 데이터 수집/알림 평가 |
| Email | Resend | 이메일 알림 발송 |
| Monitoring | Sentry | 프론트/Edge Function 오류 추적 |

---

# 3. MVP 아키텍처

```text
User Browser
  ↓
Next.js + Tailwind CSS
  ↓
Supabase Client
  ├─ Supabase Auth
  ├─ Supabase PostgREST
  ├─ Supabase RPC
  ├─ Supabase Storage
  └─ Supabase Edge Functions

GitHub Actions Cron
  ↓
Supabase Edge Functions
  ↓
External Sources
  ├─ TDnet
  └─ Stock Price API

Supabase Studio
  ↓
Admin Review
```

---

# 4. 백엔드 설계 방향

## 4.1 기존 서버형 백엔드와의 차이

| 항목 | 기존 서버형 설계 | MVP 저비용 설계 |
|---|---|---|
| Backend Server | NestJS/FastAPI | Supabase Edge Functions |
| Auth | JWT 직접 구현 | Supabase Auth |
| DB | PostgreSQL 직접 운영 | Supabase PostgreSQL |
| API | REST Controller 직접 구현 | PostgREST + RPC |
| Queue | Redis/BullMQ | PostgreSQL jobs 테이블 |
| Cache | Redis | View / Materialized View |
| Admin | 별도 Admin API | Supabase Studio 우선 |
| Storage | S3/R2 | Supabase Storage 우선 |
| Scheduler | 서버 Cron | GitHub Actions Cron |

## 4.2 설계 원칙

| 원칙 | 설명 |
|---|---|
| 서버 운영 최소화 | 별도 백엔드 서버를 두지 않는다. |
| DB 중심 설계 | 핵심 로직은 PostgreSQL View/RPC와 Edge Function으로 처리한다. |
| RLS 우선 | 사용자 데이터 보호는 Supabase RLS로 처리한다. |
| 관리자 기능 단순화 | 초기에는 Supabase Studio로 검수한다. |
| Redis 제거 | 캐시와 큐는 MVP에서 제외한다. |
| 알림 단순화 | 앱 내 알림을 우선 구현하고 이메일은 선택 기능으로 둔다. |

---

# 5. 도메인 모델

## 5.1 주요 도메인

| 도메인 | 설명 |
|---|---|
| profile | 사용자 프로필 |
| user_setting | 사용자 설정 |
| stock | 일본 주식 종목 |
| holding | 사용자 보유 종목 |
| dividend_event | 종목별 배당 이벤트 |
| dividend_review | 관리자 검수 데이터 |
| notification_rule | 목표 배당수익률 알림 조건 |
| notification | 사용자 알림 |
| disclosure | 공시 원문 |
| job | 정기 작업/비동기 작업 |

## 5.2 도메인 관계

```text
auth.users 1 --- 1 profiles
profiles 1 --- 1 user_settings
profiles 1 --- N holdings
profiles 1 --- N notification_rules
profiles 1 --- N notifications

stocks 1 --- N holdings
stocks 1 --- N dividend_events
stocks 1 --- N dividend_reviews
stocks 1 --- N notification_rules
stocks 1 --- N disclosures

dividend_reviews 1 --- 0..1 dividend_events
disclosures 1 --- N dividend_reviews
```

---

# 6. 데이터베이스 설계

## 6.1 profiles

Supabase Auth의 `auth.users`와 연결되는 사용자 프로필 테이블입니다.

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'user',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

| 컬럼 | 설명 |
|---|---|
| id | Supabase Auth user id |
| email | 사용자 이메일 |
| role | user, admin |
| status | active, deleted |

---

## 6.2 user_settings

```sql
create table user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  email_notification_enabled boolean not null default true,
  in_app_notification_enabled boolean not null default true,
  default_amount_basis text not null default 'after_tax',
  currency text not null default 'JPY',
  annual_dividend_goal_amount numeric(18,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);
```

| 컬럼 | 설명 |
|---|---|
| default_amount_basis | before_tax 또는 after_tax |
| annual_dividend_goal_amount | 연간 세후 배당 목표 금액 |
| currency | MVP에서는 JPY 고정 |

---

## 6.3 stocks

```sql
create table stocks (
  id uuid primary key default gen_random_uuid(),
  ticker text not null unique,
  exchange text not null default 'TSE',
  name text not null,
  name_en text,
  currency text not null default 'JPY',
  support_status text not null default 'unsupported',
  current_price numeric(18,2),
  price_updated_at timestamptz,
  expected_annual_dividend_per_share numeric(18,2),
  expected_dividend_yield numeric(8,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

| 컬럼 | 설명 |
|---|---|
| ticker | 예: 9433 |
| support_status | supported, unsupported |
| current_price | 현재 주가 |
| expected_annual_dividend_per_share | 예상 연간 주당 배당 |

---

## 6.4 holdings

```sql
create table holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  stock_id uuid not null references stocks(id),
  quantity numeric(18,4) not null,
  average_purchase_price numeric(18,2) not null,
  account_type text not null,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

| 컬럼 | 설명 |
|---|---|
| account_type | nisa, tokutei, general |
| quantity | 보유 수량 |
| average_purchase_price | 평균 취득가 |
| deleted_at | 소프트 삭제 |

---

## 6.5 dividend_events

```sql
create table dividend_events (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid not null references stocks(id),
  fiscal_year int not null,
  event_type text not null,
  dividend_per_share numeric(18,2),
  previous_dividend_per_share numeric(18,2),
  expected_payment_date date,
  expected_payment_month int,
  record_date date,
  ex_dividend_date date,
  status text not null default 'estimated',
  change_type text,
  source_type text,
  source_url text,
  source_published_at timestamptz,
  review_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

| 컬럼 | 설명 |
|---|---|
| event_type | interim, year_end, special, other |
| status | estimated, confirmed, paid, undecided |
| change_type | increase, decrease, no_dividend, special, unchanged |
| review_status | pending, approved, rejected |

---

## 6.6 dividend_reviews

관리자 검수용 테이블입니다.

```sql
create table dividend_reviews (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid references stocks(id),
  disclosure_id uuid,
  extracted_dividend_per_share numeric(18,2),
  previous_dividend_per_share numeric(18,2),
  extracted_payment_date date,
  extracted_payment_month int,
  confidence_score numeric(5,4),
  status text not null default 'pending',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_dividend_event_id uuid references dividend_events(id),
  raw_payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

## 6.7 notification_rules

```sql
create table notification_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  stock_id uuid not null references stocks(id),
  basis text not null,
  operator text not null,
  target_yield numeric(8,4) not null,
  notify_in_app boolean not null default true,
  notify_email boolean not null default false,
  status text not null default 'active',
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

| 컬럼 | 설명 |
|---|---|
| basis | MVP 사용자 생성 룰은 before_tax_yield 고정. after_tax_yield는 Phase 2 고급 알림 후보 |
| operator | gte, lte |
| target_yield | 목표 수익률 |

---

## 6.8 notifications

```sql
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  stock_id uuid references stocks(id),
  notification_rule_id uuid references notification_rules(id),
  type text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}',
  status text not null default 'unread',
  channel text not null default 'in_app',
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
```

| 컬럼 | 설명 |
|---|---|
| type | yield_target, dividend_increase, dividend_decrease 등 |
| channel | in_app, email |
| status | unread, read, failed |

---

## 6.9 disclosures

```sql
create table disclosures (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid references stocks(id),
  external_id text unique,
  source_type text not null,
  title text not null,
  document_url text,
  storage_path text,
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  status text not null default 'collected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

## 6.10 jobs

Redis Queue 대신 사용하는 MVP용 작업 테이블입니다.

```sql
create table jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}',
  run_after timestamptz not null default now(),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

| type | 설명 |
|---|---|
| collect_disclosures | 공시 수집 |
| parse_disclosure | 공시 파싱 |
| evaluate_notification_rules | 목표수익률 조건 평가 |
| send_email_notification | 이메일 알림 발송 |

---

# 7. Row Level Security 설계

## 7.1 기본 원칙

| 테이블 | 사용자 접근 |
|---|---|
| profiles | 본인만 조회/수정 |
| user_settings | 본인만 조회/수정 |
| holdings | 본인 데이터만 CRUD |
| notification_rules | 본인 데이터만 CRUD |
| notifications | 본인 데이터만 조회/수정 |
| stocks | 로그인 사용자는 조회 가능 |
| dividend_events | 승인된 데이터만 조회 가능. pending/rejected는 사용자 화면과 알림 생성에서 제외 |
| dividend_reviews | admin만 접근 |
| disclosures | admin만 전체 접근, 사용자는 제한 조회 |

---

## 7.2 holdings RLS 예시

```sql
alter table holdings enable row level security;

create policy "Users can view own holdings"
on holdings for select
using (auth.uid() = user_id);

create policy "Users can insert own holdings"
on holdings for insert
with check (auth.uid() = user_id);

create policy "Users can update own holdings"
on holdings for update
using (auth.uid() = user_id);

create policy "Users can delete own holdings"
on holdings for delete
using (auth.uid() = user_id);
```

---

## 7.3 Admin RLS 예시

```sql
create or replace function is_admin()
returns boolean
language sql
security definer
as $$
  select exists (
    select 1
    from profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;
```

```sql
create policy "Admins can manage dividend reviews"
on dividend_reviews
for all
using (is_admin())
with check (is_admin());
```

---

# 8. API 설계

MVP에서는 REST API 서버를 직접 만들지 않고, 아래 3가지 방식으로 API를 구성합니다.

| 방식 | 사용처 |
|---|---|
| Supabase Client CRUD | 단순 테이블 조회/등록/수정 |
| Supabase RPC | 계산이 필요한 홈/캘린더 조회 |
| Edge Functions | 관리자 승인, 외부 수집, 알림 발송 |

---

## 8.1 Frontend에서 직접 사용하는 Supabase CRUD

| 기능 | 테이블 | 방식 |
|---|---|---|
| 내 설정 조회 | user_settings | select |
| 내 설정 수정 | user_settings | update |
| 종목 검색 | stocks | select |
| 보유 종목 등록 | holdings | insert |
| 보유 종목 수정 | holdings | update |
| 보유 종목 삭제 | holdings | update deleted_at |
| 알림 조건 생성 | notification_rules | insert |
| 알림 조건 수정 | notification_rules | update |
| 알림 목록 조회 | notifications | select |
| 알림 읽음 처리 | notifications | update |

---

## 8.2 RPC 목록

| RPC | 설명 |
|---|---|
| get_home_summary | 홈 화면 요약 데이터 조회 |
| get_portfolio_summary | 포트폴리오 요약 조회 |
| get_dividend_calendar | 월별 배당 캘린더 조회 |
| get_dividend_month_detail | 특정 월 배당 상세 조회 |
| calculate_holding_dividend | 보유 종목 예상 배당 계산 |
| get_stock_detail | 종목 상세 조회 |

---

## 8.3 Edge Function 목록

| Function | 설명 |
|---|---|
| approve-dividend-review | 관리자 검수 승인 |
| reject-dividend-review | 관리자 검수 거절 |
| collect-disclosures | 공시 데이터 수집 |
| parse-disclosure | 공시 원문 파싱 |
| evaluate-notification-rules | 목표수익률 알림 조건 평가 |
| send-email-notification | 이메일 알림 발송 |
| refresh-stock-prices | 주가 데이터 갱신 |

---

# 9. 주요 API 상세

## 9.1 홈 요약 조회

### 방식

Supabase RPC

```ts
const { data, error } = await supabase.rpc("get_home_summary", {
  p_year: 2026
});
```

### 반환 예시

```json
{
  "year": 2026,
  "annualDividend": {
    "beforeTaxAmount": 480000,
    "estimatedTaxAmount": 96000,
    "afterTaxAmount": 384000,
    "currency": "JPY"
  },
  "currentMonthDividend": {
    "month": 6,
    "afterTaxAmount": 28400
  },
  "nextDividend": {
    "ticker": "9433",
    "stockName": "KDDI",
    "displayDateText": "6월 하순 예정",
    "afterTaxAmount": 15000,
    "status": "estimated"
  },
  "monthlyGoal": {
    "targetAmount": 30000,
    "currentAmount": 28400,
    "achievementRate": 94.67
  }
}
```

---

## 9.2 배당 캘린더 조회

### 방식

Supabase RPC

```ts
const { data, error } = await supabase.rpc("get_dividend_calendar", {
  p_year: 2026,
  p_basis: "after_tax",
  p_account_type: "all"
});
```

### 반환 예시

```json
{
  "year": 2026,
  "basis": "after_tax",
  "currency": "JPY",
  "months": [
    {
      "month": 1,
      "amount": 12000,
      "eventCount": 1
    },
    {
      "month": 6,
      "amount": 28400,
      "eventCount": 2
    }
  ]
}
```

---

## 9.3 보유 종목 등록

### 방식

Supabase Client Insert

```ts
await supabase.from("holdings").insert({
  user_id: user.id,
  stock_id: stockId,
  quantity: 100,
  average_purchase_price: 4300,
  account_type: "nisa"
});
```

### 보안

RLS에서 `auth.uid() = user_id`를 검증합니다.

---

## 9.4 목표수익률 알림 조건 생성

### 방식

Supabase Client Insert

```ts
await supabase.from("notification_rules").insert({
  user_id: user.id,
  stock_id: stockId,
  basis: "before_tax_yield",
  operator: "gte",
  target_yield: 3.5,
  notify_in_app: true,
  notify_email: false
});
```

---

## 9.5 관리자 검수 승인

### 방식

Supabase Edge Function

```http
POST /functions/v1/approve-dividend-review
```

### Request

```json
{
  "reviewId": "uuid"
}
```

### 처리 흐름

```text
1. 요청자의 JWT 확인
2. profiles.role = admin 확인
3. dividend_reviews 조회
4. status = pending인지 확인
5. dividend_events 생성
6. dividend_reviews.status = approved 변경
7. 관련 종목 active holding 보유 사용자 조회 (`holdings.deleted_at IS NULL`)
8. notifications 생성
```

---

# 10. 세후 배당 계산 로직

## 10.1 기본 계산식

```text
세전 배당금 = 주당 배당금 × 보유 수량
예상 세금 = 세전 배당금 × 계좌별 세율
세후 배당금 = 세전 배당금 - 예상 세금
```

## 10.2 계좌별 세금 정책

| account_type | 설명 | MVP 계산 |
|---|---|---|
| nisa | NISA | 세금 0 |
| tokutei | 특정계좌 | 기본 배당세율 적용 |
| general | 일반계좌 | 기본 배당세율 적용 |

### 가정

- MVP에서는 특정계좌와 일반계좌의 세율을 동일하게 처리합니다.
- 실제 세금은 증권사, 계좌 유형, 개인 상황에 따라 달라질 수 있으므로 화면에 “예상값” 고지를 표시합니다.
- 세율은 코드에 하드코딩하지 말고 `tax_policies` 테이블로 분리할 수 있습니다.

---

## 10.3 tax_policies 선택 테이블

MVP 초반에는 생략 가능하지만, 확장성을 위해 아래 테이블을 권장합니다.

```sql
create table tax_policies (
  id uuid primary key default gen_random_uuid(),
  account_type text not null,
  country text not null default 'JP',
  tax_rate numeric(8,6) not null,
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now()
);
```

---

# 11. 알림 설계

## 11.1 알림 유형

| type | 설명 |
|---|---|
| yield_target | 목표 배당수익률 도달 |
| dividend_increase | 증배 |
| dividend_decrease | 감배 |
| no_dividend | 무배 |
| special_dividend | 특별배당 |
| data_update | 배당 데이터 업데이트 |

배당 변경 알림(`dividend_increase`, `dividend_decrease`, `no_dividend`, `special_dividend`)은 MVP에서 해당 종목을 active holding으로 보유한 사용자에게만 생성합니다. `deleted_at`이 설정된 보유 정보와 목표수익률 룰만 설정한 미보유 사용자는 대상에서 제외합니다.

---

## 11.2 알림 처리 방식

### MVP 1차

```text
앱 내 알림만 구현
notifications 테이블에 insert
알림 목록 화면에서 조회
```

### MVP 2차

```text
Resend로 이메일 알림 추가
send-email-notification Edge Function 사용
```

---

## 11.3 목표수익률 알림 평가 흐름

```text
GitHub Actions Cron
  ↓
evaluate-notification-rules Edge Function 호출
  ↓
active notification_rules 조회
  ↓
stocks.current_price 기준 수익률 계산
  ↓
조건 만족 여부 확인
  ↓
notifications insert
  ↓
notify_email = true이면 email job 생성
```

---

# 12. 외부 데이터 수집 설계

## 12.1 MVP 방식

초기에는 완전 자동화를 목표로 하지 않고, 아래 순서로 단계화합니다.

| 단계 | 방식 |
|---|---|
| 1단계 | CSV 또는 수동 입력으로 종목/배당 데이터 등록 |
| 2단계 | TDnet 공시 메타데이터 수집 |
| 3단계 | 공시 원문 저장 |
| 4단계 | PDF/XBRL 파싱 |
| 5단계 | 관리자 검수 후 사용자 화면 반영 |

---

## 12.2 GitHub Actions Cron 예시

```yaml
name: Collect Dividend Data

on:
  schedule:
    - cron: "0 21 * * *"
  workflow_dispatch:

jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - name: Call Supabase Edge Function
        run: |
          curl -X POST "$SUPABASE_FUNCTION_URL/collect-disclosures" \
            -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

---

# 13. 관리자 검수 설계

## 13.1 MVP 관리자 도구

| 기능 | MVP 구현 |
|---|---|
| 검수 목록 보기 | Supabase Studio에서 dividend_reviews 필터 |
| 추출값 수정 | Supabase Studio에서 직접 수정 |
| 승인 | approve-dividend-review Edge Function |
| 거절 | reject-dividend-review Edge Function |
| 원문 보기 | disclosures.storage_path 확인 |

---

## 13.2 추후 Admin 화면

Next.js에 `/admin` 라우트를 추가합니다.

```text
/admin/dividend-reviews
/admin/disclosures
/admin/jobs
```

단, MVP 1차에서는 Supabase Studio로 충분합니다.

---

# 14. 파일 저장 설계

## 14.1 Supabase Storage Bucket

| Bucket | 용도 | Public |
|---|---|---|
| disclosures | 공시 원문 PDF/XBRL | No |
| exports | 관리자 CSV Export | No |

## 14.2 파일 접근 정책

| 사용자 | 접근 |
|---|---|
| User | 원문 직접 접근 불가, 출처/공시일만 조회 |
| Admin | Signed URL로 원문 접근 |
| System | Edge Function에서 업로드/다운로드 |

---

# 15. Next.js 연동 구조

## 15.1 추천 폴더 구조

```text
src/
  app/
    auth/
      login/
      signup/
    app/
      home/
      portfolio/
      portfolio/new/
      portfolio/[holdingId]/edit/
      calendar/
      notifications/
      settings/
    admin/
      dividend-reviews/
  components/
  features/
    auth/
    holdings/
    dividends/
    notifications/
    stocks/
  lib/
    supabase/
      client.ts
      server.ts
    validators/
  types/
```

---

## 15.2 Supabase Client

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

---

## 15.3 Server Component에서 조회

```ts
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_home_summary", {
    p_year: new Date().getFullYear()
  });

  return (
    <main>
      <h1>홈</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </main>
  );
}
```

---

# 16. 환경 변수

## 16.1 Next.js

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=
```

## 16.2 Edge Functions

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
TDNET_BASE_URL=
PRICE_API_BASE_URL=
PRICE_API_KEY=
```

### 주의

`SUPABASE_SERVICE_ROLE_KEY`는 절대 프론트엔드에 노출하면 안 됩니다.

---

# 17. 보안 설계

## 17.1 필수 보안 항목

| 항목 | 방식 |
|---|---|
| 인증 | Supabase Auth |
| 인가 | RLS |
| 관리자 권한 | profiles.role = admin |
| 사용자 데이터 보호 | user_id = auth.uid() 정책 |
| 민감 키 보호 | Edge Function 환경 변수 |
| 파일 보호 | Private Bucket + Signed URL |
| SQL Injection 방지 | Supabase Client / RPC 파라미터 사용 |
| 투자 추천 오해 방지 | 알림 문구에 매수/매도 추천 아님 표시 |

---

## 17.2 관리자 API 보호

관리자용 Edge Function은 반드시 다음 검증을 합니다.

```text
1. JWT 검증
2. auth.uid() 추출
3. profiles 테이블에서 role 확인
4. role !== admin이면 403 반환
```

---

# 18. 성능 설계

## 18.1 MVP에서는 캐시 없이 시작

MVP 초기에는 Redis 없이도 충분합니다.

| 화면 | 처리 방식 |
|---|---|
| 홈 | RPC 계산 |
| 포트폴리오 | holdings + stocks join |
| 캘린더 | RPC 계산 |
| 알림 | notifications select |
| 종목 검색 | stocks ILIKE |

---

## 18.2 성능이 느려질 때 개선 순서

1. 인덱스 추가
2. PostgreSQL View 추가
3. Materialized View 추가
4. Supabase Pro 전환
5. Cloudflare Cache 일부 적용
6. Redis 또는 별도 API 서버 도입 검토

---

# 19. 인덱스 설계

```sql
create index idx_stocks_ticker on stocks(ticker);
create index idx_stocks_name on stocks(name);
create index idx_stocks_support_status on stocks(support_status);

create index idx_holdings_user_id on holdings(user_id);
create index idx_holdings_user_stock on holdings(user_id, stock_id);

create index idx_dividend_events_stock_year on dividend_events(stock_id, fiscal_year);
create index idx_dividend_events_payment_month on dividend_events(fiscal_year, expected_payment_month);
create index idx_dividend_events_review_status on dividend_events(review_status);

create index idx_notification_rules_user_id on notification_rules(user_id);
create index idx_notification_rules_status on notification_rules(status);

create index idx_notifications_user_created on notifications(user_id, created_at desc);
create index idx_notifications_user_status on notifications(user_id, status);

create index idx_dividend_reviews_status on dividend_reviews(status);
create index idx_jobs_status_run_after on jobs(status, run_after);
```

---

# 20. 개발 우선순위

## 20.1 MVP 1차

| 순서 | 작업 |
|---:|---|
| 1 | Next.js + Tailwind CSS 프로젝트 생성 |
| 2 | Supabase 프로젝트 생성 |
| 3 | Auth 설정 |
| 4 | DB 테이블 생성 |
| 5 | RLS 설정 |
| 6 | stocks seed 데이터 입력 |
| 7 | holdings CRUD 구현 |
| 8 | 세후 배당 계산 RPC 구현 |
| 9 | 홈 요약 RPC 구현 |
| 10 | 배당 캘린더 RPC 구현 |
| 11 | notifications 기본 구현 |
| 12 | Supabase Studio로 관리자 검수 운영 |

---

## 20.2 MVP 2차

| 순서 | 작업 |
|---:|---|
| 1 | notification_rules 구현 |
| 2 | 목표수익률 평가 Edge Function |
| 3 | Resend 이메일 발송 연동 |
| 4 | GitHub Actions Cron 설정 |
| 5 | disclosures 저장 |
| 6 | dividend_reviews 승인 Edge Function |
| 7 | 배당 변경 알림 생성 |

---

## 20.3 MVP 3차

| 순서 | 작업 |
|---:|---|
| 1 | `/admin` Next.js 관리자 화면 |
| 2 | TDnet 자동 수집 |
| 3 | PDF/XBRL 파싱 |
| 4 | Materialized View 최적화 |
| 5 | Cloudflare R2 또는 별도 Storage 검토 |
| 6 | 별도 백엔드 서버 도입 검토 |

---

# 21. 최종 추천 스택

## 21.1 확정 추천

| 영역 | 기술 |
|---|---|
| Frontend | Next.js |
| Styling | Tailwind CSS |
| Language | TypeScript |
| Auth | Supabase Auth |
| Database | Supabase PostgreSQL |
| API | Supabase PostgREST + RPC |
| Custom Backend | Supabase Edge Functions |
| Authorization | Supabase RLS |
| Storage | Supabase Storage |
| Admin | Supabase Studio |
| Scheduler | GitHub Actions Cron |
| Email | Resend |
| Error Tracking | Sentry |
| Queue | PostgreSQL jobs table |
| Cache | 없음, 필요 시 View/Materialized View |

---

## 21.2 MVP에서 제외할 것

| 제외 항목 | 이유 |
|---|---|
| NestJS/FastAPI 서버 | 서버 운영비와 구현 복잡도 증가 |
| Redis | MVP 트래픽에서는 불필요 |
| BullMQ/Celery | DB jobs 테이블로 대체 가능 |
| Kubernetes | MVP에 과함 |
| ECS/Fargate | 비용과 운영 복잡도 증가 |
| 별도 Admin 서버 | Supabase Studio로 대체 가능 |
| OpenSearch/Meilisearch | PostgreSQL 검색으로 시작 가능 |

---

# 22. 최종 결론

이 배당앱 MVP는 다음 구조가 가장 적합합니다.

```text
Frontend:
Next.js + Tailwind CSS + TypeScript

Backend:
Supabase Auth
+ Supabase PostgreSQL
+ Supabase RLS
+ Supabase RPC
+ Supabase Edge Functions
+ Supabase Storage

Operations:
GitHub Actions Cron
+ Resend
+ Sentry
+ Supabase Studio
```

이 구조는 **저렴하고**, **개발 속도가 빠르며**, **MVP 검증에 충분한 기능**을 제공합니다.

특히 현재 앱은 초기 단계에서 **홈 요약, 포트폴리오, 캘린더, 알림, 관리자 검수**가 핵심이므로, 별도 서버를 먼저 만들기보다 Supabase 중심으로 빠르게 구현하고, 사용자가 늘어난 뒤 NestJS/FastAPI 서버를 분리하는 전략이 가장 현실적입니다.
