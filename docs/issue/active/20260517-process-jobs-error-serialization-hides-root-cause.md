---
status: open
type: bug
created: 2026-05-17
resolved:
priority: high
labels: [bug, edge-function, observability, jobs, workflow]
---

# process-jobs 에러 직렬화가 실제 실패 원인을 숨김

## 개요 (Overview)

`process-jobs` Supabase Edge Function 이 예외를 500 응답으로 반환할 때, 응답 본문이 실제 에러 객체의 내용을 보존하지 못하고 `"[object Object]"` 로 축약된다. 이 때문에 GitHub Actions 워크플로우 [`Collect TDnet Disclosures`](/home/seo/projects/dividend-calendar-app/.github/workflows/collect-disclosures.yml) 의 `download` 단계가 실패해도, 호출자 로그에서는 어떤 Supabase 쿼리나 어떤 내부 예외가 문제였는지 확인할 수 없다. 실제 2026-05-17 수동 실행 run `25980133950` 에서 `download` 단계는 67회 iteration 까지 성공한 뒤 68번째 `process-jobs` 호출에서 실패했지만, GitHub Actions 로그에는 `{"error":"[object Object]"}` 만 남았다. 현재 상태에서는 동일 장애가 재발해도 원인 추적이 느리고, 운영자가 Supabase 함수 플랫폼 로그를 직접 열어 보지 않으면 코드 레벨 원인을 파악할 수 없다.

## 재현 방법 (Reproduction Steps)

