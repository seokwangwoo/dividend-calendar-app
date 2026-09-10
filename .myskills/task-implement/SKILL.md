---
name: task-implement
description: >
  Phase TaskまたはQuick Change Contractを1件だけ実装し、Deterministic Verificationを実行してDocs/STATE.mdを更新する。
---

# Task Implementation

## 目的

1つのContractを既存Architecture/Patternに従って最小変更で実装する。Scopeを再設計しない。

## 入力

対象Contractはどちらか。

- `Docs/Tasks/PhaseN/Txxx.md`
- `Docs/QuickChanges/QC-xxx.md`

加えて:

- `Docs/Architecture.md`
- 関連ソース
- 存在する場合 `Docs/STATE.md`
- 必要な場合のみ関連Spec/Phase/Research

## Core Rules

- ContractのGoal / Scope / Constraints / Non-Goals / Verification / Done Whenを守る。
- staleなfile pathより現在Repositoryをtruthとして扱う。
- unrelated refactoring / cosmetic cleanup / speculative abstractionをしない。
- Contract外の新要求を黙って混ぜない。
- final PASSは宣言しない。PASSは`task-review`だけが決める。

## Change Gate

以下が変わらないimplementation detailはTask内で処理し、Deviationsへ記録できる。

- Goal
- Requirement/AC
- Non-Goals
- Architecture boundary
- Done When

これらを変える必要がある場合は実装を止め、STATEを`CHANGE_CONTROL`へ更新して`change-control`へ渡す。

## 手順

1. Contractを読む。
2. `workflow-state`でStage=`TASK_IMPLEMENT`、Status=`IMPLEMENTING`へ更新する。
3. 重要なcode assumptionを実コードで再確認する。
4. existing abstraction / helper / error handling / lifecycle / test patternを優先して最小実装する。
5. 必要なtestを追加・更新する。
6. Stage=`TASK_VERIFY`、Status=`VERIFYING`へ更新する。
7. Contract記載のDeterministic Verificationを実行する。
8. diff self-reviewでdebug code、dead code、scope leak、unrelated changeを確認する。
9. Verification PASSならStage=`TASK_REVIEW`、Status=`REVIEWING`、Next Action=`task-review`へ更新する。
10. unresolved FAILなら`TASK_VERIFY`を維持しevidenceを記録する。

## BLOCKED条件

- Requirement/Architecture/Researchの重大矛盾
- unmet dependency
- 必要credential/external environment不足
- Contractを安全に満たせない未決事項

推測で突破せず`BLOCKED`にする。

## 出力

```markdown
# Implementation Result: <Txxx | QC-xxx>

## Result
IMPLEMENTED | BLOCKED | CHANGE_CONTROL

## Changed Files
- `path`: reason

## Verification
- `<command>`: PASS | FAIL | SKIPPED

## Done When Check
- [x] ...

## State Update
Stage: ...
Status: ...
Next Action: ...

## Deviations
None | ...

## Remaining Concerns
None | ...
```

IMPLEMENTEDはContractを満たし、必須Verificationが成功または正当SKIPPEDで、Independent Reviewへ渡せる場合のみ使用する。
