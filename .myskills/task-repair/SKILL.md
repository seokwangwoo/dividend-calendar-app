---
name: task-repair
description: >
  Independent ReviewでFAILとなったFindingだけを、最小変更で修正し再Verificationへ戻す。Phase TaskとQuick Changeの両方に対応する。
---

# Targeted Task Repair

## 目的

有効なBLOCKER / MAJOR Findingだけを解消する。Task全体を再実装せず、既に正しい部分を維持する。

## 入力

- `Docs/Tasks/PhaseN/Txxx.md` または `Docs/QuickChanges/QC-xxx.md`
- 最新Review結果
- 現在Repository state
- 関連ソース
- 必要に応じてSpec / Architecture / Research

## Core Rules

- Review Findingを盲目的に信じない。現在コードで再確認する。
- Findingが誤りなら`DISPUTED: Rxxx`としてevidenceを示す。
- unrelated refactoring / scope expansionをしない。
- 新RequirementやContract変更が必要なら`change-control`へ渡す。
- Repair自身は最終PASSを宣言しない。

## 手順

1. BLOCKER / MAJOR Findingを抽出する。
2. 各Findingをcurrent codeで検証する。
3. 有効Findingだけ最小修正する。
4. 必要なら最小regression testを追加する。
5. 元ContractのVerificationと変更箇所checkを再実行する。
6. `workflow-state`をStatus=`VERIFYING`、Stage=`TASK_VERIFY`へ戻す。
7. Verification PASS後は`task-review`によるIndependent Reviewを再実行する。

## 出力

```markdown
# Repair Result: <Txxx | QC-xxx>

## Result
REPAIRED | BLOCKED | CHANGE_CONTROL

## Resolved Findings
### R001
- Change: ...
- Evidence: `path: symbol`

## Disputed Findings
- None | ...

## Verification
- `<command>`: PASS | FAIL | SKIPPED

## Additional Changes
None | ...

## State Update
Stage: `TASK_VERIFY | CHANGE_CONTROL | BLOCKED`
Next Action: ...

## Remaining Concerns
None | ...
```

同一TaskのReview FAILが3回続く場合は無限修正せずBLOCKEDとし、Spec / Architecture / Research / Task Plan / Implementation / Environmentのどこにroot causeがあるか分類する。
