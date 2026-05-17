---
status: open
type: bug
created: 2026-05-17
resolved:
priority: high
labels: [pdf-ai, openai, table-extraction, edge-function]
---

# 공시 배당표 斜線(대각선) 셀로 인한 AI 파서 컬럼 정렬 오류

## 개요 (Overview)

일본 상장사의 "配当予想の修正" 공시에는 1株当たり配当金 표가 포함되어 있고, 표의 각 행(前回予想 / 今回修正予想 / 当期実績 / 前期実績)은 第2四半期末 · 期末 · 年間 세 컬럼 구조를 갖습니다. 이미 지급이 끝났거나 의미가 없는 셀은 PDF에서 **대각선(斜線, "/" 빗금)** 으로 표시되며, 텍스트가 존재하지 않습니다.

현재 `supabase/functions/_shared/pdf-ai-parser.ts`와 `pdf-table-extractor.ts` 조합은 이 빈 셀의 위치를 안정적으로 보존하지 못해, 빗금 셀이 행 가운데/앞쪽에 있을 때 AI가 남은 숫자를 **왼쪽 컬럼부터 채워 넣는 형태로 잘못 파싱**하는 사례가 발생합니다. 예시 입력에서는 `今回修正予想 31円 55円` 행을 "중간배당 31円 / 기말배당 55円"으로 잘못 추출했지만, 실제 의미는 "중간배당 N/A / 기말배당 31円 / 연간 55円"입니다. `dividend_reviews` 단계에서 잘못된 값이 운영자에게 그대로 노출됩니다.

## 재현 방법 (Reproduction Steps)

1. 아래와 같이 第2四半期末 컬럼이 일부 행에서 斜線으로 표시된 "配当予想の修正" 공시 PDF를 받아 `disclosures` 에 등록한다 (예: 期末 / 年間만 수정하는 케이스).
2. `process-jobs` → `parse_disclosure_pdf_ai` 가 실행되어 `pdf-ai-parser.ts`의 `executeParseDisclosurePdfAi()` 가 호출되도록 한다.
3. `/admin/dividend-reviews` 에서 해당 공시의 review row(s) 를 확인한다.

문제 입력 예시 (사용자가 PDF에서 복사해 온 본문 발췌):

```
                                     記


１. 配当予想の修正について
                                         1 株当り配当金(円)
                         第 2 四半期末              期末              年間
      前    回   予   想                         26 円 00 銭       50 円 00 銭
      今 回 修 正 予 想                            31 円 00 銭       55 円 00 銭
      当    期   実   績     24 円 00 銭
     （ご参考）
     前    期    実   績
                         22 円 50 銭           22 円 50 銭       45 円 00 銭
      （2025 年 3 月期）
```

위 표에서 사람이 읽을 때의 의미:

| 행 | 第2四半期末 (中間) | 期末 | 年間 |
|----|------------------|------|------|
| 前回予想 | 斜線 (N/A) | 26円00銭 | 50円00銭 |
| 今回修正予想 | 斜線 (N/A) | **31円00銭** | **55円00銭** |
| 当期実績 | 24円00銭 | 斜線 (미발생) | 斜線 (미발생) |
| 前期実績 | 22円50銭 | 22円50銭 | 45円00銭 |

## 예상 vs 실제 (Expected vs Actual)

### Current Values (今回修正予想 행)

| 필드 | 잘못 파싱된 값 | 올바른 값 |
|------|---------------|----------|
| `event_type` (1) | `interim` | `year_end` |
| `dividend_per_share` (1) | 31 | 31 |
| `event_type` (2) | `year_end` | `annual_total` |
| `dividend_per_share` (2) | 55 | 55 |
| 누락된 이벤트 | — | year_end 31円 + annual_total 55円을 분리하되, interim 은 N/A로 두어야 함 |

> 잘못된 케이스에서는 31円이 중간배당으로 들어가 사용자의 캘린더/홈 화면에 거짓 중간배당이 표시될 수 있습니다.

### Root Data Comparison

| Source | 中間 | 期末 | 年間 |
|--------|------|------|------|
| PDF 원본 (육안) | 斜線 | 31円 | 55円 |
| `pdf-table-extractor.ts` 출력 (이론상 정상) | 빈 셀 `\| \|` | `\| 31円00銭 \|` | `\| 55円00銭 \|` |
| 실제 AI 출력 (오류 발생 시) | 31円 | 55円 | (누락) |

## 기술적 원인 분석 (Technical Root Cause)

### 1. 斜線(N/A) 셀은 텍스트가 없다

- 斜線으로 표시된 셀은 PDF 컨텐츠 스트림에 텍스트 객체(`Tj`/`TJ`)를 만들지 않습니다.
- 따라서 `pdfjs-dist`의 `getTextContent()` 결과에서 해당 셀은 `PositionedTextItem` 자체가 존재하지 않습니다.
- (`supabase/functions/_shared/pdf-ai-parser.ts:643-651`에서 PDF.js 텍스트 아이템만 수집함)

