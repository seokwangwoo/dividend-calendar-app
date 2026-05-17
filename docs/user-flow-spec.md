# 사용자 플로우 사양서

## 1. 문서 목적

이 문서는 배당 캘린더 앱에서 사용자가 각 화면 사이를 어떻게 이동하는지 정의한다. 기준 구현은 Next.js App Router의 `src/app` 라우트와 화면 내 `Link`, 서버 액션 `redirect`, 미들웨어 접근 제어이다.

## 2. 공통 접근 규칙

### 2.1 루트 진입

- 사용자가 `/`에 접근하면 `/app/home`으로 즉시 이동한다.
- `/app/*` 화면은 로그인 사용자가 접근할 수 있다.
- 비로그인 사용자가 `/app/*`에 접근하면 `/auth/login?next={원래경로}`로 이동한다.
- `/admin/*` 화면은 관리자만 접근할 수 있다.
- 비로그인 사용자가 `/admin/*`에 접근하면 `/auth/login?next={원래경로}`로 이동한다.
- 로그인했지만 관리자 권한이 없는 사용자가 `/admin/*`에 접근하면 `/app/home`으로 이동한다.

### 2.2 하단 탭 내비게이션

로그인 후 일반 앱 화면에는 하단 탭이 고정 노출된다.

| 탭 | 이동 경로 | 주요 화면 |
| --- | --- | --- |
| 홈 | `/app/home` | 올해 배당 요약 |
| 보유 | `/app/portfolio` | 포트폴리오 |
| 캘린더 | `/app/calendar` | 배당 캘린더 |
| 알림 | `/app/notifications` | 알림 목록 |
| 설정 | `/app/settings` | 계정 및 표시 설정 |

현재 경로가 탭 경로와 같거나 하위 경로이면 해당 탭을 활성 상태로 표시한다.

## 3. 인증 플로우

### 3.1 로그인

| 시작 화면 | 사용자 행동 | 성공 시 | 실패 시 |
| --- | --- | --- | --- |
| `/auth/login` | 이메일/비밀번호 입력 후 `ログイン` 제출 | `/app/home` | `/auth/login?error={메시지}` |

추가 이동:

- `アカウント作成` 클릭 시 `/auth/signup`으로 이동한다.
- `パスワード再設定` 클릭 시 `/auth/reset-password`로 이동한다.

### 3.2 회원가입

| 시작 화면 | 사용자 행동 | 성공 시 | 실패 시 |
| --- | --- | --- | --- |
| `/auth/signup` | 이메일/비밀번호 입력 후 `作成` 제출 | `/auth/login?message=確認メールを送信しました...` | `/auth/signup?error={메시지}` |

추가 이동:

- `既にアカウントをお持ちの方` 클릭 시 `/auth/login`으로 이동한다.

### 3.3 비밀번호 재설정

| 시작 화면 | 사용자 행동 | 성공 시 | 실패 시 |
| --- | --- | --- | --- |
| `/auth/reset-password` | 이메일 입력 후 `送信` 제출 | `/auth/login?message=パスワード再設定用リンクを送信しました。` | `/auth/reset-password?error={메시지}` |

추가 이동:

- `ログインへ戻る` 클릭 시 `/auth/login`으로 이동한다.

### 3.4 로그아웃

| 시작 화면 | 사용자 행동 | 성공 시 |
| --- | --- | --- |
| `/app/settings` | `ログアウト` 제출 | `/auth/login` |

## 4. 일반 사용자 앱 플로우

### 4.1 홈

경로: `/app/home`

주요 이동:

- 보유 종목이 없으면 빈 상태 CTA `銘柄を追加`를 통해 `/app/portfolio/new`로 이동한다.
- 연간 배당 목표가 없으면 CTA `目標を設定`을 통해 `/app/settings`로 이동한다.
- `ポートフォリオを確認する` 클릭 시 `/app/portfolio`로 이동한다.
- 하단 탭을 통해 포트폴리오, 캘린더, 알림, 설정 화면으로 이동한다.

