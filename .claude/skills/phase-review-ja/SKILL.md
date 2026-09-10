---
name: phase-review-ja
description: >
  作成済みのPhase文書を実装前に独立レビューし、実装可能性・Requirement Coverage・Current-Code Anchor・Design整合性・Acceptance Criteria・Validation・Handoffを検証する。
  「Phase計画をレビューして」「このPhaseを実装開始してよいか確認して」など、Phase quality gateに使用する。
  Phase本文は変更しない。修正が必要ならFindingを返す。
---

# Independent Phase Review

## 目的

Phase文書が、**実装Agentに不要な推測や再設計をさせず、完了可否を客観的に判定できる品質に達しているか**を独立して確認する。

このSkillはPhase作成Agentとは独立したReviewerとして振る舞う。

ソースコードやPhase文書を変更しない。

## 入力

必須:

- 対象 `Docs/Plans/PhaseN.md`
- `Docs/Spec.md`
- `Docs/Architecture.md`
- Repository source

必要な場合のみ読む:

- 直前Phaseの`Handoff`
- 関連する後続Phase
- 関連 `Docs/Research/*.md`
- `Docs/STATE.md`
- Repository固有instruction

Phase作成Agentの説明・自己評価をcorrectness evidenceとして扱わない。

## 出力

原則としてReview結果を返す。

Repositoryでdurable review artifactを保存する場合の推奨path:

`Docs/Reviews/PhaseN-plan-review.md`

既存Review規則がある場合はそちらを優先する。

## 言語ルール

- Review・Finding・判定は日本語で記述する。
- code identifier / file path / API / log / errorは原文を保持する。
- 社内用語は既存表記を優先する。

## Reviewer Principles

- 「よく書けている」ではなく、実装開始可能かを判定する。
- Phase文書内の主張をそのまま信用せず、必要なAnchor/Architecture claimを実コード・Researchで確認する。
- 好みのdesignを押し付けない。
- Phase作成Agentの文体ではなくdownstream riskを評価する。
- Findingには必ず「このままだと次工程で何が起きるか」を含める。
- Reviewer自身が新しいRequirementを追加しない。
- exact implementation patchを指示しすぎず、満たすべきconditionを示す。

# Review Axes

以下の順序でレビューする。

## 1. Phase Coherence

確認する:

- Goalが1つの意味あるOutcomeになっているか
- このPhaseだけ完了した状態がsystem/user視点で一貫しているか
- 技術layerだけで不自然に分割されていないか
- Phaseが大きすぎないか
- 複数の独立featureを1 Phaseへ詰め込んでいないか

典型的な問題:

- DBだけ作るPhase
- UIだけ出して動かないPhase
- 複数featureを一度に実装するPhase
- Goalが「A.tsを変更する」などimplementation activityになっている

## 2. Scope Boundary

`IN / OUT`を確認する。

- INがbehavior boundaryとして明確か
- OUTに隣接scopeが明示されているか
- INとOUTが矛盾していないか
- 後続Phaseのscopeを先取りしていないか
- Acceptance CriteriaやImplementation StepsにOUT項目が紛れ込んでいないか

Scopeが曖昧でImplementerが「ついでに実装」できる状態はMAJOR候補。

## 3. Dependency Validity

確認する:

- Dependencyが単なるPhase名ではなく必要contractを示すか
- 前Phase Handoff / ACと整合するか
- 未成立Dependencyを成立済みと仮定していないか
- circular dependencyがないか
- 外部credential/device/environment依存が必要なら明示されているか

## 4. Requirement Coverage

Specから対象Phaseに関係するRequirementをReviewer側で独立抽出する。

PhaseのCoverage tableだけを信用しない。

確認する:

- 必要Requirementの漏れ
- Phase外Requirementの混入
- Requirement → Design/AC → Validationのtraceability
- Failure behaviorの抜け
- Explicit non-goalとの矛盾

対象SpecにIDがある場合はID単位で検証する。

## 5. Current-Code Anchor Evidence

`Current-Code Anchors`の重要項目を実コードまたはVERIFIED Researchで確認する。

各Anchorについて確認する:

- pathが存在するか
- symbolが存在するか
- Why欄の責務説明が実際のコードflowと整合するか
- deprecated/unused/old implementationを誤ってAnchorにしていないか
- 重要なentry point / ownershipが抜けていないか

単なるgrep hitはownership evidenceではない。

Anchorが存在するだけでなく、**なぜその場所がbehaviorを所有するか**を確認する。

## 6. Design Sufficiency

Designが「Implementerに必要な判断」を十分固定しているか確認する。

重要な確認項目:

