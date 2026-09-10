---
name: task-implement-ja
description: >
  計画済みのTaskを1件だけ実装し、指定されたVerificationを実行した後、Docs/STATE.mdの作業状態を更新する。
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

作業状態の更新には `workflow-state-ja` の状態モデルと更新規則を使用する。

## 言語ルール

- 作業報告は日本語で記述する。
- code identifier / file path / API名 / log / errorは原文を保持する。
- 既存のコメント言語・命名規則を尊重する。

## Core Rule

**Taskを実装する。Taskを再設計しない。Scopeを拡張しない。**

ただし、Task内の前提が現在のRepositoryと矛盾する場合は、古い指示を盲目的に実装しない。

また、Task終了時にSTATEを更新せず終了してはならない。

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

対象Taskを開始する時点で、次の状態へ更新する。

- Phase Status: `EXECUTING`
- Stage: `TASK_IMPLEMENT`
- Current Task: 対象 `Txxx`
- 対象Task Status: `IMPLEMENTING`
- Next Action: 対象Taskの実装を継続する

`Docs/STATE.md`が存在しない場合は、`workflow-state-ja` の初期化規則に従って最小STATEを作成する。

会話だけを根拠に既存TaskをPASS扱いにしない。

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

### 6. 実装完了後、Verification開始状態へ更新する

コード変更が完了し、Verificationへ移る直前にSTATEを更新する。

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

を確認する。

### 9. 終了状態を必ず更新する

最終報告を返す前に、`workflow-state-ja` の規則に従って `Docs/STATE.md` を更新する。

#### A. IMPLEMENTED + Verification成功

TaskをIndependent Reviewへ渡せる状態なら:

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

このSkill内で安全に解消できないVerification failureが残る場合:

- Phase Status: `EXECUTING`
- Stage: `TASK_VERIFY`
- Current Task: 対象 `Txxx`
- 対象Task Status: `VERIFYING`
- Last Result: `Verification FAIL`
- BlockersまたはRemaining Concernsへfailure evidenceを記録
- Next Action: failure原因を確認し、Task範囲内で修正または上位問題へescalateする

この場合はIndependent Reviewへ進まない。

#### C. BLOCKED

Requirement / Architecture / dependencyなどにより実装を継続できない場合:

- Phase Status: `BLOCKED`
- Stage: `BLOCKED`
- Current Task: 対象 `Txxx`
- 対象Task Status: `BLOCKED`
- Blockers: blocker ID + 短い説明 + evidence
- Next Action: blockerの原因をSpec / Architecture / Research / Task Plan / dependency / environmentのいずれかへ分類し、解消する

不明点を推測で埋めて`IMPLEMENTED`にしない。

## STATE更新ルール

STATE更新では以下を守る。

- Task本文をSTATEへコピーしない。
- diff全文をSTATEへコピーしない。
- test log全文をSTATEへコピーしない。
- Review前にTaskを`PASS`へしない。
- `Updated At`を更新する。
- `Next Action`は常に1つにする。
- 他Taskのstatusを根拠なく変更しない。
- STATEと実Repositoryが矛盾する場合はRepository truthを優先し、STATEを補正する。

## BLOCKED条件

以下によりTask Contractを安全に満たせない場合は、推測で埋めず`BLOCKED`を返す。

- Requirementの重大な欠落・矛盾
- Architecture前提の誤り
- Researchの重大な誤り
- 必要な外部依存・credential不足
- 上位Task dependency未完了

## 完了報告フォーマット

```markdown
# Implementation Result: Txxx

## Result

IMPLEMENTED | BLOCKED

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
- Stage: `TASK_REVIEW` | `TASK_VERIFY` | `BLOCKED`
- Task Status: `REVIEWING` | `VERIFYING` | `BLOCKED`
- Next Action: ...

## Deviations

None

または

- 計画との差異
- 実コード上の根拠
- なぜこの変更が最小か

## Remaining Concerns

None

または具体的な懸念のみ記載。
```

## 完了条件

`IMPLEMENTED`は以下を全て満たす場合のみ使用する。

- TaskのGoalを満たす
- Done Whenを満たす
- 必須Verificationが成功、または正当なSKIPPED理由がある
- Non-Goalsへscope leakしていない
- 独立Reviewerへ渡せる状態である
- `Docs/STATE.md`が次のActionを示す状態へ更新されている

最終報告を返す前にSTATE更新の完了を確認する。
