---
name: workflow-state-ja
description: >
  Phaseベース開発Workflowの進行状態をDocs/STATE.mdに保存・復元・整合確認する。
  「作業状態を更新して」「どこまで進んだ？」「前回の続きから再開して」「STATE.mdを作って」など、
  セッションをまたぐ進捗管理やWorkflow再開時に使用する。
---

# Workflow State Management

## 目的

Phaseベース開発Workflowの**現在位置だけを、短く・永続的・再検証可能な形で保存する**。

`Docs/STATE.md`は仕様書でも作業ログでもない。

このSkillが管理するのは主に次の情報である。

- 現在のPhase
- 現在のWorkflow stage
- Taskごとの状態
- 現在作業中のTask
- Review retry回数
- Blocker
- 次に実行すべきAction
- Workflow再開に必要な最小限の参照先

詳細なRequirement、Research、設計判断、Review本文、長い実行ログをSTATEへ複製しない。

## 基本原則

### 1. STATEはキャッシュでありRepository truthではない

`Docs/STATE.md`は再開を高速化するためのdurable stateである。

STATEとRepositoryの実状態が矛盾した場合は、以下を優先する。

1. git / source / test結果
2. Task / Review / Phaseなどのdurable artifact
3. `Docs/STATE.md`

STATEを盲信しない。

### 2. 状態だけを保存する

STATEへ以下をコピーしない。

- Spec全文
- Architecture全文
- Research全文
- Task本文
- Review finding全文
- test log全文
- conversation summary

代わりにpathやFinding IDだけを記録する。

### 3. 常に次のActionを一意にする

STATEを読んだAgentが「次に何をすべきか」を再判断しなくてよいように、`Next Action`を必ず1つ定義する。

### 4. 更新はWorkflow transition時に行う

少なくとも次のタイミングでSTATEを更新する。

- Phase開始
- Research開始/完了
- Planning開始/完了
- Task開始
- Implementation完了/BLOCKED
- Verification完了/FAIL
- Review開始/PASS/FAIL
- Repair開始/完了
- Task完了
- Phase Close開始
- Phase COMPLETE/INCOMPLETE/BLOCKED

## Default Path

原則:

`Docs/STATE.md`

Repositoryに既存のstate/status規則がある場合はそれを優先し、重複ファイルを作らない。

## 状態モデル

### Phase Status

次の値のみ使用する。

- `NOT_STARTED`
- `RESEARCHING`
- `PLANNING`
- `EXECUTING`
- `CLOSING`
- `COMPLETE`
- `INCOMPLETE`
- `BLOCKED`

### Task Status

次の値のみ使用する。

- `PENDING`
- `READY`
- `IMPLEMENTING`
- `VERIFYING`
- `REVIEWING`
- `REPAIRING`
- `PASS`
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

## Active Findings

- None

または:

- `T002 / R001 / MAJOR`
- `T002 / R003 / BLOCKER`

Finding本文はReview artifactを参照する。

## Blockers

- None

または:

- `B001`: <短い説明> — Evidence: `<path or command>`

## Last Verification

Task: `T002`
Result: `PASS`
Checks:
- `npm run typecheck`: PASS
- `npm test -- ...`: PASS

詳細ログは保存先があればpathだけ記録する。

## Resume Notes

