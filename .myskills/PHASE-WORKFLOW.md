# 日本語 Development Workflow Skills

このドキュメントは、Phaseベース開発と小規模修正を同じ品質原則で運用するためのSkillセットをまとめたものです。

## 入口

変更要求を受けたら、まず規模を判断します。

```text
Change Request
   ↓
Small / local / single outcome ?
   ├─ YES → quick-change
   └─ NO  → phase-plan
```

## Quick Change Workflow

Phaseを作るほどではない小規模修正は次の流れで進めます。

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
   ├─ PASS → COMPLETE
   ├─ FAIL → task-repair → 再Verification → 再Review
   └─ scope拡大 → phase-planへ昇格
```

Quick Changeの目安:

- 1つのprimary outcome
- 既存Architecture内
- 既存Patternが明確
- 局所変更
- 独立Task分割が不要
- PASS/FAILを明確に定義できる

次の場合はPhaseへ昇格します。

- Architecture変更
- 大きなRequirement追加
- 非自明なDB schema / public API / protocol変更
- 複数Outcome
- 広いResearchが必要
- rollbackが複雑

## Phase Workflow

```text
Spec / Architecture / Change Request
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
     Ready Task
          ↓
  task-implement
          ↓
 Deterministic Verification
          ↓
   task-review
      ├─ PASS → 次Task
      ├─ FAIL → task-repair → 再Verification → 再Review
      └─ CHANGE → change-control
          ↓
    全Task PASS
          ↓
    phase-close
          ↓
   STATE = COMPLETE
```

## Skills

| Skill | 役割 |
|---|---|
| `workflow-state` | Phase / Quick Change両方の進捗保存・復元・整合確認 |
| `quick-change` | Phase不要の小規模修正を軽量Contract付きで実行 |
| `phase-plan` | Phase文書そのものを作成・更新 |
| `phase-review` | Phase文書を実装前に独立レビュー |
| `phase-research` | 承認済みPhaseのコードベース詳細調査 |
| `phase-task-plan` | Phase + Researchを実装Taskへ分解 |
| `task-implement` | Phase Task / Quick Changeを1件実装しVerificationとSTATE更新 |
| `task-review` | Phase Task / Quick Changeの独立Review |
| `task-repair` | FAIL Findingだけを限定修正 |
| `change-control` | 実行中のRequirement/Scope/Architecture変更を分類・再計画 |
| `phase-close` | Phase全体の完成を統合確認 |
| `run-phase` | 承認済みPhaseのResearch以降をSTATE付きでOrchestration |

## 想定ドキュメント構成

```text
Docs/
├── Spec.md
├── Architecture.md
├── STATE.md
├── Plans/
│   └── PhaseN.md
├── Research/
│   └── PhaseN.md
├── Reviews/
│   └── PhaseN-plan-review.md
├── Changes/
│   └── CR-001.md
├── QuickChanges/
│   └── QC-001.md
└── Tasks/
    └── PhaseN/
        ├── README.md
        ├── T001.md
        └── T002.md
```

## Phase文書の標準Format

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

## Quick Contractの標準Format

```markdown
# QC-xxx - <Title>

## Goal

## Reason

## Scope
### IN
### OUT

## Code Anchors

| Area | Anchor | Why |
|---|---|---|

## Expected Change

## Constraints

## Verification

## Done When
```

## STATE.mdの考え方

`Docs/STATE.md`は仕様書や作業ログではなくdurable stateです。

保存する主な情報:

- Work Type: `PHASE | QUICK_CHANGE`
- Current Phase / Current Quick Change
- Stage
- Current Task
- Status
- Review retry回数
- Active Finding / Active Change
- Blocker
- Last Verification要約
- Next Action

STATEはRepository truthより下位です。再開時はcheap consistency checkを行います。

## 設計原則

- 小さな変更にPhaseを強制しない
- Quick ChangeでもContract / Verification / Independent Reviewは省略しない
- Quick Changeが膨らんだら無理に続けずPhaseへ昇格する
- Phase Planner自身がPhaseを最終承認しない
- ResearchとPlanningを分離する
- `UNKNOWN`を仮定で埋めない
- Current-Code Anchorは`path + symbol + ownership reason`で示す
- Acceptance CriteriaをImplementation Stepsより先に考える
- 1 Task = 1 meaningful outcome
- ImplementerはContractを再設計しない
- VerificationとSemantic Reviewを分離する
- ReviewerはContract + diff + code + verificationを根拠にする
- FAIL時はFindingだけを修正する
- Requirement変更をtask-repairで処理しない
- Review FAIL 3回で無限retryを止める
- STATEは短く保ちappend-only logにしない

## 言語方針

- 分析・計画・Review・報告: 日本語
- class/function/variable/macro/file path/API名: 原文維持
- log/error/protocol名: 原文維持
- 社内用語: 既存文書・ソースコードの表記を優先
