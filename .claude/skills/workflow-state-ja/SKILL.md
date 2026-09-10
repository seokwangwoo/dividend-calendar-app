---
name: workflow-state-ja
description: >
  Phase WorkflowとQuick Change Workflowの進行状態をDocs/STATE.mdに保存・復元・整合確認する。
  実装途中の変更要求はCHANGE_CONTROLとして追跡する。
---

# Workflow State Management

## 目的

開発Workflowの**現在位置だけを、短く・永続的・再検証可能な形で保存する**。

`Docs/STATE.md`は仕様書でも作業ログでもない。

対応するWork Type:

- `PHASE`
- `QUICK_CHANGE`

管理対象:

- Work Type
- Current PhaseまたはCurrent Quick Change
- Workflow Stage
- Current Task
- Task / Quick Change Status
- Review retry回数
- Active Change
- Active Findings
- Blocker
- Last Verification
- Next Action

詳細なSpec、Research、Task本文、Review本文、Change Request本文、長い実行ログはSTATEへ複製しない。

## 基本原則

### STATEはRepository truthより下位

矛盾した場合の優先順位:

1. git / source / test結果
2. Task / Review / Phase / Quick Contract / Change Requestなどのdurable artifact
3. `Docs/STATE.md`

### Next Actionは常に1つ

再開Agentが次の処理を再判断しなくてよいようにする。

### transition時に即時更新

Workflow stageが変わるたびに更新する。

## Default Path

`Docs/STATE.md`

Repositoryに既存規則がある場合はそちらを優先する。

## 状態モデル

### Work Type

- `PHASE`
- `QUICK_CHANGE`

### Phase Status

PHASE時のみ使用:

- `NOT_STARTED`
- `RESEARCHING`
- `PLANNING`
- `EXECUTING`
- `CLOSING`
- `COMPLETE`
- `INCOMPLETE`
- `BLOCKED`

### Task Status

PHASE Taskで使用:

- `PENDING`
- `READY`
- `IMPLEMENTING`
- `VERIFYING`
- `REVIEWING`
- `REPAIRING`
- `PASS`
- `BLOCKED`

### Quick Change Status

QUICK_CHANGE時に使用:

- `DRAFTING`
- `READY`
- `IMPLEMENTING`
- `VERIFYING`
- `REVIEWING`
- `REPAIRING`
- `COMPLETE`
- `BLOCKED`
- `ESCALATED`

### Stage

- `IDLE`
- `PHASE_PLAN`
- `PHASE_REVIEW`
- `PHASE_RESEARCH`
- `TASK_PLAN`
- `TASK_IMPLEMENT`
- `TASK_VERIFY`
- `TASK_REVIEW`
- `TASK_REPAIR`
- `QUICK_CHANGE`
- `CHANGE_CONTROL`
- `PHASE_CLOSE`
- `DONE`
- `BLOCKED`

独自の類似statusを増やさない。

## STATE.md Format

```markdown
# Workflow State

## Current

Work Type: `PHASE | QUICK_CHANGE`
Phase: `Phase3 | None`
Phase File: `Docs/Plans/Phase3.md | None`
Phase Status: `EXECUTING | None`
Current Quick Change: `QC-003 | None`
Quick Change Status: `REVIEWING | None`
Stage: `TASK_REVIEW | QUICK_CHANGE | ...`
Current Task: `T002 | QC-003 | None`
Updated At: `YYYY-MM-DD HH:mm`

## Next Action

<次に行うActionを1つだけ書く>

Use Skill: `<skill-name>`

## Artifacts

- Spec: `Docs/Spec.md`
- Architecture: `Docs/Architecture.md`
- Phase: `... | None`
- Research: `... | None`
- Tasks: `... | None`
- Quick Change: `Docs/QuickChanges/QC-003.md | None`

## Task Status

| Task | Status | Review Rounds | Depends On | Last Result |
|---|---|---:|---|---|

Quick Changeのみの場合は省略可。

## Active Change

- None

またはCR path / classification / affected tasksだけを短く記録。

## Active Findings

- None

または:
- `T002 / R001 / MAJOR`
- `QC-003 / R002 / BLOCKER`

## Blockers

- None

または:
- `B001`: <短い説明> — Evidence: `<path or command>`

## Last Verification

Contract: `T002 | QC-003`
Result: `PASS | FAIL | SKIPPED`
Checks:
- `<command>`: PASS

## Resume Notes

再開時に必要な短い注意点のみ。最大5項目程度。
```

## 初期化・再開

