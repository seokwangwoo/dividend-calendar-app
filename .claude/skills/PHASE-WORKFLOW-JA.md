# 日本語 Phase Workflow Skills

このドキュメントは、Phaseベース開発をResearch・Task化・実装・独立Review・変更管理・状態管理まで含めて運用するSkillセットです。

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
                  Task群
                      ↓
             task-implement-ja
                 │         │
                 │         └─ Task Contract外の変更
                 │                    ↓
                 │          change-control-ja
                 │                    ↓
                 │          影響Artifact/Task更新
                 │                    ↓
                 └───────────────→ Taskへ復帰
                      ↓
          Deterministic Verification
                      ↓
               task-review-ja
              ├─ PASS → 次Task
              ├─ FAIL(実装不備)
              │      ↓
              │ task-repair-ja
              │      ↓
              │ 再Verify → 再Review
              │
              └─ Contract変更必要
                     ↓
              change-control-ja
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
| `phase-task-plan-ja` | Researchを実行可能なTaskへ分解 |
| `task-implement-ja` | Taskを1件だけ実装し、VerificationとSTATE更新まで行う |
| `task-review-ja` | Task Contractに対して実装を独立レビュー |
| `task-repair-ja` | 既存Task Contractに対するFAIL Findingだけを限定修正 |
| `change-control-ja` | 実行途中の仕様・Task scope・Architecture変更を分類し、影響範囲だけ再計画 |
| `phase-close-ja` | Phase全体のRequirement/Integration完了判定 |
| `run-phase-ja` | State・Change Controlを含むWorkflow全体のOrchestration |

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
├── Changes/
│   └── CR-001.md
└── Tasks/
    └── PhaseN/
        ├── README.md
        ├── T001.md
        └── T002.md
```

Repository側の既存命名規則がある場合は、そちらを優先します。

## 通常Workflow

### Phase開始

```text
phase-research-ja
→ phase-task-plan-ja
→ task-implement-ja
→ task-review-ja
→ 必要なら task-repair-ja
→ 全Task PASS
→ phase-close-ja
```

### 一括実行

Workflowが安定したら`run-phase-ja`を使用します。

`run-phase-ja`は`Docs/STATE.md`を読み、Repository truthとのcheap consistency check後に`Next Action`から再開します。

## Change Control

Phase Planning後に要求が変わった場合、現在Taskへそのまま追加しません。

まず`change-control-ja`で分類します。

```text
IMPLEMENTATION_DETAIL
TASK_SCOPE_CHANGE
REQUIREMENT_CHANGE
ARCHITECTURE_CHANGE
```

判断基準:

- HOWだけ変わる → `IMPLEMENTATION_DETAIL`
- Task boundaryだけ変わる → `TASK_SCOPE_CHANGE`
- observable WHATが変わる → `REQUIREMENT_CHANGE`
- system boundary / responsibility / flowが変わる → `ARCHITECTURE_CHANGE`

必要に応じて`Docs/Changes/CR-xxx.md`を作成します。

更新範囲は変更レベルまでだけ戻ります。

```text
TASK_SCOPE_CHANGE
  → Research必要範囲 → Plan/Task

REQUIREMENT_CHANGE
  → Spec → Research validity check → Plan/Task

ARCHITECTURE_CHANGE
  → Architecture → Spec consistency → Research → Plan/Task
```

影響を受けないPASS済みTaskは保持します。

PASS済みTaskはChange Controlで次のいずれかに分類します。

- `PRESERVE`
- `REVERIFY`
- `INVALIDATE`

## RepairとChange Controlの違い

### `task-repair-ja`

使う条件:

- Specは変わらない
- Task Contractは正しい
- 実装がTask Contractを満たしていない

例:

`AC-004ではerror表示が必要だが、実装では表示されない`

### `change-control-ja`

使う条件:

- 新Requirementが追加された
- Task Contractを変更する必要がある
- Phase scopeが変わる
- Spec / Architectureを変更する必要がある

例:

`保存前に確認Dialogを追加したい`

この違いを混同しないことが重要です。

## STATE.mdの責務

`Docs/STATE.md`は仕様書や作業ログではありません。

保存するのは主に:

- Current Phase
- Phase Status
- Stage
- Current Task
- Task Status一覧
- Review retry回数
- Active Change
- Active Finding ID
- Blocker
- Last Verification要約
- Next Action

Stageには`CHANGE_CONTROL`も含みます。

Active Change例:

```markdown
## Active Change

Change: `Docs/Changes/CR-003.md`
Type: `REQUIREMENT_CHANGE`
Requested During: `Phase3 / T002 / TASK_IMPLEMENT`
Current Work: `PARTIALLY_REUSABLE`
Affected Tasks: `T002, T003`
Preserved Tasks: `T001`
```

STATEへChange Request本文やSpec本文はコピーしません。

STATEはRepository truthより下位です。再開時にはgit/source/task/review/change artifactとのcheap consistency checkを行います。

## Task Implementation中の変更要求

`task-implement-ja`実行中にTask Contract外の追加要求が入った場合:

```text
current diff保持
   ↓
STATE Stage = CHANGE_CONTROL
   ↓
change-control-ja
   ↓
必要Artifactだけ更新
   ↓
影響Taskだけ再計画
   ↓
READY Taskから再開
```

current diffは原則自動revertしません。

## 独立Review中の変更発見

Review FAILをすべてrepairへ送らないでください。

```text
実装がContract違反
→ task-repair-ja

Contract/Requirement自体の変更が必要
→ change-control-ja
```

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
- Task Contract外変更を実装へ混ぜない
- VerificationとSemantic Reviewを分離する
- ReviewerはTask + diff + code + verificationを根拠にする
- 実装不備はRepair、新RequirementはChange Controlへ送る
- Change Controlでは影響Taskだけを再計画する
- 同一TaskのReview FAILが3回続いたら無限retryしない
- 全Agentへ全文書を投入せず、役割に必要なContextだけを渡す
- STATEは短く保ち、append-only logにしない
- Workflow stageが変わるたびにSTATEを更新する
- 再開時はSTATEを盲信せずRepository truthと最低限の整合確認を行う
