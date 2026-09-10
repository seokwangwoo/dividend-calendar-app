---
name: change-control-ja
description: >
  Phase Planning完了後またはTask実行中に発生した仕様変更・追加要求・設計変更を分類し、
  必要な上位文書だけを更新して影響Taskを再計画する。
  「途中で要件が変わった」「この機能も追加したい」「実装中に仕様変更が出た」など、
  既存Task Contractの外側に変更が発生した場合に使用する。
---

# Change Control

## 目的

実装途中に発生した変更要求を現在Taskへ無秩序に混ぜず、
**変更が発生した抽象化レベルまでだけ戻ってSource of Truthを更新し、影響を受ける下位Artifactだけを再計画する。**

このSkillは通常のReview Finding修正には使用しない。
Reviewで既存Task Contractへの違反が見つかっただけなら`task-repair-ja`を使用する。

## Core Rule

変更要求をその場で実装しない。

まず以下を行う。

1. 現在作業を安全な位置で止める
2. 現在diffとSTATEを保存する
3. 変更を分類する
4. 影響範囲を特定する
5. 必要な上位Artifactのみ更新する
6. 影響Taskだけを再計画する
7. STATEを更新して再開する

完了済みで影響を受けないTaskをやり直さない。

## 入力

必須:

- ユーザーまたは業務側からの変更要求
- `Docs/STATE.md`
- `Docs/Spec.md`
- `Docs/Architecture.md`
- 対象 `Docs/Plans/PhaseN.md`
- 対象PhaseのTask群
- 現在のRepository state / git diff

必要な場合のみ:

- `Docs/Research/PhaseN.md`
- Review artifact
- 関連ソースコード

## 言語ルール

- 分析・変更記録・報告は日本語で記述する。
- code identifier / file path / API / log / errorは原文を保持する。
- 社内用語は既存文書・ソースコードの表記を優先する。

## Change Classification

変更要求を必ず次のいずれかに分類する。

### A. IMPLEMENTATION_DETAIL

ユーザー観点のBehavior、Requirement、Acceptance Criteriaは変わらない。

例:

- 想定していたhelperではなく既存helperを使う
- 実際のRepository構造に合わせて実装場所を変える
- 既存Patternへ合わせる

対応:

- 原則としてSpec / Architecture / Phase Planは変更しない
- 現Task内で最小対応する
- 必要ならTaskの`Expected Changes`や`Existing Code Evidence`だけ更新する
- 実装結果の`Deviations`へ記録する

### B. TASK_SCOPE_CHANGE

Requirement自体は変わらないが、既存Task Contractでは安全に完了できない。

例:

- 追加の既存module変更が必要と判明
- dependencyが不足
- Taskの分割境界が不適切

対応:

- Specは原則変更しない
- Researchを必要範囲だけ再確認する
- 対象Taskを修正、分割、または追加する
- dependency / verification / Done Whenを再計画する

### C. REQUIREMENT_CHANGE

ユーザー・装置・システムから観測されるBehaviorが変わる。

例:

- 保存前に確認Dialogを追加
- timeout時の挙動を変更
- 新しいfailure behaviorを追加
- 新しいuser scenarioを追加

対応:

1. `Docs/Spec.md`を更新する
2. 必要なら関連Requirement / Acceptance Criteria IDを追加・変更する
3. 既存Researchがまだ有効か評価する
4. 必要な範囲だけResearchを追加する
5. 対象Phase Planを更新する
6. 影響Taskのみ再計画する

### D. ARCHITECTURE_CHANGE

Component boundary、data flow、thread/process responsibility、protocol、persistence strategy等の設計前提が変わる。

例:

- sync処理をworker threadへ移行
- direct DB accessをqueue経由に変更
- IPC方式を変更
- service/repository boundaryを変更

対応:

1. `Docs/Architecture.md`を更新する
2. 必要に応じて`Docs/Spec.md`との整合を確認する
3. 影響範囲をResearchし直す
4. Phase Planを更新する
5. 影響Taskのみ再計画する

## Classification Rule

