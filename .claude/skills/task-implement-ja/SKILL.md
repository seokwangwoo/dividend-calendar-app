---
name: task-implement-ja
description: >
  計画済みのTaskを1件だけ実装し、指定されたVerificationを実行した後、Docs/STATE.mdの作業状態を更新する。
  実装中にTask Contract外の変更要求が発生した場合は実装へ混ぜず、change-control-jaへ移行する。
  「T001を実装して」「次のTaskを実装して」など、Task単位の実装に使用する。
---

# Task Implementation

## 目的

計画済みTaskを1件だけ、既存Architectureと既存Patternに従って最小変更で実装する。

実装とVerificationが終了したら、**必ずWorkflow Stateを更新してから終了する**。

## 入力

必須:

- 対象Task文書 `Docs/Tasks/PhaseN/Txxx.md`
- `Docs/Architecture.md`
- 実際のソースコード

存在する場合は読む:

- `Docs/STATE.md`

必要な場合のみ読む:

- `Docs/Spec.md` の関連箇所
- 対象 `Docs/Plans/PhaseN.md`
- `Docs/Research/PhaseN.md` の関連箇所

無関係なTaskやPhaseを全て読み込まない。

## 使用する関連Skill

- 状態更新: `workflow-state-ja`
- Task Contract外の変更要求: `change-control-ja`

## 言語ルール

- 作業報告は日本語で記述する。
- code identifier / file path / API名 / log / errorは原文を保持する。
- 既存のコメント言語・命名規則を尊重する。

## Core Rule

**Taskを実装する。Taskを再設計しない。Scopeを拡張しない。**

ただし、Task内の前提が現在のRepositoryと矛盾する場合は、古い指示を盲目的に実装しない。

また、Task終了時にSTATEを更新せず終了してはならない。

## Change Request Gate

実装中にユーザー・仕様担当・装置担当などから追加要求または変更要求が入った場合、まず現在Task Contract内かを判定する。

### Current Task Contract内

以下をすべて満たす場合は通常実装を継続してよい。

- Goalが変わらない
- Requirement / Acceptance Criteriaが変わらない
- Non-Goalsへscope leakしない
- Architecture boundaryが変わらない
- TaskのDone Whenを変更する必要がない

単なるimplementation detail差分は`Deviations`へ記録する。

### Current Task Contract外

以下のいずれかに該当する場合は、その場で実装へ混ぜてはならない。

- 新しいuser/device/system behaviorが追加された
- Requirement / Acceptance Criteriaを変更する必要がある
- TaskのGoal / Done When / Non-Goalsを変更する必要がある
- Phase scopeを変更する必要がある
- Architecture boundary / flow / responsibilityが変わる
- future Taskのdependencyやscopeへ影響する

この場合:

1. 現在diffをrevertしない。
2. current Taskとgit diffを保持する。
3. `Docs/STATE.md`を以下へ更新する。

```text
Phase Status = EXECUTING
Stage = CHANGE_CONTROL
Current Task = Txxx
Task Status = IMPLEMENTING
Next Action = 変更要求をchange-control-jaで分類する
Use Skill = change-control-ja
```

4. `change-control-ja`へ処理を渡す。
5. Change Control完了まで追加要求を実装しない。

変更要求を通常のReview Findingとして`task-repair-ja`へ送らない。

## 手順

### 1. Task Contractを理解する

変更前に次を確認する。

- Goal
- Requirement Coverage
- Existing Code Evidence
- Constraints
- Non-Goals
- Dependencies
- Verification
- Done When

### 2. Workflow Stateを開始状態へ更新する

`Docs/STATE.md`が存在する場合、現在のRepository状態と大きな矛盾がないことを軽く確認する。

対象Taskを開始する時点で:

- Phase Status: `EXECUTING`
- Stage: `TASK_IMPLEMENT`
- Current Task: 対象 `Txxx`
- 対象Task Status: `IMPLEMENTING`
- Next Action: 対象Taskの実装を継続する

STATEが存在しない場合は`workflow-state-ja`で初期化する。

### 3. 前提を実コードで再確認する

Taskの重要な前提が現在のコードと一致するか確認する。

差異がある場合:

1. 実コードを調査する
2. Repositoryの現在状態をtruthとして扱う
3. Taskの目的を満たす最小の適応を行う
4. 最終報告の`Deviations`に差異と理由を書く

重大な矛盾で安全に判断できない場合は無理に実装せず`BLOCKED`とする。

### 4. 最小変更で実装する

優先して再利用する。

- existing abstraction
- utility
- naming convention
- error handling pattern
- state / lifecycle pattern
- test helper

避ける:

- unrelated refactoring
- cosmetic cleanup
- speculative abstraction
- later Task scope
- debug codeの残存

### 5. 必要なTestを追加・更新する

