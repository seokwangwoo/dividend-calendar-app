---
name: run-phase-ja
description: >
  1つのPhaseについて、State復元 → Research → Task Planning → Task Implementation → Verification → Independent Review → Repair → Phase Closeを順番に実行する。
  「このPhaseを一通り進めて」「前回の続きからPhaseを進めて」「次のPhaseを完了まで実行して」など、Phase全体のオーケストレーションに使用する。
---

# Run Phase Workflow

## 目的

対象Phaseを標準Workflowに従って最後まで進める。

このSkillはOrchestratorとして振る舞い、各工程の専門責務は対応Skillへ委譲する。

Workflowの進行状態は`workflow-state-ja`を使用してdurable stateとして保存する。

## 使用するSkill

1. `workflow-state-ja`
2. `phase-research-ja`
3. `phase-task-plan-ja`
4. `task-implement-ja`
5. `task-review-ja`
6. `task-repair-ja`（FAIL時のみ）
7. `phase-close-ja`

## 入力

必須:

- 対象 `Docs/Plans/PhaseN.md`
- `Docs/Spec.md`
- `Docs/Architecture.md`
- Repository source

状態管理:

- `Docs/STATE.md`（存在する場合）

既存のパスやRepository規則が異なる場合はそちらを優先する。

## Workflow

```text
STATE load / consistency check
          ↓
        Phase
          ↓
       Research
          ↓
    Task Planning
          ↓
     Ready Task
          ↓
      Implement
          ↓
Deterministic Verification
          ↓
 Independent Review
    ├─ PASS → state更新 → 次Task
    └─ FAIL → state更新 → Repair
                         ↓
                    Verification
                         ↓
                       Review
          ↓
      全Task PASS
          ↓
      Phase Close
          ↓
     STATE = COMPLETE
```

## State First Rule

新規実行・再開を問わず、最初に`workflow-state-ja`の規則を適用する。

### STATEが存在する場合

1. `Docs/STATE.md`を読む。
2. Current Phase / Stage / Current Task / Next Actionを抽出する。
3. cheap consistency checkを行う。
4. Repository truthと整合していれば`Next Action`から再開する。
5. 矛盾があればSTATEを修正してから再開する。

会話履歴だけを根拠に現在位置を決めない。

### STATEが存在しない場合

`workflow-state-ja`で初期化する。

既にResearch/Task/Review artifactが存在する場合は、実態を確認して途中状態を再構築する。

すべてを最初からやり直さない。

## State Update Rule

Workflow stageが変わるたびにSTATEを更新する。

少なくとも以下のtransitionで更新する。

- Phase開始
- Research開始/完了
- Planning開始/完了
- Task開始
- Implementation完了/BLOCKED
- Verification PASS/FAIL
- Review PASS/FAIL
- Repair開始/完了
- Task PASS
- Phase Close開始
- Phase COMPLETE/INCOMPLETE/BLOCKED

STATE更新は「あとでまとめて」行わない。

## 詳細手順

### 0. Resume / Initialize

`workflow-state-ja`を使用する。

次を確定する。

- target Phase
- current Stage
- current Task
- Task status table
- active findings
- blockers
- next action

既にPhaseが`COMPLETE`なら、ユーザーが明示的に再検証を求めない限り再実装しない。

### 1. Research

STATE:

```text
Phase Status = RESEARCHING
Stage = PHASE_RESEARCH
```

`phase-research-ja`を使用して対象Phaseの調査結果を作成する。

Researchが重大な`UNKNOWN`や文書とコードの矛盾によりPlanning不能と判断した場合:

```text
Phase Status = BLOCKED
Stage = BLOCKED
```

としてevidence付きBlockerをSTATEへ記録し、無理に次へ進まない。

Research完了後:

```text
Phase Status = PLANNING
Stage = PHASE_PLAN
Next Action = phase-task-plan-ja
```

### 2. Task Planning

`phase-task-plan-ja`を使用する。

Task dependencyとRequirement Coverageを確認する。

Planning完了後、Task status tableをSTATEへ作成する。

- dependencyなし → `READY`
- dependency未完了 → `PENDING`

その後:

```text
Phase Status = EXECUTING
Current Task = 最初のREADY Task
Stage = TASK_IMPLEMENT
```

### 3. Ready Taskを選ぶ

以下を満たすTaskのみ実装可能。

- `READY`
- `Depends On`がすべてPASS済み
- BLOCKEDでない

TaskがPASSするたびにdependencyを再評価する。

安全な場合、独立Taskは並列実行してよい。
ただし同一ファイルを広く編集するTaskは原則直列にする。

### 4. Task Implementation

Task開始前:

```text
Task Status = IMPLEMENTING
Stage = TASK_IMPLEMENT
Current Task = Txxx
```

`task-implement-ja`で1 Taskだけ実装する。

Implementerが`BLOCKED`を返した場合はrepair loopへ入れない。

原因を以下に分類する。

- Spec
- Architecture
- Research
- Task Plan
- External dependency
- Environment

STATEを`BLOCKED`へ更新し、evidenceを残す。

実装完了後:

```text
Task Status = VERIFYING
Stage = TASK_VERIFY
```

### 5. Deterministic Verification

Taskに定義されたverificationを実行する。

