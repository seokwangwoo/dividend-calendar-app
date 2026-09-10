# Development Workflow Skills

このディレクトリは、Phaseベース開発と小規模Quick Changeを同じ品質原則で運用するためのSkillセットです。

## Layout

```text
.myskills/
├── PHASE-WORKFLOW.md
├── workflow-state/SKILL.md
├── quick-change/SKILL.md
├── phase-plan/SKILL.md
├── phase-review/SKILL.md
├── phase-research/SKILL.md
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
Small / local / single outcome ?
   ├─ YES → quick-change
   └─ NO  → phase-plan
```

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
  └─ scope/requirement/architecture change → change-control / phase-plan
```

## Phase Workflow

```text
Spec / Architecture / Requirement
  ↓
phase-plan
  ↓
phase-review
  ├─ FAIL → phase-planでFinding修正 → 再Review
  └─ PASS
       ↓
phase-research
  ↓
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

## Skills

| Skill | Responsibility |
|---|---|
| `workflow-state` | `Docs/STATE.md`による状態保存・復元 |
| `quick-change` | Phase不要の小規模修正Contract |
| `phase-plan` | Phase文書そのものを作成 |
| `phase-review` | Phase文書の独立Quality Gate |
| `phase-research` | 実コードのentry/flow/pattern/evidence調査 |
| `phase-task-plan` | Phase + Researchを実行Taskへ分解 |
| `task-implement` | 1 Contractだけ実装・Verification・STATE更新 |
| `task-review` | 実装結果の独立Review |
| `task-repair` | Review Findingだけを限定修正 |
| `change-control` | 実行中のRequirement/Scope/Architecture変更管理 |
| `phase-close` | Phase全体のIntegration/Completion確認 |
| `run-phase` | 承認済みPhaseのResearch以降をOrchestration |

## Core Principles

- 小さな変更にPhaseを強制しない。
- Quick ChangeでもContract / Verification / Independent Reviewは省略しない。
- Phase Planner自身がPhaseを最終承認しない。
- ResearchとPlanningを分離する。
- `UNKNOWN`を仮定で埋めない。
- Code Anchorは`path: symbol`とownership reasonで示す。
- Acceptance CriteriaをImplementation Stepsより先に定義する。
- 1 Task = 1 meaningful outcome。
- ImplementerはContractを再設計しない。
- Deterministic VerificationとSemantic Reviewを分離する。
- Review FAIL時はFindingだけを修正する。
- Requirement変更を`task-repair`で処理しない。
- PASS済みで影響なしのTaskをやり直さない。
- 同一TaskのReview FAILが3回続いたら上位Artifactを疑う。
- STATEは短く保ち、Repository truthより下位として扱う。

## Language Policy

- 分析・計画・Review・報告: 日本語
- class/function/variable/macro/file path/API名: 原文維持
- log/error/protocol名: 原文維持
- 社内用語: 既存文書・コード表記を優先
