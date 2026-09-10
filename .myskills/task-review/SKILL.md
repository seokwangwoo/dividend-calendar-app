---
name: task-review
description: >
  実装済みPhase TaskまたはQuick Changeを、Contract・git diff・関連コード・Verification結果に基づき独立レビューする。
---

# Independent Task Review

## 目的

Implementerの自己評価ではなく、Contractと実変更からPASS/FAILを独立判定する。read-only review専用。

## 入力

- `Docs/Tasks/PhaseN/Txxx.md` または `Docs/QuickChanges/QC-xxx.md`
- git diff
- 関連ソース
- Verification結果
- 必要に応じて関連Spec / Architecture / Research / Phase

## Review Order

1. Contract Compliance: Goal / Requirement / Constraints / Non-Goals / Done When。
2. Functional Correctness: success/failure/edge/state/resource/lifecycle/async/thread。
3. Architecture Compliance: layer boundary、existing pattern、bypass、不要abstraction。
4. Regression Risk。
5. Test Quality: passingだけでなくrequired behaviorを検証しているか。
6. Scope Discipline: unrelated refactor/format/dependency/later work。

## Severity

- `BLOCKER`: correctness/data/safety等の重大問題。完了不可。
- `MAJOR`: Contract違反、重要error path/test/architecture問題。完了不可。
- `MINOR`: Contractを壊さない小改善。原則PASSを妨げない。

## Finding Format

```markdown
### R001
Severity: BLOCKER | MAJOR | MINOR
Requirement: <AC / Done When / Constraint>
Location: `path: symbol`

Problem:
...

Evidence:
...

Required Outcome:
何がtrueになれば解決か。
```

## Verdict

- PASS: BLOCKER=0、MAJOR=0、Contractを満たす。
- FAIL: BLOCKERまたはMAJORが1件以上。

新RequirementやContract変更が必要と判明した場合は通常Finding修正ではなく`change-control`へ分類する。

## State Update

PASS:
- 対象Status=`PASS`
- Review Rounds += 1
- Phase Taskならdependency再評価。全Task PASSなら`PHASE_CLOSE`へ。
- Quick ChangeならStage=`DONE`。

FAIL:
- Status=`REPAIRING`
- Stage=`TASK_REPAIR`
- Active FindingsへBLOCKER/MAJOR IDを記録
- Next Action=`task-repair`

## 出力

```markdown
# Review: <Txxx | QC-xxx>

## Verdict
PASS | FAIL

## Findings
...

## Requirement Check
...

## Verification Assessment
...

## Architecture Assessment
...

## Scope Assessment
...
```

passing testsだけでPASSにせず、各重大Findingには具体的evidenceを付ける。
