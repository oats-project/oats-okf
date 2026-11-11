# Spec: the bridge PR on oats-knowledge (PR C)

Status: build spec for one reviewed PR on `oats-project/oats-knowledge` (public). Direction: Pepe, 10 November
2026. Design: `2026-11-09-knowledge-base-by-subject.md` §2, §7.1, §7.2 (branch `agents/kb-by-subject-okf-expert`).
Package half: `2026-11-10-subject-layer-in-oats-okf.md`.

Compatibility fact the PR rests on: a version-1 base with the three reserved nodes and `about:` frontmatter
passes oats.okf 5.8.0's metadata check, strict validator and consult CLI unchanged (verified 2026-11-09). So the
PR is safe for every current reader; 6.0 readers gain the verbs.

## 1. What the PR adds (no file moves, no content changes)

1. `okf-base.json` (version 1): three more nodes, `claims`, `subjects`, `verdicts`, path = name, owner
   `00000000-0000-0000-0000-000000000000`; each directory gets `index.md` and `log.md`.
2. Subject files `subjects/<kind>/<slug>.md`:
   - systems: `oats-kernel` (repo github.com/awebai/oats, the kernel and CLI), `oats-desktop`
     (github.com/awebai/oats, packages/desktop), `oats-okf`, `oats-aweb`, `oats-jira`, `oats-linear`,
     `oats-authoring`, `oats-apps`, `oats-cloning`, `oats-engineering` (the coordination package in
     github.com/awebai/oats), `aweb` (integrated, github.com/awebai/aweb);
   - workstreams (Pepe's acceptance): `oats-direction`, `coordination`, `provider-integration`, `operations`,
     `positioning`, `workspace-administration`, `knowledge`, `messaging`;
   - projects: `coordination-rethink`, `okf-5`, `roster-2026-11`.
   Frontmatter per the layer spec §1 (`type`, `title`, `description`, `repo`, `in-workstreams`, `depends-on`
   only where the body cites code, `status`, `legacy-nodes`). Descriptions in OATS's words; no outside
   organisation named anywhere.
   `legacy-nodes`: oats-kernel ← oats-kernel-expert; oats-desktop ← oats-desktop-expert; each package system ←
   its expert node; oats-direction ← oats-maintainer; coordination ← oats-expert; provider-integration ←
   integrations-expert; operations ← oats-operator-expert; positioning ← market-research-expert;
   workspace-administration ← oats-setup-admin.
3. Frontmatter on all 418 concepts, inserted after `description:` without touching any other line:
   - `about: [<primary>, <secondary>...]`: primary from the node map; secondary by the measured heuristic (a
     tag exactly matching one of kernel→system/oats-kernel, desktop→system/oats-desktop,
     messaging→workstream/messaging, knowledge→workstream/knowledge, operator→workstream/operations,
     integrations→workstream/provider-integration; or three or more body links into one other node's concepts);
     deduplicated. The PR description says secondary subjects are heuristic and lists the 80-odd concepts that
     got them, for the maintainer's later judgement.
   - `kind:` where the type maps: Lesson → `lesson`, Conclusion → `finding`, Limitation → `constraint`,
     Roadmap → `direction` (and `status: proposed`); Decision, Reference, Playbook get no `kind` (Decision kinds
     are judged later, not guessed).
   - `id:` stable: `<type-prefix>-<first 12 hex of sha256 of the original path>` with prefixes dec, ins, ref, pb
     (Roadmap → dec). Never changes afterwards.
   `type:` stays as it is (Lesson, Decision, …): the layer spec's validator reads the kinds from `kind:` and
   maps old types; renaming types is a later, judged change.
4. Generated views by the layer's `okf-reindex.mjs`: `subjects/<kind>/<slug>/index.md` per subject,
   `subjects/index.md`, and a "Subjects" section appended to the root `index.md`. `claims/index.md` and
   `verdicts/index.md` say what will live there. Every `log.md` touched gets one dated line naming this PR.

## 2. What the PR must prove (in its description, with commands)

- The 5.8.0 validator (`git show v5.8.0:oats-package/capabilities/oats-okf/lib/okf-validate.mjs` from oats-okf)
  with `--strict`: 0 errors, 0 warnings on the result.
- The 6.0 validator (PR B's head) with `--strict`: 0 errors, 0 warnings; `okf-reindex.mjs --check` clean.
- Every pre-existing link still resolves (the two already-broken links in the root `log.md` stay as they are and
  are named); no file moved, no body changed (`git diff --stat` shows frontmatter insertions and new files only;
  a script asserts that each concept's body after the frontmatter is byte-identical).
- The 5.8.0 consult CLI against a local Git binding of the result: `bases` valid, `index` for a v1 soul
  unchanged, `cat` of three old paths unchanged, `ls /claims`, `ls /subjects/system`.
- Counts: concepts 418, with one subject N1, two N2, three or more N3; subjects 22; indexes 23.

## 3. Order and conditions

- Open as a draft on a branch `okf-bridge/<date>` from `main` at the moment of generation; regenerate from the
  then-current `main` right before marking ready (the base merges several PRs an hour; the conversion is a
  script, rerun it rather than rebase by hand).
- Condition from the design (D3): the live rehearsal. Smallest version now (the lead's "few hours"): the real-
  kernel CI suite of oats-okf gets a bridged fixture (PR B) and the local-binding rehearsal in §2 is run and
  pasted into the PR. The full scratch-deployment rehearsal with a pinned 6.0 follows the cut, before Pepe pins;
  the PR description says so.
- Review: the knowledge maintainer (trigger) plus a second read by a fresh reviewer on a model family other than
  the author's; Pepe's acceptance of the workstream list is cited in the PR body (his words of 10 November, via
  the lead). The PR is public: no outside organisation, no person outside the team, no machine paths.
- Mark ready and hand to the lead at the exact head once B's head is known (the regenerator and validator used
  are B's; cite its commit).

## 4. Not in this PR

No content judgement (no re-typing, no Decision kinds, no supersession edits), no moves, no `okf-base.json`
version 2, no verdict files, no changes to old `index.md` files beyond the root's new section.
