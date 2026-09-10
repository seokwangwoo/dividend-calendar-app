---
name: task-implement-ja
description: >
  計画済みのTaskを1件だけ実装し、指定されたVerificationまで実行する。
  「T001を実装して」「次のTaskを実装して」など、Task単位の実装に使用する。
---

# Task Implementation

## 目的

計画済みTaskを1件だけ、既存Architectureと既存Patternに従って最小変更で実装する。

## 入力

必須:

- 対象Task文書 `Docs/Tasks/PhaseN/Txxx.md`
- `Docs/Architecture.md`
- 実際のソースコード

必要な場合のみ読む:

- `Docs/Spec.md` の関連箇所
- 対象 `Docs/Plans/PhaseN.md`
- `Docs/Research/PhaseN.md` の関連箇所

無関係なTaskやPhaseを全て読み込まない。

## 言語ルール

- 作業報告は日本語で記述する。
- code identifier / file path / API名 / log / errorは原文を保持する。
- 既存のコメント言語・命名規則を尊重する。

## Core Rule

**Taskを実装する。Taskを再設計しない。Scopeを拡張しない。**

ただし、Task内の前提が現在のRepositoryと矛盾する場合は、古い指示を盲目的に実装しない。

## 手順

### 1. Task Contractを理解する

変更前に次を確認する。

- Goal
- Requirement Coverage
- Existing Code Evidence
- Constraints
- Non-Goals
- Dependencies
- Verification
- Done When

### 2. 前提を実コードで再確認する

Taskの重要な前提が現在のコードと一致するか確認する。

差異がある場合:

1. 実コードを調査する
2. Repositoryの現在状態をtruthとして扱う
3. Taskの目的を満たす最小の適応を行う
4. 最終報告の`Deviations`に差異と理由を書く

重大な矛盾で安全に判断できない場合は無理に実装せず`BLOCKED`とする。

### 3. 最小変更で実装する

優先して再利用する。

- existing abstraction
- utility
- naming convention
- error handling pattern
- state / lifecycle pattern
- test helper

避ける:

- unrelated refactoring
- cosmetic cleanup
- speculative abstraction
- later Task scope
- debug codeの残存

### 4. 必要なTestを追加・更新する

TaskのDone条件を証明するために必要なtestを追加する。

無関係なtest rewriteは行わない。

### 5. Deterministic Verificationを実行する

Taskの`Verification`に記載されたcommandを実行する。

例:

- compiler / build
- lint
- typecheck
- unit test
- integration test

このTaskが原因のfailureは修正する。

Task外の既存failureを発見した場合は勝手に大規模修正せず、区別して報告する。

### 6. Diff Self Reviewを行う

完了前にdiffを確認する。

- accidental change
- debug log
- dead code
- unnecessary refactoring
- missing error path
- missing test
- scope leak

を確認する。

## BLOCKED条件

以下によりTask Contractを安全に満たせない場合は、推測で埋めず`BLOCKED`を返す。

- Requirementの重大な欠落・矛盾
- Architecture前提の誤り
- Researchの重大な誤り
- 必要な外部依存・credential不足
- 上位Task dependency未完了

## 完了報告フォーマット

```markdown
# Implementation Result: Txxx

## Result

IMPLEMENTED | BLOCKED

## Changed Files

- `path`: 変更理由

## Verification

- `<command>`: PASS / FAIL / SKIPPED
  - Summary: ...

## Done When Check

- [x] ...
- [ ] ...

## Deviations

None

または

- 計画との差異
- 実コード上の根拠
- なぜこの変更が最小か

## Remaining Concerns

None

または具体的な懸念のみ記載。
```

## 完了条件

`IMPLEMENTED`は以下を全て満たす場合のみ使用する。

- TaskのGoalを満たす
- Done Whenを満たす
- 必須Verificationが成功、または正当なSKIPPED理由がある
- Non-Goalsへscope leakしていない
- 独立Reviewerへ渡せる状態である
