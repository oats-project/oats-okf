# Ontology sketch for the probes (design draft, 2026-11-09; not accepted knowledge)

This is the working ontology the probes exercise: OATS's own wording of subjects, claims scoped by About-edges
and verdicts.

## Subjects (`subjects/<kind>/<slug>.md`)

| kind | meaning for OATS | examples |
|---|---|---|
| `system` | a repository, package, app or service OATS builds or integrates | `system/oats-kernel`, `system/oats-desktop`, `system/oats-okf`, `system/oats-aweb`, `system/oats-jira`, `system/oats-linear`, `system/oats-authoring`, `system/oats-apps` |
| `workstream` | a lasting area of responsibility or practice, no end date | `workstream/oats-direction`, `workstream/coordination`, `workstream/provider-integration`, `workstream/operations`, `workstream/positioning`, `workstream/workspace-administration`, `workstream/knowledge`, `workstream/messaging` |
| `project` | a bounded effort with an end state (a plan, an epic, a trial series) | `project/coordination-rethink`, `project/okf-5` |

A subject file's frontmatter (flat scalars and flow lists only):

```yaml
---
type: System            # System | Workstream | Project
title: oats.okf knowledge package
description: one line
repo: github.com/awebai/oats-okf        # System only
in-workstreams: [workstream/knowledge]  # System, Project
depends-on: [system/oats-kernel]        # System only; each needs code evidence in the body
status: active
---
```

## Claims (`claims/<type>/<slug>.md`)

| type | today's kind | notes |
|---|---|---|
| `Decision` | Decision, Roadmap (kind direction, status proposed) | status: proposed, decided, superseded, reversed; `decided-by: human|maintainer`; `supersedes: [paths]` |
| `Insight` | Lesson (kind lesson), Conclusion (kind finding), Limitation (kind constraint) | |
| `Requirement` | (none today; conventions/principles pulled out of decisions later) | kind: principle, constraint, convention, functional |
| `Risk` | (none today) | |
| `Question` | (none today) | status: open, answered, dropped; `resolved-by: [decision path]` |
| `Reference` | Reference | a document, not a claim; still carries `about` |
| `Playbook` | Playbook | a document, not a claim; still carries `about` |

Common frontmatter for every claim and document:

```yaml
---
type: Insight
kind: lesson
title: ...
description: one line
about: [system/oats-okf, workstream/knowledge]   # >= 1 subject ref; this is the About-edge
tags: [okf, harvest]
timestamp: 2026-10-10            # as today
source-soul: oats-okf-expert     # provenance, flat
source-instance: <instance>
accepted-by: maintainer          # human | maintainer
accepted-on: 2026-10-12
---
```

Rule: flat scalar keys and flow lists (`[a, b]`) only, so the dependency-free validator stays one small parser.

## Verdicts (`verdicts/<claim-type>-<16 hex>.md`)

Written only by the knowledge maintainer when it closes or supersedes a proposed claim:

```yaml
---
type: Verdict
claim-type: Decision
verdict: rejected                # rejected | superseded
claim-hash: <sha256 of "<Type>|<normalized title>" first 16 hex>
claim-title: ...
reason: one line
pr: https://github.com/.../pull/N
decided-by: maintainer
decided-on: 2026-11-10
---
```

A proposer checks `claim-hash` before proposing (exact lane); the reviewer is the semantic lane.

## Node → primary subject mapping (for the conversion)

| today's node | primary subject |
|---|---|
| oats-kernel-expert | system/oats-kernel |
| oats-desktop-expert | system/oats-desktop |
| oats-okf-expert | system/oats-okf |
| oats-aweb-expert | system/oats-aweb |
| oats-jira-expert | system/oats-jira |
| oats-linear-expert | system/oats-linear |
| oats-authoring-expert | system/oats-authoring |
| oats-apps-expert | system/oats-apps |
| oats-maintainer | workstream/oats-direction |
| oats-expert | workstream/coordination |
| integrations-expert | workstream/provider-integration |
| oats-operator-expert | workstream/operations |
| market-research-expert | workstream/positioning |
| oats-setup-admin | workstream/workspace-administration |

Secondary subjects (heuristic for the probe only; the real migration is judged): a concept whose body links into
another node's concept three or more times, or whose `tags` name another subject's slug word (kernel, desktop,
messaging, knowledge, operator, integrations), also gets that subject in `about`.

## Canonical paths and generated indexes

- One canonical file per claim: `claims/<type-lowercase-plural>/<slug>.md` (e.g. `claims/decisions/x.md`,
  `claims/insights/y.md`).
- Subject views are generated: `subjects/<kind>/<slug>/index.md` lists the subject's claims by type (title +
  description), and the base root `index.md` lists subjects by kind. Generated files are committed and a check
  regenerates and diffs them.
