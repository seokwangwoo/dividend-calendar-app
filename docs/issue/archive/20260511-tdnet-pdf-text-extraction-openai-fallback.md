---
status: resolved
type: bug
created: 2026-05-11
resolved: 2026-05-11
priority: high
labels: [pdf-ai, openai, edge-function]
---

# TDnet PDF 텍스트 추출 개선 및 OpenAI fallback 입력 방식 수정 필요

## 개요 (Overview)

`process-jobs`의 `parse_disclosure_pdf_ai` 경로가 TDnet PDF를 충분히 안정적으로 텍스트 추출하지 못할 때 `direct_pdf_fallback`으로 내려가고, 이 fallback이 현재 OpenAI Responses API에서 거부되는 입력 형식으로 호출됩니다. 그 결과 `process-jobs`가 `parse_disclosure_pdf_ai` job을 완료하지 못하고 반복 재시도 상태로 돌리며, PDF 기반 배당 파싱 파이프라인이 막힙니다.

실제 실패 사례를 확인한 결과, 문제는 “PDF 자체가 텍스트가 없다”는 것이 아니라 현재 커스텀 extractor가 TDnet PDF의 압축 스트림/구조를 해석하지 못해서 추출 결과가 0글자로 떨어진다는 점입니다.

## 재현 방법 (Reproduction Steps)

1. `OPENAI_API_KEY`를 설정한 상태에서 `process-jobs` Edge Function을 호출합니다.
2. PDF 다운로드까지 완료된 `parse_disclosure_pdf_ai` job이 pending 상태로 존재하도록 둡니다.
3. 다음 명령을 실행합니다.

```bash
curl -s -X POST "${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-jobs" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"batch_size":5}'
```

4. 응답에서 `parse_disclosure_pdf_ai` job이 `retried`로 남고, 에러가 `openai_call_failed:openai_request_failed:http_400:... Invalid value: 'input_file' ...` 형태로 반환되는지 확인합니다.

### 실제 조사 결과

- 실패한 `parse_disclosure_pdf_ai` job:
  - `ede1c591-8d5d-45b3-925d-799bc535f037`
  - `56187ddf-e4e1-44e8-811e-ff0dc0940735`
- 연결된 disclosure:
  - `f38ad1dc-21a1-4197-8ea6-2447a3292ed2`
    - `2026年３月期 決算短信〔日本基準〕（連結）`
    - 저장 경로: `disclosures/75700/2026-05-11/1245368.pdf`
  - `50a85bdf-dc83-467c-978a-2bc18ada593a`
    - `2027年３月期配当予想（11期連続の増配）に関するお知らせ`
    - 저장 경로: `disclosures/75700/2026-05-11/1245369.pdf`
- 로컬 검증 결과:
  - `pdftotext`는 두 PDF 모두 정상적으로 일본어 본문을 출력했다.
  - 현재 코드의 `extractTextFromPdf()`를 그대로 적용하면 두 파일 모두 `rawLen: 0`이었다.
  - 즉, TDnet PDF에 텍스트가 없는 것이 아니라 현재 extractor가 본문을 복원하지 못하고 있다.

## 예상 vs 실제 (Expected vs Actual)

### Current Values

| Context | Value |
|---------|-------|
| `process-jobs` 결과 | `claimed: 2`, `completed: 0`, `retried: 2`, `failed: 0` |
| 실패한 job type | `parse_disclosure_pdf_ai` |
| 실패 메시지 | `openai_call_failed:openai_request_failed:http_400` |
| 문제 입력 | `input_file` |
| 다운로드된 PDF 파일 | `1245368.pdf`, `1245369.pdf` |
| `pdftotext` 결과 | 본문 정상 추출 |
| 현재 커스텀 extractor 결과 | `rawLen: 0` |

### Root Data Comparison

| Table / Column | Value A | Value B | Notes |
|----------------|---------|---------|-------|
| `jobs.status` | `pending` → `processing` → `pending` | `pending` → `processing` → `failed` | 현재는 retryable 에러로 분류되어 다시 pending으로 돌아감 |
| `disclosures.parse_status` | `downloaded` / `parsing` | `parsed` | OpenAI 호출 실패로 parsed까지 도달하지 못함 |
| `disclosures.last_parse_error` | `openai_call_failed:...input_file...` | `null` | 실패 원인이 저장됨 |
| `extractTextFromPdf()` 출력 | `0` 글자 | 유효한 일본어 본문 | PDF 구조 해석 실패 |

## 기술적 원인 분석 (Technical Root Cause)

- `supabase/functions/_shared/pdf-ai-parser.ts`의 `executeParseDisclosurePdfAi()`는 PDF 텍스트 추출 품질이 낮을 때 `direct_pdf_fallback`을 선택합니다.
- `supabase/functions/_shared/pdf-ai-parser.ts`의 `extractTextFromPdf()`는 PDF 전체 바이트를 Latin-1 문자열로 바꾼 뒤 `BT...ET` / `Tj` / `TJ` 패턴을 정규식으로 찾습니다.
- 이번에 내려받은 TDnet PDF는 `FlateDecode` 압축 스트림과 `ObjStm`를 사용하고 있었고, 이 방식으로는 본문을 복원하지 못해 `rawLen: 0`이 나왔습니다.
- `supabase/functions/process-jobs/index.ts`의 `callOpenAIResponsesApi()`는 이 fallback에서 `input_file`을 포함한 요청 본문을 만들어 OpenAI Responses API로 보냅니다.
- 실제 실행에서는 OpenAI가 `input_file` 값을 거부하고 HTTP 400을 반환합니다.
- `executeParseDisclosurePdfAi()`는 이 오류를 `openai_call_failed:...`로 감싸고, `process-jobs` 러너는 이를 retryable 오류로 해석해 job을 `retried` 상태로 되돌립니다.
- 관련 코드:
  - [`supabase/functions/_shared/pdf-ai-parser.ts`](/home/seo/OneDrive/linux/projects/dividend-calendar-app/supabase/functions/_shared/pdf-ai-parser.ts)
  - [`supabase/functions/process-jobs/index.ts`](/home/seo/OneDrive/linux/projects/dividend-calendar-app/supabase/functions/process-jobs/index.ts)
  - [`supabase/functions/_shared/process-jobs.ts`](/home/seo/OneDrive/linux/projects/dividend-calendar-app/supabase/functions/_shared/process-jobs.ts)

