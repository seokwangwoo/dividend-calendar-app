---
name: task-repair-ja
description: >
  Independent ReviewでFAILとなったPhase TaskまたはQuick ChangeのFindingだけを対象に、最小変更で修正し再Verificationへ戻す。
---

# Targeted Task Repair

## 目的

Independent Reviewで指摘されたBLOCKER / MAJOR Findingを、**既に正しい部分を壊さず、最小変更で解消する**。

これはContract全体の再実装ではない。

対応Contract:

- Phase Task: `Docs/Tasks/PhaseN/Txxx.md`
- Quick Change: `Docs/QuickChanges/QC-xxx.md`

## 入力

必須:

- 対象Contract
- 最新のReview結果
- 現在のRepository state

必要に応じて読む:

- 関連ソースコード
- Phase Taskの場合: 関連Spec / Architecture / Research
- Quick Changeの場合: Quick Contractが参照する既存仕様/Architecture

## 言語ルール

- 修正報告は日本語で記述する。
- code identifier / path / log / errorは原文を保持する。

## Core Rule

**Review Findingの解消に必要な箇所だけを修正する。既に正しい挙動を再設計しない。**

新RequirementやArchitecture変更が必要ならrepairで押し切らない。

- Phase Task → `change-control-ja`
- Quick Change → `phase-plan-ja`への昇格を検討

## 手順

### 1. FAIL Findingを抽出

対象は原則:

- BLOCKER
- MAJOR

MINORはContract違反や重大riskに繋がる場合のみ対応する。

### 2. Findingを現在コードで再確認

Reviewerの指摘を盲目的に受け入れない。

事実と異なる場合:

```text
DISPUTED: Rxxx
Evidence: path/to/file: symbol
Reason: ...
```

として修正しない。

### 3. Repair可能性を判定

次なら通常repair:

- Contract内の実装不良
- missing error handling
- missing test
- localized regression
-既存Patternからの逸脱

次ならrepairを中止:

- Contract自体の変更が必要
- Scope追加が必要
- Architecture boundary変更が必要
- Quick Changeが複数Outcomeへ膨張した

### 4. 最小修正

- Findingに必要な箇所だけ変更
- unrelated refactoring禁止
- already-correct behavior保持
- future scopeへ広げない

### 5. Regression Test

Findingで露出したbehaviorを固定できる場合、最小のtestを追加する。

### 6. Verification再実行

最低限:

- 変更箇所に直接関係するcheck
- 元Contractの必須Verification

を再実行する。

### 7. STATE更新

Phase Task:

```text
Stage = TASK_VERIFY
Task Status = VERIFYING
Next Action = Verification後にtask-review-ja
```

Quick Change:

```text
Stage = QUICK_CHANGE
Quick Change Status = VERIFYING
Next Action = Verification後にtask-review-ja
```

Repair自身はPASS / COMPLETEにしない。

## 出力

```markdown
# Repair Result: <Txxx | QC-xxx>

## Result

REPAIRED | BLOCKED | CHANGE_CONTROL | ESCALATE_TO_PHASE

## Resolved Findings

### R001
- Change: ...
- Evidence: `path/to/file: symbol`

## Disputed Findings

- None

## Verification

- `<command>`: PASS | FAIL | SKIPPED

## State Update

- Stage: ...
- Contract Status: ...
- Next Action: ...

## Additional Changes

None または必要最小限の理由。

## Remaining Concerns

None または具体的内容。
```

## 完了条件

- 有効なBLOCKER / MAJORに必要な修正を行った
- Contract scopeを拡張していない
- 必須Verificationを再実行した
- 次のIndependent Reviewへ渡せる
- STATEを更新した

最終判定は必ず`task-review-ja`で再実施する。
