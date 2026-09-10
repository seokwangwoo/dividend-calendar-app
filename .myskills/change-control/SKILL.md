---
name: change-control
description: >
  実行中に発生した仕様変更・追加要求・Task scope変更・Architecture変更を分類し、必要なSource of Truthだけを更新して影響範囲をResearch→Planの順で再構築する。
---

# Change Control

## 目的

Task Contract外の変更を現在実装へ混ぜず、変更が発生した抽象化レベルまで戻ってSource of Truthを更新し、影響Workだけを再計画する。

## Classification

- `IMPLEMENTATION_DETAIL`: WHAT / ACは変わらずHOWだけ変わる。
- `TASK_SCOPE_CHANGE`: Requirementは同じだがTask境界 / dependencyが変わる。
- `REQUIREMENT_CHANGE`: observable behavior / ACが変わる。
- `ARCHITECTURE_CHANGE`: component boundary / ownership / flow / persistence / protocol / threading等が変わる。

複数に該当する場合は上位を採用する。
`ARCHITECTURE_CHANGE > REQUIREMENT_CHANGE > TASK_SCOPE_CHANGE > IMPLEMENTATION_DETAIL`

## 入力

- 変更要求
- `Docs/STATE.md`
- 関連Spec / Architecture / Research / Phase / Task / Quick Change
- current repository state / git diff
- 必要に応じてReview

## 手順

1. 現在作業を安全な位置で止める。current diffを自動revertしない。
2. 変更を4分類する。
3. current workを`REUSABLE | PARTIALLY_REUSABLE | OBSOLETE | UNKNOWN`で評価する。
4. Upstream / Downstream impactを確認する。
5. PASS済みTaskを`PRESERVE | REVERIFY | INVALIDATE`で評価する。
6. Requirement / observable behaviorが変わり、その意図が曖昧なら`phase-intent`でsession内 clarificationを行う。
7. 必要なSource of Truthを更新する。
8. 必要な範囲だけResearchを更新する。
9. Research evidenceを基にPhase / Task Planを更新する。
10. dependency / Requirement Coverageを再計算する。
11. `workflow-state`のActive Change / Next Actionを更新する。

## Artifact Update Order

### IMPLEMENTATION_DETAIL

`current Task内で最小適応 → Verification`

Spec / Phase Planを原則変更しない。

### TASK_SCOPE_CHANGE

`Research(必要範囲) → Phase/Task Plan → affected Tasks`

### REQUIREMENT_CHANGE

```text
変更要求
  ↓
phase-intent（observable behaviorが曖昧な場合のみ）
  ↓
Spec更新
  ↓
Research validity check / 追加Research
  ↓
Phase Plan更新
  ↓
Phase Review
  ↓
affected Tasks再計画
```

### ARCHITECTURE_CHANGE

```text
Architecture decision / update
  ↓
Spec consistency check
  ↓
Research
  ↓
Phase Plan
  ↓
Phase Review
  ↓
affected Tasks再計画
```

**Researchが必要な変更で、Phase Planを先に書かない。**

## Intent Clarification Rule

`phase-intent`を使うのは、変更後のWHATが不明な場合だけ。

使う例:
- failure時に旧behaviorを維持するか不明
- 新しいuser/device outcomeが複数解釈できる
- IN / OUTが変わるが境界が不明

使わない例:
- 既にRequirementが明確
- HOWだけの変更
- codebaseを調べれば答えられる問題

Intent Briefはファイルへ保存しない。同一セッションでResearchへ渡す。

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

Intent Brief本文はCRへ複製しない。CRには確定した変更内容だけを簡潔に残す。

## Repairとの境界

`task-repair`:
- Requirement / Contractは正しい
- Reviewが実装不良を指摘

`change-control`:
- 新要求追加
- Contract変更必要
- Spec / Architecture / Phase変更必要

## State

変更評価中:
- Stage=`CHANGE_CONTROL`
- Current Task / Quick Changeを保持
- Active ChangeへCR path / classification / affected workを記録
- Next Actionは1つだけ

`phase-intent`はsession-onlyなのでSTATEのStageには追加しない。
Intent clarificationが必要ならNext Actionにその旨だけ記載し、Intent本文は保存しない。

変更反映後は、影響WorkをREADY / PENDING / REVERIFYへ戻し、再開地点を一意に決める。

## STOP

要求矛盾、重大互換性影響不明、Architecture責任範囲不明などで安全に判断できない場合は推測せずBLOCKEDにする。
Phase Planを何度も書き直して解決しようとせず、問題がIntent / Research / Spec / Architectureのどこにあるか明示する。