## 영향 범위 (Impact)

- **User experience**: TDnet 공시가 `dividend_reviews`로 넘어가지 않아 관리자 승인 흐름이 멈춥니다.
- **Affected screens**: `/admin/dividend-reviews`, `/admin/disclosures`, 그리고 승인 이후에만 갱신되는 사용자 home/calendar/notifications 경로.
- **Tests**: `process-jobs` 관련 E2E/통합 테스트에서 실제 OpenAI 호출이 실패하면 재시도 루프가 발생합니다.
- **Data integrity**: 공시가 다운로드된 뒤에도 review 후보가 생성되지 않아 파이프라인이 중간에서 정체됩니다.

## 해결 내용 (Resolution)

- TDnet PDF 텍스트 추출을 `pdfjs-dist` 기반으로 교체해, 압축 스트림과 object stream이 있는 실제 TDnet PDF에서도 본문을 안정적으로 읽도록 수정했습니다.
- `direct_pdf_fallback`은 OpenAI가 지원하는 PDF file input 형식으로 유지하되, PDF 처리 시에는 `gpt-4o-mini`를 기본 fallback 모델로 사용하도록 분리했습니다.
- `process-jobs`와 `pdf-ai-parser` 단위 테스트를 통과시켜 텍스트 추출 경로와 PDF fallback 모델 선택을 검증했습니다.

## 제안하는 해결 방향 (Proposed Solutions)

### 1. TDnet PDF 텍스트 추출 강화 후 fallback 의존도 축소

**Description**: `prepareTextForAI()`와 관련 텍스트 추출/섹션 트리밍 로직을 개선해서, 일반적인 TDnet PDF는 extracted text 경로로 처리되게 만듭니다. 현재처럼 raw bytes를 `BT...ET` 패턴으로 직접 훑는 방식 대신, 압축 스트림/객체 스트림을 해석할 수 있는 추출 방식으로 바꿉니다. fallback은 예외적인 경우로 줄입니다.

**Pros**:
- OpenAI 호출 형식 문제를 우회하는 가장 안정적인 방향입니다.
- 모델 입력이 텍스트 중심으로 고정되어 검증과 테스트가 단순해집니다.
- 비용과 실패율을 함께 줄일 수 있습니다.

**Cons / Risks**:
- 텍스트 추출 품질 개선 범위가 넓을 수 있습니다.
- 이미지 기반 PDF나 특이한 인코딩 PDF는 여전히 별도 대응이 필요할 수 있습니다.

**Recommended?**: 예. 먼저 이 경로를 강화하는 것이 우선입니다.

### 2. fallback을 OpenAI가 실제 지원하는 파일 입력 방식으로 변경

**Description**: 텍스트 추출이 충분하지 않을 때만 OpenAI가 실제 지원하는 파일 입력 방식으로 사용하도록 바꾸고, 현재의 `input_file` 요청 구조는 제거합니다. fallback은 `Responses API`가 허용하는 file input 형태에 맞춰 다시 설계합니다.

**Pros**:
- 텍스트 추출 실패 케이스를 완전히 버리지 않고 처리할 수 있습니다.
- 이미지/레이아웃이 복잡한 PDF에 대한 복원력을 확보할 수 있습니다.

**Cons / Risks**:
- 파일 입력 방식은 현재 Responses API 요청 구조와 정확히 맞춰야 하며, 구현/검증 비용이 있습니다.
- 텍스트 경로와 fallback 경로 두 가지를 모두 유지해야 하므로 테스트 범위가 넓어집니다.

**Recommended?**: 보조안. 텍스트 추출 개선 후에도 남는 실패 케이스를 처리하는 용도로 유지합니다.

## 관련 파일 (Related Files)

- [`supabase/functions/_shared/pdf-ai-parser.ts`](/home/seo/OneDrive/linux/projects/dividend-calendar-app/supabase/functions/_shared/pdf-ai-parser.ts) — PDF 텍스트 추출, fallback 판단, AI 입력 생성
- [`supabase/functions/process-jobs/index.ts`](/home/seo/OneDrive/linux/projects/dividend-calendar-app/supabase/functions/process-jobs/index.ts) — OpenAI 호출 및 job handler wiring
- [`supabase/functions/_shared/process-jobs.ts`](/home/seo/OneDrive/linux/projects/dividend-calendar-app/supabase/functions/_shared/process-jobs.ts) — retry/final-failure 분기
- [`tests/e2e/system-pipeline.spec.ts`](/home/seo/OneDrive/linux/projects/dividend-calendar-app/tests/e2e/system-pipeline.spec.ts) — collect/process job E2E
- [`docs/manual-e2e-guide.md`](/home/seo/OneDrive/linux/projects/dividend-calendar-app/docs/manual-e2e-guide.md) — 수동 검증 참고

## 라벨 제안 (Suggested Labels)

- `bug`
- `pdf-ai`
- `openai`
- `edge-function`
- `high-priority`