TaskのDone条件を証明するために必要なtestを追加する。

無関係なtest rewriteは行わない。

### 6. Verification開始状態へ更新する

コード変更が完了したら:

- Phase Status: `EXECUTING`
- Stage: `TASK_VERIFY`
- Current Task: 対象 `Txxx`
- 対象Task Status: `VERIFYING`
- Next Action: Taskに定義されたVerificationを実行する

### 7. Deterministic Verificationを実行する

Taskの`Verification`に記載されたcommandを実行する。

例:

- compiler / build
- lint
- typecheck
- unit test
- integration test

このTaskが原因のfailureは修正する。

Task外の既存failureを発見した場合は勝手に大規模修正せず、区別して報告する。

Verification結果はSTATEの`Last Verification`へ短く記録する。
長いtest log全文はSTATEへコピーしない。

### 8. Diff Self Reviewを行う

完了前にdiffを確認する。

- accidental change
- debug log
- dead code
- unnecessary refactoring
- missing error path
- missing test
- scope leak

### 9. 終了状態を必ず更新する

最終報告を返す前に`workflow-state-ja`の規則に従ってSTATEを更新する。

#### A. IMPLEMENTED + Verification成功

- Phase Status: `EXECUTING`
- Stage: `TASK_REVIEW`
- Current Task: 対象 `Txxx`
- 対象Task Status: `REVIEWING`
- Last Result: `Implementation complete / Verification PASS`
- Next Action: 対象TaskのIndependent Reviewを実行する
- Use Skill: `task-review-ja`

この時点ではTaskを`PASS`にしてはならない。
`PASS`へ遷移できるのはIndependent ReviewがPASSした後だけである。

#### B. Verification未解決FAIL

- Phase Status: `EXECUTING`
- Stage: `TASK_VERIFY`
- Current Task: 対象 `Txxx`
- 対象Task Status: `VERIFYING`
- Last Result: `Verification FAIL`
- BlockersまたはRemaining Concernsへfailure evidenceを記録
- Next Action: failure原因をTask範囲内で限定修正、または上位問題へescalateする

この場合はIndependent Reviewへ進まない。

#### C. BLOCKED

- Phase Status: `BLOCKED`
- Stage: `BLOCKED`
- Current Task: 対象 `Txxx`
- 対象Task Status: `BLOCKED`
- Blockers: blocker ID + 短い説明 + evidence
- Next Action: blocker原因をSpec / Architecture / Research / Task Plan / dependency / environmentへ分類する

#### D. CHANGE_CONTROL

追加・変更要求がTask Contract外の場合:

- Phase Status: 原則`EXECUTING`
- Stage: `CHANGE_CONTROL`
- Current Task: 対象 `Txxx`
- 対象Task Status: `IMPLEMENTING`
- Next Action: `change-control-ja`で変更要求を分類・反映する
- Use Skill: `change-control-ja`

## STATE更新ルール

- Task本文をSTATEへコピーしない。
- diff全文をSTATEへコピーしない。
- test log全文をSTATEへコピーしない。
- Review前にTaskを`PASS`へしない。
- `Updated At`を更新する。
- `Next Action`は常に1つにする。
- 他Taskのstatusを根拠なく変更しない。
- STATEと実Repositoryが矛盾する場合はRepository truthを優先する。

## BLOCKED条件

以下によりTask Contractを安全に満たせない場合は`BLOCKED`を返す。

- Requirementの重大な欠落・矛盾
- Architecture前提の誤り
- Researchの重大な誤り
- 必要な外部依存・credential不足
- 上位Task dependency未完了

## 完了報告フォーマット

```markdown
# Implementation Result: Txxx

## Result

IMPLEMENTED | BLOCKED | CHANGE_CONTROL

## Changed Files

- `path`: 変更理由

## Verification

- `<command>`: PASS / FAIL / SKIPPED
  - Summary: ...

## Done When Check

- [x] ...
- [ ] ...

## State Update

- `Docs/STATE.md`: UPDATED
- Stage: `TASK_REVIEW` | `TASK_VERIFY` | `CHANGE_CONTROL` | `BLOCKED`
- Task Status: `REVIEWING` | `VERIFYING` | `IMPLEMENTING` | `BLOCKED`
- Next Action: ...

## Deviations

None または計画との差異。

## Remaining Concerns

None または具体的懸念。
```

## 完了条件

`IMPLEMENTED`は以下を全て満たす場合のみ使用する。

- TaskのGoalを満たす
- Done Whenを満たす
- 必須Verificationが成功、または正当なSKIPPED理由がある
- Non-Goalsへscope leakしていない
- 独立Reviewerへ渡せる状態である
- STATEが次Actionを示す状態へ更新されている

Task Contract外の変更要求が未処理なら`IMPLEMENTED`にせず`CHANGE_CONTROL`とする。