### 2. 컬럼 anchor 가 항상 4개로 잡힌다는 보장이 없다

- `supabase/functions/_shared/pdf-table-extractor.ts:71-101` 의 `detectColumnAnchors()` 는 **2개 이상의 행에서 같은 x 좌표 클러스터가 등장**해야 anchor 로 인정합니다 (`MIN_TABLE_ROWS = 2`).
- 위 표에서 第2四半期末 컬럼에 텍스트가 있는 행은 **当期実績 (24円)** 과 **前期実績 (22.5円)** 단 두 줄뿐입니다. 한 줄이라도 누락되면(예: `前期実績` 라벨이 별도 행에 떨어져 데이터 행과 y 좌표가 어긋남) 해당 anchor 는 사라지고, 표 출력은 **3컬럼**(label + 期末 + 年間)으로 축소됩니다.
- 그 결과 markdown 표가 다음과 같이 변형됩니다:
  ```
  | 今回修正予想 | 31円00銭 | 55円00銭 |
  ```
  AI 가 이 행을 보면 컬럼 헤더가 무엇이었는지 알 수 없어 "왼쪽이 中間, 다음이 期末" 으로 추측합니다.

### 3. `前期実績` 라벨이 별도 행에 표시되는 레이아웃

- 본 예시 PDF 에서는 "前期実績" 텍스트와 "22円50銭 22円50銭 45円00銭" 데이터 행이 서로 다른 줄에 있습니다.
- `groupIntoRows()` 는 `Y_TOLERANCE = 4` 안에서만 같은 행으로 묶기 때문에, 라벨이 빠진 숫자만의 행이 생성됩니다.
- 이 경우 같은 컬럼 anchor 가 "라벨 없는 행" 에서만 보이게 되어, anchor 인식이 **약화**되거나 라벨 컬럼에 다른 셀이 정렬되어 들어갑니다.

### 4. AI 프롬프트에 斜線/빈 셀 처리 규칙이 없다

- 현재 프롬프트(`supabase/functions/_shared/pdf-ai-parser.ts:378-502`)는 "当期実績 / 前回予想 / 今回予想 / 修正予想 / 前期実績 을 구분" 하라고 안내하지만, **빈 컬럼이 있는 행에서 숫자 순서가 줄어드는 경우** 어떻게 컬럼 정렬을 유지해야 하는지 명시하지 않습니다.
- 또한 "중간 / 기말 / 연간" 세 칼럼이 정해진 순서임을 알려주지 않아, AI 가 행의 숫자 개수에 따라 좌측부터 채우는 경향을 보입니다.
- legacy fallback 경로(`extractTextFromPdfLegacy()`)로 떨어지면 모든 토큰이 공백 join 되어 컬럼 구조가 완전히 사라지고, 이 오류 가능성이 더 높아집니다.

### 5. 검증 단계에서 잡히지 않음

- `validateAiOutput()` 는 enum / 범위만 검사하므로 31円을 "중간배당" 으로 받아도 통과합니다.
- `parser-fixtures.test.ts` 의 `Fixture: 配当予想の修正` 는 단일 行 / 단일 이벤트 케이스만 다루어, 斜線이 섞인 3컬럼 표는 회귀 테스트로 들어가 있지 않습니다.

## 영향 범위 (Impact)

- **User experience**:
  - `/admin/dividend-reviews` 에서 운영자가 잘못된 컬럼으로 들어간 값을 승인할 가능성. 승인 시 `dividend_events` / `stocks.next_dividend_*` 에 잘못된 중간배당이 기록됩니다.
  - 사용자 캘린더/홈 화면에 실제로 존재하지 않는 "중간배당 31円" 이벤트가 노출될 수 있습니다.
- **Affected screens / pipelines**:
  - `/admin/dividend-reviews`, `/admin/dividend-reviews/[eventId]`
  - `/admin/disclosures`
  - 승인 이후 `events` 기반 home / calendar / notifications
- **Tests**:
  - `parser-fixtures.test.ts` 와 `pdf-ai-parser.test.ts` 에 斜線/N/A 셀 케이스가 없어 회귀 시 알람이 울리지 않습니다.
- **Data integrity**:
  - 원본 PDF 는 정확하지만 AI 추출 결과만 어긋나는 케이스로, **계산이 아니라 추출이 잘못된** 종류의 데이터 정합성 문제입니다.

## 제안하는 해결 방향 (Proposed Solutions)

### 1. (권장) 프롬프트에 "고정 컬럼 순서 + 빈 셀 = null" 규칙을 명시

