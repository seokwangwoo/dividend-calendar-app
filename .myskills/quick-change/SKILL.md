---
name: quick-change
description: >
  Phaseを作るほどではない小規模・局所・単一Outcomeの修正を、軽量Contract付きで実行する。
  小さなbug fix、validation追加、文言変更、局所条件修正などに使用する。
---

# Quick Change

## 目的

小さな変更にPhase文書を強制せず、Contract / Verification / Independent Reviewは維持する。

## Quick Change適用条件

原則として以下を満たす。

- primary outcomeが1つ
- 既存Architectureを変更しない
- 既存Patternが明確
- 変更範囲が局所的
- 複数の独立Taskへ分解する必要がない
- PASS/FAILを明確に定義できる

以下の場合はPhase workflowへ昇格する。

- Architecture boundary / responsibility / flow変更
- 非自明なDB schema / public API / protocol変更
- 複数Outcome
- 広いResearchが必要
- Requirementが大きく増える
- rollback / compatibility riskが複雑

昇格時は直接`phase-plan`へ行かず、原則`phase-intent`でPhase級のGoal / Scopeを再確認してから`phase-research`へ進む。

## 出力

`Docs/QuickChanges/QC-xxx.md`

```markdown
# QC-xxx - <Title>

## Goal
1つの観測可能なOutcome。

## Reason
なぜ必要か。

## Scope
### IN
- ...
### OUT
- ...

## Code Anchors
| Area | Anchor | Why |
|---|---|---|
| ... | `path: symbol` | ... |

## Expected Change
既存Patternを使った最小変更方針。

## Constraints
- ...

## Verification
- `<command or deterministic check>`
- `<behavior check>`

## Done When
- [ ] ...
```

## 手順

1. 要求を1文のGoalへ変換する。
2. 実コードで1〜3個程度の重要Anchorを確認する。
3. IN / OUTを明示する。
4. 既存Pattern内で最小変更できるか再確認する。
5. QC Contractを作成する。
6. `workflow-state`でWork Type=`QUICK_CHANGE`、Current Task=`QC-xxx`、Stage=`TASK_IMPLEMENT`へ更新する。
7. `task-implement`で実装・Verificationを行う。
8. `task-review`で独立Reviewする。
9. FAILなら`task-repair`→再Verification→再Review。

## Escalation Gate

実装中に以下が判明したらQuick Changeを継続しない。

- Goalを分割する必要がある
- 新しいArchitecture判断が必要
- 想定外に複数moduleの責務を跨ぐ
- Requirement / ACを大きく定義し直す必要がある
- existing patternが不明で広いResearchが必要

この場合:

1. current diffを無条件にrevertしない。
2. Quick Changeを完了扱いにしない。
3. `change-control`でcurrent workの再利用可否を整理する。
4. Phase級変更のIntentが不明確なら`phase-intent`を実行する。
5. 同一セッションで`phase-research → phase-plan → phase-review`へ進む。

## Rules

- 小さいからという理由でVerification / Reviewを省略しない。
- speculative refactoringを追加しない。
- Code Anchorは推測で書かない。
- Contract外の要求を黙って追加しない。
- Phaseへ昇格する際、古いQC Contractだけを新PhaseのSource of Truthにしない。
