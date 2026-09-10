# 日本語 Phase Workflow Skills

このドキュメントは、Phaseベース開発を以下の流れで実行するためのSkillセットをまとめたものです。

## 全体Workflow

```text
Spec / Architecture / Change Request
          ↓
     phase-plan-ja
   Phase文書を作成
          ↓
    phase-review-ja
   独立Quality Gate
      ├─ FAIL → phase-plan-jaでFinding修正 → 再Review
      └─ PASS
          ↓
   phase-research-ja
   コードベース詳細調査
          ↓
 phase-task-plan-ja
   実行Taskへ分解
          ↓
     Ready Task
          ↓
  task-implement-ja
          ↓
 Deterministic Verification
          ↓
   task-review-ja
      ├─ PASS → STATE更新 → 次Task
      ├─ FAIL(実装不良) → task-repair-ja → 再Verification → 再Review
      └─ CHANGE(要求/設計変更) → change-control-ja
          ↓
    全Task PASS
          ↓
    phase-close-ja
          ↓
   STATE = COMPLETE
```

## Skills

| Skill | 役割 |
|---|---|
| `workflow-state-ja` | `Docs/STATE.md`による進捗保存・復元・整合確認 |
| `phase-plan-ja` | Spec/Architecture/既存コードを基にPhase文書そのものを作成・更新 |
| `phase-review-ja` | Phase文書を実装前に独立レビューするQuality Gate |
| `phase-research-ja` | 承認済みPhaseを実装するためのコードベース詳細調査 |
| `phase-task-plan-ja` | Phase + Researchを小さな実装Taskへ分解 |
| `task-implement-ja` | Taskを1件だけ実装しVerificationとSTATE更新を行う |
| `task-review-ja` | Task実装を独立レビュー |
| `task-repair-ja` | Review FAIL Findingだけを限定修正 |
| `change-control-ja` | 実行中のRequirement/Scope/Architecture変更を分類・影響分析・再計画 |
| `phase-close-ja` | 全Task完了後にPhase全体の完成を統合確認 |
| `run-phase-ja` | 承認済みPhaseのResearch以降をSTATE付きでOrchestration |

## Phase Definition Gate

新しいPhaseを開始するときは、原則として実装へ直接進まない。

```text
phase-plan-ja
      ↓
phase-review-ja
      ├─ PASS → phase-research-ja
      └─ FAIL → phase-plan-jaでFindingのみ修正
```

`phase-plan-ja`を実行したAgent自身がPhaseを最終承認してはならない。
可能なら`phase-review-ja`は別sub-agent / cold contextで実行する。

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

Repositoryに既存formatがある場合は、semantic roleを失わない範囲で既存formatを優先する。

## 良いPhaseのQuality Gate

Phase Reviewでは最低限、次を確認する。

1. Goalを1文で説明できる。
2. Phase単体で意味のあるOutcomeになっている。
3. IN / OUTが明確。
4. 対象Requirementに漏れがない。
5. Current-Code Anchorsは実在し、責務理由がある。
6. DesignはArchitectureと整合する。
7. Implementerへ大きな未解決設計判断を押し付けていない。
8. Implementation Stepsがfile edit listではなくbehavioral construction orderになっている。
9. Acceptance Criteriaがobservable / testable / binary。
10. 全Acceptance CriteriaがAutomatedまたはManual Validationへ紐付く。
11. Risk / RollbackがPhase固有で現実的。
12. Handoffが次Phaseのstable contractを示す。

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
└── Tasks/
    └── PhaseN/
        ├── README.md
        ├── T001.md
        └── T002.md
```

## 責務の境界

### phase-plan-ja

決めるもの:
- Phase Goal
- Scope IN/OUT
- Requirement Coverage
- Current-Code Anchors
- Design boundary
- Acceptance Criteria
- Validation strategy
- Handoff

決めないもの:
- Task分解
- line-level implementation
- exact code patch

### phase-review-ja

確認するもの:
- Phase size / coherence
- Requirement漏れ
- Anchor evidence
- Architecture compliance
- Design不足・過剰
- AC品質
- Validation traceability
- Handoff contract

変更しないもの:
- Phase本文
- Spec
- Architecture
- source code

### phase-research-ja

承認済みPhaseについて実コードをさらに深く調査し、entry point / execution flow / similar pattern / tests / constraintsを整理する。

### phase-task-plan-ja

承認済みPhase + Researchを、1 Task = 1 meaningful outcomeの実装Contractへ分解する。

## STATE.mdの責務

`Docs/STATE.md`は仕様書や作業ログではない。

保存する主な情報:

- Current Phase
- Phase Status
- Current Stage
- Current Task
- Task Status一覧
- Review retry回数
- Active Finding ID
- Active Change
- Blocker
- Last Verification要約
- Next Action

詳細なSpec、Research、Task、Review本文は複製しない。
STATEはRepository truthより下位であり、再開時にはcheap consistency checkを行う。

## Change Control

Task実行中に新しい要求・Scope変更・Architecture変更が発生した場合、現在Taskへ黙って追加しない。

```text
変更要求
  ↓
change-control-ja
  ↓
IMPLEMENTATION_DETAIL
TASK_SCOPE_CHANGE
REQUIREMENT_CHANGE
ARCHITECTURE_CHANGE
```

Plan以上を変更する場合は`Docs/Changes/CR-xxx.md`を作成し、影響を受ける文書・Taskだけを更新する。
既にPASS済みのTaskは、影響がない限り保持する。

## 言語方針

- 分析・計画・Review・報告: 日本語
- class/function/variable/macro/file path/API名: 原文維持
- log/error/protocol名: 原文維持
- 社内用語: 既存文書・ソースコードの表記を優先

## 設計上の重要点

- Phaseを書く前にRequirementを抽出する
- Acceptance CriteriaをImplementation Stepsより先に考える
- ResearchとPlanningを分離する
- `UNKNOWN`を仮定で埋めない
- Current-Code Anchorは`path + symbol + ownership reason`で示す
- Phase Planner自身がPhaseを最終承認しない
- 1 Task = 1つの意味あるOutcome
- ImplementerはTaskを再設計しない
- VerificationとSemantic Reviewを分離する
- Reviewerは実装Agentの説明ではなくTask + diff + code + verificationを根拠にする
- FAIL時はTask全体ではなくFindingのみを修正する
- Requirement変更をtask-repairで処理しない
- 同一TaskのReview FAILが3回続いたら上位文書の問題を疑う
- STATEは短く保ち、append-only logにしない
