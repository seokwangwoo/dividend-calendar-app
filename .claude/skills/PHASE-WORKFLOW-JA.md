# 日本語 Phase Workflow Skills

このドキュメントは、Phaseベース開発を以下の流れで実行するためのSkillセットをまとめたものです。

```text
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
      ├─ PASS → 次Task
      └─ FAIL → task-repair-ja
                    ↓
                 再Review
          ↓
    全Task PASS
          ↓
    phase-close-ja
```

## Skills

| Skill | 役割 |
|---|---|
| `phase-research-ja` | Phase実装前のコードベース調査 |
| `phase-task-plan-ja` | ResearchをTaskへ分解 |
| `task-implement-ja` | Taskを1件だけ実装 |
| `task-review-ja` | 実装を独立レビュー |
| `task-repair-ja` | FAIL Findingだけを限定修正 |
| `phase-close-ja` | Phase全体の完了判定 |
| `run-phase-ja` | 上記Workflow全体のOrchestration |

## 推奨する導入順

最初は次の4つだけでも運用できます。

1. `phase-research-ja`
2. `phase-task-plan-ja`
3. `task-implement-ja`
4. `task-review-ja`

実際の運用でReview FAIL時の修正が広がりすぎる場合は`task-repair-ja`を使い、Task単位ではPASSしてもPhase統合で漏れが出る場合は`phase-close-ja`を使います。

Workflowが安定してから`run-phase-ja`で自動Orchestrationするのが推奨です。

## 想定ドキュメント構成

```text
Docs/
├── Spec.md
├── Architecture.md
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
