---
name: phase-plan-ja
description: >
  Spec・Architecture・既存コード・前後Phaseの文脈を基に、実装可能で検証可能なPhase文書を作成または更新する。
  「次のPhaseを書いて」「Phase計画を作って」「この要求をPhase文書にして」など、Phase自体の設計に使用する。
  Task分解は行わない。Task化はphase-task-plan-jaの責務。
---

# Phase Planning

## 目的

1つのPhaseについて、**実装Agentが新しい設計判断をほとんど必要とせず、Reviewerが完了可否を客観的に判定できるPhase文書**を作成する。

Phaseは単なる作業一覧ではない。

Phase文書は以下を同時に満たす必要がある。

- 完了後に何が可能になるか明確
- IN / OUTの境界が明確
- 現在コード上の責務位置が根拠付きで示される
- Designが既存Architectureと整合する
- 実装順序が論理的
- Acceptance Criteriaが観測可能・判定可能
- Acceptance CriteriaがValidationへ追跡可能
- 次Phaseへ渡すcontractが明確

このSkillはPhase文書を作る。Task分解や実装は行わない。

## 入力

必須:

- `Docs/Spec.md`
- `Docs/Architecture.md`
- 対象Phaseの目的または対象Requirement
- Repository source

可能なら読む:

- 直前Phaseの`Handoff`
- 既存の前後Phase文書
- 関連する`Docs/Research/*.md`
- `Docs/STATE.md`
- Repository固有のinstruction

既存Researchがない場合でもPhaseを作成できるが、`Current-Code Anchors`に書く内容は実コードで直接確認すること。

## 出力

原則:

`Docs/Plans/PhaseN.md`

Repositoryに既存のPhase命名規則・folder layoutがある場合はそちらを優先する。

既存Phaseを更新する場合、ユーザーが明示していないscopeを勝手に追加しない。

## 言語ルール

- Phase本文・説明は日本語で記述する。
- class / function / variable / macro / file path / API / log / errorは原文を保持する。
- 社内用語は既存文書・コードで使用される表記を優先する。
- 技術用語を無理に日本語化しない。

## Phase Size Principle

Phaseは**1つの意味ある、独立して検証可能なOutcome**を持つ。

良いPhase:

- ユーザーが支出を入力し、保存結果を月次一覧で確認できる
- 装置が新しいイベントを受信し、既存状態遷移に従って安全に処理できる
- 既存ユーザーがログインし、再起動後もsessionを復元できる

悪いPhase:

- DBを作るだけ
- Repositoryだけ作る
- UIだけ置いて動作しない
- ログイン・登録・パスワード再設定・権限管理を一度に実装する

判断基準:

> このPhaseだけが完了した状態でも、システムまたはユーザー視点で一貫した意味を持つか？

Noなら、Phaseをsplitまたはreorderする。

## 作成手順

Phase文書は上から順番に埋めない。次の順序で考える。

1. Specから対象Requirementを抽出
2. 前Phase HandoffとDependencyを確認
3. 現在コードのAnchorを確認
4. Goalを定義
5. IN / OUTを確定
6. Acceptance Criteriaを先に作る
7. Designを決める
8. Implementation Stepsを組み立てる
9. Automated / Manual ValidationをACへ紐付ける
10. Risks / Rollback / Handoffを書く
11. 最後に全体整合を検査する

実装方法を先に考えてからAcceptance Criteriaを後付けしない。

---

# Section Rules

## `## Goal`

「何を実装するか」ではなく、**Phase完了後に何が可能になるか**を書く。

含めるべき内容:

- 主体（user / device / system）
- triggerまたは主な操作
- success outcome
- 重要なintegration outcome
- 重要なfailure expectation（Phaseの中心なら）

悪い例:

```text
ExpenseRepositoryとExpenseFormを実装する。
```

良い例:

```text
ユーザーが金額・カテゴリ・日付を入力して支出を保存できる状態にする。
保存成功後は現在月の一覧へ反映され、保存失敗時は既存データを壊さない。
```

Goalは原則1段落で説明できる大きさにする。

## `## Scope`

