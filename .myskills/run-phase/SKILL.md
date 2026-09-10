---
name: run-phase
description: >
  Phase級の変更要求を、phase-cycleによるIntent/Research/Plan/Cold Review準備からTask Planning、Implement、Verify、Independent Review、Repair、Phase CloseまでOrchestrationする。
  既存STATEがある場合は整合確認後、途中stageから再開する。
---

# Run Phase

## 目的

Phase級の変更要求を、ユーザーに手動セッション切替を要求せず、準備から実装完了まで安全に進める。

Phase準備は`phase-cycle`へ委譲する。
`run-phase`自身がPlannerとReviewerを同一contextで連続実行して独立性を壊してはならない。

## New Phase Workflow

```text
phase-cycle
  ├─ phase-intent
  ├─ phase-research
  ├─ phase-plan
  ├─ cold phase-review
  ├─ targeted correction / upstream routing
  └─ PASS
       ↓
phase-task-plan
  ↓
READY Taskごとに
  task-implement
    ↓
  deterministic verification
    ↓
  cold task-review
    ├─ PASS → 次READY Task
    ├─ FAIL → task-repair → verification → new cold task-review
    └─ Contract変更必要 → change-control
  ↓
全Task PASS
  ↓
cold phase-close
```

`phase-cycle`が`BLOCKED`で終了した場合、Task Planningへ進まない。

## Existing Prepared Phase

既に以下が成立している場合は`phase-cycle`を再実行しない。

- `Docs/Research/PhaseN.md`が現在Requirement/Architectureに対して有効
- `Docs/Plans/PhaseN.md`が存在
- 最新`phase-review`がPASS

この場合は`phase-task-plan`またはSTATEのNext Actionから再開する。

Phase Planが存在していてもReview PASS evidenceがなければ、必要に応じて`phase-cycle`のReview側から再開する。

## Resume Workflow

`Docs/STATE.md`がある場合:

1. `workflow-state`でcheap consistency checkを行う。
2. durable artifactとSTATEが矛盾すればRepository truthへ合わせる。
3. `Next Action`から再開する。
4. Intent Briefはdurableではないため、Research artifactがまだ存在せずsessionも切れている場合は`phase-cycle`内で`phase-intent`を短く再実行する。

## Context Isolation

### Phase Preparation

`phase-cycle`のContext Isolation Ruleを使用する。

特に:
- PlannerとPhase Reviewerを分離
- 再Reviewは可能ならnew cold reviewer
- Planner reasoningをReviewer evidenceとして渡さない

### Implementation

- Task Planning: Spec + Architecture + Phase + Research
- Implement: target Task + Architecture + relevant source + 必要箇所だけ
- Task Review: Task + diff + relevant source + verification
- Repair: Task + failing findings + relevant source
- Change Control: change request + STATE + affected artifacts + current diff
- Close: Phase + relevant Spec + all task status/review + repository

全Agentへ全Docsを渡さない。

## State Management

`phase-intent`自体はSTATEへ保存しない。
`phase-cycle`はResearch開始からdurable stateを管理する。

標準stage order:

```text
PHASE_RESEARCH
→ PHASE_PLAN
→ PHASE_REVIEW
→ TASK_PLAN
→ TASK_IMPLEMENT
→ TASK_VERIFY
→ TASK_REVIEW
→ TASK_REPAIR（必要時）
→ PHASE_CLOSE
→ DONE
```

Phase Review PASS時:

```text
Stage = TASK_PLAN
Next Action = phase-task-plan
```

## Phase Review Cycle

Phase準備のReview/修正loopは`phase-cycle`へ任せる。

ルール:
- Reviewerはcold contextを優先
- Findingの`Fix At`に従う
- MINORだけでFAIL loopを継続しない
- 最大3 Review rounds
- upstream problemをPhase Plannerだけで解決しようとしない

## Task Scheduling

- dependencyが全てPASSのTaskだけREADY。
- independent Taskは安全ならparallel可能。
- 同一file / 広いshared stateを触るTaskは原則serial。
- TaskをIndependent Review PASS前に完了扱いしない。

## Task Review Independence

`task-implement`を行ったAgentがそのまま最終承認してはならない。

推奨:

```text
Implementer Agent A
  ↓ diff + verification
Reviewer Agent B (cold)
  ↓ FAIL
Repair Agent / Implementer
  ↓
Reviewer Agent C (cold)
```

Reviewer input:
- Task Contract
- actual diff
- relevant source
- verification result
- 必要なSpec/Researchだけ

Implementerの説明・自己評価をevidenceとして扱わない。

## Task Review Loop

Review FAIL:
1. Findingがexisting Task Contractへの実装不良か確認する。
2. 実装不良なら`task-repair`へFindingだけ渡す。
3. 修正後Verification。
4. new cold contextで`task-review`再実行。

Requirement/Contract変更が必要なら`task-repair`ではなく`change-control`へrouteする。

同一Taskで3回FAILしたら停止し、BLOCKED reportを作る。

root cause候補:
- Spec
- Architecture
- Research
- Phase Plan
- Task Plan
- Implementation
- Environment

## Change Control

新Requirement、Scope変更、Architecture変更はrepairへ流さない。

`change-control`でSource of Truthを更新し、必要なら:

```text
phase-intent
→ phase-research
→ phase-plan
→ cold phase-review
```

を`phase-cycle`相当の方法で影響範囲だけ再構築する。

PASS済みで影響なしのTaskは保持する。

## Phase Close Independence

全Task PASS後、可能なら`phase-close`もImplementation Agentとは別のcold contextで実行する。

目的は個別Taskでは見落としやすいintegration gap、Requirement coverage、cross-task contract不一致を独立確認すること。

## 完了条件

Phase COMPLETEは以下すべて必要。

- `phase-cycle`または同等手順によるPhase Review PASS
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

## Phase Preparation
Review: PASS
Review Rounds: <n>

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