### 4.2 포트폴리오 목록

경로: `/app/portfolio`

주요 이동:

- 헤더 CTA `+ 銘柄追加` 클릭 시 `/app/portfolio/new`로 이동한다.
- `종목 검색` 클릭 시 `/app/stocks/search`로 이동한다.
- `CSVインポート` 클릭 시 `/app/portfolio/import`로 이동한다.
- 보유 종목 카드 클릭 시 `/app/portfolio/{holdingId}/edit`로 이동한다.
- 보유 종목이 없으면 빈 상태 CTA `銘柄を追加`를 통해 `/app/portfolio/new`로 이동한다.

화면 내 상태 변경:

- 계좌 필터 `すべて`, `NISA`, `特定口座`, `一般口座`는 화면 내 목록만 필터링하며 경로는 변경하지 않는다.
- 정렬 옵션 `税引後配当額順`, `銘柄コード順`, `最近追加`는 화면 내 목록만 정렬하며 경로는 변경하지 않는다.

### 4.3 보유 종목 추가

경로: `/app/portfolio/new`

진입 경로:

- 홈 빈 상태 CTA
- 포트폴리오 헤더 CTA
- 캘린더 빈 상태 CTA
- 종목 검색 결과의 `보유 추가`
- `/app/portfolio/new?stockId={stockId}`로 진입하면 해당 종목을 미리 선택한다.

주요 흐름:

1. 사용자가 종목명 또는 코드를 검색한다.
2. 검색 결과에서 `選択`을 클릭해 종목을 선택한다.
3. 보유 수량, 평균 취득 단가, 계좌 구분을 입력한다.
4. `保存`을 클릭한다.
5. 저장 성공 시 같은 페이지에서 완료 화면을 표시한다.

완료 화면 이동:

- `カレンダーで確認` 클릭 시 `/app/calendar`로 이동한다.
- `続けて銘柄を追加` 클릭 시 입력 상태를 초기화하고 같은 화면에서 추가 입력을 계속한다.

예외:

- 비로그인 상태에서 저장 액션이 실행되면 `/auth/login`으로 이동한다.
- 상장폐지 종목은 포트폴리오에 추가할 수 없고 오류를 표시한다.

### 4.4 보유 종목 편집

경로: `/app/portfolio/{holdingId}/edit`

진입 경로:

- `/app/portfolio`의 보유 종목 카드 클릭

주요 이동:

- 헤더의 `← 戻る` 클릭 시 `/app/portfolio`로 이동한다.
- `保存` 성공 시 `/app/portfolio`로 이동한다.
- `この保有情報を削除` 클릭 후 브라우저 확인을 승인하면 삭제 처리 후 `/app/portfolio`로 이동한다.
- 존재하지 않는 보유 ID이면 Not Found 화면을 표시한다.

### 4.5 CSV 인포트

경로: `/app/portfolio/import`

진입 경로:

- `/app/portfolio`의 `CSVインポート`

주요 이동:

- 헤더의 `← ポートフォリオへ戻る` 클릭 시 `/app/portfolio`로 이동한다.
- 완료 단계의 `ポートフォリオへ戻る` 클릭 시 `/app/portfolio`로 이동한다.

단계 흐름:

1. 업로드: CSV 파일을 선택하거나 텍스트를 붙여넣는다.
2. 미리보기: `プレビュー →` 클릭 시 유효 행, 중복 행, 오류 행을 표시한다.
3. 확정: `N件をインポート確定` 클릭 시 등록한다.
4. 완료: 등록 건수와 중복 스킵 건수를 표시한다.
5. `続けてインポート` 클릭 시 업로드 단계로 돌아간다.

### 4.6 종목 검색

경로: `/app/stocks/search`

진입 경로:

- 포트폴리오의 `종목 검색`
- 알림 빈 상태 CTA
- 목표 수익률 관리 빈 상태 CTA

주요 이동:

- 검색 결과의 `상세 보기` 클릭 시 `/app/stocks/{stockId}`로 이동한다.
- 검색 결과의 `보유 추가` 클릭 시 `/app/portfolio/new?stockId={stockId}`로 이동한다.

화면 내 상태:

- 검색어가 비어 있으면 입력 안내를 표시한다.
- 검색 중에는 로딩 문구를 표시한다.
- 결과가 없으면 결과 없음 문구를 표시한다.

### 4.7 종목 상세

경로: `/app/stocks/{stockId}`

진입 경로:

- 종목 검색 결과의 `상세 보기`
- 목표 수익률 관리 목록의 종목 카드

주요 이동:

- 해당 종목을 보유하지 않은 경우 빈 상태 CTA `ポートフォリオに追加`를 통해 `/app/portfolio/new`로 이동한다.
- `目標利回りを設定` 클릭 시 `/app/stocks/{stockId}/notification-rule`로 이동한다.
- 배당 데이터가 없으면 목표 수익률 설정 링크는 비활성화된다.
- 존재하지 않는 종목 ID이면 Not Found 화면을 표시한다.

### 4.8 목표 수익률 설정

경로: `/app/stocks/{stockId}/notification-rule`

진입 경로:

- 종목 상세의 `目標利回りを設定`

주요 흐름:

- 조건, 목표 수익률, 알림 채널을 입력하고 `保存`을 제출한다.
- 저장 성공 시 같은 화면을 재검증하고 설정된 룰 목록을 갱신한다.
- 기존 활성 룰이 있으면 같은 폼에서 수정한다.
- 설정된 활성 룰의 `無効にする` 제출 시 같은 화면에서 룰 상태를 비활성화한다.

예외:

- 배당 데이터가 없는 종목은 입력과 저장 버튼이 비활성화된다.
- 존재하지 않는 종목 ID이면 Not Found 화면을 표시한다.
- 비로그인 상태에서 저장/비활성화 액션이 실행되면 `/auth/login`으로 이동한다.

### 4.9 캘린더

경로: `/app/calendar`

주요 이동:

- 보유 종목이 없고 표시할 배당 이벤트가 없으면 빈 상태 CTA `銘柄を追加`를 통해 `/app/portfolio/new`로 이동한다.
- 하단 탭을 통해 다른 주요 화면으로 이동한다.

화면 내 상태 변경:

- 이전/다음 연도 버튼은 연도만 변경하고 같은 화면에서 캘린더 데이터를 다시 불러온다.
- 금액 기준 `税引後`, `税引前` 선택은 같은 화면에서 캘린더 데이터를 다시 불러온다.
- 계좌 필터 선택은 같은 화면에서 캘린더 데이터를 다시 불러온다.
- 월 행을 클릭하면 같은 화면 아래에 해당 월 상세를 펼친다.
- 이미 선택된 월을 다시 클릭하면 월 상세를 접는다.

### 4.10 알림

경로: `/app/notifications`

주요 이동:

- 필터 탭 `すべて` 클릭 시 `/app/notifications`로 이동한다.
- 다른 필터 클릭 시 `/app/notifications?filter={filter}`로 이동한다.
- 알림이 없으면 빈 상태 CTA `알림을 설정할 종목 찾기`를 통해 `/app/stocks/search`로 이동한다.

화면 내 액션:

- 개별 알림의 `既読にする` 제출 시 같은 화면을 재검증하고 해당 알림을 읽음 처리한다.
- `すべて既読にする` 제출 시 같은 화면을 재검증하고 모든 미읽음 알림을 읽음 처리한다.

### 4.11 설정

경로: `/app/settings`

주요 이동:

- `目標利回り管理` 클릭 시 `/app/settings/yield-targets`로 이동한다.
- `ログアウト` 제출 시 `/auth/login`으로 이동한다.

화면 내 액션:

