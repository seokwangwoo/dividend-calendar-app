---
name: phase-intent
description: >
  Phaseに入る前にユーザーの変更意図を対話で明確化し、Goal・Scope・observable outcome・重要なfailure behaviorを同一セッション内のIntent Briefとして確定する。
  文書は作成せず、確定したIntentをそのままphase-researchへ渡す。
---

# Phase Intent

## 目的

Phase文書やResearchを始める前に、ユーザーが本当に実現したい変更を短い対話で明確にする。

このSkillは`grill-me`のように曖昧な点を1つずつ確認するが、**実装方法を設計するためのInterviewではない**。
確認するのは主にWHAT / WHY / observable behavior / scope boundaryである。

## 重要原則

- 質問は原則1回に1つだけ行う。
- 各質問にはAgentの**推奨回答と理由**を付ける。
- すでに会話やSpecで明確なことを再質問しない。
- codebaseを見れば分かることをユーザーへ質問しない。
- 実装方法、file path、class構成、DB設計、state management等をユーザーへ決めさせない。
- Researchを開始できるだけの明確さに達したらInterviewを止める。文書の完全性のためだけに質問を続けない。
- IntentをRepositoryへ保存しない。`Docs/`へIntent文書を作らない。
- Intentを`Docs/STATE.md`へ複製しない。

## 入力

- ユーザーの変更要求
- 現在の会話
- `Docs/Spec.md`（存在する場合）
- `Docs/Architecture.md`（必要な場合）
- 既存Phase / STATE（対象範囲を理解するため必要な場合）

コードで確認可能な質問が出た場合は、ユーザーへ聞くのではなく次のどちらかにする。

1. 短い確認で済むならRepositoryを確認する。
2. entry point / execution flow / ownership等の調査が必要なら`phase-research`へResearch Questionとして渡す。

## 確認すべきIntent

最低限、Research開始前に次を明確にする。

### Goal

Phase完了後に誰が/何が、何をできるようになるか。

### Trigger / Actor

変更を開始する主体・triggerが重要なら明確にする。

例:
- user action
- device event
- API request
- background event

### Scope IN

今回必ず成立させたいbehavior。

### Scope OUT

近接しているが今回やらないbehavior。
特にAgentが「ついでに」実装しそうなものを明確にする。

### Success Outcome

外部から観測できる成功状態。

### Failure Behavior

今回の機能で重要なfailure時の期待動作。
細部まで決める必要はなく、誤実装リスクが高いものだけ確認する。

### Relevant Requirements

既存SpecのRequirement / ACがあれば対応付ける。
新しいRequirementが必要なら、Intent上は意味だけ明確にし、正式なSpec変更が必要な場合は`change-control`またはSpec更新へ渡す。

### Constraints / Non-Goals

互換性、安全性、装置動作、ユーザー体験など、Research/Planningが無視してはいけない制約。

## 質問する条件

次のように、回答によってResearch対象またはPhase scopeが実質的に変わる場合だけ質問する。

- 成功状態が複数解釈できる
- IN / OUTが曖昧
- failure behaviorに製品判断が必要
- 既存behaviorを維持するか変更するか不明
- backward compatibility / device behavior等の重要判断が不明
- 2つ以上の異なるPhaseへ分かれる可能性がある

## 質問しない条件

以下は原則ユーザーへ質問しない。

- どのfileを変更するか
- どのclass / functionを使うか
- 新しいservice/repositoryが必要か
- DB/API内部実装方法
- thread/async実装方法
- test fileの場所
- build command
- 既存Patternが何か

これらは`phase-research`の責務である。

## Question Format

質問が必要な場合:

```text
質問:
<1つのdecisionだけを聞く>

推奨:
<推奨回答>

理由:
<なぜその選択を推奨するかを短く説明>
```

ユーザーが「推奨で」「それでOK」と回答した場合は、そのdecisionを確定して次へ進む。

## Stop Rule

次がすべて満たされたら質問を止める。

- Goalが1文で説明できる
- IN / OUTがResearch範囲を決められる程度に明確
- success outcomeが観測可能
- 重要failure behaviorの未決がない
- Research対象を変える重大なproduct decisionが残っていない

MinorなUI detail、命名、内部構造等を理由にInterviewを続けない。

## Quick Change Gate

Intentを整理した結果、次をすべて満たす場合はPhaseを強制せず`quick-change`を推奨してよい。

- primary outcomeが1つ
- 既存Architecture内の局所変更
- 複数Taskへ分ける必要がなさそう
- behaviorとPASS/FAILを短く定義できる

逆にResearch範囲が広い、複数Outcome、Architecture/contract変更がありそうならPhase workflowを続ける。

## Session-only Output

Intent確定後、**ファイルへ保存せず会話内だけで**次のBriefを出力する。

```markdown
# Phase Intent Brief

## Target
Phase: `PhaseN` または暫定Title

## Goal
...

## Trigger / Actor
...

## Scope
### IN
- ...

### OUT
- ...

## Success Outcome
- ...

## Important Failure Behavior
- ...

## Relevant Requirements
- FR-xxx / AC-xxx / Spec section

## Constraints / Non-Goals
- ...

## Research Questions
- codebaseで確認すべき未解決事項だけ

## Open Product Decisions
None

## Next Action
`phase-research`を同一セッションで実行する。
```

`Research Questions`は「どの実装にするか」という提案ではなく、コードから確認すべき事実を書く。

例:
- 現在の保存entry pointはどこか
- 同種のtimeout handling patternが存在するか
- state ownershipはどのcomponentか

## Handoff Rule

Intent Briefを出力したら、可能なら同一セッションで直ちに`phase-research`へ渡す。
Intent Briefだけを永続Artifactとして残そうとしない。

もしセッションが切れてIntent Briefを失った場合は、会話記憶に依存して再構築せず、必要に応じて`phase-intent`を短く再実行する。