STATEがない場合、対象Work Typeを判断し、実際のArtifactとgit/source状態から最小STATEを構築する。

再開時は:

1. STATEを読む
2. Current Work / Stage / Next Actionを抽出
3. cheap consistency checkを行う
4. 整合していればNext Actionから再開
5. 矛盾があればRepository truthへ補正

Cheap consistency check例:

- Current Phase / Quick Contractが存在するか
- Current Taskが存在するか
- PASS/COMPLETEにReview evidenceがあるか
- Active Change pathが存在するか
- git stateが明らかに矛盾していないか

毎回Repository全体を再調査しない。

## PHASE Transition Rules

### Phase Plan

```text
Work Type = PHASE
Stage = PHASE_PLAN
```

### Phase Review

```text
Stage = PHASE_REVIEW
```

### Research

```text
Phase Status = RESEARCHING
Stage = PHASE_RESEARCH
```

### Task Planning

```text
Phase Status = PLANNING
Stage = TASK_PLAN
```

### Task開始

```text
Phase Status = EXECUTING
Stage = TASK_IMPLEMENT
Current Task = Txxx
Task Status = IMPLEMENTING
```

### Verification

```text
Stage = TASK_VERIFY
Task Status = VERIFYING
```

### Review

```text
Stage = TASK_REVIEW
Task Status = REVIEWING
```

### Review PASS

```text
Task Status = PASS
Review Rounds += 1
```

全Task PASSなら:

```text
Phase Status = CLOSING
Stage = PHASE_CLOSE
Current Task = None
Next Action = phase-close-ja
```

### Review FAIL

```text
Task Status = REPAIRING
Review Rounds += 1
Stage = TASK_REPAIR
Next Action = task-repair-ja
```

### Contract外変更

```text
Stage = CHANGE_CONTROL
Next Action = change-control-ja
```

### Phase COMPLETE

```text
Phase Status = COMPLETE
Stage = DONE
Current Task = None
```

## QUICK_CHANGE Transition Rules

### Quick Change Draft

```text
Work Type = QUICK_CHANGE
Current Phase = None
Phase Status = None
Stage = QUICK_CHANGE
Current Quick Change = QC-xxx
Quick Change Status = DRAFTING
Current Task = QC-xxx
Next Action = Quick Contract作成
```

### Ready

```text
Quick Change Status = READY
Next Action = task-implement-ja
```

### Implement

```text
Quick Change Status = IMPLEMENTING
Stage = QUICK_CHANGE
Current Task = QC-xxx
```

### Verify

```text
Quick Change Status = VERIFYING
Stage = QUICK_CHANGE
```

### Review

```text
Quick Change Status = REVIEWING
Stage = QUICK_CHANGE
Next Action = task-review-ja
```

### Review FAIL

```text
Quick Change Status = REPAIRING
Review Rounds += 1
Next Action = task-repair-ja
```

### Review PASS

```text
Quick Change Status = COMPLETE
Stage = DONE
Current Task = None
Next Action = 次の作業、またはWorkflow終了
```

### Quick Eligibility喪失

```text
Quick Change Status = ESCALATED
Stage = QUICK_CHANGE
Next Action = phase-plan-ja
```

現在diffは自動revertしない。

### Quick BLOCKED

```text
Quick Change Status = BLOCKED
Stage = BLOCKED
```

## Review Retry

Phase Task / Quick Changeともに、同一ContractでIndependent Review FAILが3回続いた場合は無限retryしない。

- Phase Task: 上位Artifact問題を診断
- Quick Change: Phase昇格またはroot cause診断

## Active Change / Finding管理

STATEには本文を書かない。

保存するのは:

- path / ID
- classification
- severity
- affected scope

解決済み情報は削除する。履歴はArtifactとgit historyへ任せる。

## STATE Size Rule

原則150行以内を目標にする。

append-only logにしない。

## 禁止事項

- STATEにRequirementやArchitecture decisionを新規定義しない
- STATEだけを根拠にPASS/COMPLETEにしない
- Independent ReviewなしでPASS/COMPLETEにしない
- transcriptや長いlogを貼らない
- Current WorkとRepository truthの矛盾を無視しない

## 完了チェック

- [ ] Work Typeが明確
- [ ] Current PhaseまたはCurrent Quick Changeが一意
- [ ] Status / Stageが許可値
- [ ] Current TaskとArtifactが整合
- [ ] Review Roundsが最新
- [ ] Active Change / Findingsが最新
- [ ] Blockerにevidenceがある
- [ ] Next Actionが1つ
- [ ] STATEがRepository truthと大きく矛盾していない