- 이메일 알림, 앱 내 알림, 기본 금액 표시 기준, 연간 세후 배당 목표액을 수정하고 `保存`을 제출한다.
- 저장 성공 시 같은 설정 화면을 재검증한다.
- `アカウント削除` 버튼은 비활성화 상태이며 이동하지 않는다.

### 4.12 목표 수익률 관리

경로: `/app/settings/yield-targets`

진입 경로:

- `/app/settings`의 `目標利回り管理`

주요 이동:

- 목표 룰 카드 클릭 시 `/app/stocks/{stockId}`로 이동한다.
- 목표 룰이 없으면 빈 상태 CTA `銘柄を探す`를 통해 `/app/stocks/search`로 이동한다.

## 5. 관리자 플로우

### 5.1 관리자 권한

관리자 화면은 `/admin/*` 하위에 있으며 `profiles.role`이 `admin`인 사용자만 접근할 수 있다. 권한이 없으면 `/app/home`으로 이동한다.

### 5.2 AI 배당 후보 리뷰 목록

경로: `/admin/dividend-reviews`

주요 이동:

- 헤더 CTA `手動作成` 클릭 시 `/admin/dividend-reviews/new`로 이동한다.
- 각 행의 `詳細・操作` 클릭 시 `/admin/dividend-reviews/{eventId}`로 이동한다.
- 필터 적용 폼 제출 시 같은 경로에 쿼리 파라미터를 붙여 목록을 다시 표시한다.
- 커스텀 필터가 있는 경우 `クリア` 클릭 시 `/admin/dividend-reviews`로 이동한다.

기본 필터:

- `status` 기본값은 `pending,needs_manual_check`이다.

### 5.3 AI 배당 후보 리뷰 상세

경로: `/admin/dividend-reviews/{eventId}`

진입 경로:

- 리뷰 목록의 `詳細・操作`

주요 이동:

- `署名付きURLを生成（5分間有効）` 클릭 시 `/admin/dividend-reviews/{eventId}?pdf=1`로 이동하고 PDF 임시 URL을 생성한다.
- PDF 임시 URL이 생성되면 `PDFを開く ↗` 클릭으로 외부 PDF URL을 새 탭에서 연다.
- 하단 `← 一覧に戻る` 클릭 시 `/admin/dividend-reviews`로 이동한다.
- 승인 성공 시 `/admin/dividend-reviews`로 이동한다.
- 승인 실패 시 `/admin/dividend-reviews/{eventId}?error={메시지}`로 이동한다.
- 거절 성공 시 `/admin/dividend-reviews`로 이동한다.
- 거절 실패 시 `/admin/dividend-reviews/{eventId}?error={메시지}`로 이동한다.
- 존재하지 않는 리뷰 ID이면 Not Found 화면을 표시한다.

상태별 액션:

- 상태가 `pending` 또는 `needs_manual_check`인 경우에만 승인/거절 폼을 표시한다.
- 승인 폼은 AI 추출값을 기본으로 사용하되 입력된 필드는 값으로 덮어쓴다.
- 거절 폼은 거절 이유가 필수이다.

### 5.4 배당 이벤트 수동 생성

경로: `/admin/dividend-reviews/new`

진입 경로:

- 리뷰 목록의 `手動作成`

주요 이동:

- `保存（保留中として登録）` 제출 성공 시 `/admin/dividend-reviews`로 이동한다.
- `キャンセル` 클릭 시 `/admin/dividend-reviews`로 이동한다.

### 5.5 공시 데이터 진단

경로: `/admin/disclosures`

주요 이동:

- 현재 화면에는 다른 앱 화면으로 이동하는 링크나 제출 액션이 없다.
- 파서 진단, 최근 7일 수집 요약, 수집 플로우 설명을 조회 전용으로 표시한다.

### 5.6 작업 큐 진단

경로: `/admin/jobs`

주요 이동:

- 현재 화면에는 다른 앱 화면으로 이동하는 링크나 제출 액션이 없다.
- 큐 깊이, 가격 업데이트 요약, 운영 메모를 조회 전용으로 표시한다.

