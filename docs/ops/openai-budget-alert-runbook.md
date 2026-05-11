# OpenAI 예산 알림 대응 런북

## 목적

이 런북은 AI 파싱 예산이 허용 가능한 일일 한도를 초과하거나 예상치 못한 급증을 보일 때 대응 방법을 설명합니다.

## 증상

- `get_admin_disclosure_summary.total_ai_cost_usd`가 일일 상한을 초과함.
- 개별 공시당 `ai_parse_cost_usd`가 비정상적으로 높음 (예: PDF당 $0.05 초과).
- OpenAI 대시보드에 정상 수집 시간대 외의 사용량 급증이 표시됨.

## 일일 상한 기준

| 환경 | 소프트 상한 | 하드 상한 |
|---|---|---|
| 스테이징 | $5/일 | $10/일 |
| 프로덕션 | $20/일 | $50/일 |

> 런칭 후 실제 트래픽에 따라 이 값들을 조정하세요.

## 즉각적인 대응

### 1. 비필수 파싱 일시 중지

`parse-disclosure` Edge Function에서 `DAILY_AI_PARSE_CALL_CAP`을 0으로 설정:

```typescript
// supabase/functions/parse-disclosure/index.ts
const DAILY_AI_PARSE_CALL_CAP = 0;
```

재배포:

```bash
npx supabase functions deploy parse-disclosure
```

이렇게 하면 큐는 보존한 채 새로운 AI 파싱 작업이 중단됩니다.

### 2. 보유 종목만 우선 파싱

파싱을 계속하고 싶지만 사용자가 실제로 보유한 종목에 대해서만 하려면:

1. 보유 중인 종목 ID 조회:
   ```sql
   select distinct stock_id from holdings where deleted_at is null;
   ```
2. 보유하지 않은 종목에 대해 보류 중인 작업을 건 넘기거나, `process-jobs`에서 필터링합니다.

### 3. 일일 상한 조정

예산 문제가 해결되면 `DAILY_AI_PARSE_CALL_CAP`을 안전한 값으로 복원:

```typescript
const DAILY_AI_PARSE_CALL_CAP = 500; // 또는 적절한 한도
```

다시 재배포합니다.

## 근본 원인 확인

| 확인 항목 | 쿼리 / 조치 |
|---|---|
| 어떤 공시가 가장 많이 소비했는가? | `select id, title, ai_parse_input_tokens, ai_parse_output_tokens, ai_parse_cost_usd from disclosures where date(collected_at) = current_date order by ai_parse_cost_usd desc nulls last limit 20;` |
| 특정 종목이 과도한 공시를 생성하고 있는가? | `select stock_id, count(*) from disclosures where date(collected_at) = current_date group by stock_id order by count desc limit 10;` |
| 재시도로 인해 비용이 증가하고 있는가? | `select avg(ai_parse_attempts) from disclosures where date(collected_at) = current_date;` |

## 예방

- `parse-disclosure`에 `DAILY_AI_PARSE_CALL_CAP`을 하드 리미트로 설정.
- `get_admin_disclosure_summary.total_ai_cost_usd`가 소프트 상한의 80%를 초과할 때 Slack/이메일 알림 추가.
- 실패한 파싱은 즉시 재큐잉하지 말고 지수 백오프로 재시도.

## 에스컬레이션

상한 설정 후에도 비용이 계속 높다면:

1. 초기 파싱에 더 저렴한 모델 사용 (예: GPT-4o-mini).
2. 가능한 경우 여러 개의 짧은 PDF를 하나의 API 호출로 배치 처리.
3. `docs/issue/active/`에 해당 문제를 문서화.
