---
name: task-repair-ja
description: >
  Independent Task ReviewでFAILとなったFindingだけを対象に、最小変更で修正し再Verificationへ戻す。
  「レビューNGを修正して」「R002だけ直して」など、レビュー後の限定修正に使用する。
---

# Targeted Task Repair

## 目的

Independent Reviewで指摘されたBLOCKER / MAJOR Findingを、**既に正しい部分を壊さず、最小変更で解消する**。

これはTask全体の再実装ではない。

## 入力

必須:

- 対象Task `Docs/Tasks/PhaseN/Txxx.md`
- 最新のReview結果
- 現在のRepository state

必要に応じて読む:

- 関連ソースコード
- 関連Spec / Architecture / Research

## 言語ルール

- 修正報告は日本語で記述する。
- code identifier / path / log / errorは原文を保持する。

## Core Rule

**Review Findingの解消に必要な箇所だけを修正する。既にPASSしている挙動を再設計しない。**

## 手順

### 1. FAIL Findingを抽出する

対象は原則:

- BLOCKER
- MAJOR

MINORはTask Contract違反や将来の重大riskに繋がる場合のみ対応する。

### 2. Findingを現在のコードで再確認する

Reviewerの指摘を盲目的に受け入れない。

Findingが事実と異なる場合は修正せず、次の形式で`DISPUTED`として報告する。

```text
DISPUTED: Rxxx
Evidence: path/to/file: symbol
Reason: ...
```

### 3. 最小修正する

有効なFindingごとに:

- 必要な箇所だけを変更する
- unrelated refactoringをしない
- already-correct behaviorを保持する
- later Task scopeへ広げない

### 4. 必要ならRegression Testを追加する

Reviewで露出したmissing behaviorを再発防止できる場合、最小のtestを追加する。

### 5. Verificationを再実行する

最低限:

- 変更箇所に直接関係するcheck
- 元Taskの必須Verification

を再実行する。

## 出力フォーマット

```markdown
# Repair Result: Txxx

## Result

REPAIRED | BLOCKED

## Resolved Findings

### R001
- Change: ...
- Evidence: `path/to/file: symbol`

## Disputed Findings

- None

または

### Rxxx
- Evidence: ...
- Reason: ...

## Verification

- `<command>`: PASS / FAIL / SKIPPED

## Additional Changes

None

または必要最小限の追加変更理由。

## Remaining Concerns

None
```

## 完了条件

- 有効なBLOCKER / MAJORに対して必要な修正を行った
- 元Taskのscopeを拡張していない
- 必須Verificationを再実行した
- 次のIndependent Reviewへ渡せる状態である

Repair自身は最終PASSを宣言しない。最終判定は必ず`task-review-ja`で再実施する。
