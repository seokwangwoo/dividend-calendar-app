---
name: phase-plan
description: >
  phase-intentとphase-researchで明確化・検証した情報を基に、実装可能で検証可能なPhase文書を作成・更新する。Task分解は行わない。
---

# Phase Planning

## 目的

Spec上の要求とResearchで確認したRepository truthを結び付け、Implementerが重大な設計判断を新たに行わず、Reviewerが実装開始可否を客観判定できるPhase文書を作る。

**Phase PlanはResearchの後に作る。**
Research前にCurrent-Code Anchorや実装flowを推測して埋めない。

## 入力

必須:

- 同一セッションの`Phase Intent Brief`またはResearch内のIntent Summary
- `Docs/Research/PhaseN.md`
- `Docs/Spec.md`（存在する場合）
- `Docs/Architecture.md`（存在する場合）

必要に応じて:

- 前Phase Handoff
- 既存Phase
- Repository source（Research evidenceのspot checkのみ）
- `Docs/STATE.md`

Repository全体の再Researchは行わない。Researchが不足している場合は推測で補完せず`phase-research`へ戻す。

## 出力

`Docs/Plans/PhaseN.md`

Repositoryに既存のPhase命名規則・formatがある場合はsemantic roleを保つ範囲で従う。

## Phase Size

1 Phase = 1つの意味ある独立Outcome。
技術layerだけで分けず、可能ならvertical behavior単位にする。

次の場合はsplitを検討する。

- 独立したSuccess Outcomeが複数ある
- IN scopeが複数の大きなflowに分かれる
- rollback boundaryが別々
- Task Planが巨大になることがResearchから明らか

## 作成順序

1. Intent / Specから対象Requirementを抽出する。
2. ResearchのVERIFIED evidenceとUnknownを読む。
3. 前Phase Handoff / Dependenciesを確認する。
4. Goal / IN / OUTを確定する。
5. Acceptance Criteriaを先に作る。
6. Research evidenceからCurrent-Code Anchorsを選ぶ。
7. Designを既存Architecture / Patternに沿って決める。
8. Implementation Stepsをbehavioral construction orderで書く。
9. ValidationをACへ紐付ける。
10. Risks / Rollback / Handoffを書く。
11. Requirement CoverageとResearch整合を最終確認する。

## 標準Format

```markdown
# Phase <N>: <Title>

## Goal

## Scope
### IN
### OUT

## Dependencies

## Requirement Coverage
| Requirement | Covered By | Validation |
|---|---|---|

## Current-Code Anchors
| Area | Anchor | Why it owns the behavior |
|---|---|---|

## Design
### <design topic>

## Implementation Steps
1. ...

## Acceptance Criteria
- [ ] ...

## Automated Validation
| ID | Test | Covers | Setup | Assertion |
|---|---|---|---|---|

## Manual Validation
1. ...

## Risks and Rollback

## Handoff
```

## Section Rules

- Goal: 「何を作るか」ではなく完了後に何が可能になるかを書く。
- IN/OUT: behavior boundaryとscope creepしやすい近接機能を明示する。
- Dependencies: Phase番号だけでなく、前段から成立済みであるべきcontractを書く。
- Requirement Coverage: 対象Requirement / ACをPhase内のDesign / AC / Validationへ追跡可能にする。
- Anchors: Researchの`VERIFIED` evidenceを優先し、`path: symbol` + ownership reasonを書く。
- Design: major flow / responsibility / state / error / lifecycle / reused patternを示す。line-level patchは書かない。
- Implementation Steps: file edit順ではなくbehavioral construction order。
- AC: observable / testable / binary。曖昧語を避ける。
- Validation: 全ACをAutomatedまたはManual Validationへ追跡可能にする。
- Risks: Phase固有の現実的なriskだけを書く。
- Handoff: 次Phaseがstable contractとして信頼してよいものと未実装範囲を書く。

## Research Dependency Rule

Phaseに必要な重要判断がResearchの`UNKNOWN`に依存する場合、次のどちらかにする。

### Plan可能

UNKNOWNが実装詳細であり、既存Architecture boundary内でTask段階に安全に解消できる。

→ Risk / Planning noteとして明示しPlanを続行してよい。

### Plan不可

UNKNOWNが以下に影響する。

- Phase Goal / Scope
- public/device behavior
- Architecture boundary
- ownership
- compatibility
- critical failure behavior
- Acceptance Criteriaの成立条件

→ 推測でPhaseを完成させず`phase-research`または`phase-intent`へ戻す。

## Evidence / Architecture Rules

- 存在しないpath / symbolを作らない。
- Researchと異なるAnchor / flowを採用する場合は新しいevidenceが必要。
- `Docs/Architecture.md`と矛盾する設計をPhaseだけで決めない。
- Architecture変更が必要なら`change-control`へ渡す。
- cosmetic preferenceやfuture-proofingをDesign requirementへ昇格させない。

## 完了チェック

- [ ] Goalを1文で説明可能
- [ ] IN / OUTが明確
- [ ] 全対象RequirementをCoverageできる
- [ ] 重要AnchorがVERIFIED evidenceに基づく
- [ ] DesignがResearch / Architectureと整合する
- [ ] Implementerへ重大な未決設計を残していない
- [ ] 全ACがbinary
- [ ] 全ACにValidationがある
- [ ] Handoffが次Phaseのcontractになっている
- [ ] Planで解決不能なUNKNOWNを推測で埋めていない

作成後の最終承認は自分で行わず、Researchと共に`phase-review`へ渡す。
