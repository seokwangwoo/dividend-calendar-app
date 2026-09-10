---
name: run-phase-ja
description: >
  1つのPhaseについて、State復元 → Research → Task Planning → Task Implementation → Verification → Independent Review → Repair / Change Control → Phase Closeを順番に実行する。
  「このPhaseを一通り進めて」「前回の続きからPhaseを進めて」「次のPhaseを完了まで実行して」など、Phase全体のオーケストレーションに使用する。
---

# Run Phase Workflow

## 目的

対象Phaseを標準Workflowに従って最後まで進める。

このSkillはOrchestratorとして振る舞い、各工程の専門責務は対応Skillへ委譲する。
Workflowの進行状態は`workflow-state-ja`を使用して`Docs/STATE.md`へ保存する。

## 使用するSkill

1. `workflow-state-ja`
2. `phase-research-ja`
3. `phase-task-plan-ja`
4. `task-implement-ja`
5. `task-review-ja`
6. `task-repair-ja`（既存Task Contractへの実装不備のみ）
7. `change-control-ja`（新要求・Task Contract変更・Spec/Architecture変更時）
8. `phase-close-ja`

## Workflow

```text
STATE load / consistency check
          ↓
        Phase
          ↓
       Research
          ↓
    Task Planning
          ↓
      Ready Task
          ↓
      Implement
          │
          ├─ Task Contract外の変更要求
          │          ↓
          │    Change Control
          │          ↓
          │   影響Artifact更新
          │          ↓
          │    影響Taskだけ再計画
          │          ↓
          └──────→ Ready Taskへ復帰
          ↓
Deterministic Verification
          ↓
 Independent Review
    ├─ PASS → 次Task
    ├─ FAIL(実装不備) → Repair → Verify → Review
    └─ Contract変更必要 → Change Control
          ↓
      全Task PASS
          ↓
      Phase Close
          ↓
     STATE = COMPLETE
```

## State First Rule

新規実行・再開を問わず、最初に`workflow-state-ja`を適用する。

STATEが存在する場合:

1. `Docs/STATE.md`を読む。
2. Current Phase / Stage / Current Task / Next Action / Active Changeを抽出する。
3. cheap consistency checkを行う。
4. Repository truthと整合していれば`Next Action`から再開する。
5. 矛盾があればSTATEを修正してから再開する。

STATEが存在しない場合は、既存ArtifactとRepository stateから最小STATEを構築する。

会話履歴だけを根拠に現在位置を決めない。

## State Update Rule

Workflow stageが変わるたびにSTATEを更新する。

最低限:

- Phase開始
- Research開始/完了
- Planning開始/完了
- Task開始
- Implementation完了/BLOCKED/CHANGE_CONTROL
- Verification PASS/FAIL
- Review PASS/FAIL
- Repair開始/完了
- Change Control開始/完了
- Task PASS
- Phase Close開始
- Phase COMPLETE/INCOMPLETE/BLOCKED

STATE更新は後回しにしない。

## 0. Resume / Initialize

`workflow-state-ja`で以下を確定する。

- target Phase
- current Stage
- current Task
- Task status table
- active change
- active findings
- blockers
- next action

Phaseが既に`COMPLETE`なら、明示的な再検証要求がない限り再実装しない。

## 1. Research

STATE:

```text
Phase Status = RESEARCHING
Stage = PHASE_RESEARCH
```

`phase-research-ja`を実行する。

重大な`UNKNOWN`や文書/コード矛盾でPlanning不能なら:

```text
Phase Status = BLOCKED
Stage = BLOCKED
```

として停止する。

Research完了後:

```text
Phase Status = PLANNING
Stage = PHASE_PLAN
Next Action = phase-task-plan-ja
```

## 2. Task Planning

`phase-task-plan-ja`を実行する。

Planning完了後:

- dependencyなし → `READY`
- dependency未完了 → `PENDING`

STATE:

```text
Phase Status = EXECUTING
Current Task = 最初のREADY Task
Stage = TASK_IMPLEMENT
Next Action = task-implement-ja
```

## 3. Ready Task Selection

実装可能なのは:

- `READY`
- `Depends On`がすべてPASS
- BLOCKEDでない

TaskがPASS、再計画、invalidateされるたびにdependencyを再評価する。

## 4. Task Implementation

`task-implement-ja`で1 Taskだけ実装する。

### IMPLEMENTED

Verificationへ進む。

### BLOCKED

repair loopへ入れない。
原因をSpec / Architecture / Research / Task Plan / External dependency / Environmentへ分類し、STATEをBLOCKEDへ更新する。

### CHANGE_CONTROL

Task Contract外の変更要求を検出した場合、通常実装を停止して`change-control-ja`へ移行する。

STATE:

```text
Phase Status = EXECUTING
Stage = CHANGE_CONTROL
Current Task = Txxx
Next Action = change-control-ja
```

current diffは原則revertしない。

## 5. Change Control

以下の状況では`change-control-ja`を使用する。

- 新しいRequirementが追加された
- observable behaviorが変更された
- Task Goal / Done When / Non-Goalsを変更する必要がある
- Phase scopeが変わる
- Architecture boundary / flow / responsibilityが変わる
- Review中に「実装不備」ではなくTask Contract自体の変更が必要と判明した

### 使用しない状況

既存Task Contractは正しく、実装がそれを満たしていないだけなら`task-repair-ja`を使用する。

### Change Control処理

1. current diff / current Taskを保持する。
2. 変更を分類する。
3. 必要なら`Docs/Changes/CR-xxx.md`を作成する。
4. 上位Artifactを必要な範囲だけ更新する。
5. PASS済みTaskを`PRESERVE / REVERIFY / INVALIDATE`で評価する。
6. 影響Taskだけを再計画する。
7. Requirement Coverageとdependencyを再確認する。
8. STATEを更新する。
9. 次の`READY` Taskから通常Workflowへ復帰する。

変更分類:

```text
IMPLEMENTATION_DETAIL
TASK_SCOPE_CHANGE
REQUIREMENT_CHANGE
ARCHITECTURE_CHANGE
```

上位変更ほど戻る範囲を広げる。

```text
TASK_SCOPE_CHANGE
  → Research必要範囲 → Plan/Task

REQUIREMENT_CHANGE
  → Spec → Research validity check → Plan/Task

ARCHITECTURE_CHANGE
  → Architecture → Spec consistency → Research → Plan/Task
```

変更と無関係なPASS済みTaskはやり直さない。

Change Control完了後:

```text
Phase Status = EXECUTING
Stage = TASK_IMPLEMENT
Current Task = 次のREADY Task
Next Action = task-implement-ja
```

未決事項が残る場合:

```text
Phase Status = BLOCKED
Stage = CHANGE_CONTROL
Next Action = 未決decisionを解消する
```

## 6. Deterministic Verification

Taskに定義されたverificationを実行する。

例:

- compiler/build
- lint
- typecheck
- unit test
- integration test
- static analysis

結果はSTATEの`Last Verification`へ短く記録する。

### PASS

```text
Task Status = REVIEWING
Stage = TASK_REVIEW
Next Action = task-review-ja
```

### FAIL

Task変更に起因するfailureなら、semantic review前に限定修正する。
既存failure / environment failureはTask defectと混同しない。

## 7. Independent Review

`task-review-ja`をcold/independent contextで実行することを優先する。

主要Context:

- Task Contract
- actual diff
- relevant code
- Verification result

実装Agentの説明はcorrectness evidenceとして扱わない。

### PASS

```text
Task Status = PASS
Review Rounds += 1
```

次Taskがある場合:

```text
Current Task = 次のREADY Task
Stage = TASK_IMPLEMENT
Next Action = task-implement-ja
```

全Task PASSなら:

```text
Phase Status = CLOSING
Current Task = None
Stage = PHASE_CLOSE
Next Action = phase-close-ja
```

### FAIL: Implementation Defect

Requirement / Task Contractが正しく、実装不備なら:

```text
Task Status = REPAIRING
Review Rounds += 1
Stage = TASK_REPAIR
Active Findings = BLOCKER/MAJOR IDs
Next Action = task-repair-ja
```

### FAIL: Contract / Requirement Change Needed

Reviewerが新Requirement不足、Task Contract誤り、Architecture変更必要などを発見した場合はrepairへ送らない。

```text
Stage = CHANGE_CONTROL
Next Action = change-control-ja
```

## 8. Repair Loop

`task-repair-ja`は**既存Task Contractへの実装不備だけ**を修正する。

Repair後:

1. Verification
2. Independent Review

Repair Agent自身の「修正完了」を最終PASSに使わない。

同一TaskでReview FAILが3回になった場合は停止し、root causeを上位Artifact含めて再評価する。

## 9. Phase Close

全必須TaskがPASSしたら`phase-close-ja`を実行する。

### COMPLETE

```text
Phase Status = COMPLETE
Stage = DONE
Current Task = None
Active Change = None
Active Findings = None
Blockers = None
```

### INCOMPLETE

原因を以下へ分類する。

- missing Task
- integration gap
- Spec / Plan gap
- verification gap

必要最小限のPlanningまたはChange Controlへ戻す。

## Context Isolation Rule

全文書を全Agentへ自動投入しない。

### State Manager
- STATE
- current Task/Phase artifact
- cheap repository evidence

### Research
- Spec
- Architecture
- Phase
- source

### Planner
- Spec
- Architecture
- Phase
- Research

### Implementer
- target Task
- Architecture
- relevant source
- 必要なSpec/Research箇所のみ

### Reviewer
- target Task
- diff
- relevant source
- verification results

### Repair
- target Task
- failing findings
- relevant current source

### Change Control
- change request
- STATE
- current Task / diff
- Spec / Architecture / Phase
- impacted Research/Tasksのみ

### Phase Close
- Phase
- relevant Spec
- final Task statuses/reviews
- integrated repository state

## Scope Rule

- Phaseを飛ばさない。
- 後続Phaseのscopeを先取りしない。
- Task実装中にPlanを勝手に拡張しない。
- Task Contract外変更はchange-control-jaへ送る。
- 新Requirementをtask-repair-jaで実装しない。
- Repository truthと文書が矛盾する場合はRepository truthを優先して差異を記録する。

## 完了報告

```markdown
# Phase Workflow Result

## Phase
<Phase path/title>

## Result
COMPLETE | INCOMPLETE | BLOCKED

## State
- Stage: ...
- Current Task: ...
- Active Change: ...
- Next Action: ...

## Tasks
| Task | Status | Review Rounds |
|---|---|---:|
| T001 | PASS | 1 |

## Changes During Execution
- None

または:
- CR-xxx: classification / affected tasks

## Verification
主要check結果。

## Phase Close
COMPLETE / INCOMPLETE

## Remaining Issues
None または具体的内容。
```

## Orchestrator完了チェック

- [ ] STATEとRepository truthのcheap consistency checkを行った
- [ ] stage transitionごとにSTATEを更新した
- [ ] READYでないTaskを実装していない
- [ ] Task Contract外変更を実装へ混ぜていない
- [ ] 新Requirementをrepairとして扱っていない
- [ ] Change Controlで影響Taskだけを再計画した
- [ ] Verification PASS前にsemantic PASS扱いしていない
- [ ] Independent ReviewなしでTaskをPASSにしていない
- [ ] FAIL時は実装不備かContract変更かを分類した
- [ ] Review FAIL 3回で無限retryを停止した
- [ ] 全Task PASS後にPhase Closeを実行した
- [ ] 最終STATEがPhase結果と整合している
