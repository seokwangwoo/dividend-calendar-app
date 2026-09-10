---
name: phase-task-plan
description: >
  承認済みPhaseとResearchを、小さく意味があり独立レビュー可能な実装Taskへ分解する。実装は行わない。
---

# Phase Task Planning

## 目的

対象Phaseを、1 Task = 1 meaningful outcomeの実行Contractへ分解する。

## 入力

- `Docs/Spec.md`
- `Docs/Architecture.md`
- `Docs/Plans/PhaseN.md`
- `Docs/Research/PhaseN.md`
- 必要に応じて実コード

## 出力

```text
Docs/Tasks/PhaseN/
  README.md
  T001.md
  T002.md
  ...
```

## Planning Principles

- 全Requirement / AC / failure behaviorを最低1 Taskへ紐付ける。
- 優先順位は existing implementation → existing pattern → small extension → new abstraction。
- unrelated refactoring / cleanup / future-proofingを入れない。
- 各Taskは独立Verification / Review可能にする。
- file editだけのmechanical Taskへ細分化しすぎない。
- 各Task完了後、可能な限りRepositoryをbuild/test可能な状態に保つ。

## 手順

1. Requirement Coverage mapを作る。
2. Research evidenceから最小実装経路を組み立てる。
3. 1つのprimary outcomeごとにTaskへ分割する。
4. Depends On / Blocksを定義する。
5. 各TaskのVerification / Done Whenを定義する。
6. 全TaskでPhaseを完全に満たすか確認する。

## README Format

```markdown
# Phase N Task Plan

## Goal

## Requirement Coverage
| Requirement / Criteria | Task |
|---|---|

## Tasks

## Execution Order

## Risks

## Phase Completion Condition
```

## Task Format

```markdown
# Txxx - <Title>

## Goal

## Requirement Coverage
- FR-xxx
- AC-xxx

## Context
必要最小限。上位文書全文をコピーしない。

## Existing Code Evidence
- `path: symbol` - 理由

## Expected Changes
期待behaviorと有力な変更領域。

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
```

## Task Size Check

- primary outcomeは1つか
- objective PASS/FAILが可能か
- 独立Review可能か
- unrelated changeがないか
- 単なるimport/rename等まで分割していないか

## Final Validation

- 全Requirement/ACがTaskへcoverageされている
- OUT scopeを含めていない
- Architecture判断がResearch evidenceに支えられている
- dependencyが矛盾しない
- 全TaskにVerificationがある
