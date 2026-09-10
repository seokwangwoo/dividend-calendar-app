---
name: workflow-state-ja
description: >
  Phaseベース開発Workflowの進行状態をDocs/STATE.mdに保存・復元・整合確認する。
  実装途中の変更要求はCHANGE_CONTROLとして追跡する。
  「作業状態を更新して」「どこまで進んだ？」「前回の続きから再開して」「STATE.mdを作って」など、
  セッションをまたぐ進捗管理やWorkflow再開時に使用する。
---

# Workflow State Management

## 目的

Phaseベース開発Workflowの**現在位置だけを、短く・永続的・再検証可能な形で保存する**。

`Docs/STATE.md`は仕様書でも作業ログでもない。

管理対象:

- 現在のPhase
- 現在のWorkflow stage
- Taskごとの状態
- 現在作業中のTask
- Review retry回数
- Active Change
- Active Findings
- Blocker
- Last Verification
- 次に実行すべきAction

詳細なRequirement、Research、設計判断、Review本文、Change Request本文、長い実行ログをSTATEへ複製しない。

## 基本原則

### 1. STATEはキャッシュでありRepository truthではない

矛盾した場合の優先順位:

1. git / source / test結果
2. Task / Review / Phase / Change Requestなどのdurable artifact
3. `Docs/STATE.md`

### 2. 状態だけを保存する

STATEへ本文をコピーせず、path / ID / short statusだけを記録する。

### 3. Next Actionは常に1つ

再開Agentが次の処理を再判断しなくてよいように、`Next Action`を一意にする。

### 4. Workflow transition時に即時更新する

少なくとも以下で更新する。

- Phase開始
- Research開始/完了
- Planning開始/完了
- Task開始
- Implementation完了/BLOCKED/CHANGE_CONTROL
- Verification完了/FAIL
- Review開始/PASS/FAIL
- Repair開始/完了
- Change Control開始/完了
- Task完了
- Phase Close開始
- Phase COMPLETE/INCOMPLETE/BLOCKED

## Default Path

原則:

`Docs/STATE.md`

Repositoryに既存のstate/status規則がある場合はそちらを優先する。

## 状態モデル

### Phase Status

- `NOT_STARTED`
- `RESEARCHING`
- `PLANNING`
- `EXECUTING`
- `CLOSING`
- `COMPLETE`
- `INCOMPLETE`
- `BLOCKED`

### Task Status

- `PENDING`
- `READY`
- `IMPLEMENTING`
- `VERIFYING`
- `REVIEWING`
- `REPAIRING`
- `PASS`
- `BLOCKED`

### Stage

- `IDLE`
- `PHASE_RESEARCH`
- `PHASE_PLAN`
- `TASK_IMPLEMENT`
- `TASK_VERIFY`
- `TASK_REVIEW`
- `TASK_REPAIR`
- `CHANGE_CONTROL`
- `PHASE_CLOSE`
- `DONE`
- `BLOCKED`

独自の類似statusを増やさない。

## STATE.md Format

```markdown
# Workflow State

## Current

Phase: `Phase3`
Phase File: `Docs/Plans/Phase3.md`
Phase Status: `EXECUTING`
Stage: `TASK_REVIEW`
Current Task: `T002`
Updated At: `YYYY-MM-DD HH:mm`

## Next Action

`T002`のIndependent Reviewを実行する。

Use Skill: `task-review-ja`

## Artifacts

- Spec: `Docs/Spec.md`
- Architecture: `Docs/Architecture.md`
- Phase: `Docs/Plans/Phase3.md`
- Research: `Docs/Research/Phase3.md`
- Tasks: `Docs/Tasks/Phase3/`

## Task Status

| Task | Status | Review Rounds | Depends On | Last Result |
|---|---|---:|---|---|
| T001 | PASS | 1 | - | Review PASS |
| T002 | REVIEWING | 0 | T001 | Verification PASS |
| T003 | PENDING | 0 | T002 | - |

## Active Change

- None

または:

Change: `Docs/Changes/CR-003.md`
Type: `REQUIREMENT_CHANGE`
Requested During: `Phase3 / T002 / TASK_IMPLEMENT`
Current Work: `PARTIALLY_REUSABLE`
Affected Tasks: `T002, T003`
Preserved Tasks: `T001`

## Active Findings

- None

または:

- `T002 / R001 / MAJOR`

## Blockers

- None

または:

- `B001`: <短い説明> — Evidence: `<path or command>`

## Last Verification

Task: `T002`
Result: `PASS`
Checks:
- `<command>`: PASS

## Resume Notes

再開時に必要な短い注意点のみ。最大5項目程度。
```

## 初期化

`Docs/STATE.md`が存在しない場合:

1. 対象Phaseを特定する。
2. Research artifactの有無を確認する。
3. Task directoryの有無を確認する。
4. Review / Change Request / verification artifactを必要範囲で確認する。
5. git status / current source stateを軽く確認する。
6. 実状態からSTATEを再構築する。

会話だけを根拠に完了状態を作らない。

## Resume

再開時:

1. STATEを読む。
2. Current Phase / Stage / Current Task / Next Action / Active Change / Active Findings / Blockersを抽出する。
3. cheap consistency checkを行う。
4. 整合していれば`Next Action`から再開する。
5. 矛盾があればRepository truthに合わせてSTATEを修正する。

Cheap consistency check例:

- Phase fileが存在するか
- Current Task fileが存在するか
- PASS TaskにReview PASS evidenceがあるか
- Active Change pathが存在するか
- current git stateがSTATEと明らかに矛盾していないか

