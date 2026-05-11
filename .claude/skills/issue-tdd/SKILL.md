# Issue TDD Skill

## Overview

TDD(Test-Driven Development) 기반으로 이슈를 해결하기 위한 자동화 harness입니다. Git worktree로 격리된 환경에서 Red-Green-Refactor 사이클을 강제하며, 이슈 문서 파싱 → 테스트 스캐폴드 생성 → 코드 수정 → 전체 검증 → 커밋까지의 전체 흐름을 지원합니다.

## Trigger

Use this skill when:
- 사용자가 "이슈 해결", "issue fix", "TDD로 수정", "bug fix with test" 등을 요청할 때
- `docs/issue/active/` 아래의 이슈 문서를 기반으로 작업을 시작할 때
- Git worktree 기반 격리된 개발 환경이 필요할 때

## Tools

- `scripts/issue-harness/index.js` — 메인 CLI
- `scripts/issue-harness/lib/` — 내장 모듈 (git, issue, scaffold, test, verify, logger)

## Workflow

### Phase 1: Init — 작업 환경 준비

사용자가 지정한 이슈 파일로부터 worktree를 생성하고 실패 테스트를 스캐폴드합니다.

```bash
npm run issue:harness -- init <issue-file-path>
```

예시:
```bash
npm run issue:harness -- init docs/issue/active/20260510-xxx.md
```

수행 작업:
1. 이슈 문서(Frontmatter + Body) 파싱
2. `issue/YYYYMMDD-slug` 브랜치 생성
3. `.worktrees/issue-YYYYMMDD-slug` git worktree 생성
4. `tests/issues/YYYYMMDD-slug.test.ts`에 **반드시 실패하는** 테스트 템플릿 생성
5. 생성된 테스트 단독 실행 → **RED 상태 확인**

출력 예시:
```
Worktree : /path/to/project/.worktrees/issue-YYYYMMDD-slug
Branch   : issue/YYYYMMDD-slug
Test     : tests/issues/YYYYMMDD-slug.test.ts
```

### Phase 2: RED — 실패 테스트 작성/확인

`init`으로 생성된 테스트는 `expect(true).toBe(false)` 형태입니다. 이를 **실제 이슈 상황을 재현하는 assertion**으로 교체합니다.

규칙:
- **테스트 파일만 수정**합니다.
- 구현 코드는 절대 수정하지 않습니다.
- 교체 후 `cycle`을 실행하여 반드시 실패하는지 확인합니다.

```bash
cd .worktrees/issue-YYYYMMDD-slug
node ../../scripts/issue-harness/index.js cycle tests/issues/YYYYMMDD-slug.test.ts
```

결과가 RED(실패)가 확인되면 Phase 3으로 진행합니다.

### Phase 3: GREEN — 최소한의 구현 수정

이슈를 재현하는 테스트가 RED를 확인한 후, **구현 코드**를 수정합니다.

규칙:
- 최소한의 변경으로 테스트를 통과시킵니다.
- `cycle`을 실행하여 GREEN을 확인합니다.
- 여전히 RED면 다시 수정하고 `cycle`을 반복합니다.

```bash
node ../../scripts/issue-harness/index.js cycle tests/issues/YYYYMMDD-slug.test.ts
```

### Phase 4: REFACTOR — 전체 품질 검증

단일 테스트가 GREEN이 되면, 프로젝트 전체 품질 기준을 충족하는지 검증합니다.

```bash
node ../../scripts/issue-harness/index.js verify
```

수행 작업:
1. `eslint --fix` (Formatter)
2. `eslint` (Lint)
3. `tsc --noEmit` (Type check)
4. `npm run test` (모든 유닛 테스트)
5. `npm run test:integration` (통합 테스트)
6. `npm run test:e2e` (E2E 테스트)

모든 항목이 통과해야 합니다. 실패 시 해당 항목을 수정하고 `verify`를 다시 실행합니다.

### Phase 5: FINISH — 배포 및 커밋

검증이 모두 통과하면 변경사항을 커밋합니다.

```bash
node ../../scripts/issue-harness/index.js finish "fix: <이슈 요약>"
```

수행 작업:
1. `package.json`의 `supabase:deploy` 또는 `db:deploy` 스크립트가 있으면 실행
2. `git commit` 수행

## AI Agent Guidelines

1. **worktree로 이동**한 후 모든 작업을 수행합니다. 본 브랜치(main)는 건드리지 않습니다.
2. **RED 단계에서 구현 코드를 수정하지 마세요**. 테스트만 수정합니다.
3. **GREEN 단계에서 테스트를 수정하지 마세요**. 구현 코드만 수정합니다.
4. **verify 실패 시** `finish`로 넘어가지 말고 해당 검증을 통과할 때까지 수정합니다. 통합 테스트나 E2E 테스트 실패도 반드시 해결해야 합니다.
5. **supabase deploy**가 프로젝트에 설정되어 있지 않으면 `finish`에서 자동 skip됩니다. 필요시 `package.json` scripts에 추가하세요.

## File Structure

```
scripts/issue-harness/
├── index.js           # 메인 CLI (init, cycle, verify, finish)
└── lib/
    ├── logger.js      # 컬러 로그 출력
    ├── issue.js       # 이슈 문서 파싱
    ├── git.js         # worktree / branch / commit 관리
    ├── scaffold.js    # 테스트 스캐폴드 생성
    ├── test.js        # vitest 실행 래퍼
    └── verify.js      # lint / typecheck / formatter
```

## Notes

- worktree는 `.worktrees/issue-*`에 생성됩니다. 작업 완료 후 `git worktree remove`로 정리할 수 있습니다.
- `init` 시 기존 worktree가 있으면 재사용합니다.
- `cycle`은 단일 테스트 파일을 지정하면 해당 파일만, 미지정 시 전체 유닛 테스트를 실행합니다.
