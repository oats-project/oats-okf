# Spec: the subject layer in oats.okf (6.0, PR B)

Status: build spec. Direction: Pepe, 10 November 2026 (via the coordination lead): the knowledge moves to the
planned nodes by subject now, with the harvester removal. Design: `2026-11-09-knowledge-base-by-subject.md`
(branch `agents/kb-by-subject-okf-expert`, §2, §3, §4, §6, §7). This PR is the package half; the base half is the
bridge PR on `oats-knowledge` (spec `2026-11-10-bridge-pr-oats-knowledge.md`). Both sides have said yes to the
design; D4's gate wording and D13 are still Juan's, so §3 below is built as the design says and flagged.

Depends on PR A (`2026-11-10-no-harvesters-propose-by-pr.md`): the write surface plugs into `propose`. Build on a
branch from A's head and merge A's updates before hand-over.

## 1. The bridged layout, detected on a version-1 base

A base is **bridged** when its `okf-base.json` (still `version: 1`) lists the three reserved nodes `claims`,
`subjects` and `verdicts` (paths equal to their names, owner the sentinel `00000000-0000-0000-0000-000000000000`).
5.8.0 accepts such a base unchanged (verified). 6.0 reads it as the subject layout:

- `subjects/<kind>/<slug>.md`, kind `system | workstream | project`, frontmatter `type: System | Workstream |
  Project`, `title`, `description`, optional `repo`, `in-workstreams: [...]`, `depends-on: [...]`, `status`,
  `legacy-nodes: [<node>, ...]` (the old per-soul nodes this subject absorbs).
- Claims and documents anywhere under a node (old node directories stay canonical) with `about: [<kind>/<slug>,
  ...]` (one or more existing subject refs), `kind:` where the type has kinds, `id:` (stable, stamped by the
  bridge PR or by the maintainer at acceptance), and the existing `type`, `title`, `description`, `tags`,
  `timestamp`.
- `subjects/<kind>/<slug>/index.md`: a generated view per subject, one section per claim type, each entry
  `* [title](/path) - description`; `subjects/index.md` lists subjects by kind; `claims/index.md` and
  `verdicts/index.md` exist (may be near-empty). The root `index.md` keeps its node list and gains a "Subjects"
  section linking `subjects/index.md`.
- `verdicts/<id>.md`: `type: Verdict`, `claim-type`, `verdict: rejected | superseded | duplicate`,
  `claim-title`, `claim-description`, `title-hash` (16 hex of sha256 of `<Type>|<normalized title>`), `reason`,
  `pr`, `decided-by`, `decided-on`, `canonical` (id) for duplicate/superseded.

A base without the reserved nodes is a plain v1 base, served exactly as today.

## 2. Validator v2 (`lib/okf-validate.mjs`, both shipped copies identical)

- Frontmatter parser: flow lists `[a, b]` (bare and JSON-double-quoted items) become arrays; everything else as
  today; malformed or nested lists are errors. Net small, as probe P1's +8-line extension.
- On a bridged base, errors: `about` missing/empty or naming a subject with no file; a subject file with a bad
  `type` or kind directory mismatch; a `Verdict` outside `verdicts/`; a generated index that does not match the
  regenerator's output (`--strict` only, warning → error with `OKF_STRICT_EXIT`); `id` missing on a concept under
  `claims/` (old node concepts without `id` warn, not fail, until the bridge PR stamps them).
- The regenerator `okf-reindex.mjs` (new, no deps): reads every concept's frontmatter and writes the subject
  views, `subjects/index.md`, and the root "Subjects" section deterministically; `--check` exits nonzero on a
  diff. Shipped beside the validator in `okf-authoring` (both copies).
- Plain v1 bases: validator behaviour unchanged.

## 3. Declarations and the write surface

- `okf.json` version 2: `{"version": 2, "subjects": ["<kind>/<slug>", ...]}`; `owner`, `owns`, `reads` absent.
  `validateDeclaration` accepts v1 and v2. The spawn hook resolves each v2 subject to its file in the bound base
  (`E_CONFIG: unresolved subject: <ref>`); a v2 declaration against a base without the reserved nodes is
  `E_CONFIG: base <alias> has no subject layout; declare owns/reads (version 1) or bridge the base (release note
  §7.2)`. `resolveNodes` and `E_OWNER` stay for v1.
