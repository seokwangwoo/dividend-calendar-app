# Stock Master Import 운영 매뉴얼

## 개요

JPX "List of TSE-listed Issues" 파일을 CSV로 변환하여 업로드하고, `parse-stock-master-csv` Edge Function을 호출하여 `stocks` 테이블을 갱신하는 절차입니다.

갱신 주기: 월 1회 (관리자 수동 실행)

---

## 1. JPX 파일 다운로드

### 1.1 다운로드 경로

JPX 웹사이트에서 "List of TSE-listed Issues"를 다운로드합니다.

- URL: https://www.jpx.co.jp/english/markets/statistics-equities/misc/01.html
- 또는: https://www.jpx.co.jp/markets/statistics-equities/misc/01.html (일본어)

### 1.2 파일 형식

- 원본: `.xlsx` (Excel)
- 필요 컬럼: 코드(티커), 銘柄名(종목명), 市場区分(시장구분)

---

## 2. Excel → CSV 변환

### 2.1 Excel에서 CSV 저장

1. Excel에서 `.xlsx` 파일을 엽니다.
2. **파일(File)** → **다른 이름으로 저장(Save As)** → **CSV UTF-8 (*.csv)** 선택
3. 파일명: `YYYYMMDD_list_of_tse_listed_issues.csv` (예: `20260511_list_of_tse_listed_issues.csv`)

> ⚠️ **주의**: 반드시 **CSV UTF-8** 형식으로 저장하세요. 일반 CSV는 Shift_JIS 인코딩으로 저장되어 한글이 깨질 수 있습니다.

### 2.2 CSV 헤더 변경

저장된 CSV의 첫 행(헤더)을 다음으로 변경합니다:

```csv
ticker,name,market_segment
```

예시:

```csv
ticker,name,market_segment
9433,KDDI,TSE Prime
2914,日本たばこ産業,TSE Prime
8306,三菱UFJフィナンシャル・グループ,TSE Prime
```

> ⚠️ **주의**: 헤더는 반드시 소문자 영어(`ticker,name,market_segment`)로 작성해야 합니다.

---

## 3. Supabase Storage에 업로드

### 3.1 접속

1. Supabase Studio (https://supabase.com/dashboard)에 로그인
2. 해당 프로젝트 선택
3. 왼쪽 메뉴 **Storage** 클릭

### 3.2 버킷 선택

- 버킷: `imports` (없으면 관리자가 미리 생성)
- 경로: `stock-master/`

### 3.3 파일 업로드

1. `stock-master/` 폴더로 이동
2. **Upload file** 클릭
3. 변환한 CSV 파일 선택
4. 업로드 완료 확인

### 3.4 파일 경로 규칙

```
imports/stock-master/YYYYMMDD_list_of_tse_listed_issues.csv
```

예시:
```
imports/stock-master/20260511_list_of_tse_listed_issues.csv
```

---

## 4. Edge Function 호출

### 4.1 호출 정보

- **Function URL**: `{SUPABASE_URL}/functions/v1/parse-stock-master-csv`
- **Method**: `POST`
- **Authentication**: `Bearer {SUPABASE_SERVICE_ROLE_KEY}` 또는 Admin JWT

### 4.2 요청 본문 (Dry Run)

먼저 dry-run 모드로 실행하여 변경 내용을 미리 확인합니다:

```json
{
  "storagePath": "stock-master/20260511_list_of_tse_listed_issues.csv",
  "dryRun": true
}
```

curl 예시:

```bash
curl -X POST "{SUPABASE_URL}/functions/v1/parse-stock-master-csv" \
  -H "Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "storagePath": "stock-master/20260511_list_of_tse_listed_issues.csv",
    "dryRun": true
  }'
```

### 4.3 Dry Run 응답 예시

```json
{
  "dryRun": true,
  "summary": {
    "processed": 3847,
    "toInsert": 12,
    "toUpdate": 35,
    "toDelist": 3
  },
  "preview": {
    "inserts": [{ "ticker": "9999", "name": "新規上場株式会社", "market_segment": "TSE Growth" }],
    "updates": [{ "ticker": "9433", "name": "KDDI", "market_segment": "TSE Prime" }],
    "delists": [{ "ticker": "0001", "name": "廃止株式会社" }]
  }
}
```

> 미리보기를 확인하여 예상치 못한 대량 변경이 없는지 검증합니다.

### 4.4 실제 실행

Dry Run 결과가 정상이면 `dryRun: false`로 다시 호출:

```json
{
  "storagePath": "stock-master/20260511_list_of_tse_listed_issues.csv",
  "dryRun": false
}
```

curl 예시:

```bash
curl -X POST "{SUPABASE_URL}/functions/v1/parse-stock-master-csv" \
  -H "Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "storagePath": "stock-master/20260511_list_of_tse_listed_issues.csv",
    "dryRun": false
  }'
```

### 4.5 실제 실행 응답 예시

```json
{
  "dryRun": false,
  "summary": {
    "processed": 3847,
    "inserted": 12,
    "updated": 35,
    "delisted": 3,
    "failed": 0,
    "durationMs": 4500
  },
  "logId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

---

## 5. 실행 결과 확인

### 5.1 stock_import_logs 테이블 조회

Supabase Studio → SQL Editor에서:

```sql
select * from stock_import_logs
order by created_at desc
limit 5;
```

### 5.2 stocks 테이블 확인

```sql
select support_status, count(*) from stocks
group by support_status;
```

예상 결과:
```
 support_status | count
----------------+-------
 supported      |    42
 unsupported    |  3802
 delisted       |     3
```

### 5.3 기존 데이터 무결성 확인

```sql
-- 외래 키가 깨진 holdings가 있는지 확인
select count(*) from holdings h
left join stocks s on s.id = h.stock_id
where s.id is null;
```

결과가 `0`이어야 합니다.

---

## 6. 문제 발생 시 대응

### 6.1 잘못된 CSV 업로드

- **증상**: `failed_count > 0` 또는 예상보다 많은 `updated` 카운트
- **대응**: 
  1. 잘못된 CSV를 Storage에서 삭제
  2. 올바른 CSV를 다시 업로드
  3. Dry Run으로 재확인 후 실제 실행

### 6.2 외래 키 제약 위반

- **증상**: `insert` 또는 `update` 중 foreign key 오류
- **대응**: 
  1. `stock_import_logs.error_message` 확인
  2. 해당 ticker가 `holdings`나 `dividend_events`에서 참조되고 있는지 확인
  3. 필요 시 수동으로 `stocks` 테이블 직접 수정

### 6.3 Rollback (이전 상태 복원)

이전 달의 CSV 파일이 Storage에 남아있으면, 이전 파일로 다시 import하여 rollback:

```bash
curl -X POST "{SUPABASE_URL}/functions/v1/parse-stock-master-csv" \
  -H "Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "storagePath": "stock-master/20260411_list_of_tse_listed_issues.csv",
    "dryRun": false
  }'
```

> ⚠️ Rollback은 이전 CSV가 Storage에 보관되어 있을 때만 가능합니다. Storage의 오래된 파일은 삭제하지 마세요.

---

## 7. 연락처

- 기술 문의: 개발 팀
- 데이터 이상: 관리자
