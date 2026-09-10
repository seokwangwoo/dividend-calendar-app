---
name: task-implement-ja
description: >
  Phase TaskまたはQuick Change Contractを1件だけ実装し、VerificationとDocs/STATE.md更新まで行う。
  実装中にContract外の変更要求が発生した場合は実装へ混ぜず、change-control-jaまたはPhase昇格へ移行する。
---

# Task Implementation

## 目的

1つの実行Contractを、既存Architectureと既存Patternに従って最小変更で実装する。

対応するContract:

- Phase Task: `Docs/Tasks/PhaseN/Txxx.md`
- Quick Change: `Docs/QuickChanges/QC-xxx.md`

実装とVerification終了後、必ず`Docs/STATE.md`を更新する。

## 入力

必須:

- 対象Contract
- `Docs/Architecture.md`（存在する場合）
- 実際のソースコード

存在する場合:

- `Docs/STATE.md`

Phase Taskで必要な場合のみ:

- `Docs/Spec.md` の関連箇所
- 対象Phase
- 関連Research

Quick Changeでは無関係なPhase/Researchを読み込まない。

## 関連Skill

- 状態更新: `workflow-state-ja`
- Phase実行中のContract外変更: `change-control-ja`
- Quick Changeが大きくなった場合: `phase-plan-ja`
- 実装後Review: `task-review-ja`

## Core Rule

**Contractを実装する。Contractを再設計しない。Scopeを拡張しない。**

Repository truthとContractが重大に矛盾する場合は、古い指示を盲目的に実装しない。

## Contract Type判定

開始時にどちらかを確定する。

```text
PHASE_TASK
QUICK_CHANGE
```

### PHASE_TASK

Task ID: `Txxx`
通常のPhase dependency / Requirement Coverageを尊重する。

### QUICK_CHANGE

Task ID: `QC-xxx`
Quick ContractのGoal / IN / OUT / Constraints / Verification / Done WhenをContractとして扱う。

Quick Change中に以下が必要と判明したら`ESCALATE_TO_PHASE`とする。

- Architecture boundary変更
- 大きなRequirement追加
- 非自明なDB schema / public API / protocol変更
- 複数の独立Outcome
- 広範なcodebase Research
- 実装Agent自身による大きな設計判断

## Change Request Gate

実装中の追加要求が現在Contract内か判定する。

Contract内なら通常実装を継続し、必要に応じて`Deviations`へ記録する。

Contract外ならその場で実装へ混ぜない。

### Phase Taskの場合

```text
Result = CHANGE_CONTROL
Stage = CHANGE_CONTROL
Next Action = change-control-ja
```

### Quick Changeの場合

小さなContract修正で済むならQuick Contractを更新して再確認してよい。

ただしQuick Eligibilityを失う場合:

```text
Result = ESCALATE_TO_PHASE
Stage = QUICK_CHANGE
Next Action = phase-plan-ja
```

現在diffは自動revertしない。

## 手順

### 1. Contract確認

最低限確認する。

- Goal
- Scope / Non-Goals
- Constraints
- Verification
- Done When
- dependency（Phase Taskの場合）

### 2. STATE開始更新

#### Phase Task

```text
Work Type = PHASE
Phase Status = EXECUTING
Stage = TASK_IMPLEMENT
Current Task = Txxx
Task Status = IMPLEMENTING
```

#### Quick Change

```text
Work Type = QUICK_CHANGE
Stage = QUICK_CHANGE
Current Quick Change = QC-xxx
Current Task = QC-xxx
Quick Change Status = IMPLEMENTING
```

`Next Action`は対象Contract実装継続とする。

### 3. 前提を実コードで再確認

重要なAnchor / type / symbol / flowが現在コードと一致するか必要範囲で確認する。

差異が軽微ならRepository truthへ合わせて最小適応し、`Deviations`へ記録する。

重大ならBLOCKEDまたはESCALATEする。

### 4. 最小変更で実装

優先:

- existing abstraction
- existing pattern
- utility / helper
- established error handling
- existing state/lifecycle model
- existing test helper

避ける:

- unrelated refactoring
- cosmetic cleanup
- speculative abstraction
- future scope
- debug code残存

### 5. 必要なTestを追加・更新

Done Whenを証明する最小のtestを追加する。

### 6. Verification状態へ更新

#### Phase Task

```text
Stage = TASK_VERIFY
Task Status = VERIFYING
```

#### Quick Change

```text
Stage = QUICK_CHANGE
Quick Change Status = VERIFYING
```

### 7. Deterministic Verification

Contract記載のcheckを実行する。

例:

- compiler / build
- unit/integration test
- lint
- typecheck
- static analysis

この変更が原因のfailureはContract範囲内で修正する。
既存failure / environment failureは区別して報告する。

STATEの`Last Verification`へ短く記録し、長いlog全文は入れない。

### 8. Diff Self Review

確認:

- accidental change
- debug code
- dead code
- unrelated refactor
- missing failure path
- missing test
- scope leak

### 9. 終了STATE更新

#### IMPLEMENTED + Verification PASS: Phase Task

```text
Stage = TASK_REVIEW
Task Status = REVIEWING
Current Task = Txxx
Next Action = task-review-ja
```

#### IMPLEMENTED + Verification PASS: Quick Change

```text
Stage = QUICK_CHANGE
Quick Change Status = REVIEWING
Current Quick Change = QC-xxx
Current Task = QC-xxx
Next Action = task-review-ja
```

Independent Review前にPASS / COMPLETEへしない。

#### Verification FAIL

対象ContractをVERIFYING状態に保ち、failure evidenceと次Actionを記録する。

#### BLOCKED

根拠付きBlockerをSTATEへ記録する。

#### CHANGE_CONTROL

Phase TaskのContract外変更を`change-control-ja`へ渡す。

#### ESCALATE_TO_PHASE

Quick Changeを停止し、次をSTATEへ記録する。

```text
Stage = QUICK_CHANGE
Quick Change Status = ESCALATED
Next Action = phase-plan-ja
```

## 出力

```markdown
# Implementation Result: <Txxx | QC-xxx>

## Result

IMPLEMENTED | BLOCKED | CHANGE_CONTROL | ESCALATE_TO_PHASE

## Changed Files

- `path`: reason

## Verification

- `<command>`: PASS | FAIL | SKIPPED

## Done When Check

- [x] ...
- [ ] ...

## State Update

- Stage: ...
- Contract Status: ...
- Next Action: ...

## Deviations

None または具体的差異。

## Remaining Concerns

None または具体的懸念。
```

## 完了条件

`IMPLEMENTED`は以下をすべて満たす場合のみ使用する。

- Goalを満たす
- Done Whenを満たす
- 必須Verificationが成功、または正当なSKIPPED理由がある
- Scope leakがない
- Independent Reviewerへ渡せる
- STATEが次Actionを示す

Quick ChangeがQuick Eligibilityを失った場合は`IMPLEMENTED`にせず`ESCALATE_TO_PHASE`とする。