再開時に必要な短い注意点のみ。
最大5項目程度。
```

## Stage Values

`Stage`は次のいずれかを使用する。

- `IDLE`
- `PHASE_RESEARCH`
- `PHASE_PLAN`
- `TASK_IMPLEMENT`
- `TASK_VERIFY`
- `TASK_REVIEW`
- `TASK_REPAIR`
- `PHASE_CLOSE`
- `DONE`
- `BLOCKED`

## 初期化手順

`Docs/STATE.md`が存在しない場合:

1. 対象Phaseを特定する。
2. Research artifactの有無を確認する。
3. Task directoryの有無を確認する。
4. Review artifactやverification evidenceがあれば確認する。
5. git status / current source stateを必要範囲で確認する。
6. 実状態からSTATEを構築する。

会話だけを根拠に「ここまで完了した」と書かない。

## Resume手順

ユーザーが「続きから」「前回の続き」などと指示した場合:

### 1. STATEを読む

次を抽出する。

- Current Phase
- Phase Status
- Stage
- Current Task
- Next Action
- Active Findings
- Blockers

### 2. Cheap Consistency Check

STATEをそのまま信用せず、最低限確認する。

例:

- Phase fileが存在するか
- Current Task fileが存在するか
- PASS TaskのReview PASS evidenceが存在するか
- current git stateが明らかにSTATEと矛盾していないか

すべてのsourceを再調査してはならない。必要最小限のverificationにする。

### 3. 差異がない場合

`Next Action`から再開する。

### 4. 差異がある場合

STATEを現在のRepository truthへ修正してから再開する。

重要な差異は`Resume Notes`へ一時的に記録する。

## Transition Rules

### Phase開始

```text
Phase Status = RESEARCHING
Stage = PHASE_RESEARCH
Current Task = None
Next Action = phase-research-ja
```

### Research PASS

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

Task dependencyを評価して、実行可能なTaskのみ`READY`にする。

### Implementation完了

```text
Task Status = VERIFYING
Stage = TASK_VERIFY
Next Action = Task Verification
```

### Implementation BLOCKED

```text
Task Status = BLOCKED
Phase Status = BLOCKED
Stage = BLOCKED
```

Blocker evidenceを記録する。

### Verification PASS

```text
Task Status = REVIEWING
Stage = TASK_REVIEW
Next Action = task-review-ja
```

### Verification FAIL

Task自身の変更に起因するFAILであれば:

```text
Task Status = IMPLEMENTING
Stage = TASK_IMPLEMENT
Next Action = verification failureの限定修正
```

既存failure / environment failureの場合はBlockerまたはKnown conditionとして区別する。

### Review PASS

```text
Task Status = PASS
Review Rounds += 1
```

その後dependencyを再評価する。

次のTaskがあれば:

```text
次Task = READY
Current Task = 次Task
Stage = TASK_IMPLEMENT
```

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

`Spec / Architecture / Research / Task Plan / Implementation / Environment`のどこにroot causeがある可能性が高いか記録する。

### Phase COMPLETE

```text
Phase Status = COMPLETE
Stage = DONE
Current Task = None
Next Action = 次Phaseを開始、またはWorkflow終了
Active Findings = None
Blockers = None
```

### Phase INCOMPLETE

```text
Phase Status = INCOMPLETE
Stage = BLOCKED
```

missing Task / integration gap / Spec・Plan gap / verification gapを記録する。

## Task Dependency更新

TaskがPASSするたびにTask dependencyを再評価する。

- dependencyがすべてPASS → `READY`
- dependencyが未完了 → `PENDING`
- dependencyがBLOCKED → 原則`PENDING`のまま。必要ならBlocker説明を追加。

並列実行可能なREADY Taskが複数あっても、`Current Task`はmain workflowが現在追跡する1件を記録する。
並列Taskを実際に走らせる場合はTask Status tableをauthoritativeに使う。

## Active Findings管理

STATEにはReview本文を保存しない。

保存するのは以下だけ。

```text
Task / Finding ID / Severity
```

Findingが解消されたらActive Findingsから削除する。

MINOR findingは次Taskを止めない限りActive Findingsへ残す必要はない。

## Blocker ID

Blockerは`B001`, `B002`...で管理する。

Blockerには必ず最低1つのevidenceを付ける。

悪い例:

`B001: APIがおかしい`

良い例:

`B001: test environment用credentialが未設定 — Evidence: integration test error XXX`

## STATE Size Rule

`Docs/STATE.md`は原則150行以内を目標にする。

長くなった場合:

- 完了Taskの詳細を削る
- 古いverification詳細を削る
- 解決済みBlockerを削る
- historyはgit historyへ任せる

STATEをappend-only logにしない。

## 禁止事項

- STATEに仕様を新規決定しない。
- STATEだけを根拠にTaskをPASSにしない。
- ReviewなしでTaskをPASSにしない。
- 古いFindingを永遠に残さない。
- conversation transcriptを貼らない。
- 毎回Repository全体を再調査しない。
- STATEと実状態の矛盾を無視しない。

## 完了チェック

STATE更新後に確認する。

- [ ] Current Phaseが一意
- [ ] Phase Statusが許可値
- [ ] Stageが許可値
- [ ] Task statusが許可値
- [ ] Current TaskとTask tableが矛盾していない
- [ ] Review Roundsが最新
- [ ] Active Findingsが最新Reviewと整合する
- [ ] Blockerにevidenceがある
- [ ] Next Actionが1つに決まっている
- [ ] 詳細文書を重複コピーしていない
- [ ] STATEがRepository truthと大きく矛盾していない
