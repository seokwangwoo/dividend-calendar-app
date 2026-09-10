# Development Workflow Skills

このディレクトリは、Phaseベース開発と小規模Quick Changeを同じ品質原則で運用するためのSkillセットです。

## Layout

```text
.myskills/
├── PHASE-WORKFLOW.md
├── workflow-state/SKILL.md
├── quick-change/SKILL.md
├── phase-intent/SKILL.md
├── phase-research/SKILL.md
├── phase-plan/SKILL.md
├── phase-review/SKILL.md
├── phase-task-plan/SKILL.md
├── task-implement/SKILL.md
├── task-review/SKILL.md
├── task-repair/SKILL.md
├── change-control/SKILL.md
├── phase-close/SKILL.md
└── run-phase/SKILL.md
```

各Skillは単一の`SKILL.md`だけで完結する。補助`REFERENCE.md`は使用しない。

## Entry Decision

```text
Change Request
   ↓
Clearly small / local / single outcome ?
   ├─ YES → quick-change
   └─ NO / UNCERTAIN → phase-intent
```

`phase-intent`の結果、実際にはQuick Changeで十分と分かった場合は`quick-change`へrouteしてよい。

## Phase Workflow

```text
User Request / Spec / Architecture
  ↓
phase-intent
  │  対話だけでIntent明確化
  │  ファイルは作らない
  ↓
Phase Intent Brief (session-only)
  ↓
phase-research
  ↓
Docs/Research/PhaseN.md
  ↓
phase-plan
  ↓
Docs/Plans/PhaseN.md
  ↓
phase-review
  ├─ PASS
  │    ↓
  │ phase-task-plan
  │
  ├─ FAIL (Fix At=PHASE_PLAN)
  │    ↓
  │ phase-planでFindingだけ修正 → 再Review
  │
  └─ UPSTREAM_BLOCKED
       ├─ PHASE_RESEARCH → Researchへ戻る
       ├─ PHASE_INTENT → Intentを再確認 → Research
       ├─ SPEC → Spec source-of-truthを解決
       └─ ARCHITECTURE → Architecture decisionを解決

phase-task-plan
  ↓
task-implement
  ↓
Verification
  ↓
task-review
  ├─ PASS → 次Task
  ├─ FAIL → task-repair → Verification → Review
  └─ CHANGE → change-control
  ↓
全Task PASS
  ↓
phase-close
  ↓
DONE
```

## Why Research Before Plan

Phase formatには次のようなcodebase-specific情報が含まれる。

- Current-Code Anchors
- Design flow / ownership
- Existing Pattern reuse
- Automated Validation strategy
- Regression Risks

これらをResearch前にPlanすると、PlannerとReviewerが別々にコードを推測し、`phase-plan ↔ phase-review`の無限loopを作りやすい。

したがって原則:

```text
Intent
→ Research evidence
→ Phase Plan
→ Independent Review
```

とする。

## Phase Intent

`phase-intent`は文書を作らない。
同一セッションで次を明確にする。

- Goal
- Trigger / Actor
- Scope IN / OUT
- Success Outcome
- Important Failure Behavior
- Relevant Requirements
- Constraints / Non-Goals

質問は原則1回に1つ。
各質問には推奨回答と理由を付ける。

codebaseを見れば分かることはユーザーへ聞かず、`phase-research`へResearch Questionとして渡す。

Intentが十分明確になったら質問を止め、会話内の`Phase Intent Brief`をそのまま`phase-research`へ渡す。
Intent Briefを`Docs/`や`STATE.md`へ保存しない。

## Phase Review Philosophy

`phase-review`の目的は完璧な文書を作ることではない。

> このPhaseをTask Planner / Implementerへ渡しても重大な推測や誤実装を生まないか？

を判定する。

- `MINOR`だけなら原則PASS。
- `BLOCKER / MAJOR`でPhase文書修正だけで解消可能 → `FAIL`, Fix At=`PHASE_PLAN`
- Research / Intent / Spec / Architectureの問題 → `UPSTREAM_BLOCKED`

Findingには`Fix At`を付け、すべてを`phase-plan`へ戻さない。

## Quick Change Workflow

```text
quick-change
  ↓
Docs/QuickChanges/QC-xxx.md
  ↓
task-implement
  ↓
Verification
  ↓
task-review
  ├─ PASS → DONE
  ├─ FAIL → task-repair → Verification → Review
  └─ scope拡大 → change-control → phase-intent → phase-research → phase-plan
```

Quick ChangeがPhaseへ昇格する際、古いQC Contractだけを新PhaseのSource of Truthにしない。

## Skills

| Skill | Responsibility |
|---|---|
| `workflow-state` | `Docs/STATE.md`によるdurable state保存・復元 |
| `quick-change` | Phase不要の小規模修正Contract |
| `phase-intent` | Phase前のGoal/Scope/Outcomeを対話で明確化。session-only |
| `phase-research` | Intentを起点に実コードのentry/flow/pattern/evidenceを調査 |
| `phase-plan` | Research evidenceを基にPhase文書を作成 |
| `phase-review` | Phase文書が安全に実装開始可能か独立Quality Gate |
| `phase-task-plan` | 承認済みPhase + Researchを実行Taskへ分解 |
| `task-implement` | 1 Contractだけ実装・Verification・STATE更新 |
| `task-review` | 実装結果の独立Review |
| `task-repair` | Review Findingだけを限定修正 |
| `change-control` | 実行中のRequirement/Scope/Architecture変更管理 |
| `phase-close` | Phase全体のIntegration/Completion確認 |
| `run-phase` | IntentからPhase CloseまでOrchestration / resume |

## State Policy

`phase-intent`はsession-onlyなのでSTATE Stageとして保存しない。

DurableなPhase stateは原則`phase-research`開始から管理する。

```text
PHASE_RESEARCH
→ PHASE_PLAN
→ PHASE_REVIEW
→ TASK_PLAN
→ TASK_IMPLEMENT / TASK_VERIFY / TASK_REVIEW / TASK_REPAIR
→ PHASE_CLOSE
→ DONE
```

STATEはRepository truthより下位であり、再開時はcheap consistency checkを行う。

## Core Principles

- 小さな変更にPhaseを強制しない。
- Intentは同一セッションで明確化し、不要な文書を増やさない。
- codebaseで分かることをユーザーへ質問しない。
- Research before Plan。
- `UNKNOWN`を仮定で埋めない。
- Code Anchorは`path: symbol`とownership reasonで示す。
- Acceptance CriteriaをImplementation Stepsより先に定義する。
- Phase Planner自身がPhaseを最終承認しない。
- Phase Reviewは文書の完璧さではなくdownstream riskを評価する。
- Review Findingは正しい上位stageへrouteする。
- 1 Task = 1 meaningful outcome。
- ImplementerはContractを再設計しない。
- Deterministic VerificationとSemantic Reviewを分離する。
- Review FAIL時はFindingだけを修正する。
- Requirement変更を`task-repair`で処理しない。
- PASS済みで影響なしのTaskをやり直さない。
- 同一問題が繰り返す場合、Plannerの文章力ではなく上位Artifact/Evidence不足を疑う。
- STATEは短く保つ。

## Language Policy

- 分析・計画・Review・報告: 日本語
- class/function/variable/macro/file path/API名: 原文維持
- log/error/protocol名: 原文維持
- 社内用語: 既存文書・コード表記を優先