### `### IN`

今回のPhaseが責任を持つbehavior boundaryを書く。

単なるfile/task listにしない。

例:

- form submitから既存保存flowへ接続
- 必須validation
- 保存成功後の既存refresh
- 保存失敗時のerror handling

### `### OUT`

**近接していてAgentがつい実装しそうなもの**を優先して書く。

例:

- 編集・削除
- offline queue
- 新しいanalytics
- 将来用abstraction
- 後続Phaseの機能

OUTはscope creep防止contractである。

## `## Dependencies`

単に`Phase 2`とだけ書かない。

「前段から何が成立している必要があるか」をcontractとして書く。

例:

```text
- Phase 02完了
  - `Expense` domain modelが確定済み
  - `ExpenseRepository.create()`が利用可能
- category master dataが取得可能
```

可能なら前PhaseのAcceptance Criteria / Handoffと対応させる。

## `## Requirement Coverage`

Phase formatに存在しない場合でも、原則追加する。

```markdown
## Requirement Coverage

| Requirement | Covered By | Validation |
|---|---|---|
| FR-012 | Save Flow | AT-01 |
| AC-008 | Error Handling | AT-03 |
```

すべての対象RequirementがPhase内のDesign/AC/Validationへ追跡できること。

対象SpecにIDがない場合は、section headingまたは短い引用名で識別する。

## `## Current-Code Anchors`

既存format:

```markdown
| Area | Anchor | Why it owns the behavior |
```

Anchorは必ず実コードで確認する。

各行に最低限:

- area
- `path: symbol`
- なぜそのsymbolが責務を持つか

悪い例:

```text
Expense | src/expense.ts | expense関連
```

良い例:

```text
Form submit | src/features/expense/ExpenseForm.tsx: handleSubmit | 現在の入力画面のsubmit entry point
```

Anchorはfile inventoryではない。

重要なAnchorについて、存在未確認のpath/symbolを推測で書いてはならない。

既存Researchがある場合はVERIFIED evidenceを優先して再利用する。

## `## Design`

Designは**重要な構造・flow・contract・判断理由**を書く。

書くべき内容:

- major execution flow
- layer responsibility
- state transition
- data ownership
- error handling policy
- concurrency/lifecycle rule
- reused existing pattern
- 新規abstractionを作らない判断など

必要なら簡潔なflowを使う。

```text
Entry
  → Handler
  → Existing Service
  → Repository
  → External I/O
```

書きすぎない。

原則として次は避ける:

- line番号ベースの実装指示
- 完成コード
- pseudo-codeによる詳細実装
- import単位の指示
- cosmetic choice

Designを読めばImplementerが「どの責務境界を使うか」を再設計しなくてよい状態を目指す。

## `## Implementation Steps`

**file edit順ではなく、behaviorを成立させる論理順**で書く。

悪い例:

```text
1. A.tsを変更
2. B.tsを変更
3. testを変更
```

良い例:

```text
1. 入力値を既存domain inputへ変換する境界を整える。
2. submitを既存repository flowへ接続する。
3. success時のrefreshを既存patternへ接続する。
4. failure時のstate保持を実装する。
5. success/failure behaviorをtestで固定する。
```

Task分解はここで行わない。

Implementation Step = Phase全体のconstruction order。
Task = `phase-task-plan-ja`が後で作るexecution contract。

## `## Acceptance Criteria`

すべて**observable / testable / binary**にする。

避ける表現:

- 適切に
- 正しく
- 必要に応じて
- いい感じに
- 問題なく

それらを使う場合は具体的条件へ置き換える。

良いACの特徴:

- 入力条件がある
- 観測可能な結果がある
- failure behaviorが明確
- 必要ならnegative criterionがある

例:

```text
- [ ] 有効な入力で保存すると支出が1件永続化される。
- [ ] 保存成功後、現在月一覧に新しい支出が表示される。
- [ ] repositoryが失敗した場合、入力値が保持される。
- [ ] 本Phaseでは編集・削除機能を追加しない。
```

原則、1 ACに複数の独立条件を詰め込みすぎない。