迷う場合は「何が変わったか」で判断する。

- HOWだけ変わる → `IMPLEMENTATION_DETAIL`
- Task boundaryだけ変わる → `TASK_SCOPE_CHANGE`
- WHAT / observable behaviorが変わる → `REQUIREMENT_CHANGE`
- system responsibility / boundary / flowが変わる → `ARCHITECTURE_CHANGE`

複数に該当する場合は最も上位の変更を採用する。

優先順位:

`ARCHITECTURE_CHANGE > REQUIREMENT_CHANGE > TASK_SCOPE_CHANGE > IMPLEMENTATION_DETAIL`

## Change Request Artifact

`IMPLEMENTATION_DETAIL`以外でPlanまたは上位文書の変更が必要な場合、原則としてChange Requestを作成する。

保存先:

`Docs/Changes/CR-xxx.md`

Repositoryに既存の変更管理規則がある場合はそちらを優先する。

番号は既存CRの次番号を使用する。

### Format

```markdown
# CR-xxx - <short title>

## Requested Change

変更要求を短く記述する。

## Reason

変更理由。分からない場合は`UNKNOWN`とする。

## Classification

IMPLEMENTATION_DETAIL | TASK_SCOPE_CHANGE | REQUIREMENT_CHANGE | ARCHITECTURE_CHANGE

## Requested During

Phase: `PhaseN`
Task: `Txxx` または `None`
Stage: `TASK_IMPLEMENT` 等

## Current Work State

- current diffの有無
- 実装途中か
- 既存変更を再利用可能か

## Affected Artifacts

- `Docs/Spec.md`
- `Docs/Architecture.md`
- `Docs/Plans/PhaseN.md`
- `Docs/Research/PhaseN.md`
- `Docs/Tasks/PhaseN/Txxx.md`

必要なものだけ記載する。

## Affected Requirements

- FR-xxx
- AC-xxx

該当しなければ`None`。

## Affected Tasks

- Txxx: INVALIDATE | REPLAN | REVERIFY

## Preserved Tasks

- Txxx: 影響なし。既存PASSを保持。

## Required Updates

更新すべきartifactを順序付きで記載する。

## Resume Condition

何が完了したら通常Workflowへ戻れるか。
```

## 実行中Taskの扱い

変更要求が入った時点で、現在の実装をむやみにrevertしない。

### 1. 現在状態を保存

確認する。

- current Task
- git diff
- uncommitted files
- latest verification
- latest review status

### 2. 再利用可能性を判定

現在変更を次のいずれかに分類する。

- `REUSABLE`: 新しい要求でもそのまま有効
- `PARTIALLY_REUSABLE`: 一部のみ有効
- `OBSOLETE`: 新しい要求と矛盾
- `UNKNOWN`: 判断には追加Researchが必要

原則として自動revertしない。

### 3. Task statusを更新

変更評価中は対象TaskをPASSにしない。

`Docs/STATE.md`:

```text
Stage = CHANGE_CONTROL
Current Task = Txxx
Next Action = change-control-ja
```

必要ならPhase Statusは`EXECUTING`のまま維持する。
変更により安全に進められない場合のみ`BLOCKED`とする。

## Impact Analysis

次を確認する。

### Upstream Impact

変更が以下に影響するか。

- Spec
- Architecture
- Phase Goal
- Phase Scope

### Downstream Impact

変更が以下に影響するか。

- current Task
- future Tasks
- already PASS Tasks
- tests
- external interface
- data compatibility

### Already Completed Tasks

PASS済みTaskについては次のいずれかに分類する。

- `PRESERVE`: そのまま有効
- `REVERIFY`: 実装変更は不要だが新条件で再検証必要
- `INVALIDATE`: Requirement変更によりTask Contractまたは実装が無効

PASS済みTaskを理由なく`READY`へ戻さない。

## Artifact Update Order

変更分類に応じて上位から下位へ更新する。

### TASK_SCOPE_CHANGE

```text
Research（必要範囲のみ）
  ↓
Phase Plan / Task Plan
  ↓
Affected Tasks
```