例:

- compiler/build
- lint
- typecheck
- unit test
- integration test
- static analysis

Verification結果はSTATEの`Last Verification`へ短く記録する。

#### PASS

```text
Task Status = REVIEWING
Stage = TASK_REVIEW
Next Action = task-review-ja
```

#### FAIL

Task変更が原因なら、意味的Reviewerを呼ぶ前に限定修正する。

```text
Task Status = IMPLEMENTING
Stage = TASK_IMPLEMENT
Next Action = verification failureの限定修正
```

既存failureや環境要因はTask defectと混同せず、evidence付きで区別する。

### 6. Independent Review

`task-review-ja`をcold/independent contextで実行することを優先する。

Reviewerへ渡す主要Context:

- Task Contract
- actual diff
- relevant code
- Verification result

実装Agentの説明はcorrectness evidenceとして扱わない。

#### PASS

STATEを更新する。

```text
Task Status = PASS
Review Rounds += 1
Active Findingsから当該TaskのBLOCKER/MAJORを削除
```

次のdependencyを再評価する。

次Taskがある場合:

```text
Current Task = 次のREADY Task
Stage = TASK_IMPLEMENT
Next Action = task-implement-ja
```

全Task PASSの場合:

```text
Phase Status = CLOSING
Current Task = None
Stage = PHASE_CLOSE
Next Action = phase-close-ja
```

#### FAIL

```text
Task Status = REPAIRING
Review Rounds += 1
Stage = TASK_REPAIR
Active Findings = BLOCKER/MAJOR Finding IDs
Next Action = task-repair-ja
```

### 7. Repair Loop

`task-repair-ja`を使用し、Active Findingsのみを限定修正する。

Repair完了後:

```text
Task Status = VERIFYING
Stage = TASK_VERIFY
```

必ず次の順で再確認する。

1. Verification
2. Independent Review

Repair Agent自身の「修正完了」を最終PASSに使わない。

### 8. Retry Limit

同一TaskでIndependent Review FAILが3回になった場合、無限retryをやめる。

STATE:

```text
Task Status = BLOCKED
Phase Status = BLOCKED
Stage = BLOCKED
```

次を報告する。

```markdown
## Escalation

Task: Txxx
Failed Review Rounds: 3

### Unresolved Findings

### Repairs Attempted

### Suspected Root Cause

- Spec issue
- Architecture issue
- Research issue
- Task planning issue
- Implementation issue
- Environment/dependency issue

### Recommended Next Action
```

Task全体を闇雲に再実装しない。

### 9. Phase Close

全必須TaskがPASSしたら`phase-close-ja`を実行する。

実行前:

```text
Phase Status = CLOSING
Stage = PHASE_CLOSE
```

#### COMPLETE

```text
Phase Status = COMPLETE
Stage = DONE
Current Task = None
Active Findings = None
Blockers = None
```

#### INCOMPLETE

原因を分類する。

- missing Task
- integration gap
- Spec / Plan gap
- verification gap

```text
Phase Status = INCOMPLETE
Stage = BLOCKED
```

必要最小限の追加Planningへ戻す。

## Context Isolation Rule

全文書を全Agentへ自動投入しない。

### State Manager

- STATE
- current Task/Phase artifact
- cheap repository evidenceのみ

### Research

- Spec
- Architecture
- Phase
- source

### Planner

- Spec
- Architecture
- Phase
- Research

### Implementer

- target Task
- Architecture
- relevant source
- 必要なSpec/Research箇所のみ

### Reviewer

- target Task
- diff
- relevant source
- verification results

### Repair

- target Task
- failing findings
- relevant current source

### Phase Close

- Phase
- Spec関連箇所
- 全Task status/review
- integrated repository state

STATEは各Agentへ全文配布する必要はない。
Orchestratorが必要なCurrent/Next情報だけを渡す。

## Scope Rule

- Phaseを飛ばさない。
- 後続Phaseのscopeを先取りしない。
- Task実装中にPlanを勝手に拡張しない。
- 現在のRepository truthと文書が矛盾する場合はRepository truthを優先し差異を記録する。
- STATEへ新しい仕様や設計判断を書き込まない。

## 完了報告

```markdown
# Phase Workflow Result

## Phase

<Phase path/title>

## Result

COMPLETE | INCOMPLETE | BLOCKED

## State

- Stage: ...
- Current Task: ...
- Next Action: ...

## Research

- Output: ...
- Key unknowns: ...

## Tasks

| Task | Status | Review Rounds |
|---|---|---:|
| T001 | PASS | 1 |

## Verification

主要checkの結果。

## Phase Close

COMPLETE / INCOMPLETE

## Remaining Issues

None または具体的内容。
```

## Orchestrator完了チェック

- [ ] STATEとRepository truthのcheap consistency checkを行った
- [ ] 各stage transitionでSTATEを更新した
- [ ] READYでないTaskを実装していない
- [ ] Verification PASS前にsemantic PASS扱いしていない
- [ ] Independent ReviewなしでTaskをPASSにしていない
- [ ] FAIL時はActive Findingsだけをrepairした
- [ ] Review FAIL 3回で停止した
- [ ] 全Task PASS後にPhase Closeを実行した
- [ ] 最終STATEがPhase結果と整合している