**Description**:
- `buildDividendExtractionPrompt()` (`supabase/functions/_shared/pdf-ai-parser.ts:370-502`) 에 다음 규칙을 추가:
  - 배당표는 항상 `第2四半期末(=interim) → 期末(=year_end) → 年間(=annual_total)` 순서다.
  - 행 안의 숫자가 1~2개라면 **왼쪽부터 채우지 말고**, evidence_text 와 라벨을 기준으로 어느 컬럼인지 판단한다.
  - 판단이 불가능하면 `dividend_per_share = null` 로 두고 `warnings` 에 기록한다.
  - 斜線, "－", "─", 빈 셀은 모두 "해당 없음(N/A)" 으로 해석한다.
- 동시에 markdown 표 출력 시 빈 셀이 `| |` 로 명시되도록 `formatAsMarkdownTable()` 의 출력 포맷을 강화하여 AI 가 컬럼 위치를 추론하기 쉽게 만든다 (현재도 빈 셀은 `| |` 로 들어가지만, anchor 가 누락되면 그 칼럼 자체가 사라짐).

**Pros**:
- 모델 자체 동작을 바꾸지 않고 텍스트/프롬프트 레벨에서 해결.
- 다른 케이스(증감 표 등 다른 양식)에도 일반화하기 쉬움.
- 회귀 테스트 추가가 단순함 (입력 텍스트 + mocked AI 응답 형태).

**Cons / Risks**:
- 프롬프트만으로는 100% 보장이 어려우므로, 검증 단계에서의 보완이 필요함.
- 프롬프트 길이가 늘어 토큰 비용이 약간 증가.

**Recommended?**: 예. 가장 빠르고 단순한 1차 방어선입니다.

### 2. `pdf-table-extractor.ts` 에서 빈 셀 자리 표시자(placeholder) 삽입

**Description**:
- `detectColumnAnchors()` 가 `MIN_TABLE_ROWS = 2` 미만이라도 헤더 행에서 명시적으로 등장하는 컬럼은 anchor 로 강제 등록.
- `formatAsMarkdownTable()` 출력 시 빈 셀에 `N/A` 또는 `斜線` 같은 placeholder 를 넣어 AI 입장에서 컬럼 수가 보존된 것이 명확히 보이도록 변경.
- 헤더 행 텍스트(예: "第2四半期末", "期末", "年間") 를 발견하면 해당 행을 anchor 정의로 우선 사용.

**Pros**:
- 텍스트 출력만 봐도 사람이 즉시 컬럼 구조를 알 수 있음 → 디버깅 용이.
- AI 프롬프트와 결합하면 오류 확률을 더 낮출 수 있음.

**Cons / Risks**:
- 헤더 검출 로직이 일본어 패턴에 종속되어 일반화 어려움.
- `pdf-table-extractor.test.ts` 에 다양한 케이스를 새로 작성해야 함.
- placeholder 가 다른 의미로 해석될 위험 (예: AI 가 `N/A` 를 단어로 인식).

**Recommended?**: 보조안. 1번과 함께 적용하면 가장 안정적이지만, 단독 적용은 추천하지 않음.

### 3. `validateAiOutput()` 에 "표 행수 vs 추출 이벤트 일관성" 검사 추가

**Description**:
- AI 응답을 받은 후 evidence_text 와 disclosure 원문을 비교하여, "今回修正予想" 라인에 등장한 숫자가 응답의 dividend_per_share 와 의미적으로 일치하는지 확인.
- 일치도가 낮으면 `status = needs_manual_check` 로 강제 분류하여 운영자 검수를 유도.

**Pros**:
- AI 가 일부 오류를 내더라도 검수 흐름에서 잡힘.
- 잘못된 자동 승인을 차단 가능.

**Cons / Risks**:
- 검증 로직 자체가 복잡 (자연어 비교).
- false positive 증가 시 운영자 작업량이 늘어남.

**Recommended?**: 장기 보강안. 1번 적용 후에도 정확도가 부족할 때 추가 고려.

## 관련 파일 (Related Files)

- `supabase/functions/_shared/pdf-ai-parser.ts` — `buildDividendExtractionPrompt()` (Line 370-502), `extractTextWithPdfjs()` (Line 627-663), `validateAiOutput()`
- `supabase/functions/_shared/pdf-table-extractor.ts` — `detectColumnAnchors()` (Line 71-101), `formatAsMarkdownTable()` (Line 107-135), `extractStructuredPageText()` (Line 141-212)
- `src/features/disclosures/pdf-ai-parser.test.ts` — 메인 파서 테스트 (1235 lines)
- `src/features/disclosures/parser-fixtures.test.ts` — 공시 유형별 fixture, "Fixture: 配当予想の修正" 등 (Line 125-195)
- `src/features/disclosures/pdf-table-extractor.test.ts` — 표 추출기 테스트
- `src/app/admin/dividend-reviews/page.tsx`, `src/app/admin/dividend-reviews/[eventId]/page.tsx` — 운영자 검수 화면

## 라벨 제안 (Suggested Labels)

- `bug`
- `pdf-ai`
- `openai`
- `table-extraction`
- `data-consistency`
- `high-priority`
