---
name: task-review-ja
description: >
  実装済みのPhase TaskまたはQuick Changeを、Contract・実diff・関連コード・Verification結果に基づき独立レビューする。
  「T001をレビューして」「QC-003を独立確認して」「実装がContractを満たすか確認して」など、実装後の判定に使用する。
---

# Independent Task Review

## 目的

実装Agentの説明を信用するのではなく、**Contractと実際の変更結果を独立して確認し、PASS / FAILを判定する**。

このSkillはread-only review専用である。ソースコードを変更しない。

## 対応するContract

次のどちらにも使用できる。

### Phase Task

`Docs/Tasks/PhaseN/Txxx.md`

### Quick Change

`Docs/QuickChanges/QC-xxx.md`

Repositoryに別のTask/Issue規則がある場合は、そのContractを入力として使用してよい。

## 入力

必須:

- 対象Contract
- 実装後のgit diff
- 関連ソースコード
- 実行済みVerification結果

Phase Taskの場合、必要な場合のみ読む:

- `Docs/Spec.md` の関連Requirement
- `Docs/Architecture.md`
- `Docs/Research/PhaseN.md`
- 対象Phase

Quick Changeの場合、必要な場合のみ読む:

- `Docs/Architecture.md`
- Quick Contractが参照する既存仕様

実装Agentの思考過程・自己評価をcorrectnessの根拠にしない。

## 言語ルール

- Review結果は日本語で記述する。
- code identifier / path / log / errorは原文を保持する。
- 社内用語は既存表記を優先する。

## Review Principles

- passing testだけでPASSにしない。
- plausibleな実装ではなくContractへの適合を確認する。
- 問題を指摘する場合は具体的evidenceを示す。
- 好みのstyleをRequirement違反と混同しない。
- 修正方法を過度に指定せず、必要なoutcomeを示す。
- Quick Changeでは「本当にQuick Changeの範囲に収まっているか」も確認する。

## Review手順

### 1. Contract Compliance

Contractに存在する以下を1項目ずつ確認する。

- Goal
- Scope / Non-Goals
- Requirement Coverage（Phase Taskの場合）
- Constraints
- Verification
- Done When

### 2. Functional Correctness

Contract範囲内で確認する。

- success path
- failure path
- boundary / edge case
- state transition
- resource / lifecycle handling
- async / thread handling（関連する場合）

### 3. Architecture Compliance

確認する。

- 既存layer boundaryを守っているか
- 既存Patternを適切に再利用しているか
- established flowを迂回していないか
- 不要なabstractionを追加していないか

Quick ChangeでArchitecture判断が必要になっている場合、それ自体をPhase昇格候補として指摘する。

### 4. Regression Risk

変更箇所の周辺挙動を確認し、Contractによるregressionの可能性を評価する。

### 5. Test Quality

Testが単に通るのではなく、Contractのrequired behaviorを実際に検証しているか確認する。

### 6. Scope Discipline

以下を確認する。

- unrelated refactoring
- unrelated formatting
- unnecessary dependency
- later Task / unrelated feature implementation
- speculative future work

Quick Changeの場合は特に:

- 複数Outcomeへ膨張していないか
- public API / schema / protocolなどの非自明な変更へ拡大していないか
- Phaseを避けるためにscopeを押し込んでいないか

## Finding Severity

- `BLOCKER`: Contract違反、重大なcorrectness問題、データ破損/安全性、またはQuick Changeとして続行不適切。
- `MAJOR`: Contractを満たさない、重要なerror path/test/architecture問題。
- `MINOR`: Contractを壊さない小さな改善点。原則PASSを妨げない。

## Finding Format

```markdown
### R001

Severity: BLOCKER | MAJOR | MINOR
Contract: Requirement / Done When / Constraint / Scope
Location: `path/to/file: symbol` または該当箇所

Problem:
具体的な問題。

Evidence:
なぜ実際の問題と判断できるか。

Required Outcome:
このFindingを解消するために、何がtrueになる必要があるか。
```

`Required Outcome`は原則としてexact patchではなくbehavior/contractで記述する。

## Verdict Rule

`PASS`:

- BLOCKER = 0
- MAJOR = 0
- Contractを満たす

`FAIL`:

- BLOCKERまたはMAJORが1件以上

MINORだけの場合は、Contract違反でない限りPASS可能。

Quick ChangeでPhase昇格が必要な場合はFAILとし、Findingに`Required Outcome: Phase Workflowへ昇格する`ことを明示する。

## 出力

```markdown
# Review: <Txxx | QC-xxx>

## Verdict

PASS | FAIL

## Findings

### R001
...

Findingsがない場合:
- None

## Contract Check

- [x] ...
- [ ] ...

## Verification Assessment

## Architecture Assessment

## Scope Assessment

## Reviewer Notes
```

## 完了チェック

- [ ] Contractの各項目を確認した
- [ ] diffだけでなく関連コードも必要範囲で確認した
- [ ] passing testsだけで判断していない
- [ ] 各BLOCKER/MAJORに具体的evidenceがある
- [ ] 好みとContract違反を区別した
- [ ] Quick ChangeならPhase昇格条件も確認した
- [ ] ソースコードを変更していない