- execution flow
- layer boundary
- data ownership
- state transition
- error handling
- concurrency/thread/lifecycle（関連する場合）
- external I/O boundary
- existing pattern reuse

次の状態は問題:

### Under-specified

Implementerが以下を新しく決めないと実装できない。

- どのlayerが責務を持つか
- どのstate transitionを採用するか
- success/failure時のbehavior
- 既存flowを使うか新規flowを作るか

### Over-specified

Phaseが以下まで固定している。

- line-level edit
- exact code body
- import順
- 不要なpseudo-code
- Architectureで決めるべきでない局所details

目標は「重要なcontractは固定、実装detailsはImplementerへ残す」。

## 7. Architecture Compliance

`Docs/Architecture.md`と照合する。

確認する:

- layer boundary違反がないか
- data ownershipが矛盾していないか
- new abstractionがArchitecture changeを暗黙に含んでいないか
- thread/process/device boundaryを越える変更が適切に扱われているか
- Phaseだけでproject-wide architecture decisionを勝手に決めていないか

Architecture変更が必要なら、Phase review PASSではなく`change-control-ja`またはArchitecture更新を要求する。

## 8. Implementation Steps Quality

確認する:

- behavior construction orderになっているか
- 単なるfile edit listではないか
- 順序にdependency上の矛盾がないか
- Acceptance Criteriaを成立させるのに必要なstepが抜けていないか
- Task分解レベルまで細かすぎないか
- OUT scopeが紛れ込んでいないか

## 9. Acceptance Criteria Quality

各ACを1件ずつ確認する。

良いAC:

- observable
- testable
- binary PASS/FAIL
- conditionとexpected outcomeが明確

問題となる表現:

- 正しく
- 適切に
- 問題なく
- 必要に応じて
- 期待通り

これらが具体条件なしで使われている場合はAmbiguity Finding候補。

さらに確認する:

- success path
- important failure path
- important boundary/edge case
- negative scope criterion（必要な場合）

1つのACに独立した複数条件を詰め込みすぎていないかも確認する。

## 10. Validation Traceability

ReviewerはすべてのACについて次を確認する。

```text
AC
↓
Automated Validation または Manual Validation
↓
具体的Assertion
```

チェック項目:

- coverageされないACがないか
- ValidationがACとは違うものをtestしていないか
- Setupが再現可能か
- Assertionが具体的か
- automated可能なのにmanualだけに逃げていないか
- implementation detailだけをtestし、behaviorをtestしていない箇所がないか

Test名があるだけではcoverageとみなさない。

## 11. Risk and Rollback Quality

確認する:

- RiskがPhase固有か
- 発生条件が理解できるか
- Impactが現実的か
- Mitigationがscope内か
- Rollback boundaryが現実的か

一般論を大量に列挙しているだけならMINOR。

Rollback不能なのにrollback可能と書いている場合はMAJOR候補。

## 12. Handoff Contract

確認する:

- 次Phaseが何を成立済みとして扱えるか明確か
- stable interface / behavior / ownershipが明示されているか
- intentionally unimplementedなscopeが明示されているか
- 後続Phaseが再度同じArchitectureを発明しないためのboundaryが十分か
- HandoffがAcceptance Criteriaと矛盾していないか

「Phase完了」とだけ書くHandoffは不十分。

# Cross-Section Consistency

最後にsection間の矛盾を探す。

特に確認する組み合わせ:

- Goal ↔ Scope
- Scope OUT ↔ Implementation Steps
- Requirement Coverage ↔ Acceptance Criteria
- Current-Code Anchors ↔ Design
- Design ↔ Architecture
- Acceptance Criteria ↔ Validation
- Acceptance Criteria ↔ Handoff
- Dependencies ↔ Handoff of previous Phase

単独sectionが良くても、section間矛盾があればPASSにしない。

# Severity

## BLOCKER

Phaseを安全に計画・実装できない重大問題。

例:

- SpecとPhaseが根本的に矛盾
- Architecture変更が未承認
- 必須Requirementが大きく欠落
- 重要Anchorが存在しない
- Phase goal自体が成立不能

## MAJOR

Phase実装開始前に修正すべき問題。

例:

- IN/OUT曖昧
- ACが検証不能
- 重要failure behavior欠落
- ACにValidationがない
- Design ownershipが未定義
- Handoff contractが不十分で後続Phaseが再設計を要する

## MINOR

実装開始を必ずしも止めない改善点。

例:

- 一部表現が冗長
- Risk記述の軽微な不足
- traceability表の小さな表記改善

# Finding Format

各Findingは次の形式にする。

