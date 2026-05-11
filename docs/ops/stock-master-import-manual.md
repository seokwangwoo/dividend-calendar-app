# 주식 마스터 임포트 운영 매뉴얼

## 목적

이 매뉴얼은 `parse-stock-master-csv` Edge Function을 사용하여 전체 JPX/TSE 상장 주식 마스터를 `stocks` 테이블에 임포트하는 방법을 설명합니다.

## 전제 조건

- 애플리케이션에서 관리자(Admin) 역할.
- Supabase Studio 접근 권한 (Storage 업로드 + Edge Function 실행).
- JPX "TSE 상장 종목 목록" XLS 파일 (JPX 웹사이트에서 다운로드 가능).

## 1단계: JPX 주식 목록 다운로드

1. JPX 웹사이트를 방문하여 최신 "TSE 상장 종목 목록" (上場銘柄一覧)을 다운로드.
2. XLS 파일을 Excel 또는 LibreOffice Calc에서 열기.
3. **CSV (UTF-8)**로 저장/내보내기, 헤더는 영문으로: `ticker,name,market_segment`.
   - `ticker`: 4자리 종목 코드 (예: `7203`).
   - `name`: 일본어 회사명.
   - `market_segment`: 시장 구분 (예: `TSE Prime`, `TSE Standard`, `TSE Growth`).
4. CSV에 중복된 `ticker` 값이 없는지 확인.

## 2단계: CSV를 Supabase Storage에 업로드

1. Supabase Studio → Storage를 열기.
2. `imports` 버킷이 있는지 확인 (없으면 생성, private 설정).
3. CSV를 `stock-master/YYYYMM_list_of_tse_listed_issues.csv`에 업로드.
   - 예: `stock-master/202506_list_of_tse_listed_issues.csv`.
4. 전체 파일 경로를 기록: `imports/stock-master/202506_list_of_tse_listed_issues.csv`.

## 3단계: 임포트 드라이 런

1. Supabase Studio에서 Edge Functions로 이동.
2. `parse-stock-master-csv`를 다음 JSON 본문으로 실행:
   ```json
   {
     "filePath": "imports/stock-master/202506_list_of_tse_listed_issues.csv",
     "dryRun": true
   }
   ```
3. 응답을 검토. 반환값:
   - `processedCount`: 파싱된 행 수.
   - `insertedCount`, `updatedCount`, `delistedCount`: 실제 DB 상태에 따라 발생할 작업의 미리보기 수치 (쓰기 없음).
   - `failedCount`: 발생할 검증 오류 수.
   - `errors`: 검증 오류 상세.

## 4단계: 임포트 실행

1. `dryRun: false`로 `parse-stock-master-csv`를 실행:
   ```json
   {
     "filePath": "imports/stock-master/202506_list_of_tse_listed_issues.csv",
     "dryRun": false
   }
   ```
2. 함수가 수행하는 작업:
   - 새로운 종목을 `support_status = 'unsupported'`로 삽입.
   - 기존 종목 업데이트 (지원 중인 종목의 `id`와 `support_status` 보존).
   - 일치하는 모든 ticker의 `name`과 `market_segment`를 덮어씀.
   - CSV에는 없으나 DB에 있는 ticker를 `support_status = 'delisted'`로 표시.
   - `stock_import_logs`에 로그 항목 기록.

## 5단계: 임포트 검증

1. Supabase Studio에서 최신 실행에 대한 `stock_import_logs` 확인.
2. `stocks`를 조회하여 행 수가 3,800 이상인지 확인.
3. 몇몇 알려진 ticker가 올바른 `market_segment`와 함께 존재하는지 확인.
4. 기존 `supported` 종목이 `id`와 `support_status`를 유지했는지 확인.

## 롤백 절차

임포트에 문제가 발생한 경우:

1. Storage에서 이전 정상 CSV 파일을 식별.
2. 이전 CSV 경로와 `dryRun: false`로 `parse-stock-master-csv`를 재실행.
3. 치명적인 실패 시 데이터베이스 백업에서 복원 (가용한 경우).

## 실행 주기

- 월 1회 실행 권장 (매월 첫 영업일).
- 파일명을 현재 `YYYYMM`에 맞게 업데이트.

## 문제 해결

| 문제 | 원인 | 해결 |
|---|---|---|
| "Invalid CSV header" | 헤더가 정확히 `ticker,name,market_segment`가 아님 | 올바른 헤더로 다시 내보내기 |
| "Duplicate tickers in CSV" | 동일한 ticker가 여러 번 나타남 | 소스 파일에서 중복 제거 |
| "Failed to download file" | 잘못된 버킷 또는 경로 | Storage의 전체 `filePath` 확인 |
| 폐지(delisted) 수가 예상보다 많음 | JPX가 종목을 제거했거나 CSV가 불완전함 | 소스 파일의 완전성 확인 |

## Edge Function 실행 정보

- **URL**: `https://<project-ref>.supabase.co/functions/v1/parse-stock-master-csv`
- **Method**: `POST`
- **Headers**: `Authorization: Bearer <user-jwt>` (관리자 사용자 필요)
- **Body**: `{ "filePath": string, "dryRun": boolean }`

## 보안 참고

- 이 함수는 관리자만 실행할 수 있음.
- Edge Function은 DB 작업에 서비스 롤 키를 사용하며, 이 키를 브라우저에 노출해서는 안 됨.
- `stock_import_logs`는 관리자만 읽을 수 있음.
