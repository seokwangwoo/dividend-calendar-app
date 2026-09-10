---
name: phase-review
description: >
  Research後に作成されたPhase文書を独立レビューし、安全にTask Planningへ進めるかを判定する。文書の完璧さではなく実装開始リスクを評価し、問題ごとに戻るべき上位Skillを指定する。
---

# Phase Review

## 目的

Phase Plannerとは独立した視点で、**このPhaseを基にTask Planningと実装を開始しても危険な推測が残っていないか**を確認する。

このSkillは文書校正ではない。Phaseを「完璧な文書」にするためにFAILさせない。
このSkillはread-onlyであり、Phase本文・Research・Spec・Architectureを直接修正しない。

## 入力

必須:

- 対象 `Docs/Plans/PhaseN.md`
- 対応する `Docs/Research/PhaseN.md`
- `Docs/Spec.md`（存在する場合）
- `Docs/Architecture.md`（存在する場合）

必要に応じて:

- session内のIntent Brief
- 前後Phase
- Repository source（Research evidenceのspot check）

## Core Review Question

> このPhaseをそのまま`phase-task-plan`へ渡したとき、Task Planner / Implementerが重要なRequirement・Architecture・ownership・failure behaviorを推測する必要があるか？

Noなら、文書上の軽微な改善点が残っていてもPASSを優先する。

## Review Areas

1. Phase Coherence: 1つの意味あるOutcomeか、広すぎ/細かすぎないか。
2. Intent / Scope: GoalとIN/OUTがIntentと一致するか。
3. Dependencies: 実装開始に必要な前段contractが具体的か。
4. Requirement Coverage: 対象Requirement/ACの漏れ・余計なscopeがないか。
5. Research Consistency: Phaseの重要主張がResearch evidenceと矛盾しないか。
6. Current-Code Anchors: 重要Anchorが実在し、ResearchのVERIFIED evidenceで支えられるか。
7. Design: Architecture整合、既存Pattern再利用、重要flow/error/state/lifecycleが実装開始に十分か。
8. Implementation Steps: file listではなく論理的construction orderか。
9. Acceptance Criteria: observable / testable / binaryか。
10. Validation Traceability: 重要ACがAutomated/Manual Validationへ紐付くか。
11. Risks/Rollback: 高risk変更に必要な注意があるか。
12. Handoff: 後続Phaseが誤解しないstable contractか。

## Severity Philosophy

Severityは文章品質ではなく**downstream risk**で決める。

### BLOCKER

このまま進むと安全にPlanning/Implementationできない。

例:
- Goal / Scopeが相互矛盾
- Requirement自体が未決
-重大なArchitecture conflict
- Researchでcritical UNKNOWNが残り、Phaseがそれを推測で確定
- data loss / safety / compatibilityに関する重大未決

### MAJOR

このまま進むと誤実装・Requirement漏れ・検証不能になる可能性が高い。

例:
- 必須Requirement / failure behavior漏れ
- Researchと異なるownership/flowを根拠なく採用
- 重要ACがbinaryでない
- 実装責務境界が複数解釈できる

### MINOR

改善可能だがTask Planning/Implementationを安全に開始できる。

例:
- Handoff表現をより明確にできる
- 非criticalなRisk説明が短い
- Manual Validationをもう少し具体化できる
- optional Anchorを追加できる
- wording / formatting改善

**MINORだけでFAILにしない。**

## Finding Routing

各BLOCKER / MAJOR Findingには必ず`Fix At`を付ける。

許可値:

- `PHASE_PLAN`: Phase文書の整理・Design/AC/Scope修正で解消可能
- `PHASE_RESEARCH`: codebase evidence不足・誤認・critical UNKNOWN
- `PHASE_INTENT`: user/product behavior decisionが未確定
- `SPEC`: source Requirement自体が欠落・矛盾
- `ARCHITECTURE`: project-wide architecture decisionが必要

Reviewerは「全部phase-planで直せ」としない。

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
Research / Spec / Architecture / source evidence。

Downstream Consequence:
このまま進んだ場合に何を誤る可能性があるか。

Required Outcome:
何がtrueになれば解決か。exact patchは原則指定しない。
```

MINORにもFix Atを付けてよいが、実装開始を止めない。

## Verdict

### PASS

- BLOCKER = 0
- MAJOR = 0
- Task Plannerが重大な推測をせず進める

MINORは残っていてよい。

### FAIL

- BLOCKER / MAJORがある
- かつ主なFindingが`PHASE_PLAN`で解消可能

→ Findingだけを`phase-plan`へ戻す。

### UPSTREAM_BLOCKED

Phase文書を何度書き直しても解消できない上位問題がある。

例:
- Fix At=`PHASE_RESEARCH`
- Fix At=`PHASE_INTENT`
- Fix At=`SPEC`
- Fix At=`ARCHITECTURE`

→ `phase-plan ↔ phase-review` loopを続けず、該当Skill/Artifactへ戻る。

複数Findingが混在する場合、先に最上位原因を解消する。

優先:
`SPEC/ARCHITECTURE/PHASE_INTENT → PHASE_RESEARCH → PHASE_PLAN`

## Repeated Finding Rule

同じ本質のBLOCKER/MAJORがPhase Plan修正後も繰り返す場合:

1. wording不足と決めつけない。
2. Research / Intent / Spec / Architectureの不足を疑う。
3. 根拠なしに新しいPlan案を要求し続けない。
4. 必要なら`UPSTREAM_BLOCKED`へ切り替える。

## Scorecard

Scoreは補助指標であり、PASS gateではない。
各0〜2点、合計20点。

- Coherence
- Scope
- Requirement Coverage
- Research Evidence
- Architecture/Design
- Implementation Steps
- Acceptance Criteria
- Validation Traceability
- Risk/Rollback
- Handoff

低Scoreだけを理由にFAILにしない。

## 出力

```markdown
# Phase Review: Phase N

## Verdict
PASS | FAIL | UPSTREAM_BLOCKED

## Score
X / 20

## Findings
...

## Routing Summary
- PHASE_PLAN: Pxxx
- PHASE_RESEARCH: Pxxx
- PHASE_INTENT: None
- SPEC: None
- ARCHITECTURE: None

## Coverage Check
...

## Research Consistency
...

## Validation Traceability
...

## Final Assessment
Task Planningへ進めるか、どこへ戻るべきかを1つ示す。
```

## Final Rule

レビュー目的は「欠点ゼロのPhase文書」ではなく、**誤実装を生む重大な不確実性を実装前に止めること**。
文書改善だけのMINORを積み上げて無限Review loopを作らない。