### REQUIREMENT_CHANGE

```text
Spec
  ↓
Research validity check
  ↓
Research（必要な場合）
  ↓
Phase Plan
  ↓
Affected Tasks
```

### ARCHITECTURE_CHANGE

```text
Architecture
  ↓
Spec consistency check
  ↓
Research
  ↓
Phase Plan
  ↓
Affected Tasks
```

上位Artifactを変更した後、古い下位Artifactをそのまま実行しない。

## Replanning Rules

- 影響Taskだけを再計画する。
- Preserved Taskは再生成しない。
- Requirement Coverage tableを再確認する。
- dependencyを再計算する。
- obsolete Taskは削除するのではなく、Repository規則に応じて`SUPERSEDED`等で追跡可能にするか、git historyで追跡できる形で置換する。
- current partial implementationが再利用可能なら、新Task Contractにその事実を記録する。

## STATE Update

Change Control中は`workflow-state-ja`の方針に従い、STATEへ詳細要求を複製せずChange Request pathを記録する。

推奨:

```markdown
## Active Change

Change: `Docs/Changes/CR-003.md`
Type: `REQUIREMENT_CHANGE`
Requested During: `Phase3 / T002 / TASK_IMPLEMENT`
Current Work: `PARTIALLY_REUSABLE`

Affected Tasks:
- T002: REPLAN
- T003: REPLAN

Preserved Tasks:
- T001
```

`Next Action`は常に1つにする。

例:

```text
Next Action = CR-003に基づきSpec.mdを更新する
Use Skill = change-control-ja
```

変更反映が完了したら:

- Active Changeを`None`に戻す、または直近CR pathだけを短く残す
- Task dependencyを再評価する
- current Taskを次の`READY` Taskへ設定する
- `Stage = TASK_IMPLEMENT`
- `Next Action = task-implement-ja`

## Repairとの境界

`task-repair-ja`を使用する条件:

- Requirementは変わっていない
- Task Contractも正しい
- Review Findingが実装不備を指摘している

`change-control-ja`を使用する条件:

- 新しい要求が追加された
- Task Contract自体を変える必要がある
- Spec / Architecture / Phase Planを変更する必要がある

Review中に新Requirementが発見された場合も、Reviewer Findingとして無理にrepairせずChange Controlへ切り替える。

## STOP条件

以下の場合は推測で変更を確定しない。

- 変更要求同士が矛盾する
- Product/装置Behaviorを一意に決められない
- Architecture変更の責任範囲が不明
- 既存データ/外部interfaceへの互換性影響が不明かつ重大

その場合:

```text
Phase Status = BLOCKED
Stage = CHANGE_CONTROL
```

として、未決事項と必要なdecisionを明示する。

## 出力

```markdown
# Change Control Result

## Change

CR-xxx または Inline Change

## Classification

IMPLEMENTATION_DETAIL | TASK_SCOPE_CHANGE | REQUIREMENT_CHANGE | ARCHITECTURE_CHANGE

## Impact

### Affected Artifacts
- ...

### Affected Tasks
- Txxx: ...

### Preserved Tasks
- Txxx

## Current Work Reuse

REUSABLE | PARTIALLY_REUSABLE | OBSOLETE | UNKNOWN

## Updated Artifacts

- ...

## State Update

Stage: ...
Current Task: ...
Next Action: ...

## Remaining Decisions

None または具体的内容。
```

## 完了チェック

- [ ] 変更を4分類のいずれかに分類した
- [ ] 新要求を既存Taskへ無断で混ぜていない
- [ ] current diffを自動revertしていない
- [ ] 上位Artifactへの影響を確認した
- [ ] PASS済みTaskをPRESERVE / REVERIFY / INVALIDATEで評価した
- [ ] 必要なArtifactだけ更新した
- [ ] 影響Taskだけを再計画した
- [ ] Requirement Coverage / dependencyを再確認した
- [ ] STATEのActive Change / Next Actionを更新した
- [ ] Change Control完了後の再開地点が一意に決まっている
