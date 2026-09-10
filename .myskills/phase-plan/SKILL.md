---
name: phase-plan
description: >
  Spec・Architecture・既存コード・前後Phaseの文脈を基に、実装可能で検証可能なPhase文書を作成または更新する。
  Task分解は行わず、Phase自体の設計に使用する。
---

# Phase Planning

このSkillの詳細手順は同じディレクトリの `REFERENCE.md` を参照する。

## Compatibility Rule

`REFERENCE.md` は移行前の詳細本文を保持しているため、次の読み替えを必ず適用する。

- `phase-plan-ja` → `phase-plan`
- `phase-review-ja` → `phase-review`
- `phase-research-ja` → `phase-research`
- `phase-task-plan-ja` → `phase-task-plan`
- `task-implement-ja` → `task-implement`
- `task-review-ja` → `task-review`
- `task-repair-ja` → `task-repair`
- `change-control-ja` → `change-control`
- `workflow-state-ja` → `workflow-state`
- その他の `*-ja` Skill名も同様に `-ja` を除去して解釈する。

`REFERENCE.md` のfrontmatterは無視し、本文の手順・制約・出力形式をこのSkillの手順として扱う。
