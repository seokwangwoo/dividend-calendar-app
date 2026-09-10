---
name: workflow-state
description: >
  PhaseまたはQuick Changeの進行状態をDocs/STATE.mdに保存・復元・整合確認する。
  セッション再開、Task遷移、Review/Repair/Change Control時の状態更新に使用する。
---

# Workflow State

## 目的

`Docs/STATE.md`に現在位置だけを短く保存し、別セッションでも次のActionから安全に再開できるようにする。
STATEは仕様書でも履歴ログでもなく、Repository truthの下位にあるdurable cacheである。

## Intent Policy

`phase-intent`のIntent Briefは**session-only**であり、STATEへ保存しない。

Phase workflowでdurable state管理を開始するのは、原則としてIntentが明確になり`phase-research`を開始するときからとする。
Intent確定前にセッションが切れた場合は、STATEから推測せず`phase-intent`を再実行する。

## Truth Priority

1. git / source / test結果
2. Spec / Architecture / Research / Phase / Task / Review / Change Request
3. `Docs/STATE.md`

矛盾時は上位を優先し、STATEを修正する。

## Work Type

- `PHASE`
- `QUICK_CHANGE`

## Stage

- `IDLE`
- `PHASE_RESEARCH`
- `PHASE_PLAN`
- `PHASE_REVIEW`
- `TASK_PLAN`
- `TASK_IMPLEMENT`
- `TASK_VERIFY`
- `TASK_REVIEW`
- `TASK_REPAIR`
- `CHANGE_CONTROL`
- `PHASE_CLOSE`
- `DONE`
- `BLOCKED`

`PHASE_INTENT`はdurable Stageとして持たない。

## Task Status

- `PENDING`
- `READY`
- `IMPLEMENTING`
- `VERIFYING`
- `REVIEWING`
- `REPAIRING`
- `PASS`
- `BLOCKED`

## 必須情報

```markdown
# Workflow State

## Current
Work Type: `PHASE | QUICK_CHANGE`
Phase: `PhaseN | None`
Quick Change: `QC-xxx | None`
Stage: `...`
Current Task: `Txxx | QC-xxx | None`
Updated At: `YYYY-MM-DD HH:mm`

## Next Action
<次に1つだけ行うAction>
Use Skill: `<skill-name>`

## Task Status
| Task | Status | Review Rounds | Depends On | Last Result |
|---|---|---:|---|---|

## Active Change
- None

## Active Findings
- None

## Blockers
- None

## Last Verification
- None
```

## Phase Transition Rules

### Intent完了

IntentはSTATEへ書かない。
同一セッションで`phase-research`を開始する。

### Research開始

```text
Work Type = PHASE
Stage = PHASE_RESEARCH
Current Task = None
Next Action = phase-research
```

### Research完了

```text
Stage = PHASE_PLAN
Next Action = phase-plan
```

### Phase Plan作成後

```text
Stage = PHASE_REVIEW
Next Action = phase-review
```

### Phase Review PASS

```text
Stage = TASK_PLAN
Next Action = phase-task-plan
```

### Phase Review FAIL

Findingの`Fix At`が`PHASE_PLAN`なら:

```text
Stage = PHASE_PLAN
Next Action = phase-planでFindingのみ修正
```

### Phase Review UPSTREAM_BLOCKED

Fix Atに従う。

- `PHASE_RESEARCH` → Stage=`PHASE_RESEARCH`, Next Action=`phase-research`
- `PHASE_INTENT` → session内で`phase-intent`を再実行し、その後`PHASE_RESEARCH`
- `SPEC` → Stage=`BLOCKED`または変更管理規則に従いSpec更新
- `ARCHITECTURE` → Stage=`BLOCKED`または変更管理規則に従いArchitecture更新

`PHASE_INTENT`自体をSTATE Stageとして保存しない。

### Task Planning完了

```text
Stage = TASK_IMPLEMENT
Current Task = 最初のREADY Task
Next Action = task-implement
```

### 実装開始

Task=`IMPLEMENTING`, Stage=`TASK_IMPLEMENT`。

### 実装完了

Task=`VERIFYING`, Stage=`TASK_VERIFY`。

### Verification PASS

Task=`REVIEWING`, Stage=`TASK_REVIEW`, Next Action=`task-review`。

### Review PASS

Task=`PASS`。
Dependencyを再評価し、次READY Taskへ進む。
全Task PASSなら`PHASE_CLOSE`。

### Review FAIL

Task=`REPAIRING`, Stage=`TASK_REPAIR`, Next Action=`task-repair`。

### Repair完了

Task=`VERIFYING`, Stage=`TASK_VERIFY`へ戻す。

### Contract外変更

Stage=`CHANGE_CONTROL`。

### 同一Task Review FAIL 3回

Stage=`BLOCKED`。
Spec / Architecture / Research / Task Plan / Implementation / Environmentをroot cause候補として確認する。

### Phase Close COMPLETE

Stage=`DONE`。

## Quick Change

Quick ChangeはPhase Intent / Research / Plan / Task Planを省略できる。
`quick-change`でContract作成後、直接`TASK_IMPLEMENT`へ進む。

Quick ChangeがPhaseへ昇格する場合は、既存QC ContractをSource of Truthにせず、必要な要求を`phase-intent`で再確認してから`phase-research`へ進む。

## Resume

再開時はSTATEを読み、Current / Next Actionを抽出してcheap consistency checkを行う。
最低限、対象Artifactの存在、PASS TaskのReview evidence、Active Change path、git stateの明らかな矛盾を確認する。

Research完了前のIntentはSTATEにないため、Research artifactが存在しないのにPhase workflowを再開する場合は必要に応じて`phase-intent`から再開する。

## Rules

- Next Actionは常に1つ。
- Intent BriefをSTATEへコピーしない。
- Task本文、diff全文、test log全文をSTATEへコピーしない。
- Independent Review前にTaskをPASSへしない。
- Active FindingはID / Severity / Fix Atだけを保持する。
- Active ChangeはCR path / classification / affected workだけを保持する。
- 原則150行以内を目標にする。
