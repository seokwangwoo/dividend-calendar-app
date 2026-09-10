---
name: phase-cycle
description: >
  Phase級の変更要求について、phase-intent → phase-research → phase-plan → cold phase-review を同一ユーザーセッション内でOrchestrationし、
  Review PASSまで必要な修正・再調査・再確認を自動で回す。ユーザーに手動で別セッションを開かせず、Reviewerのcontext独立性は維持する。
---

# Phase Cycle

## 目的

Phase実装前の準備を、ユーザーが1つのセッションから離れずに完了できるようにする。

内部では役割ごとにcontextを分離し、特にReviewerはPlannerから独立したcold sub-agent / cold contextで実行する。

このSkillが完了した時点で期待する状態:

- IntentがResearch可能な程度に明確
- `Docs/Research/PhaseN.md` が現在コードのevidenceを反映
- `Docs/Plans/PhaseN.md` がResearchに基づいて作成済み
- `phase-review` がPASS
- 次Actionが `phase-task-plan`

Task分解・実装はこのSkillでは行わない。

## User Experience Principle

ユーザーに次の手作業を要求しない。

```text
phase-plan
→ 新しいセッションを開く
→ phase-review
→ FAIL
→ Planner側へ戻る
→ 修正
→ また新しいReviewerセッションを開く
```

代わりに内部で以下を行う。

```text
User Session
  ↓
phase-cycle
  ├─ Intent clarification
  ├─ Research context
  ├─ Planner context
  ├─ Cold Reviewer #1
  ├─ targeted fix / upstream correction
  ├─ Cold Reviewer #2
  └─ PASS
```

ユーザーとの対話は、product/behavior decisionが本当に必要な場合だけ行う。

## Standard Flow

```text
phase-intent
  ↓ session-only Intent Brief
phase-research
  ↓ Docs/Research/PhaseN.md
phase-plan
  ↓ Docs/Plans/PhaseN.md
cold phase-review
  ├─ PASS → COMPLETE
  ├─ FAIL / Fix At=PHASE_PLAN
  │    ↓
  │  phase-planでFindingだけ修正
  │    ↓
  │  new cold phase-review
  │
  └─ UPSTREAM_BLOCKED
       ├─ PHASE_RESEARCH → Research補強 → Plan更新 → new cold Review
       ├─ PHASE_INTENT → 必要なdecisionだけユーザー確認 → Research → Plan → new cold Review
       ├─ SPEC → Spec source-of-truth解決 → Research validity確認 → Plan → new cold Review
       └─ ARCHITECTURE → Architecture decision解決 → Research → Plan → new cold Review
```

## Context Isolation

### Intent Context

入力:
- user request
- relevant Spec
- 必要最小限の既存context

目的:
- WHAT / WHY / observable behavior / scopeを確定

保存:
- Intent Briefはsession-only
- `Docs/`へ保存しない
- `STATE.md`へ本文を保存しない

### Research Context

入力:
- Intent Brief
- `Docs/Spec.md`
- `Docs/Architecture.md`
- repository source
- repository instructions

目的:
- entry point / execution flow / ownership / pattern / tests / constraints / unknownsをevidence付きで確認

出力:
- `Docs/Research/PhaseN.md`

### Planner Context

入力:
- Intent summary
- Spec
- Architecture
- Research
- 必要な前後Phase/Handoff

目的:
- `Docs/Plans/PhaseN.md`を作成またはFindingに沿って限定修正

### Reviewer Context

Reviewerは**必ずPlannerとは別のsub-agentまたはcold context**を優先する。

入力:
- `Docs/Plans/PhaseN.md`
- `Docs/Research/PhaseN.md`
- relevant Spec
- `Docs/Architecture.md`
- 必要なsource spot-check

原則として渡さない:
- Plannerのchain-of-thought / reasoning
- Plannerの自己評価
- Plannerとorchestratorの詳細な会話
- 「なぜこう書いたか」というPlannerの弁明

ReviewerはArtifactとevidenceだけで判断する。

## Review Independence Rule

同じmodelをPlannerとReviewerに使ってよい。
重要なのはmodel identityではなくcontext isolationである。

推奨:

```text
Planner Agent A
  ↓ Phase.md
Reviewer Agent B (cold)
  ↓ FAIL
Planner Agent Aまたはfresh planner
  ↓ targeted fix
Reviewer Agent C (cold)
```

再Reviewでは可能なら新しいcold Reviewerを使う。

前ReviewのFindingは「確認対象」として渡してよいが、Reviewerは前Reviewerの結論を正しいと仮定せず、Phase全体を独立再評価する。

## Finding Routing

`phase-review`の`Fix At`を必ず使用する。

### `PHASE_PLAN`

Phase文書だけで解決できる。

処理:
1. BLOCKER/MAJOR FindingだけPlannerへ渡す。
2. FindingのRequired Outcomeを満たす最小修正を行う。
3. unrelated sectionを再設計しない。
4. 新しいcold Reviewerで再Reviewする。

### `PHASE_RESEARCH`

evidence不足・誤り・UNKNOWN解消が必要。

処理:
1. Findingから具体的Research Questionを作る。
2. `phase-research`で必要範囲だけ追加調査する。
3. Researchを更新する。
4. 影響するPhase sectionだけ更新する。
5. 新しいcold Reviewerで再Reviewする。

### `PHASE_INTENT`