毎回Repository全体を再調査しない。

## Transition Rules

### Phase開始

```text
Phase Status = RESEARCHING
Stage = PHASE_RESEARCH
Current Task = None
Next Action = phase-research-ja
```

### Research完了

```text
Phase Status = PLANNING
Stage = PHASE_PLAN
Next Action = phase-task-plan-ja
```

### Task Planning完了

```text
Phase Status = EXECUTING
Stage = TASK_IMPLEMENT
Current Task = 最初のREADY Task
Next Action = task-implement-ja
```

### Task開始

```text
Task Status = IMPLEMENTING
Stage = TASK_IMPLEMENT
Current Task = Txxx
```

### Implementation完了

```text
Task Status = VERIFYING
Stage = TASK_VERIFY
Next Action = Task Verification
```

### Implementation中にTask Contract外変更が発生

```text
Phase Status = EXECUTING
Stage = CHANGE_CONTROL
Current Task = Txxx
Task Status = IMPLEMENTING
Next Action = change-control-ja
```

この時点ではcurrent diffを自動revertしない。

### Change Control開始

Active Changeへ以下を記録する。

- Change Request path またはInline Change
- Classification
- Requested During
- Current Work reuse status
- Affected Tasks
- Preserved Tasks

詳細Requirement本文はSTATEへ書かない。

### Change Control完了

上位Artifactと影響Taskの更新が完了し、通常Workflowへ戻れる場合:

```text
Phase Status = EXECUTING
Stage = TASK_IMPLEMENT
Current Task = 次のREADY Task
Next Action = task-implement-ja
Active Change = None または直近CR pathのみ
```

Task statusはChange Control結果に従い再計算する。

- 影響なし → `PASS`維持
- 再実装必要 → `READY` / `PENDING`
- 再検証のみ必要 → 実装を維持し、Workflow上でverificationへ戻す

### Change Controlで未決事項が残る

```text
Phase Status = BLOCKED
Stage = CHANGE_CONTROL
Next Action = 未決decisionを解消する
```

### Verification PASS

```text
Task Status = REVIEWING
Stage = TASK_REVIEW
Next Action = task-review-ja
```

### Verification FAIL

Task起因なら:

```text
Task Status = IMPLEMENTING
Stage = TASK_IMPLEMENT
Next Action = verification failureの限定修正
```

### Review PASS

```text
Task Status = PASS
Review Rounds += 1
```

次のdependencyを再評価する。

全Task PASSなら:

```text
Phase Status = CLOSING
Current Task = None
Stage = PHASE_CLOSE
Next Action = phase-close-ja
```

### Review FAIL

```text
Task Status = REPAIRING
Review Rounds += 1
Stage = TASK_REPAIR
Active Findings = BLOCKER/MAJOR Finding IDs
Next Action = task-repair-ja
```

ただしReview中に**新RequirementまたはTask Contract変更が必要と判明した場合**はrepairへ送らない。

```text
Stage = CHANGE_CONTROL
Next Action = change-control-ja
```

### Repair完了

```text
Task Status = VERIFYING
Stage = TASK_VERIFY
Next Action = Verification再実行
```

### Review FAIL 3回

```text
Task Status = BLOCKED
Phase Status = BLOCKED
Stage = BLOCKED
```

root cause候補をSpec / Architecture / Research / Task Plan / Implementation / Environmentへ分類する。

### Phase COMPLETE

```text
Phase Status = COMPLETE
Stage = DONE
Current Task = None
Next Action = 次Phaseを開始、またはWorkflow終了
Active Change = None
Active Findings = None
Blockers = None
```

## Task Dependency更新

TaskがPASS、再計画、またはinvalidateされるたびにdependencyを再評価する。

- dependencyがすべてPASS → `READY`
- dependency未完了 → `PENDING`
- dependency BLOCKED → 原則`PENDING`

PASS済みTaskはChange Controlで明示的に`INVALIDATE`または`REVERIFY`されない限りPASSを保持する。

## Active Change管理

STATEはChange Request本文を保存しない。

保存するのは:

- CR path
- classification
- affected/preserved tasks
- current work reuse status

Change Control完了後は古い詳細を削除する。
履歴は`Docs/Changes/`とgit historyへ任せる。

## Active Findings管理

STATEにはReview本文を保存せず、`Task / Finding ID / Severity`のみ保持する。

## Blocker

Blockerは`B001`, `B002`...で管理し、必ずevidenceを付ける。

## STATE Size Rule

`Docs/STATE.md`は原則150行以内を目標にする。

長くなったら:

- 完了Task詳細を削る
- 古いverification詳細を削る
- 解決済みBlockerを削る
- 完了済みChangeの詳細を削る

append-only logにしない。

## 禁止事項

- STATEに仕様を新規決定しない。
- STATEだけを根拠にTaskをPASSにしない。
- ReviewなしでTaskをPASSにしない。
- Change Request本文をSTATEへ複製しない。
- Task Contract外変更を通常repairとして扱わない。
- conversation transcriptを貼らない。
- STATEと実状態の矛盾を無視しない。

## 完了チェック

- [ ] Current Phaseが一意
- [ ] Phase Status / Stage / Task Statusが許可値
- [ ] Current TaskとTask tableが整合する
- [ ] Review Roundsが最新
- [ ] Active ChangeがChange Requestと整合する
- [ ] Active Findingsが最新Reviewと整合する
- [ ] Blockerにevidenceがある
- [ ] Next Actionが1つに決まっている
- [ ] 詳細Artifactを重複コピーしていない
- [ ] STATEがRepository truthと大きく矛盾していない
