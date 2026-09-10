---
name: change-control
description: >
  実行中に発生した仕様変更・追加要求・Task scope変更・Architecture変更を分類し、必要な上位Artifactだけを更新して影響範囲だけ再計画する。
---

# Change Control

## 目的

Task Contract外の変更を現在実装へ混ぜず、変更が発生した抽象化レベルまで戻ってSource of Truthを更新し、影響Workだけを再計画する。

## Classification

- `IMPLEMENTATION_DETAIL`: WHAT/ACは変わらずHOWだけ変わる。
- `TASK_SCOPE_CHANGE`: Requirementは同じだがTask境界/依存が変わる。
- `REQUIREMENT_CHANGE`: observable behavior / ACが変わる。
- `ARCHITECTURE_CHANGE`: component boundary / ownership / flow / persistence / protocol / threading等が変わる。

複数に該当する場合は上位を採用する。
`ARCHITECTURE_CHANGE > REQUIREMENT_CHANGE > TASK_SCOPE_CHANGE > IMPLEMENTATION_DETAIL`

## 入力

- 変更要求
- `Docs/STATE.md`
- 関連Spec / Architecture / Phase / Task / Quick Change
- current repository state / git diff
- 必要に応じてResearch / Review

## 手順

1. 現在作業を安全な位置で止める。current diffを自動revertしない。
2. 変更を4分類する。
3. current workを`REUSABLE | PARTIALLY_REUSABLE | OBSOLETE | UNKNOWN`で評価する。
4. Upstream/Downstream impactを確認する。
5. PASS済みTaskを`PRESERVE | REVERIFY | INVALIDATE`で評価する。
6. 必要な上位Artifactだけ更新する。
7. 影響Taskだけ再計画する。
8. dependency / Requirement Coverageを再計算する。
9. `workflow-state`のActive Change / Next Actionを更新する。

## Artifact Update Order

TASK_SCOPE_CHANGE:
`Research(必要範囲) → Phase/Task Plan → affected Tasks`

REQUIREMENT_CHANGE:
`Spec → Research validity check → Research(必要時) → Phase Plan → affected Tasks`

ARCHITECTURE_CHANGE:
`Architecture → Spec consistency → Research → Phase Plan → affected Tasks`

## Change Request Artifact

Plan以上を変更する場合は原則 `Docs/Changes/CR-xxx.md` を作る。

```markdown
# CR-xxx - <Title>

## Requested Change
## Reason
## Classification
## Requested During
## Current Work State
## Affected Artifacts
## Affected Requirements
## Affected Tasks
## Preserved Tasks
## Required Updates
## Resume Condition
```

## Repairとの境界

`task-repair`:
- Requirement/Contractは正しい
- Reviewが実装不良を指摘

`change-control`:
- 新要求追加
- Contract変更必要
- Spec/Architecture/Phase変更必要

## State

変更評価中:
- Stage=`CHANGE_CONTROL`
- Current Task/Quick Changeを保持
- Active ChangeへCR path/classification/affected workを記録
- Next Actionは1つだけ

変更反映後は、影響WorkをREADY/PENDING/REVERIFYへ戻し、再開地点を一意に決める。

## STOP

要求矛盾、重大互換性影響不明、Architecture責任範囲不明などで安全に判断できない場合は推測せずBLOCKEDにする。
