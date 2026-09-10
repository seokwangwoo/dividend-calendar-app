---
name: phase-close
description: >
  Phase内の全Taskが独立ReviewをPASSした後、Phase全体としてRequirement・Integration・Verificationを満たすか最終確認する。
---

# Phase Completion Review

## 目的

Task単体PASSの集合ではなく、Phase全体として機能が成立しているか確認する。新機能は実装しない。

## 入力

- `Docs/Spec.md`
- `Docs/Architecture.md`
- 対象Phase
- Phase Research
- 全Task
- 各Taskの最終Review
- current repository state

## 手順

1. 全必須TaskがIndependent Review PASSか確認する。
2. Plannerのcoverage表だけに依存せず、Spec/PhaseからRequirement/AC/failure behaviorを再構築する。
3. Task間Integrationを確認する。
4. Phase-level build/test/integration/smoke verificationを実行する。
5. Phase外scope/unrelated refactorがないか確認する。
6. `workflow-state`を更新する。

## Integration観点

- producer/consumer contract
- UI/backend or caller/callee接続
- state/data flow
- error propagation
- lifecycle/resource ownership
- thread/event ordering
- persistence/compatibility

## Verdict

`COMPLETE`:
- 全必須Task PASS
- Requirement漏れなし
- 重大Integration問題なし
- 必須Verification PASSまたは正当SKIPPED

`INCOMPLETE`:
- 上記のいずれかを満たさない

## 出力

```markdown
# Phase N Completion Review

## Verdict
COMPLETE | INCOMPLETE

## Requirement Coverage
- [x] ...

## Task Status
| Task | Status |
|---|---|

## Integration Findings
- None | ...

## Phase Verification
- `<command>`: PASS | FAIL | SKIPPED

## Scope Assessment
...

## Remaining Work
None | ...
```

COMPLETE時はStage=`DONE`、INCOMPLETE時は原因をTask / Plan / Spec / Architectureへ分類し、適切な再開Actionを1つ示す。
