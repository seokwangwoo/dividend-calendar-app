---
name: phase-close
description: >
  Phase内の全Taskが完了した後に、Task単体ではなくPhase全体としてRequirement・Integration・Verificationを満たすか確認する。
  「Phaseを完了判定して」「全Taskをまとめて確認して」など、Phase完了判定に使用する。
---

# Phase Completion Review

## 目的

各Taskが個別にPASSしていても、**Phase全体として機能が成立しているか**を独立して確認する。

このSkillはPhase-level integration reviewである。

## 入力

必須:

- `Docs/Spec.md`
- `Docs/Architecture.md`
- 対象 `Docs/Plans/PhaseN.md`
- `Docs/Research/PhaseN.md`
- `Docs/Tasks/PhaseN/` 配下の全Task
- 各Taskの最終Review結果
- 現在のRepository state

## 言語ルール

- Review結果は日本語で記述する。
- code identifier / path / log / errorは原文を保持する。

## 手順

### 1. Task Completionを確認する

Phaseに必要な全Taskについて:

- Implementation済み
- Independent ReviewがPASS

であることを確認する。

FAIL / BLOCKED Taskが残っている場合、PhaseはCOMPLETEにしない。

### 2. Requirement Coverageを独立再構築する

Plannerのcoverage tableだけを信用せず、対象PhaseとSpecからRequirementを再確認する。

以下に漏れがないか確認する。

- Functional Requirement
- Acceptance Criteria
- Completion Criteria
- failure behavior
- required edge case

### 3. Task間Integrationを確認する

個別Task reviewでは見落としやすい接続不良を確認する。

例:

- producerとconsumerのcontract不一致
- state/data flowの接続漏れ
- UIとbackendの統合漏れ
- lifecycleの境界問題
- error propagationの途切れ
- thread/event ordering問題

### 4. Phase-level Verificationを実行する

RepositoryとPhaseに適したcheckを実行する。

例:

- build
- compiler
- lint
- typecheck
- unit test suite
- integration test
- smoke test

実行できないものは理由を具体的に記録する。

### 5. Scopeを確認する

Phase外の機能や不要なrefactoringが紛れ込んでいないか確認する。

## Verdict

`COMPLETE`:

- 全必須TaskがPASS
- Phase Requirementに漏れなし
- 重大なIntegration問題なし
- 必須VerificationがPASSまたは正当なSKIPPED理由あり

`INCOMPLETE`:

- 上記のいずれかを満たさない

## 出力フォーマット

```markdown
# Phase N Completion Review

## Verdict

COMPLETE | INCOMPLETE

## Requirement Coverage

- [x] ...
- [ ] ...

## Task Status

| Task | Status |
|---|---|
| T001 | PASS |

## Integration Findings

- None

またはFindingを具体的に記載。

## Phase Verification

- `<command>`: PASS / FAIL / SKIPPED

## Scope Assessment

## Remaining Work

None

または未完了事項。
```

## ルール

- Task reviewがPASSだからという理由だけでCOMPLETEにしない。
- Integration gapを見つけた場合はINCOMPLETEとする。
- 新しい機能を勝手に実装しない。
- 不足がTaskの問題か、Plan/Specの問題かを可能な限り分類する。
