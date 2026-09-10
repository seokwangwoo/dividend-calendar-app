---
name: phase-plan
description: >
  Spec・Architecture・既存コード・前後Phaseの文脈を基に、実装可能で検証可能なPhase文書を作成・更新する。
  Phase自体の設計に使用し、Task分解は行わない。
---

# Phase Planning

## 目的

Implementerが大きな設計判断を新たに行わず、Reviewerが完了可否を客観判定できるPhase文書を作る。

## 入力

- `Docs/Spec.md`
- `Docs/Architecture.md`
- 対象Requirement / Change Request
- Repository source
- 必要に応じて前Phase Handoff、既存Research、STATE

## 出力

`Docs/Plans/PhaseN.md`

## Phase Size

1 Phase = 1つの意味ある独立Outcome。
技術layerだけで分けず、可能ならvertical behavior単位にする。

## 作成順序

1. 対象Requirement抽出
2. 前Phase Handoff / Dependencies確認
3. Current-Code Anchors確認
4. Goal定義
5. IN / OUT確定
6. Acceptance Criteria作成
7. Design決定
8. Implementation Steps作成
9. ValidationをACへ紐付け
10. Risks / Rollback / Handoff作成
11. Requirement Coverageを最終確認

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
- Anchors: `path: symbol` + ownership reason。実コードまたはVERIFIED Researchで確認する。
- Design: major flow / responsibility / state / error / lifecycle / reused patternを示す。line-level patchは書かない。
- Implementation Steps: file edit順ではなくbehavioral construction order。
- AC: observable / testable / binary。曖昧語を避ける。
- Validation: 全ACをAutomatedまたはManual Validationへ追跡可能にする。
- Risks: Phase固有の現実的なriskだけを書く。
- Handoff: 次Phaseがstable contractとして信頼してよいものと未実装範囲を書く。

## Evidence / Architecture Rules

- 存在しないpath/symbolを作らない。
- `Docs/Architecture.md`と矛盾する設計をPhaseだけで決めない。
- Architecture変更が必要なら`change-control`へ渡す。
- UNKNOWNは断定せずOpen Question/Riskとして扱う。

## 完了チェック

- [ ] Goalを1文で説明可能
- [ ] IN/OUT明確
- [ ] 全RequirementをCoverageできる
- [ ] 重要Anchorにevidenceあり
- [ ] Implementerへ重大な未決設計を残していない
- [ ] 全ACがbinary
- [ ] 全ACにValidationあり
- [ ] Handoffが次Phaseのcontractになっている

作成後の最終承認は自分で行わず、`phase-review`へ渡す。
