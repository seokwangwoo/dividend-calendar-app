---
name: run-phase-ja
description: >
  1つのPhaseについて、Research → Task Planning → Task Implementation → Verification → Independent Review → Repair → Phase Closeを順番に実行する。
  「このPhaseを一通り進めて」「次のPhaseをResearchから完了判定まで実行して」など、Phase全体のオーケストレーションに使用する。
---

# Run Phase Workflow

## 目的

対象Phaseを、定義済みの標準Workflowに従って最後まで進める。

このSkill自身は各工程の専門責務を抱え込まず、対応するSkillへ処理を委譲するOrchestratorとして振る舞う。

## 使用するSkill

順番に使用する。

1. `phase-research-ja`
2. `phase-task-plan-ja`
3. `task-implement-ja`
4. `task-review-ja`
5. `task-repair-ja`（FAIL時のみ）
6. `phase-close-ja`

## 入力

必須:

- 対象 `Docs/Plans/PhaseN.md`
- `Docs/Spec.md`
- `Docs/Architecture.md`
- Repository source

既存のパスが異なる場合はRepository規則に合わせる。

## Workflow

```text
Phase
  ↓
Research
  ↓
Task Planning
  ↓
Ready Taskを選択
  ↓
Implement
  ↓
Deterministic Verification
  ↓
Independent Review
  ├─ PASS → 次のReady Task
  └─ FAIL → Targeted Repair → Verification → Review
  ↓
全Task PASS
  ↓
Phase Completion Review
```

## 詳細手順

### 1. Research

`phase-research-ja`を使用して対象Phaseの調査結果を作成する。

Researchが重大な`UNKNOWN`や文書とコードの矛盾によりPlan作成不能と判断した場合は、無理に次へ進まない。

### 2. Task Planning

`phase-task-plan-ja`を使用する。

Task dependencyとRequirement Coverageを確認する。

### 3. Ready Taskを選ぶ

以下を満たすTaskのみ実装可能。

- 未完了
- `Depends On`がすべてPASS済み
- BLOCKEDでない

安全な場合、dependencyのない独立Taskは並列実行してよい。

同一ファイルを広く編集するTaskは原則直列にする。

### 4. Task Implementation

各Taskを`task-implement-ja`で実装する。

Implementerが`BLOCKED`を返した場合はrepair loopへ入れず、原因を上位文書に分類して停止する。

### 5. Verification

Taskに定義されたdeterministic verificationを必ず確認する。

例:

- compiler/build
- lint
- typecheck
- unit/integration test

Verification failureが明らかな場合、意味的Reviewerを呼ぶ前に実装側で解消する。

ただし既存failureや環境要因の場合は証拠付きで区別する。

### 6. Independent Review

`task-review-ja`をcold/independent contextで実行することを優先する。

Reviewerへ渡す主要Context:

- Task Contract
- actual diff
- relevant code
- Verification result

実装Agentの説明はcorrectness evidenceとして扱わない。

### 7. Repair Loop

ReviewがFAILの場合、`task-repair-ja`を使用する。

Repair後:

1. Verification
2. `task-review-ja`で再Review

を必ず行う。

Repair Agent自身の「修正完了」を最終PASSに使わない。

### 8. Retry Limit

同一TaskでReview FAILが3回続いた場合、無限修正をやめて停止する。

次を報告する。

```markdown
## Escalation

Task: Txxx
Failed Review Rounds: 3

### Unresolved Findings

### Repairs Attempted

### Suspected Root Cause

- Spec issue
- Architecture issue
- Research issue
- Task planning issue
- Implementation issue
- Environment/dependency issue

### Recommended Next Action
```

この状態ではTask全体を闇雲に再実装しない。

### 9. Phase Close

全必須TaskのIndependent ReviewがPASSしたら`phase-close-ja`を実行する。

`COMPLETE`になった場合のみPhase完了とする。

`INCOMPLETE`の場合は原因を以下へ分類する。

- missing Task
- integration gap
- Spec / Plan gap
- verification gap

必要最小限の追加計画へ戻す。

## Context Isolation Rule

全文書を全Agentへ自動投入しない。

推奨Context:

### Research

- Spec
- Architecture
- Phase
- source

### Planner

- Spec
- Architecture
- Phase
- Research

### Implementer

- target Task
- Architecture
- relevant source
- 必要なSpec/Research箇所のみ

### Reviewer

- target Task
- diff
- relevant source
- verification results

### Repair

- target Task
- failing findings
- relevant current source

### Phase Close

- Phase
- Spec関連箇所
-全Task status/review
- integrated repository state

## Scope Rule

- Phaseを飛ばさない。
- 後続Phaseのscopeを先取りしない。
- Task実装中にPlanを勝手に拡張しない。
- 現在のRepository truthと文書が矛盾する場合は差異を記録する。

## 完了報告

```markdown
# Phase Workflow Result

## Phase

<Phase path/title>

## Result

COMPLETE | INCOMPLETE | BLOCKED

## Research

- Output: ...
- Key unknowns: ...

## Tasks

| Task | Implementation | Review |
|---|---|---|
| T001 | IMPLEMENTED | PASS |

## Verification

主要checkの結果。

## Phase Close

COMPLETE / INCOMPLETE

## Remaining Issues

None または具体的内容。
```
