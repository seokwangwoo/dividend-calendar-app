---
name: task-review-ja
description: >
  実装済みTaskを、Task Contract・実diff・関連コード・Verification結果に基づき独立レビューする。
  「T001をレビューして」「実装がTaskを満たすか独立確認して」など、実装後の判定に使用する。
---

# Independent Task Review

## 目的

実装Agentの説明を信用するのではなく、**Task Contractと実際の変更結果を独立して確認し、PASS / FAILを判定する**。

このSkillはread-only review専用である。ソースコードを変更しない。

## 入力

必須:

- 対象Task `Docs/Tasks/PhaseN/Txxx.md`
- 実装後のgit diff
- 関連ソースコード
- 実行済みVerification結果

必要な場合のみ読む:

- `Docs/Spec.md` の関連Requirement
- `Docs/Architecture.md`
- `Docs/Research/PhaseN.md`
- 対象Phase

実装Agentの思考過程・自己評価をcorrectnessの根拠にしない。

## 言語ルール

- Review結果は日本語で記述する。
- code identifier / path / log / errorは原文を保持する。
- 社内用語は既存表記を優先する。

## Review Principles

- passing testだけでPASSにしない。
- plausibleな実装ではなくTask Contractへの適合を確認する。
- 問題を指摘する場合は必ず具体的なevidenceを示す。
- 好みのstyleをRequirement違反と混同しない。
- 修正方法を過度に指定せず、必要なoutcomeを示す。

## Review手順

### 1. Contract Compliance

Taskの以下を1項目ずつ確認する。

- Goal
- Requirement Coverage
- Constraints
- Non-Goals
- Verification
- Done When

### 2. Functional Correctness

Task範囲内で確認する。

- success path
- failure path
- boundary / edge case
- state transition
- resource/lifecycle handling
- async/thread handling（関連する場合）

### 3. Architecture Compliance

確認する。

- 既存layer boundaryを守っているか
- 既存Patternを適切に再利用しているか
- established flowを迂回していないか
- 不要なabstractionを追加していないか

### 4. Regression Risk

変更箇所の周辺挙動を確認し、Taskによるregressionの可能性を評価する。

### 5. Test Quality

Testが単に通るのではなく、Taskのrequired behaviorを実際に検証しているか確認する。

### 6. Scope Discipline

以下を確認する。

- unrelated refactoring
- unrelated formatting
- unnecessary dependency
- later Task implementation
- speculative future work

## Finding Severity

- `BLOCKER`: Requirement違反、重大なcorrectness問題、データ破損/安全性など。Taskを完了扱いにできない。
- `MAJOR`: Task Contractを満たさない、重要なerror path/test/architecture問題。Taskを完了扱いにできない。
- `MINOR`: Task Contractを壊さない小さな改善点。原則PASSを妨げない。

## Finding Format

各Findingは次の形式にする。

```markdown
### R001

Severity: BLOCKER | MAJOR | MINOR
Requirement: FR-xxx / AC-xxx / Done When / Constraint
Location: `path/to/file: symbol` または該当箇所

Problem:
具体的な問題。

Evidence:
なぜ実際の問題と判断できるか。

Required Outcome:
このFindingを解消するために、何がtrueになる必要があるか。
```

`Required Outcome` は原則としてexact patchではなくbehavior/contractで記述する。

## Verdict Rule

`PASS`:

- BLOCKER = 0
- MAJOR = 0
- Task Contractを満たす

`FAIL`:

- BLOCKERまたはMAJORが1件以上

MINORだけの場合は、Requirement違反でない限りPASS可能。

## 出力

原則としてReview結果を返す。Durableなreview fileを使用するRepositoryでは、既存規則に従って保存する。

推奨フォーマット:

```markdown
# Review: Txxx

## Verdict

PASS | FAIL

## Findings

### R001
...

Findingsがない場合:
- None

## Requirement Check

- [x] FR-xxx ...
- [ ] AC-xxx ...

## Verification Assessment

## Architecture Assessment

## Scope Assessment

## Reviewer Notes
```

## 完了チェック

- [ ] Task Contractの各項目を確認した
- [ ] diffだけでなく関連コードも必要範囲で確認した
- [ ] passing testsだけで判断していない
- [ ] 各BLOCKER/MAJORに具体的evidenceがある
- [ ] 好みとRequirement違反を区別した
- [ ] ソースコードを変更していない