product/user/device behaviorのdecisionが必要。

処理:
1. 既存会話/Specから答えが確定済みか先に確認する。
2. 確定できなければユーザーへ**1つのdecisionだけ**質問する。
3. `phase-intent`形式で推奨回答と理由を提示する。
4. Intent確定後、影響Researchを更新する。
5. Phaseを更新して再Reviewする。

ユーザーへ技術実装質問を投げない。

### `SPEC`

Requirement source-of-truth自体が不十分・矛盾。

処理:
- Spec更新権限/方針に従って解決する。
- observable behaviorが変わるなら必要に応じて`change-control`を使用する。
- Spec変更後はResearch validityを再確認する。

### `ARCHITECTURE`

project-wide architecture decisionが必要。

処理:
- PlannerがPhase内で勝手に決めない。
- Architecture source-of-truthを解決する。
- 必要なら`change-control`を使用する。
- その後Research → Planを更新する。

## Retry Policy

Phase Reviewの自動cycleは原則最大3 roundsとする。

```text
Round 1: cold Review
  ↓ FAIL
Targeted correction
  ↓
Round 2: new cold Review
  ↓ FAIL
Targeted correction
  ↓
Round 3: new cold Review
```

Round 3でもBLOCKER/MAJORが残る場合、無限loopを続けない。

次をまとめて停止する。

- unresolved findings
- 各FindingのFix At
- 既に行った修正/追加Research
- repeated findingか新しいfindingか
- suspected root cause
- ユーザーdecisionが必要か

root cause候補:
- Intent
- Spec
- Architecture
- Research
- Phase size / decomposition
- Planner
- Reviewer disagreement

## Repeated Finding Rule

同じ意味のFindingが2回以上続く場合、単純にPlannerへ再修正させない。

確認する:

1. Findingの`Fix At`が間違っていないか
2. Research evidenceが不足していないか
3. Requirement/Architectureが曖昧でないか
4. Phaseそのものが広すぎないか
5. Reviewerが「文書の完全性」を過剰要求していないか

`MINOR`のみを理由にcycleを続けない。

## Phase Review PASS Rule

Phaseは「完璧な文書」である必要はない。

PASS条件:

- BLOCKER=0
- MAJOR=0
- Task Planner / Implementerが重大なproduct/architecture/code ownershipを推測しなくてよい
- Current-Code Anchor / Designの重要主張がResearch evidenceに支えられている
- ACが実質的に検証可能

MINORは記録してもよいが、それだけでFAILにしない。

## State Management

`phase-intent`中はdurable stateを作らない。

Research開始時:

```text
Work Type = PHASE
Stage = PHASE_RESEARCH
Next Action = phase-research
```

以降:

```text
PHASE_RESEARCH
→ PHASE_PLAN
→ PHASE_REVIEW
```

Review FAIL時は実際の`Fix At`に応じてStage/Next Actionを戻す。

Review PASS時:

```text
Stage = TASK_PLAN
Next Action = phase-task-plan
```

STATEへReviewer reasoning全文やIntent Brief全文をコピーしない。
Review round数とactive BLOCKER/MAJOR ID程度だけ保持する。

## When to Ask the User

原則、内部cycleを自動継続する。

ユーザーへ戻すのは主に以下のみ。

- `Fix At=PHASE_INTENT`で既存contextからdecisionを確定できない
- Requirement同士が矛盾しproduct decisionが必要
- Architecture変更に人間approvalが必要
- compatibility/safety上の重要判断をAgentが決めるべきでない
- Review 3 rounds後もroot causeが解消しない

単なる文章修正、evidence追加、Anchor訂正、Validation mapping修正のためにユーザーを呼び戻さない。

## Quick Change Routing

Intent整理中に明らかにQuick Change規模と分かった場合、Phaseを無理に作らず`quick-change`へrouteしてよい。

この場合:
- Phase Research/Plan/Reviewは作らない
- Quick Contract + Verification + Independent Task Reviewを維持する

## Output

PASS時はユーザーへ中間roundの詳細を大量に見せず、簡潔にまとめる。

```markdown
# Phase Cycle Result

## Result
READY_FOR_TASK_PLANNING

## Phase
`Docs/Plans/PhaseN.md`

## Research
`Docs/Research/PhaseN.md`

## Review
PASS
Rounds: 2

Resolved During Cycle:
- P001: Phase Plan修正
- P002: Research補強

Remaining Minor Findings:
- None

## Next Action
`phase-task-plan`
```

停止時:

```markdown
# Phase Cycle Result

## Result
BLOCKED

## Review Rounds
3

## Unresolved Findings
- ...

## Suspected Root Cause
- ...

## Required Human Decision
- None / ...

## Next Action
...
```

## 完了チェック

- [ ] IntentはResearch開始可能な程度に明確
- [ ] Intent artifactを永続化していない
- [ ] ResearchがPlanより先に実行された
- [ ] PlannerとReviewerのcontextを分離した
- [ ] Review FAILをFix Atに従ってrouteした
- [ ] PHASE_PLAN FindingだけをPlannerへ戻した
- [ ] upstream problemをPlanner修正loopへ押し込んでいない
- [ ] 再Reviewはcold contextを使用した
- [ ] MINORだけでcycleを継続していない
- [ ] 最大3 roundsを超えていない
- [ ] PASS時Next Action=`phase-task-plan`
