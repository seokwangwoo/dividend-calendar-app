---
name: phase-review
description: >
  作成済みPhase文書を実装前に独立レビューし、Requirement coverage、scope、evidence、設計、AC、Validation、Handoffの品質を判定する。
---

# Phase Review

## 目的

Phase Plannerとは独立した視点で、Phaseが実装可能・検証可能・過不足なく設計されているか確認する。
このSkillはread-only。Phase本文を直接修正しない。

## 入力

- 対象 `Docs/Plans/PhaseN.md`
- `Docs/Spec.md`
- `Docs/Architecture.md`
- 必要に応じてRepository source / Research / 前後Phase

## Review Areas

1. Phase Coherence: 1つの意味あるOutcomeか、広すぎ/細かすぎないか。
2. Scope: IN/OUTが明確でscope leakしないか。
3. Dependencies: 前段contractが具体的か。
4. Requirement Coverage: 対象Requirement/ACの漏れ・余計なscopeがないか。
5. Current-Code Anchors: 実在し、`path: symbol`とownership reasonが正しいか。
6. Design: Architecture整合、既存Pattern再利用、重要flow/error/state/lifecycleが十分か。
7. Implementation Steps: file listではなく論理的construction orderか。
8. Acceptance Criteria: observable / testable / binaryか。
9. Validation Traceability: 全ACがAutomated/Manual Validationへ紐付くか。
10. Risks/Rollback: Phase固有で現実的か。
11. Handoff: 後続Phaseが信頼できるstable contractか。
12. Cross-section Consistency: Goal/Scope/Design/AC/Validationが互いに矛盾しないか。

## Severity

- `BLOCKER`: Phaseを実装開始できない重大な矛盾・欠落。
- `MAJOR`: 下流で誤実装/再計画を招く重要問題。
- `MINOR`: 実装開始を止めない改善点。

## Finding Format

```markdown
### P001
Severity: BLOCKER | MAJOR | MINOR
Area: <section>
Location: <heading / row / item>

Problem:
...

Evidence:
...

Downstream Consequence:
...

Required Outcome:
何がtrueになれば解決か。exact patchは原則指定しない。
```

## Verdict

`PASS`: BLOCKER=0かつMAJOR=0。
`FAIL`: BLOCKERまたはMAJORが1件以上。

## Scorecard

各0〜2点、合計20点。

- Coherence
- Scope
- Requirement Coverage
- Evidence
- Architecture/Design
- Implementation Steps
- Acceptance Criteria
- Validation Traceability
- Risk/Rollback
- Handoff

Scoreは補助指標。VerdictはSeverity ruleを優先する。

## 出力

```markdown
# Phase Review: Phase N

## Verdict
PASS | FAIL

## Score
X / 20

## Findings
...

## Coverage Check
...

## Validation Traceability
...

## Final Assessment
...
```

FAIL時は`phase-plan`へFindingだけを渡して修正し、別Reviewerまたはcold contextで再Reviewする。
