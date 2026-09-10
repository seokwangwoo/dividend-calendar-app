---
name: phase-task-plan-ja
description: >
  Spec・Architecture・対象Phase・Researchを基に、Phaseを小さく独立レビュー可能なTaskへ分解する。
  「このPhaseをTask化して」「Researchを基に実装Taskを作って」など、実装前のTask計画に使用する。
---

# Phase Task Planning

## 目的

対象Phaseを、**小さく・意味があり・独立して検証可能な実装Task**へ分解する。

このSkillは計画専用である。ソースコードを実装しない。

## 入力

必須:

- `Docs/Spec.md`
- `Docs/Architecture.md`
- 対象の `Docs/Plans/PhaseN.md`
- `Docs/Research/PhaseN.md`

必要に応じて、Researchの主張を確認するため実コードを読む。

## 出力

原則として次を作成する。

```text
Docs/Tasks/PhaseN/
  README.md
  T001.md
  T002.md
  T003.md
  ...
```

既存のTask命名規則がある場合はそれを優先する。

## 言語ルール

- 計画・説明は日本語で記述する。
- code identifier / file path / API名 / logは原文を保持する。
- 社内用語は既存表記を優先する。

## Planning Principles

### 1. Requirement Coverageを完全にする

対象Phaseに関係するRequirement / Acceptance Criteria / Completion Criteriaを列挙し、必ず1つ以上のTaskへ紐付ける。

要求を暗黙に落とさない。

### 2. 最小変更を優先する

優先順位:

1. 既存実装を再利用
2. 既存Patternを拡張
3. 小さな局所変更
4. 新しい抽象化は必要な場合のみ

将来の仮想Requirementのためのfuture-proofingを行わない。

### 3. 1 Task = 1つの意味あるOutcome

良いTask:

- 既存repository flowを使って保存処理を成立させる
- 既存device event flowへ新しい状態遷移を接続する
- form submissionを既存mutationへ統合する

悪いTask:

- importを追加する
- interfaceだけ作る
- 変数名だけ変更する
- Phase全体を1 Taskにする

### 4. Repositoryを壊れた中間状態にしない

技術的に避けられない場合を除き、各Task完了後はbuild/test可能な整合状態を維持する。

### 5. Taskを実装コードで縛りすぎない

`Expected Changes` は有力な変更領域を示すが、絶対的なfile whitelistにしない。

実装時に別ファイルが必要なら、Implementerは理由を説明する。

## 手順

### 1. Requirement Mapを作る

対象Phaseの以下を一覧化する。

- Requirement ID
- Acceptance Criteria ID
- Completion Criteria
- Failure behavior
- Scope / Non-goal

### 2. Researchから最小実装経路を作る

Researchのevidenceを使い、以下を確認する。

- 修正候補の既存code
- 再利用すべきPattern
- 必須の新規code
- dependency order
- regression risk

Researchにない重大な仮定を新しく作らない。

### 3. Taskへ分解する

各Taskは次を満たすようにする。

- primary outcomeが1つ
- Done条件が客観的
- 独立レビュー可能
- scopeが限定される
- 前後Taskとのdependencyが明確

### 4. Dependencyを決める

各Taskに以下を記載する。

- `Depends On`
- `Blocks`

不要な直列化を避ける。

### 5. Verificationを決める

Taskごとに具体的な確認方法を定義する。

優先:

- compiler / build
- typecheck
- lint
- unit test
- integration test
- deterministic script

必要な場合のみmanual verificationを追加する。

## `README.md` フォーマット

```markdown
# Phase N Task Plan

## Goal

## Requirement Coverage

| Requirement / Criteria | Task |
|---|---|
| FR-001 | T001 |
| AC-001 | T001, T002 |

## Tasks

### T001 - <タイトル>
Purpose: ...
Depends On: ...

### T002 - <タイトル>
Purpose: ...
Depends On: ...

## Execution Order

## Risks

## Phase Completion Condition
```

## Taskファイル フォーマット

```markdown
# Txxx - <タイトル>

## Goal

1つの明確なOutcome。

## Requirement Coverage

- FR-xxx
- AC-xxx
- Phase Completion Criteria: ...

## Context

このTaskを理解するための最小限の背景。
Spec/Architecture/Research全文をコピーしない。

## Existing Code Evidence

- `path/to/file: symbol` - 関連理由

## Expected Changes

期待する挙動と変更候補領域。

## Constraints

## Non-Goals

## Dependencies

Depends On:
- ...

Blocks:
- ...

## Verification

- `<command>`
- `<behavioral check>`

## Done When

- [ ] ...
- [ ] ...
```

## Task Size Check

各Task作成後に確認する。

- [ ] primary outcomeは1つか
- [ ] PASS/FAILを客観的に判断できるか
- [ ] 独立レビューできるか
- [ ] 無関係な変更が混ざっていないか
- [ ] 単なるmechanical editまで細分化していないか

必要ならsplit / mergeする。

## 最終Validation

終了前に確認する。

- [ ] 対象Phaseの全RequirementがTaskへ紐付いている
- [ ] Acceptance / Completion Criteriaに漏れがない
- [ ] Excluded scopeをTaskへ入れていない
- [ ] Architecture判断がResearch evidenceに支えられている
- [ ] 不要なrefactoringを入れていない
- [ ] 全TaskにVerificationがある
- [ ] 全Task完了でPhaseが完了する
