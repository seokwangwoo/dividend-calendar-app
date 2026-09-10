---
name: phase-task-plan
description: >
  Research後に作成されphase-reviewをPASSしたPhaseを、小さく意味があり独立レビュー可能な実装Taskへ分解する。実装は行わない。
---

# Phase Task Planning

## 目的

承認済みPhaseを、1 Task = 1 meaningful outcomeの実行Contractへ分解する。

## 前提

次が成立していること。

- `phase-research`完了
- Researchを基に`phase-plan`が作成済み
- `phase-review` Verdict=`PASS`

ResearchがPhase Review後に重大更新されている場合、古いPASSをそのまま信用せず`phase-plan → phase-review`を再実行する。

## 入力

- `Docs/Spec.md`
- `Docs/Architecture.md`
- `Docs/Research/PhaseN.md`
- `Docs/Plans/PhaseN.md`
- 最新のPhase Review結果
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
- Phase DesignとResearch evidenceの範囲内でTask化する。
- unrelated refactoring / cleanup / future-proofingを入れない。
- 各Taskは独立Verification / Review可能にする。
- file editだけのmechanical Taskへ細分化しすぎない。
- 各Task完了後、可能な限りRepositoryをbuild/test可能な状態に保つ。

## 手順

1. Phase Requirement Coverage mapを再確認する。
2. Research evidenceとPhase Designから最小実装経路を組み立てる。
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
- 単なるimport / rename等まで分割していないか

## Escalation

Taskへ分解する過程で以下を発見したら、Task側で新しい判断を作らない。

- Phase Designの重大な穴
- Research evidence不足
- Requirement Coverage欠落
- Architecture conflict

戻り先を分類する。

- Phase文書の問題 → `phase-plan`
- Evidence不足 → `phase-research` → `phase-plan` → `phase-review`
- Requirement/Architecture問題 → source-of-truth側を解決

## Final Validation

- 全Requirement / ACがTaskへcoverageされている
- OUT scopeを含めていない
- Architecture判断がResearch evidenceと承認済みPhaseに支えられている
- dependencyが矛盾しない
- 全TaskにVerificationがある
