# Issue TDD Harness

이 프로젝트는 **TDD(Test-Driven Development)** 기반으로 이슈를 해결하기 위한 `issue-harness` CLI를 제공합니다.

## 디자인 철학

- **Red-Green-Refactor**를 강제합니다.
- **Git Worktree**로 본 브랜치와 완전히 격리된 환경에서 작업합니다.
- AI(또는 개발자)는 테스트를 먼저 작성/확인하고, 구현을 수정하여 통과시킨 후, 전체 검증과 커밋을 거칩니다.

## 전체 흐름

```
1. init    → 이슈 파싱 → git worktree 생성 → 실패 테스트 스캐폴드 생성 → RED 확인
2. cycle   → 코드 수정 → 테스트 재실행 → GREEN 확인 (반복)
3. verify  → formatter → lint → typecheck → 관련 테스트 ALL PASS
4. finish  → supabase deploy → git commit
```

## 명령어

### 1. `init` — 작업 환경 준비

```bash
npm run issue:harness -- init docs/issue/active/YYYYMMDD-slug.md
```

수행 작업:
- 이슈 문서(Frontmatter + Body)를 파싱합니다.
- `issue/YYYYMMDD-slug` 브랜치를 생성하고 `.worktrees/issue-YYYYMMDD-slug` worktree를 만듭니다.
- `tests/issues/YYYYMMDD-slug.test.ts`에 **반드시 실패하는** 테스트 템플릿을 생성합니다.
- 생성된 테스트를 실행하여 `RED` 상태를 확인합니다.

### 2. `cycle` — TDD 사이클 실행

```bash
cd .worktrees/issue-YYYYMMDD-slug
node ../../scripts/issue-harness/index.js cycle [path/to/test.ts]
```

수행 작업:
- 지정한 테스트(또는 전체 유닛 테스트)를 실행합니다.
- **실패하면** 프로세스가 종료되며, AI는 소스 코드를 수정한 뒤 다시 `cycle`을 실행해야 합니다.
- **성공하면** `verify` 단계로 넘어갈 수 있습니다.

### 3. `verify` — 전체 품질 검증

```bash
node ../../scripts/issue-harness/index.js verify
```

수행 작업:
- `eslint --fix` (Formatter)
- `eslint` (Lint)
- `tsc --noEmit` (Type check)
- `vitest run` (모든 유닛 테스트)

모든 항목이 통과해야 합니다.

### 4. `finish` — 배포 및 커밋

```bash
node ../../scripts/issue-harness/index.js finish "fix: resolve YYYYMMDD-slug"
```

수행 작업:
- `package.json`의 `supabase:deploy` 또는 `db:deploy` 스크립트가 있으면 실행합니다.
- 변경사항을 `git commit`합니다.

## AI 워크플로우 가이드

AI가 이 harness를 사용하여 이슈를 자율적으로 수정할 때의 표준 절차입니다.

### Step 1: 이슈 분석 및 환경 초기화

```bash
# 사용자가 지정한 이슈 파일을 받아 init 실행
npm run issue:harness -- init <issue-file-path>
```

출력된 worktree 경로로 이동합니다.

### Step 2: RED — 실패 테스트 작성/확인

`init` 단계에서 자동 생성된 테스트는 `expect(true).toBe(false)` 형태입니다.
AI는 이를 **실제 이슈 상황을 재현하는 assertion**으로 교체해야 합니다.

- 테스트 파일만 수정합니다.
- 구현 코드는 절대 수정하지 않습니다.
- 교체 후 `cycle`을 실행하여 반드시 실패하는지 확인합니다.

### Step 3: GREEN — 최소한의 구현 수정

- 이슈를 재현하는 테스트가 RED를 확인한 후, **구현 코드**를 수정합니다.
- 최소한의 변경으로 테스트를 통과시킵니다.
- `cycle`을 실행하여 GREEN을 확인합니다.

### Step 4: REFACTOR — 전체 검증

```bash
node ../../scripts/issue-harness/index.js verify
```

통과하지 못하면 해당 항목을 수정하고 `verify`를 다시 실행합니다.

### Step 5: FINISH — 커밋

```bash
node ../../scripts/issue-harness/index.js finish "fix: <이슈 요약>"
```

## 파일 구조

```
scripts/issue-harness/
├── index.js           # 메인 CLI
└── lib/
    ├── logger.js      # 컬러 로그 출력
    ├── issue.js       # 이슈 문서 파싱
    ├── git.js         # worktree / branch / commit 관리
    ├── scaffold.js    # 테스트 스캐폴드 생성
    ├── test.js        # vitest 실행 래퍼
    └── verify.js      # lint / typecheck / formatter
```

## 주의사항

- **worktree 낭비 방지**: 작업 완료 후 `.worktrees/issue-*`는 수동으로 정리하거나 `git worktree remove`로 삭제할 수 있습니다.
- **supabase deploy**: 현재 프로젝트에 `supabase:deploy` 스크립트가 없다면 `finish` 단계에서 자동으로 skip됩니다. 필요시 `package.json`에 추가하세요.
