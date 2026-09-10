---
name: phase-research
description: >
  phase-intentで確定したsession-only Intent BriefとSpec・Architectureを起点に、Phase Planning前のコードベース調査を行い、Planningに必要なevidenceをDocs/Research/PhaseN.mdへ整理する。
---

# Phase Research

## 目的

Phase Planを書く前に、Intentを既存コードへどう接続すべきか判断できる事実を集める。
entry point、実execution flow、既存Pattern、data structure、test、constraint、unknownを確認する。

このSkillは実装・Task分解・Phase設計の確定を行わない。

## 前提

原則として同一セッションで`phase-intent`が完了し、会話内に`Phase Intent Brief`が存在すること。
Intent Briefを別ファイルとして作成しない。

既に十分明確な要求が会話にあり、`phase-intent`のStop Ruleを満たしている場合は、形式的なInterviewを再実行せず同等のIntentを会話から使用してよい。

## 入力

必須:

- session内の`Phase Intent Brief`または同等に明確なIntent
- `Docs/Spec.md`（存在する場合）
- `Docs/Architecture.md`（存在する場合）
- Repository source

必要に応じて:

- 前Phase Handoff
- 既存Plans / Research
- `Docs/STATE.md`
- Repository固有instruction

**対象Phase文書は入力として要求しない。Phase PlanはこのResearchの後に作る。**

## Phase Identity

既存命名規則から対象Phase IDを一意に決められる場合はそれを使用する。
例: 既存がPhase1〜Phase3なら次をPhase4とする。

一意に決められない場合は推測で既存Phaseを上書きせず、暫定TitleをResearch headingに使い、Plannerへ命名decisionを明示する。

## 出力

原則:

`Docs/Research/PhaseN.md`

Repositoryに既存命名規則があれば従う。

## Evidence Labels

- `VERIFIED`: 実コード / config / testから直接確認
- `INFERENCE`: evidenceから強く示唆されるが未確認
- `UNKNOWN`: 現時点で判断不能

`UNKNOWN`を仮定へ変換しない。

## 調査手順

1. Intent BriefのGoal / IN / OUT / Success / Failure / Constraintsを把握する。
2. Relevant RequirementsをSpecと照合する。
3. Entry Pointを特定する。例: UI action, API, event, callback, worker, device message。
4. 実際のcall / data / event flowを追跡する。
5. 関連file / symbolと責務を記録する。
6. 類似する既存実装Patternを探す。
7. type / interface / model / schema / protocol / state ownershipを確認する。
8. test / helper / build / validation conventionを確認する。
9. error / lifecycle / threading / persistence / external I/O等のconstraintを確認する。
10. regression riskとunknownを整理する。
11. Plannerが判断に使える`Planning Implications`を書く。Task listやPhase Designそのものは確定しない。

## Research Question Handling

Intent Briefの`Research Questions`を優先的に解消する。

新しい疑問が出た場合:

- codebaseで答えられる → 調査してevidenceを残す
- product behaviorのdecisionが必要 → `UNKNOWN / PRODUCT_DECISION_REQUIRED`として明示し、推測しない
- Architecture decisionが必要 → 現行Architectureと選択肢のevidenceだけ整理し、勝手に決めない

重大なProduct Decisionが未解決でPlanを安全に作れない場合は、`phase-plan`へ進めず`phase-intent`へ戻すべき事項として記録する。

## Evidence Format

原則 `path/to/file: symbol` を使い、なぜ関連するか説明する。
単なるfile inventoryにしない。

## 出力Format

```markdown
# Research: Phase N - <name>

## Intent Summary

## Relevant Requirements

## Entry Points

## Current Execution Flow

## Relevant Files and Symbols

## Existing Patterns to Reuse

## Data Structures / Contracts

## Existing Tests / Validation

## Constraints

## Regression Risks

## Unknowns

## Planning Implications
```

## Planning Implications Rule

ここでは以下は書いてよい。

- 再利用すべき既存boundary / pattern
- 避けるべき既存制約
- Phase Planで決める必要がある論点
- evidence上もっとも自然な方向

以下は書かない。

- Task breakdown
- exact patch
- line-level implementation
- evidenceのない新規abstraction

## Rules

- actual codeと文書が矛盾したらactual codeを優先し、矛盾を記録する。
- 実装候補を断定する前にevidenceを示す。
- Phase Planを先回りして完成させない。
- Phase外の広い調査へ無制限に拡張しない。
- Intent BriefをResearch文書へ全文コピーしない。必要な要約だけ残す。

## 完了チェック

- [ ] Intentの重要Research Questionsを確認した
- [ ] 重要entry pointを確認した
- [ ] main flowを追跡した
- [ ] 類似Patternを確認した
- [ ] test / verification locationを確認した
- [ ] VERIFIED / INFERENCE / UNKNOWNを区別した
- [ ] Planningに必要なArchitecture主張にevidenceがある
- [ ] Planを止めるProduct Decisionが残る場合は明示した

完了後のNext Actionは`phase-plan`。
