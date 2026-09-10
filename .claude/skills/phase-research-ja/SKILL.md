---
name: phase-research-ja
description: >
  対象Phaseを実装する前に、Spec・Architecture・Phase計画と実コードを照合し、
  entry point、処理フロー、既存パターン、テスト、制約、未知点を根拠付きで調査する。
  「このPhaseを調査して」「実装前にコードベースを調べて」など、計画前の調査に使用する。
---

# Phase Research

## 目的

対象Phaseを実装するために必要な、**検証済みのコードベース情報**を作成する。

このSkillは調査専用である。実装やTask分割は行わない。

## 入力

必須:

- `Docs/Spec.md`
- `Docs/Architecture.md`
- 対象の `Docs/Plans/PhaseN.md`
- 実際のソースコード

必要に応じて読む:

- `AGENTS.md`、`CLAUDE.md` 等のRepositoryルール
- 過去Phaseの計画・調査結果
- 関連テスト

パスや大文字小文字が異なる場合は、Repository内を探索して対応する文書を特定すること。

## 出力

原則として次を作成する。

`Docs/Research/PhaseN.md`

既存の命名規則がある場合はそれを優先する。

## 言語ルール

- 分析・説明・成果物は日本語で記述する。
- class/function/variable/macro/file path/API名は翻訳しない。
- ログ・エラー・プロトコル名は原文を保持する。
- 社内用語は既存文書・ソースコードの表記を優先し、勝手に言い換えない。

## 絶対ルール

- ソースコードを変更しない。
- 実装Taskを作成しない。
- 新しいArchitectureを提案することを目的にしない。
- 調査していない内容を事実として記載しない。
- `UNKNOWN` を都合のよい仮定に変換しない。
- 文書より実コードが異なる場合は、差異を明示する。

## 調査手順

### 1. Phaseの目的を理解する

対象Phaseから以下を抽出する。

- Goal
- 対象Requirement / Acceptance Criteria
- 実装Scope
- Completion Criteria
- Excluded / Non-goal

この時点では実装方法を決めない。

### 2. Entry Pointを特定する

対象挙動がシステムへ入る箇所を探す。

例:

- UI event
- route / API endpoint
- message/event handler
- callback
- command
- device event
- background worker

### 3. 実際の処理フローを追跡する

文字列一致だけで判断せず、可能な限り呼び出し関係を実コードで確認する。

例:

```text
Screen
→ onSubmit()
→ ExpenseService::Create()
→ ExpenseRepository::Insert()
→ DB
```

各重要Stepについて以下を記録する。

- file path
- symbol
- 役割
- 次のStepへ繋がる根拠

### 4. 類似実装を探す

同種の処理を既に実装している箇所を探す。

対象Phaseに関係するものだけを調査する。

- validation
- state management
- navigation
- persistence
- error handling
- retry / timeout
- async / thread handling
- logging
- external I/O
- test pattern

### 5. Data Structureを特定する

関連する以下を確認する。

- type / interface / struct
- model / schema
- enum / constant
- message / protocol definition
- DB entity

### 6. Testを確認する

以下を調査する。

- 既存の関連テスト
- 利用可能なtest helper / mock / fake
- 類似機能のtest pattern
- regression riskが高い領域

### 7. 制約を確認する

実コードから確認できた制約を記録する。

例:

- layer boundary
- legacy dependency
- threading constraint
- platform restriction
- external interface
- backward compatibility
- build/compiler constraint

### 8. 不明点を分類する

重要な結論は次のいずれかに分類する。

- `VERIFIED`: 実コードやテストで直接確認できた
- `INFERENCE`: 複数の根拠から強く推測できるが直接確認できない
- `UNKNOWN`: Repositoryからは判断できない

## 根拠の書き方

重要な判断には可能な限り次の形式で根拠を残す。

```text
path/to/file.cpp: ClassName::FunctionName
```

単なるファイル一覧にしない。なぜ関連するかを説明する。

## 出力フォーマット

```markdown
# Research: Phase N - <タイトル>

## Phase Goal

## Relevant Requirements

## Entry Points

## Current Execution Flow

## Relevant Files and Symbols

## Existing Patterns to Reuse

## Data Structures

## Existing Tests

## Constraints

## Regression Risks

## Unknowns

## Planning Implications
```

`Planning Implications` には既存Patternや制約から導ける注意点を書いてよいが、Task分割は行わない。

## 完了チェック

終了前に確認する。

- [ ] 主要なEntry Pointを実コードで確認した
- [ ] 主要な処理フローを追跡した
- [ ] 類似実装を検索した
- [ ] 関連テストを確認した
- [ ] 重要な判断にcode evidenceがある
- [ ] VERIFIED / INFERENCE / UNKNOWNが区別されている
- [ ] 実装やTask分割を行っていない