1. GitHub Actions run [`Collect TDnet Disclosures #61`](https://github.com/seokwangwoo/dividend-calendar-app/actions/runs/25980133950) 를 연다.
2. `download` job (`76367416939`) 의 `Invoke process-jobs (download loop)` step 로그를 확인한다.
3. iteration 1~67 은 모두 `{"claimed":2,"completed":2,...}` 형태로 성공하는 것을 확인한다.
4. iteration 68 에서 로그가 `{"error":"[object Object]"}` 로 출력되고 step 이 `exit code 1` 로 종료되는 것을 확인한다.
5. [`supabase/functions/process-jobs/index.ts`](/home/seo/projects/dividend-calendar-app/supabase/functions/process-jobs/index.ts:70) 의 top-level `catch` 를 확인한다.
6. `error instanceof Error ? error.message : String(error)` 로 응답을 만들고 있어, plain object 또는 Supabase/PostgREST error object 가 들어오면 문자열이 `"[object Object]"` 로 축약되는 것을 확인한다.

## 예상 vs 실제 (Expected vs Actual)

### Current Values

| Context | Value |
|---------|-------|
| Workflow run | `25980133950` |
| Failed job | `download` (`76367416939`) |
| Failed step | `Invoke process-jobs (download loop)` |
| Last successful iteration | `67/100` |
| Failure log line | `[iteration 68/100] {"error":"[object Object]"}` |
| Workflow batch size | `PROCESS_BATCH_SIZE=2` |
| Workflow iteration input | `DOWNLOAD_ITERATIONS=500` |

### Root Data Comparison

| Source | Current Value | Expected Value | Notes |
|--------|---------------|----------------|-------|
| `process-jobs` HTTP 500 body | `{"error":"[object Object]"}` | 예: `{"error":"storage_upload_failed:...","details":{...}}` 또는 직렬화된 실제 필드 | 실패 원인 식별 가능해야 함 |
| `process-jobs/index.ts` top-level catch | `String(error)` fallback | object / Error / PostgREST error 모두 구조적으로 직렬화 | 호출자 로그 품질에 직접 영향 |
| Workflow step log | iteration 번호와 `[object Object]` 만 출력 | iteration 번호 + 실제 함수 오류 메시지/코드 | GitHub Actions 만으로 1차 진단 가능해야 함 |
| 운영자 조사 경로 | GitHub 로그만으로 불충분 | GitHub 로그만으로도 함수 실패 분류 가능 | 현재는 Supabase 플랫폼 로그 의존 |

## 기술적 원인 분석 (Technical Root Cause)

- [`supabase/functions/process-jobs/index.ts`](/home/seo/projects/dividend-calendar-app/supabase/functions/process-jobs/index.ts:70) 는 `processRunnableJobs()` 호출을 top-level `try/catch` 로 감싸고, 실패 시 아래 형태로 응답한다.

```ts
return jsonResponse(
  { error: error instanceof Error ? error.message : String(error) },
  500
);
```

- 여기서 `error` 가 native `Error` 인스턴스가 아니고 plain object, Supabase client error object, PostgREST error payload, 또는 nested cause 를 가진 구조체이면 `String(error)` 의 결과는 `"[object Object]"` 가 된다.
- GitHub Actions download loop 는 [`collect-disclosures.yml`](/home/seo/projects/dividend-calendar-app/.github/workflows/collect-disclosures.yml:150) 에서 각 `process-jobs` 응답 body 를 그대로 출력한다.

```js
const text = await response.text();
console.log(`[iteration ${i + 1}/${iterations}] ${text}`);
if (!response.ok) process.exit(1);
```

- 따라서 `process-jobs` 가 실제 예외를 충분히 직렬화하지 못하면, workflow 로그도 그대로 `"[object Object]"` 만 남긴다.
- 이번 run `25980133950` 의 download job 로그는 다음 순서로 동작했다.
  - iteration `1/100` ~ `67/100`: 모두 `claimed=2`, `completed=2`
  - iteration `68/100`: `{"error":"[object Object]"}`
  - step 종료: `Process completed with exit code 1`
- 같은 workflow run 에서 `collect` job 은 별도로 `{"code":"WORKER_RESOURCE_LIMIT","message":"Function failed due to not having enough compute resources (please check logs)"}` 를 남겼다. 이 차이는 `collect-disclosures` 쪽은 플랫폼이 구조화된 에러를 그대로 내려줬고, `process-jobs` 쪽은 애플리케이션 코드가 구조를 잃어버린 채 응답했다는 점을 보여준다.
- 현재 코드만으로는 68번째 iteration 의 실제 실패가 `jobs` 조회 오류인지, `claimJob` update 오류인지, `storage_upload_failed` 인지, 또는 Supabase client/network 예외인지 판단할 수 없다.

## 영향 범위 (Impact)

- **User experience**: 직접적인 사용자 화면 오류라기보다 운영 파이프라인 장애 분석 시간이 길어진다.
- **Affected screens**: 사용자 UI보다는 GitHub Actions `Collect TDnet Disclosures`, admin 운영 파이프라인, Edge Function 운영 모니터링 경로에 영향이 있다.
- **Tests**: 현재 테스트는 에러 문자열이 사람이 읽을 수 있는지 검증하지 않아, 구조화되지 않은 직렬화가 회귀로 남아 있다.
- **Data integrity**: 원본 데이터가 깨지는 문제는 아니지만, 실패 원인 미확인 상태에서 job 재실행/재시도 전략을 조정하기 어려워 운영 안정성에 악영향을 준다.

## 제안하는 해결 방향 (Proposed Solutions)

### 1. 구조화된 에러 직렬화 유틸 추가 (권장)

**Description**: `process-jobs/index.ts` 에서 top-level catch 전용 직렬화 함수를 추가해 `Error`, `JobHandlerError`, plain object, Supabase/PostgREST error object 를 모두 구조적으로 JSON 응답으로 변환한다. 최소한 `message`, `name`, `code`, `details`, `hint`, `stack`, `cause` 중 존재하는 필드를 선택적으로 포함한다.

**Pros**: 호출자 로그 품질이 즉시 개선된다. GitHub Actions, curl, 로컬 스크립트 어디서 호출하든 같은 형식으로 원인을 볼 수 있다.

**Cons / Risks**: 민감한 내부 정보나 SQL 텍스트를 외부 응답에 과도하게 노출하지 않도록 필드 선별이 필요하다.

**Recommended?**: 예. 가장 직접적이고 재현 가능한 개선이다.

### 2. 에러 응답은 간결하게 유지하고 서버 로그를 강화

**Description**: HTTP 응답에는 사람이 읽을 수 있는 `message` 와 분류용 `code` 만 담고, 상세 object 는 `console.error(JSON.stringify(...))` 로 Edge Function 로그에만 구조적으로 남긴다. GitHub Actions 에서는 `message` 만 보이되, Supabase 로그에서 full object 를 추적한다.

**Pros**: 외부 응답에 내부 구조를 과도하게 노출하지 않는다. 보안/노출 면에서 더 보수적이다.

**Cons / Risks**: GitHub Actions 로그만으로는 여전히 정보가 제한된다. 운영자가 플랫폼 로그를 열어야 하는 조사 단계가 남는다.

**Recommended?**: 부분적으로만 적합하다. GitHub Actions 중심 운영이라면 1안보다 디버깅 효율이 낮다.

### 3. workflow 호출자에서 500 응답 wrapper 를 추가 파싱

**Description**: `.github/workflows/collect-disclosures.yml` 의 `download` loop 에서 응답 body 를 JSON parse 한 뒤, `error`, `message`, `details` 키를 우선적으로 출력하도록 wrapper 를 추가한다.

**Pros**: 호출자 로그 가독성이 좋아진다.

**Cons / Risks**: 서버가 이미 `"[object Object]"` 를 내려주면 workflow 쪽에서 복구할 수 없다. 근본 원인은 남는다.

**Recommended?**: 아니오. 보조 개선은 가능하지만, 서버 직렬화 수정이 먼저다.

## 관련 파일 (Related Files)

- [`supabase/functions/process-jobs/index.ts`](/home/seo/projects/dividend-calendar-app/supabase/functions/process-jobs/index.ts) — top-level error catch 및 HTTP 500 응답 생성
- [`supabase/functions/_shared/process-jobs.ts`](/home/seo/projects/dividend-calendar-app/supabase/functions/_shared/process-jobs.ts) — `JobHandlerError`, `normalizeJobError()`
- [`.github/workflows/collect-disclosures.yml`](/home/seo/projects/dividend-calendar-app/.github/workflows/collect-disclosures.yml) — `download` loop 가 `process-jobs` 응답 body 를 그대로 출력
- GitHub Actions run `25980133950` — `download` job `76367416939` 에서 iteration 68 실패

## 라벨 제안 (Suggested Labels)

- `bug`
- `edge-function`
- `observability`
- `jobs`
- `workflow`
