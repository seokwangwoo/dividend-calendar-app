---
name: run-phase
description: >
  新しいPhase要求をphase-intentからResearch、Planning、Review、Task Planning、Implement、Verify、Independent Review、Repair、Phase CloseまでOrchestrationする。
  既存STATEがある場合は整合確認後、途中stageから再開する。
---

# Run Phase

## 目的

Phase級の変更要求を、**Intent → Research → Plan → Review → Tasks → Implementation**の順で安全に進める。

既に途中まで進んでいる場合は`Docs/STATE.md`とdurable artifactを確認し、完了済みstageを不必要にやり直さない。

## New Phase Workflow

```text
phase-intent
  ↓ session-only Intent Brief
phase-research
  ↓ Docs/Research/PhaseN.md
phase-plan
  ↓ Docs/Plans/PhaseN.md
phase-review
  ├─ PASS → phase-task-plan
  ├─ FAIL(PHASE_PLAN) → phase-plan → phase-review
  └─ UPSTREAM_BLOCKED
       ├─ PHASE_RESEARCH → phase-research
       ├─ PHASE_INTENT → phase-intent → phase-research
       ├─ SPEC → Spec/change-control
       └─ ARCHITECTURE → Architecture/change-control
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

## Intent Interaction

新しいPhaseでは、要求がすでに十分明確でない限り`phase-intent`を使用する。

- 質問は1回に1つ。
- 推奨回答を提示する。
- codebaseで分かることをユーザーへ質問しない。
- Intent Briefはファイルへ保存しない。
- Intent確定後は同一セッションで`phase-research`へ渡す。

Intentが明らかにQuick Change規模なら`quick-change`へrouteしてよい。

## Resume Workflow

`Docs/STATE.md`がある場合:

1. `workflow-state`でcheap consistency checkを行う。
2. durable artifactとSTATEが矛盾すればRepository truthへ合わせる。
3. `Next Action`から再開する。
4. Intent Briefはdurableではないため、Research artifactがまだ存在しない状態でsessionが切れている場合は`phase-intent`を短く再実行する。

## Context Isolation

- Intent: user request + relevant Spec + 必要最小限のcontext
- Research: Intent Brief + Spec + Architecture + source
- Phase Planning: Intent summary + Spec + Architecture + Research
- Phase Review: Phase + Research + Spec + Architecture + 必要なspot-check source
- Task Planning: Spec + Architecture + Phase + Research
- Implement: target Task + Architecture + relevant source + 必要箇所だけ
- Task Review: Task + diff + relevant source + verification
- Repair: Task + failing findings + relevant source
- Change Control: change request + STATE + affected artifacts + current diff
- Close: Phase + relevant Spec + all task status/review + repository

全Agentへ全Docsを渡さない。

## State Management

`phase-intent`自体はSTATEへ保存しない。
Intent確定後、`phase-research`開始時から`workflow-state`でdurable stateを管理する。

標準stage order:

```text
PHASE_RESEARCH
→ PHASE_PLAN
→ PHASE_REVIEW
→ TASK_PLAN
→ TASK_IMPLEMENT / VERIFY / REVIEW / REPAIR
→ PHASE_CLOSE
→ DONE
```

## Phase Review Routing

`phase-review`のFindingにある`Fix At`を必ず尊重する。

- `PHASE_PLAN`: Phase文書だけを修正して再Review
- `PHASE_RESEARCH`: evidenceを追加/訂正してからPlanを更新
- `PHASE_INTENT`: product/user behavior decisionを再確認し、Researchから下流を更新
- `SPEC`: Spec source-of-truthを修正/確認
- `ARCHITECTURE`: architecture decisionを解決

すべてのFindingを`phase-plan`へ押し戻さない。
同じFindingが繰り返す場合は上位原因を疑う。

## Task Scheduling

- dependencyが全てPASSのTaskだけREADY。
- independent Taskは安全ならparallel可能。
- 同一file / 広いshared stateを触るTaskは原則serial。
- TaskをIndependent Review PASS前に完了扱いしない。

## Task Review Loop

Review FAIL:
1. Findingを`task-repair`へ渡す。
2. 修正後Verification。
3. cold/independent contextで`task-review`再実行。

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
`change-control`でSource of Truthを更新し、必要ならIntent clarification → Research → Phase Planの順で影響範囲だけ再構築する。
PASS済みで影響なしのTaskは保持する。

## 完了条件

Phase COMPLETEは以下すべて必要。

- Phase Review PASS
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
