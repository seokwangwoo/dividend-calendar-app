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

## Truth Priority

1. git / source / test結果
2. Spec / Architecture / Phase / Task / Review / Change Request
3. `Docs/STATE.md`

矛盾時は上位を優先し、STATEを修正する。

## Work Type

- `PHASE`
- `QUICK_CHANGE`

## Stage

- `IDLE`
- `PHASE_PLAN`
- `PHASE_REVIEW`
- `PHASE_RESEARCH`
- `TASK_PLAN`
- `TASK_IMPLEMENT`
- `TASK_VERIFY`
- `TASK_REVIEW`
- `TASK_REPAIR`
- `CHANGE_CONTROL`
- `PHASE_CLOSE`
- `DONE`
- `BLOCKED`

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

## Transition Rules

- Phase作成開始 → `PHASE_PLAN`
- Phase Plan作成後 → `PHASE_REVIEW`
- Phase Review PASS → `PHASE_RESEARCH`
- Research完了 → `TASK_PLAN`
- Task Planning完了 → 最初のREADY Taskを`TASK_IMPLEMENT`
- 実装開始 → `IMPLEMENTING`
- 実装完了 → `VERIFYING` / `TASK_VERIFY`
- Verification PASS → `REVIEWING` / `TASK_REVIEW`
- Review PASS → Task=`PASS`; 次Taskまたは`PHASE_CLOSE`
- Review FAIL → `REPAIRING` / `TASK_REPAIR`
- Repair完了 → `VERIFYING`へ戻す
- Contract外変更 → `CHANGE_CONTROL`
- 同一TaskのReview FAILが3回 → `BLOCKED`
- 全Task PASS → `PHASE_CLOSE`
- Phase Close COMPLETE → `DONE`

Quick ChangeはPhase Plan/Research/Task Planを省略し、`quick-change`でContract作成後に`task-implement`へ進む。

## Resume

再開時はSTATEを読み、Current/Next Actionを抽出してcheap consistency checkを行う。
最低限、対象Artifactの存在、PASS TaskのReview evidence、Active Change path、git stateの明らかな矛盾を確認する。

## Rules

- Next Actionは常に1つ。
- Task本文、diff全文、test log全文をSTATEへコピーしない。
- Independent Review前にTaskをPASSへしない。
- Active FindingはID/Severityだけを保持する。
- Active ChangeはCR path/classification/affected workだけを保持する。
- 原則150行以内を目標にする。
