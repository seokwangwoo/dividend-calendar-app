---
name: quick-change-ja
description: >
  Phaseを作るほどではない小規模修正を、軽量Contract → 実装 → Verification → 独立Reviewの流れで安全に処理する。
  「この小さなバグだけ直して」「Phaseなしで簡単に修正して」「文言変更をレビュー付きで対応して」など、
  単一Outcome・既存Architecture内・限定影響の変更に使用する。
---

# Quick Change Workflow

## 目的

Phase計画を作るほどではない小規模変更を、**無計画な直接編集にせず、最小限のTask Contractと独立Reviewを維持したまま**素早く完了する。

Quick ChangeはPhase Workflowの省略版であり、品質基準を捨てるためのshortcutではない。

基本フロー:

```text
Change Request
    ↓
Quick Eligibility Check
    ├─ NG → ESCALATE_TO_PHASE
    └─ OK
         ↓
Quick Contract
         ↓
Implementation
         ↓
Deterministic Verification
         ↓
Independent Review
    ├─ PASS → COMPLETE
    └─ FAIL → Targeted Repair → Verification → Review
```

## 適用条件

次を原則すべて満たす場合にQuick Changeとして扱う。

- 1つのprimary outcomeで説明できる
- 既存Architecture / responsibility boundaryを変更しない
- 新しい大きなuser/device/system flowを追加しない
- 既存Patternが明確、または短い調査で確認できる
- 独立した複数Taskへ分割する必要がない
- 変更範囲が局所的である
- 明確なPASS / FAIL条件を定義できる
- rollbackが単純である

ファイル数だけで機械的に判断しない。
1ファイルでもArchitecture変更ならPhaseへ上げる。
複数ファイルでも同一責務の局所修正ならQuick Changeでよい場合がある。

## Phaseへ昇格する条件

以下のいずれかが判明したら、Quick Changeを中止し`ESCALATE_TO_PHASE`とする。

- 新しいRequirementまたは複数のAcceptance Criteria群が必要
- Architecture boundary / data flow / responsibility ownershipが変わる
- DB schema / public API / protocol contractの非自明な変更
- thread / process / lifecycle設計の新規判断が必要
- 複数moduleの既存flowを広く追跡しないと安全に変更できない
- 2つ以上の独立Outcomeへ自然に分割される
- 既存Patternが不明でResearchが必要
- rollbackが複雑
- Quick ContractだけではImplementerが重要な設計判断を行う必要がある

昇格時は現在diffを自動revertしない。
変更中の作業を保存し、`phase-plan-ja`へ引き継ぐ。

## 出力場所

Quick Changeごとに原則1ファイル作成する。

```text
Docs/QuickChanges/
  QC-001.md
  QC-002.md
  ...
```

Repositoryに既存のissue/fix/task文書規則がある場合はそちらを優先する。

Quick Changeを大量の恒久文書へしない。
完了後の履歴はgit historyへ任せ、文書は短く保つ。

## Quick Contract Format

```markdown
# QC-xxx - <Title>

## Goal

1つの明確なOutcome。

## Reason

なぜこの変更が必要か。1〜3文。

## Scope

### IN
- ...

### OUT
- ...

## Code Anchors

| Area | Anchor | Why |
|---|---|---|
| ... | `path/to/file: symbol` | ... |

## Expected Change

実装方法を過度に固定せず、必要なbehaviorと変更境界を記述する。

## Constraints

- 既存Architectureを維持する
- ...

## Verification

- `<command or deterministic check>`
- `<behavioral check>`

## Done When

- [ ] observable condition
- [ ] regression condition
```

## 手順

### 1. Requestを1文で正規化する

変更要求を次の形にする。

> `<現在の問題>` を `<期待する観測可能な状態>` に変更する。

この1文が複数Outcomeを含む場合はPhase昇格を検討する。

### 2. Quick Eligibility Check

以下を確認する。

- Requirement変更の大きさ
- Architecture変更有無
- 既存Patternの明確さ
- dependency
- verification可能性
- rollback難易度

判定結果:

- `QUICK_CHANGE`
- `ESCALATE_TO_PHASE`

迷う場合は、短いcode inspectionを行ってから判断する。
大規模Researchは行わない。

### 3. Code Anchorを最小限確認する

必要な範囲だけ実コードを確認し、原則1〜5個程度のAnchorを記録する。

Anchorは:

`path + symbol + responsibility`

で示す。

単なるgrep hitをownership evidenceにしない。

### 4. Quick Contractを作成する

`Docs/QuickChanges/QC-xxx.md`を作成する。

Contractは短く保つ。
目安は50〜120行程度。小さな修正で巨大な文書を作らない。

### 5. Workflow Stateを更新する

`workflow-state-ja`を使用する。

Quick Change開始時:

```text
Work Type = QUICK_CHANGE
Stage = QUICK_CHANGE
Current Quick Change = QC-xxx
Current Task = QC-xxx
Quick Change Status = IMPLEMENTING
Next Action = task-implement-ja
```

Phaseがない場合は`Current Phase = None`でよい。

### 6. 実装

`task-implement-ja`をQuick Contractに対して実行する。

入力Task文書:

`Docs/QuickChanges/QC-xxx.md`

実装時にもQuick Eligibilityが崩れたら無理に続行しない。

次のいずれかが判明したら:

- Architecture変更が必要
- Contractを大きく書き換える必要
- 独立Task分割が必要
- 想定外の広い影響範囲

`ESCALATE_TO_PHASE`を返す。

### 7. Verification

Quick ContractのVerificationを実行する。

可能な限りdeterministic checkを優先する。

例:

- targeted unit test
- build / compile
- typecheck
- lint
- regression test
- static analysis

Repository全体の重いtest suiteは、変更リスクまたはRepository規則上必要な場合のみ実行する。

### 8. Independent Review

`task-review-ja`を別sub-agent / cold contextで実行することを優先する。

Reviewerへ渡す:

- Quick Contract
- actual diff
- relevant source
- Verification result

実装Agent自身の自己評価をcorrectness evidenceにしない。

### 9. FAIL時

ReviewがFAILで、原因がQuick Contract内の実装不良なら`task-repair-ja`でFindingだけを修正する。

```text
task-review-ja FAIL
    ↓
task-repair-ja
    ↓
Verification
    ↓
task-review-ja
```

新RequirementやArchitecture変更が原因ならrepairではなくPhaseへ昇格する。

同一Quick ChangeでReview FAILが3回続いた場合もPhase昇格または上位問題診断を優先する。

### 10. COMPLETE

Independent Review PASS後のみQuick Changeを完了とする。

STATE:

```text
Work Type = QUICK_CHANGE
Stage = DONE
Current Quick Change = QC-xxx
Quick Change Status = COMPLETE
Current Task = None
Next Action = 次の作業、またはWorkflow終了
```

## ESCALATE_TO_PHASE時の引き継ぎ

Quick ChangeをPhaseへ上げる場合、最低限次を残す。

```markdown
## Escalation

Reason:
<なぜQuick Changeでは不十分か>

Discovered Scope:
- ...

Relevant Anchors:
- `path: symbol`

Current Diff:
- PRESERVE | PARTIALLY_REUSABLE | DISCARD

Recommended Next Action:
`phase-plan-ja`でPhaseを作成する。
```

必要ならQuick Contractを`Docs/Changes/`のChange Requestから参照する。

## Quick Changeでやってはいけないこと

- 「小さいはず」という前提で広い変更を押し切る
- Phaseを避けるために複数Outcomeを1 Contractへ詰め込む
- Architecture判断をImplementerへ丸投げする
- Verificationを省略する
- Independent Review前にCOMPLETE扱いする
- Review Findingではない追加Requirementをrepairへ混ぜる
- unrelated cleanup/refactoringをついでに行う

## 完了報告

```markdown
# Quick Change Result

## Change

`QC-xxx - <title>`

## Result

COMPLETE | BLOCKED | ESCALATE_TO_PHASE

## Changed Files

- `path`: reason

## Verification

- `<check>`: PASS / FAIL / SKIPPED

## Independent Review

PASS | FAIL | NOT_RUN

## State

- Stage: ...
- Quick Change Status: ...
- Next Action: ...

## Remaining Issues

None または具体的内容。
```

## Quality Gate

Quick Change完了前に確認する。

- [ ] primary outcomeは1つ
- [ ] Architectureを変更していない
- [ ] IN / OUTが明確
- [ ] Code Anchorに実コード根拠がある
- [ ] Done Whenがobservable
- [ ] Verificationを実行した
- [ ] Independent ReviewがPASS
- [ ] unrelated changeがない
- [ ] STATEを更新した
