---
name: phase-research
description: >
  承認済みPhaseが既存コードへどのように接続されるかを実コードで調査し、Planningに必要なevidenceをDocs/Research/PhaseN.mdへ整理する。
---

# Phase Research

## 目的

Phaseを実装する前に、entry point、実際のexecution flow、既存Pattern、data structure、test、constraintを確認する。
実装・Task分解・Architecture再設計は行わない。

## 入力

- `Docs/Spec.md`
- `Docs/Architecture.md`
- 対象 `Docs/Plans/PhaseN.md`
- Repository source
- 必要に応じてRepository固有instruction

## 出力

`Docs/Research/PhaseN.md`

## Evidence Labels

- `VERIFIED`: 実コード/設定/testから直接確認
- `INFERENCE`: 強く示唆されるが未確認
- `UNKNOWN`: 現時点で判断不能

UNKNOWNを仮定へ変換しない。

## 手順

1. Phase Goal / Scope / ACを理解する。
2. Entry Pointを特定する。例: UI action, API, event, callback, worker, device message。
3. 実際のcall/data/event flowを追跡する。
4. 関連file/symbolと責務を記録する。
5. 類似する既存実装Patternを探す。
6. type/interface/model/schema/protocol/stateを確認する。
7. test/helper/build/validation conventionを確認する。
8. error/lifecycle/threading/persistence/external I/O等のconstraintを確認する。
9. regression riskとunknownを整理する。
10. Plannerが使えるImplementation Implicationsだけを書く。Task listは作らない。

## Evidence Format

原則 `path/to/file: symbol` を使い、なぜ関連するか説明する。
単なるfile inventoryにしない。

## 出力Format

```markdown
# Research: Phase N - <name>

## Phase Goal

## Relevant Requirements

## Entry Points

## Current Execution Flow

## Relevant Files and Symbols

## Existing Patterns to Reuse

## Data Structures / Contracts

## Existing Tests

## Constraints

## Regression Risks

## Unknowns

## Planning Implications
```

## Rules

- actual codeと文書が矛盾したらactual codeを優先し、矛盾を記録する。
- 実装候補を断定する前にevidenceを示す。
- 新しいabstractionを提案しない。
- Taskを作らない。
- Phase外の広い調査へ無制限に拡張しない。

## 完了チェック

- [ ] 重要entry pointを確認
- [ ] main flowを追跡
- [ ] 類似Patternを確認
- [ ] test/verification locationを確認
- [ ] VERIFIED/INFERENCE/UNKNOWNを区別
- [ ] Architecture主張にevidenceあり