```markdown
### P001

Severity: BLOCKER | MAJOR | MINOR
Area: Goal | Scope | Dependencies | Requirement Coverage | Anchors | Design | Implementation Steps | Acceptance Criteria | Validation | Risk | Handoff | Cross-Section
Location: `<section / row / criterion>`

Problem:
具体的な問題。

Evidence:
Spec / Architecture / source / Research / Phase内部矛盾の根拠。

Downstream Consequence:
このままTask PlanningまたはImplementationへ進むと、何が起こる可能性が高いか。

Required Outcome:
PASSするために何が明確・成立する必要があるか。
```

Reviewerは必要以上にexact wordingやexact implementationを指定しない。

# Scoring

補助指標として各項目を0〜2点で採点する。

- `0`: 不十分・危険
- `1`: 一部不足
- `2`: 十分

対象:

| Axis | Score |
|---|---:|
| Phase Coherence | 0-2 |
| Scope Boundary | 0-2 |
| Requirement Coverage | 0-2 |
| Code Evidence | 0-2 |
| Design Sufficiency | 0-2 |
| Architecture Compliance | 0-2 |
| Acceptance Criteria | 0-2 |
| Validation Traceability | 0-2 |
| Risk / Rollback | 0-2 |
| Handoff | 0-2 |

Total: 20点。

Scoreは補助であり、BLOCKER/MAJOR判定を上書きしない。

例えば18/20でもBLOCKERがあればFAIL。

# Verdict

## PASS

以下をすべて満たす場合のみ。

- BLOCKER = 0
- MAJOR = 0
- 必須Requirementがcoverされている
- 重要Anchorにevidenceがある
- DesignがArchitectureと整合する
- ACが判定可能
- 全ACがValidationへ紐付く
- Task Plannerが大きな設計判断を新規に行わなくてよい

## FAIL

BLOCKERまたはMAJORが1件以上ある場合。

MINORのみならPASS可能。

# 出力フォーマット

```markdown
# Phase Plan Review: Phase N

## Verdict

PASS | FAIL

## Score

| Axis | Score | Notes |
|---|---:|---|
| Phase Coherence | 2 | ... |
| Scope Boundary | 2 | ... |
| Requirement Coverage | 2 | ... |
| Code Evidence | 2 | ... |
| Design Sufficiency | 2 | ... |
| Architecture Compliance | 2 | ... |
| Acceptance Criteria | 2 | ... |
| Validation Traceability | 2 | ... |
| Risk / Rollback | 2 | ... |
| Handoff | 2 | ... |

Total: XX / 20

## Findings

### P001
...

Findingsがない場合:
- None

## Requirement Coverage Check

| Requirement | Phase Coverage | Validation | Result |
|---|---|---|---|

## Anchor Verification

| Anchor | Evidence | Result |
|---|---|---|

## Acceptance Criteria Validation Map

| AC | Validation | Result |
|---|---|---|

## Architecture Check

## Handoff Check

## Decision

`READY_FOR_RESEARCH_AND_TASK_PLANNING`

または

`REVISION_REQUIRED`

## Required Next Action

PASS時:
- `phase-research-ja`へ進む。

FAIL時:
- `phase-plan-ja`でFindingのみを修正し、再度`phase-review-ja`を実行する。
```

# Revision Loop Rule

FAIL時にReviewer自身がPhaseを直接書き換えない。

```text
phase-plan-ja
      ↓
phase-review-ja
      ├─ PASS → phase-research-ja
      └─ FAIL
           ↓
    phase-plan-jaでFinding修正
           ↓
      phase-review-ja
```

同じFindingが3回以上解消しない場合、単なる文章修正ではなく以下の上位問題を疑う。

- Spec ambiguity
- Architecture ambiguity
- missing code research
- Phase boundaryが不適切
- dependency未解決

その場合は無限rewriteせずBLOCKERとしてescalateする。

# 独立性ルール

可能なら`phase-plan-ja`を実行したAgentとは別のsub-agent / cold contextで実行する。

Reviewerへ渡す主要Context:

- Phase document
- relevant Spec
- Architecture
- relevant source / Research evidence

Plannerの思考過程は渡さなくてよい。

# 完了チェック

終了前に確認する。

- [ ] Reviewer側でRequirementを独立抽出した
- [ ] Current-Code Anchorを必要範囲で実コード確認した
- [ ] Phase size/coherenceを確認した
- [ ] Scope IN/OUT矛盾を確認した
- [ ] DesignとArchitectureを照合した
- [ ] 全ACをbinary判定可能か確認した
- [ ] 全ACとValidationをmappingした
- [ ] Handoffをstable contractとして確認した
- [ ] FindingにEvidenceとDownstream Consequenceがある
- [ ] 新しいRequirementを勝手に追加していない
- [ ] Phase文書・source codeを変更していない