## `## Automated Validation`

推奨format:

```markdown
| ID | Test | Covers | Setup | Assertion |
|---|---|---|---|---|
| AT-01 | valid save | AC-01, AC-02 | valid input | create 1回 + list refresh |
```

既存formatを維持する必要がある場合は`Covers`を追加することを優先する。

Validationはtest filenameの予定ではなく、「何をどう検証するか」を書く。

優先順位:

1. deterministic unit/integration test
2. compiler / static check
3. deterministic script
4. manual validation

すべてのACが最低1つのValidationへ紐付くこと。

## `## Manual Validation`

自動化が困難またはUX/装置挙動の直接確認が必要なものだけを書く。

別のengineerが同じ手順を実施し、同じPASS/FAIL判断ができる具体性にする。

含める:

- initial state
- exact action
- observable expected result

「画面を確認する」「正常なことを確認する」だけで終えない。

## `## Risks and Rollback`

Phaseを実際に失敗させうる重要Riskのみを書く。

各Riskについて可能なら:

- Risk
- Trigger
- Impact
- Mitigation
- Rollback boundary

を明確にする。

一般論のRiskを大量に列挙しない。

Rollbackは架空の手順を書かず、このPhaseのchange boundaryから現実的に戻せる方法を示す。

## `## Handoff`

「Phase完了の要約」ではなく、**次Phaseが何を成立済みcontractとして信頼してよいか**を書く。

含める:

- stable behavior
- stable interface/contract
- established ownership
- intentionally unimplemented scope
- 後続Phaseで再設計すべきでない重要boundary（必要な場合）

例:

```text
Phase完了後、後続Phaseは以下を前提としてよい。
- `ExpenseRepository.create()`がUI flowから接続済み
- 保存成功後のmonthly refresh ownershipが確立済み
- 編集・削除は未実装
```

---

# Evidence Rule

Phase内のArchitecture/Current-Codeに関する重要な主張は、以下のいずれかに基づくこと。

- 実コードで直接確認
- `Docs/Research/*` のVERIFIED evidence
- `Docs/Architecture.md` の明示contract

推測が必要な場合は断定せず、Open QuestionまたはRiskとして扱う。

存在しないsymbolやpathを作らない。

# Architecture Rule

- `Docs/Architecture.md`と矛盾する新しいdesignをPhase内で勝手に決めない。
- Architecture変更が必要なら`change-control-ja`またはArchitecture updateへescalateする。
- Phase局所のdesign detailとproject-wide architecture decisionを区別する。

# Change Control Rule

既存Phase更新時、要求変更が単なる文書改善ではなくscope/requirement/architectureを変える場合は`change-control-ja`の分類規則を適用する。

既にPASS済みTaskがある場合、そのcontractを黙って無効化しない。

# Phase Quality Gate

保存前に次をすべて確認する。

1. Goalを1文で説明できるか。
2. Phase単体で意味あるOutcomeか。
3. IN / OUTが明確か。
4. 対象Requirementに漏れがないか。
5. Current-Code Anchorsは実在し、責務理由があるか。
6. DesignはArchitectureと整合するか。
7. Implementerに未解決の大きな設計判断を押し付けていないか。
8. Implementation Stepsはbehavioral construction orderか。
9. 全ACがbinaryに判定できるか。
10. 全ACがAutomatedまたはManual Validationへ対応するか。
11. RiskとRollbackがPhase固有か。
12. Handoffが次Phaseのstable contractを示すか。

1つでも重大なNoがある場合は、そのまま完成扱いにしない。

# 出力フォーマット

原則として次を使用する。

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

Repositoryに既存formatがある場合、semantic roleを失わない範囲で既存formatを優先する。

# 完了報告

Phase文書作成後、短く以下を報告する。

```markdown
## Phase Plan Result

Phase: `<path>`
Result: `READY_FOR_REVIEW` | `BLOCKED`

Key Decisions:
- ...

Evidence Gaps:
- None / ...

Next Action:
- `phase-review-ja`で独立レビューする
```

Phase文書を作ったAgent自身が最終承認しない。