- `propose` write surface (from PR A's scope check): for a v1 declaration, the owned nodes + root `index.md` as
  today, and `propose` adds `about:` to every new claim from the subject whose `legacy-nodes` names the owned
  node (refuse `E_SUBJECT` if none does on a bridged base); for a v2 declaration on a bridged base: may add or
  change files under `claims/**`, add files under `subjects/system/**` and `subjects/project/**`, set
  `status: superseded` on a concept it supersedes, and must run the regenerator; never `verdicts/**`,
  `subjects/workstream/**`, `okf-base.json`, the root `index.md` by hand, or other old-node files. Outside:
  `E_SCOPE` naming path and rule. The rule is applied by `propose --check`; the maintainer's review checks it at
  merge ("rejects out-of-surface writes" is a checklist item in `knowledge-review`); the design says the tool's
  check is advisory and the review is the gate (D4 wording may still move; build this).
- `propose --check` on a bridged base also runs `verdicts --check` lanes 1 and 2 (identity: a claim naming a
  known `id` whose verdict is `rejected` without a `reconsiders:` line refuses `E_VERDICT` with the reason;
  exact title hash: a hit is listed in the PR body as a candidate). Lane 3 (lexical) is not in this build.
- Portable binding (`lib/portable-binding.mjs`): payload v2 keeps `owner/stores/reads/owns`; a v2 declaration
  renders `subjects` into `reads` as `store/subject` pairs under a new `subjects` key only if the wire needs it;
  otherwise leave the portable path for v1 souls untouched and refuse a v2 declaration there with
  `E_CONFIG` naming the limit. Smallest change wins; say which in the PR.

## 4. Reading

- Spawn brief: for a v2 declaration, replace the owns/reads clause with one line per declared subject: `<ref> —
  <description> (<n> decisions, <n> insights, …)`, at most eight lines, counts from the subject's generated
  index. v1 brief unchanged.
- Verbs (consult, read-only, same receipts `alias@oid`):
  - `oats okf subjects [--kind K]` — one line per subject from `subjects/index.md`;
  - `oats okf subject <kind>/<slug>` — the subject file's frontmatter and body, its `legacy-nodes`, systems in
    the workstream / projects (from `in-workstreams` of other subject files), and claim counts by type from its
    generated index;
  - `oats okf claims --about <ref> [--type T] [--kind K]` — entries of the subject's generated index, filtered;
  - `oats okf index [<ref>]` — for a v2 declaration with no argument: the declared subjects' generated indexes;
    with a ref: that subject's; v1 behaviour unchanged;
  - `oats okf verdicts --check <claim file>` — lanes 1 and 2 against `verdicts/`.
  All read committed indexes (one blob each), never scan the base; on a plain v1 base they answer `E_USAGE: base
  <alias> has no subject layout`.
- `okf-consultation` skill: the start-of-task loop for a v2 soul (index of defaults → subject pages → claims →
  bodies); the citation form unchanged.

## 5. Soul of this repository

`souls/oats-okf-expert/okf.json` moves to version 2: `["system/oats-okf", "workstream/knowledge",
"workstream/provider-integration"]`. Spawns of this soul resolve only once the bridge PR is accepted; until then
keep v1 in the PR and leave the v2 file as `okf.json.v2` beside it with a README line, so the switch is one rename
after the bridge merges.

## 6. Tests

`test/okf6-subjects.test.mjs`: a bridged fixture base (built by the test from a small v1 fixture plus the
reserved nodes, two subjects, three claims with `about`, generated indexes via the regenerator); validator v2
accepts it and refuses each error of §2; the regenerator is deterministic and `--check` catches a stale index;
v2 declaration resolves and the brief lists subjects; each verb's output; `E_USAGE` on a plain v1 base; v1 soul
`propose --check` adds `about:` from `legacy-nodes`; v2 soul scope refusals (`verdicts/`, `subjects/workstream/`,
old-node file) and the regenerator requirement; `verdicts --check` lanes 1 and 2. The 5.8-compat fact: the same
bridged fixture passes the *unchanged* validator copied from `v5.8.0` (`git show v5.8.0:...okf-validate.mjs`)
with 0 errors. Real-kernel CI: a v2 home spawns against the bridged fixture and `oats okf index` prints subject
indexes; a v1 home against the same fixture prints its node indexes unchanged.

## 7. Docs

README: "The subject layout (bridged bases)", the verbs, `okf.json` v2, the write surface, the verdict record,
"Upgrading to 6.0" additions (nothing a deployment must change for the layout; a soul moves to v2 when its base
is bridged). CHANGELOG under Unreleased. The `okf-consultation`, `okf-propose`, `knowledge-review` skills as above.

## 8. Not in this build

Lexical verdict lane; `okf-base.json` v2; physical moves and redirects; the readiness `protection` warning
beyond PR A; Requirement/Risk/Question extraction; anything beyond the design.
