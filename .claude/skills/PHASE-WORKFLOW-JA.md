# 日本語 Phase Workflow Skills

このドキュメントは、Phaseベース開発を以下の流れで実行するためのSkillセットをまとめたものです。

```text
          Docs/STATE.md
               │
               ▼
Spec / Architecture / Phase
          ↓
  phase-research-ja
          ↓
  phase-task-plan-ja
          ↓
     Task群を生成
          ↓
  task-implement-ja
          ↓
 Deterministic Verification
          ↓
   task-review-ja
      ├─ PASS → STATE更新 → 次Task
      └─ FAIL → STATE更新 → task-repair-ja
                              ↓
                           再Verification
                              ↓
                           再Review
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
| `phase-research-ja` | Phase実装前のコードベース調査 |
| `phase-task-plan-ja` | ResearchをTaskへ分解 |
| `task-implement-ja` | Taskを1件だけ実装 |
| `task-review-ja` | 実装を独立レビュー |
| `task-repair-ja` | FAIL Findingだけを限定修正 |
| `phase-close-ja` | Phase全体の完了判定 |
| `run-phase-ja` | Stateを含むWorkflow全体のOrchestration |

## 推奨する導入順

最初は次の5つで運用できます。

1. `workflow-state-ja`
2. `phase-research-ja`
3. `phase-task-plan-ja`
4. `task-implement-ja`
5. `task-review-ja`

Review FAIL時の修正が広がりすぎる場合は`task-repair-ja`を使い、Task単位ではPASSしてもPhase統合で漏れが出る場合は`phase-close-ja`を使います。

Workflowが安定してから`run-phase-ja`で自動Orchestrationするのが推奨です。

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
└── Tasks/
    └── PhaseN/
        ├── README.md
        ├── T001.md
        └── T002.md
```

Repository側の既存命名規則がある場合は、そちらを優先してください。

## STATE.mdの責務

`Docs/STATE.md`は仕様書や作業ログではありません。

保存するのは主に次の情報です。

- Current Phase
- Phase Status
- Current Stage
- Current Task
- Task Status一覧
- Review retry回数
- Active Finding ID
- Blocker
- Last Verificationの要約
- Next Action

詳細なSpec、Research、Task、Review本文は複製せず、pathやIDで参照します。

STATEはRepository truthより下位です。再開時にはgit/source/task/review artifactとのcheap consistency checkを行い、矛盾があればSTATEを修正します。

## 言語方針

- 分析・計画・Review・報告: 日本語
- class/function/variable/macro/file path/API名: 原文維持
- log/error/protocol名: 原文維持
- 社内用語: 既存文書・ソースコードの表記を優先

## 設計上の重要点

- ResearchとPlanningを分離する
- `UNKNOWN`を仮定で埋めない
- 1 Task = 1つの意味あるOutcome
- ImplementerはTaskを再設計しない
- VerificationとSemantic Reviewを分離する
- Reviewerは実装Agentの説明ではなくTask + diff + code + verificationを根拠にする
- FAIL時はTask全体ではなくFindingのみを修正する
- 同一TaskのReview FAILが3回続いたら無限retryせず上位文書の問題を疑う
- 全Agentへ全文書を投入せず、役割に必要なContextだけを渡す
- STATEは短く保ち、append-only logにしない
- Workflow stageが変わるたびにSTATEを更新する
- 再開時はSTATEを盲信せず、Repository truthと最低限の整合確認を行う