## 6. 주요 플로우 요약

### 6.1 신규 사용자의 첫 보유 등록

1. `/` 진입
2. `/app/home`으로 이동
3. 비로그인 상태이면 `/auth/login?next=/app/home`으로 이동
4. 로그인 성공 후 `/app/home`으로 이동
5. 홈 빈 상태 `銘柄を追加` 클릭
6. `/app/portfolio/new`로 이동
7. 종목 검색 및 선택
8. 보유 정보 저장
9. 완료 화면에서 `/app/calendar`로 이동하거나 계속 추가

### 6.2 종목 검색 후 보유 추가

1. `/app/portfolio`
2. `종목 검색` 클릭
3. `/app/stocks/search`
4. 검색 결과의 `보유 추가` 클릭
5. `/app/portfolio/new?stockId={stockId}`
6. 종목이 미리 선택된 상태에서 수량/단가/계좌 입력
7. 저장 후 완료 화면 표시

### 6.3 목표 수익률 알림 설정

1. `/app/stocks/search`
2. 검색 결과의 `상세 보기` 클릭
3. `/app/stocks/{stockId}`
4. `目標利回りを設定` 클릭
5. `/app/stocks/{stockId}/notification-rule`
6. 조건과 목표 수익률 입력
7. 저장 후 같은 화면에서 설정 목록 갱신
8. `/app/settings/yield-targets`에서 설정된 룰을 모아 확인 가능

### 6.4 배당 캘린더 확인

1. `/app/home` 또는 하단 탭에서 캘린더 진입
2. `/app/calendar`
3. 연도, 금액 기준, 계좌 필터 선택
4. 월 행 클릭
5. 같은 화면에서 월별 배당 상세 확인

### 6.5 관리자 AI 리뷰 승인

1. `/admin/dividend-reviews`
2. 필요한 필터 적용
3. 대상 행의 `詳細・操作` 클릭
4. `/admin/dividend-reviews/{eventId}`
5. 필요 시 `?pdf=1`로 PDF 임시 URL 생성 후 원문 확인
6. 승인 값 확인 및 필요 필드 덮어쓰기
7. `承認する` 제출
8. 성공 시 `/admin/dividend-reviews`로 이동

## 7. 화면 목록

| 구분 | 화면 | 경로 |
| --- | --- | --- |
| 공통 | 루트 | `/` |
| 인증 | 로그인 | `/auth/login` |
| 인증 | 회원가입 | `/auth/signup` |
| 인증 | 비밀번호 재설정 | `/auth/reset-password` |
| 인증 | 인증 콜백 | `/auth/callback` |
| 사용자 | 홈 | `/app/home` |
| 사용자 | 포트폴리오 | `/app/portfolio` |
| 사용자 | 보유 종목 추가 | `/app/portfolio/new` |
| 사용자 | 보유 종목 편집 | `/app/portfolio/{holdingId}/edit` |
| 사용자 | CSV 인포트 | `/app/portfolio/import` |
| 사용자 | 캘린더 | `/app/calendar` |
| 사용자 | 알림 | `/app/notifications` |
| 사용자 | 설정 | `/app/settings` |
| 사용자 | 목표 수익률 관리 | `/app/settings/yield-targets` |
| 사용자 | 종목 검색 | `/app/stocks/search` |
| 사용자 | 종목 상세 | `/app/stocks/{stockId}` |
| 사용자 | 종목 목표 수익률 설정 | `/app/stocks/{stockId}/notification-rule` |
| 관리자 | AI 배당 후보 리뷰 목록 | `/admin/dividend-reviews` |
| 관리자 | AI 배당 후보 리뷰 상세 | `/admin/dividend-reviews/{eventId}` |
| 관리자 | 배당 이벤트 수동 생성 | `/admin/dividend-reviews/new` |
| 관리자 | 공시 데이터 진단 | `/admin/disclosures` |
| 관리자 | 작업 큐 진단 | `/admin/jobs` |
