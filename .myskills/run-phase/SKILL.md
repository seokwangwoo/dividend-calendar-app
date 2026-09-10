---
name: run-phase
description: >
  承認済みPhaseをResearchからTask Planning、Implement、Verify、Independent Review、Repair、Phase CloseまでSTATE付きでOrchestrationする。
---

# Run Phase

## 目的

承認済み `Docs/Plans/PhaseN.md` を標準Workflowで完了まで進める。

## 前提

Phase文書は`phase-plan`で作成され、`phase-review`をPASS済みであること。
未承認なら実行せずPhase Reviewへ戻す。

## Workflow

```text
phase-research
  ↓
phase-task-plan
  ↓
READY Taskごとに
  task-implement
    ↓
  deterministic verification
    ↓
  task-review
    ├─ PASS → 次READY Task
    ├─ FAIL → task-repair → verification → task-review
    └─ Contract変更必要 → change-control
  ↓
全Task PASS
  ↓
phase-close
```

## Context Isolation

- Research: Spec + Architecture + Phase + source
- Task Planning: Spec + Architecture + Phase + Research
- Implement: target Task + Architecture + relevant source + 必要箇所だけ
- Review: Task + diff + relevant source + verification
- Repair: Task + failing findings + relevant source
- Change Control: change request + STATE + affected artifacts + current diff
- Close: Phase + relevant Spec + all task status/review + repository

全Agentへ全Docsを渡さない。

## State Management

各stage transitionで`workflow-state`を使用する。
再開時はSTATEのNext Actionを起点にし、cheap consistency check後に続行する。

## Task Scheduling

- dependencyが全てPASSのTaskだけREADY。
- independent Taskは安全ならparallel可能。
- 同一file/広いshared stateを触るTaskは原則serial。
- Taskを独立Review PASS前に完了扱いしない。

## Review Loop

Review FAIL:
1. Findingを`task-repair`へ渡す。
2. 修正後Verification。
3. cold/independent contextで`task-review`再実行。

同一Taskで3回FAILしたら停止し、BLOCKED reportを作る。
Reportにはunresolved findings、attempted repairs、root cause候補を含める。

root cause分類:
- Spec
- Architecture
- Research
- Task Plan
- Implementation
- Environment

## Change Control

新Requirement、Scope変更、Architecture変更はrepairへ流さない。
Stage=`CHANGE_CONTROL`へ移し`change-control`を実行し、影響Taskだけ再計画する。
PASS済みで影響なしのTaskは保持する。

## 完了条件

Phase COMPLETEは以下すべて必要。

- 全必須TaskがIndependent Review PASS
- Phase-level Requirement Coverage成立
- Integration gapなし
- Phase-level Verification成功または正当SKIPPED
- `phase-close` Verdict=`COMPLETE`
- STATE Stage=`DONE`

## 最終出力

```markdown
# Run Phase Result

## Result
COMPLETE | INCOMPLETE | BLOCKED

## Phase
...

## Task Summary
| Task | Status | Review Rounds |
|---|---|---:|

## Verification Summary
...

## Remaining Findings / Blockers
...

## State
Next Action: ...
```
