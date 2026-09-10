---
name: phase-review
description: >
  Research後に作成されたPhase文書を実装前に独立レビューし、Task Planningへ安全に渡せるかを判定する。
  文書の完璧さではなくdownstream riskを評価する。
---

# Phase Review

## 目的

Phase Plannerとは独立した視点で、PhaseがTask Planner / Implementerへ安全にhandoff可能か確認する。

このSkillはread-only。Phase本文を直接修正しない。

通常は`phase-cycle`から**Plannerとは別のcold sub-agent / cold context**として実行する。
ユーザーが独立Reviewのために別Chat/sessionを手動で開く必要はない。

## Independence Rule

ReviewerはPlannerの結論を正しいと仮定しない。

入力として優先するもの:

- `Docs/Plans/PhaseN.md`
- `Docs/Research/PhaseN.md`
- relevant `Docs/Spec.md`
- `Docs/Architecture.md`
- 必要なRepository source spot-check

原則としてevidenceにしないもの:

- Plannerのreasoning / chain-of-thought
- Plannerの自己評価
- Plannerが「正しい」と説明しただけの主張
- Plannerとorchestratorの詳細な会話

同じmodelをPlannerとReviewerに使ってもよい。重要なのはcontext isolationである。

再Reviewでは可能ならnew cold Reviewerを使用する。
前回Findingは確認対象として渡してよいが、その結論を無条件に継承しない。

## Review Question

中心質問は次の1つ。

> このPhaseをTask Planner / Implementerへ渡した場合、重大なProduct / Architecture / Code Ownership / Validation判断を推測する必要が残っていないか？

## Review Areas

1. Phase Coherence: 1つの意味あるOutcomeか、広すぎ/細かすぎないか。
2. Scope: IN/OUTが明確でscope leakしないか。
3. Dependencies: 前段contractが具体的か。
4. Requirement Coverage: 対象Requirement/ACの漏れ・余計なscopeがないか。
5. Current-Code Anchors: Research evidenceと一致し、`path: symbol`とownership reasonが妥当か。
6. Design: Architecture整合、既存Pattern再利用、重要flow/error/state/lifecycleが十分か。
7. Implementation Steps: file listではなく論理的construction orderか。
8. Acceptance Criteria: observable / testable / binaryか。
9. Validation Traceability: 重要ACがAutomated/Manual Validationへ紐付くか。
10. Risks/Rollback: Phase固有で現実的か。
11. Handoff: 後続Phaseが信頼できるstable contractか。
12. Cross-section Consistency: Goal/Scope/Design/AC/Validationが互いに矛盾しないか。

## Severity

- `BLOCKER`: 実装開始できない重大な矛盾・欠落。
- `MAJOR`: 下流で誤実装/再計画を招く重要問題。
- `MINOR`: 実装開始を止めない改善点。

MINORだけなら原則PASSとする。
文書をより美しくできる、説明を追加できる、という理由だけでMAJORにしない。

## Fix At

各BLOCKER / MAJOR Findingに、解決すべきSourceを必ず付ける。

- `PHASE_PLAN`: Phase文書だけで解消可能
- `PHASE_RESEARCH`: evidence不足/誤り/UNKNOWN解消が必要
- `PHASE_INTENT`: user/product/device behavior decisionが必要
- `SPEC`: Requirement source-of-truthの変更/明確化が必要
- `ARCHITECTURE`: project-wide architecture decisionが必要

すべてを`PHASE_PLAN`へ戻さない。

## Finding Format

```markdown
### P001
Severity: BLOCKER | MAJOR | MINOR
Fix At: PHASE_PLAN | PHASE_RESEARCH | PHASE_INTENT | SPEC | ARCHITECTURE
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

MINORでは`Fix At`を省略してもよい。

## Verdict

### `PASS`

- BLOCKER=0
- MAJOR=0

MINORは残っていてもよい。

### `FAIL`

BLOCKER/MAJORが存在し、そのFindingがすべて`PHASE_PLAN`で修正可能。

`phase-cycle`ではFindingだけをPlannerへ渡し、限定修正後にnew cold Reviewを行う。

### `UPSTREAM_BLOCKED`

少なくとも1つのBLOCKER/MAJORが以下を必要とする。

- PHASE_RESEARCH
- PHASE_INTENT
- SPEC
- ARCHITECTURE

この場合、Plannerに文章修正だけを繰り返させない。
`phase-cycle`がFix Atへrouteする。

## Review Discipline

- Researchにないcode factをReviewerが勝手に補完してPASSさせない。
- 逆に、実装時に自然に決められるminor detailをPhaseへ過剰要求しない。
- file/path/symbolの小さな表現差より、ownership/flow判断が正しいかを優先する。
- すべてのedge caseを列挙していないこと自体をFAIL理由にしない。対象Requirementに重要かで判断する。
- passing test planの文言より、ACが実際に検証可能かを評価する。
- 前ReviewerのFindingが修正済みでもPhase全体を独立再評価する。ただし新しいcosmetic Findingを増やしてcycleを長引かせない。

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
高Scoreを得るためだけの修正を要求しない。

## 出力

```markdown
# Phase Review: Phase N

## Verdict
PASS | FAIL | UPSTREAM_BLOCKED

## Score
X / 20

## Findings
...

## Coverage Check
...

## Validation Traceability
...

## Routing
Next Fix At: PHASE_PLAN | PHASE_RESEARCH | PHASE_INTENT | SPEC | ARCHITECTURE | None

## Final Assessment
...
```

## Loop Protection

同じ意味のFindingが繰り返す場合:

1. Fix Atが正しいか再評価する。
2. Planner文章修正だけで解決できる問題か確認する。
3. Research/Intent/Spec/Architectureの不足ならUPSTREAM_BLOCKEDへ変更する。
4. MINORだけならPASSにする。

`phase-cycle`では原則3 Review roundsを上限とする。
