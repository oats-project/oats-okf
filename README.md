# oats.okf 6 — external knowledge, consulted remotely, proposed by PR at checkpoints

The official OKF (Open Knowledge Format) knowledge package for OATS,
requiring **OATS >=0.69.2**. This branch is the unreleased 6.0 change ("no
harvesters"; the manifests still read 5.8.0 until the release lane cuts it).
CI runs it against the released OATS 0.69.2 kernel (see
[Tests and CI](#tests-and-ci)).

A working soul's knowledge lives outside the soul, in OKF bases: Git
repositories (or plain directories) of Markdown concepts grouped in nodes,
each node owned by one soul. An instance reads that knowledge remotely, keeps
its own working notes in its home, and at important checkpoints **proposes
what it learned itself, as a pull request** on its owned nodes
(`oats okf propose`). The **knowledge maintainer gates every merge**, and the
knowledge repository's accepted branch is protected so that nothing else can
change it. Nothing writes accepted knowledge except a
merged PR (or an explicit operator change).

**Upgrading to 6.0:** the knowledge harvester is gone; new spawns propose with
`oats okf propose`, and every Git base's accepted branch should be protected.
See [Upgrading to 6.0](#upgrading-to-60). 5.0 replaced the 4.x harvest
machinery; see [Upgrading to 5.0](#upgrading-to-50). The history of earlier
versions is in [CHANGELOG.md](CHANGELOG.md).

## What the package contains

| Capability | For | Skills | Commands |
|---|---|---|---|
| `oats.okf` (knowledge slot) | every working soul with OKF knowledge | `okf-consultation`, `okf-instance-knowledge`, `okf-propose`, `knowledge-theory`, `okf-authoring` | consult (`bases index cat ls links search`), `propose`, `status`, `inspect`, `init`, `migrate`, `unlock`, `setup --remove-legacy-settings`; the spawn, soul-scaffold and upgrade hooks |
| `oats.okf-maintenance` | the maintainer soul | `knowledge-review`, `knowledge-theory`, `okf-authoring`, `okf-trigger-setup` | `okf-maintenance review-context` (`notify-harvester` answers `E_REMOVED`) |

- One working package soul: `oats.okf/knowledge-maintainer` (`work: directory`,
  `knowledge: none`, its capability `from: here`, `background: true`).
- Until 7.0, a stub of the removed harvester: the soul
  `oats.okf/knowledge-harvester` and the capability `oats.okf-harvest`, with
  no skills or instructions, whose required spawn hook always refuses with
  `E_REMOVED` naming the fix (see [Upgrading to 6.0](#upgrading-to-60)).
- Two trigger templates: `oats.okf:proposal-review`
  (`triggers/proposal-review.json`, label `okf-proposal`) and, through 6.x,
  `oats.okf:harvest-review` (`triggers/harvest-review.json`, label
  `okf-harvest`, for PRs a 5.x harvester opened).
- `knowledge-theory` (the promotion doctrine) and `okf-authoring` (the
  craft, the validator and the publication helper) ship as identical copies
  in both capabilities: the proposer's and the maintainer's.

The release payload is `oats-package/`, enumerated by
`oats-package/oats-package.json`. The OKF JSON Schemas ship in the
capability's `schemas/`, with copies in the repository's `schemas/`.

## Configuration

A workspace declares the package (`packages: { oats.okf: v5.8.0 }`) and
selects it as the knowledge capability (`defaults: { knowledge: { oats.okf:
{ from: package } } }`, or per soul). Each deployment points it at its
bindings file in its own `oats-local.yaml`:

```yaml
settings:
  oats.okf:
    bindings-file: /absolute/config/okf-bindings.json
```

### Settings

| Setting | Meaning |
|---|---|
| `bindings-file` | Absolute path of the bindings document (below). Required for everything except help and the soul-scaffold hook. |
| `state-dir` | Normalized absolute durable state directory recorded in a portable binding; required by the binding wire's normalize phase, never derived from an instance home. |
| `git-timeout` | Seconds for each Git operation that talks to a remote (clone, fetch, push, ls-remote); default 600. Local object reads keep a short fixed limit. |
| `consult-max-age` | Seconds a Git base's cached accepted commit may age before a consult read refetches; default 300, 0 refetches on every read. |
| `screen-terms-file` | Optional (6.0). Absolute path of a host text file, one term per line: `oats okf propose` refuses any outgoing content (concepts, file names, commit text, PR body, branch) containing a term, case-insensitively, as rule `host-term`, by location only. It only adds refusals. Absent: the fixed content-screen rules only. |

Any other key is refused (`E_CONFIG`).

**The soul's opt-out stays.** A soul author can write
`knowledge: { harvest: off }` (from 6.0 also spelled `publish: off`) in
soul.yaml: its instances still consult and keep instance knowledge, but never
publish knowledge: `oats okf status` says `off` and `oats okf propose`
refuses them (`E_OPTED_OUT`). A public soul is reachable from outside, and
its notes must not be published. Only the soul sets it: a host or spawn
`publish`, or a soul `publish` other than `off`, refuses (`E_CONFIG`). A soul
`knowledge.propose` key is no setting and refuses the spawn: `E_CONFIG:
knowledge.propose is not a setting; instances propose directly in oats.okf 6;
use harvest: off to opt out`. The opt-out is enforced in code; it has two
limits: see
[What is enforced and what is an instruction](#what-is-enforced-and-what-is-an-instruction).

Every other 4.x harvest key is removed when someone SET it: a host or spawn
`harvest` (even `off`; a host value also masks the soul's opt-out), and
`harvest-runtime` and `harvest-model` in any layer. (A value the kernel
filled in from the 4.x manifest default, origin `manifest-default`, was
nobody's decision and is ignored: see [Upgrading to 5.0](#upgrading-to-50).)
Wherever one is set, every
`oats okf` command and hook (except the cleanup below) refuses with
`E_REMOVED` before doing anything, in one sentence that names the layer that
set it, for example:

```text
settings.oats.okf.harvest from host (oats-local.yaml#/settings/oats.okf) was removed in oats.okf 5.0; agents now propose their own knowledge by PR at checkpoints (oats okf propose); run oats okf setup --remove-legacy-settings --soul <soul> --json from this deployment.
```

- A **host** value (`oats-local.yaml`) names the cleanup command.
- A **soul** `harvest` other than `off`, or a soul `harvest-runtime` or
  `harvest-model`, says to change it in the soul's reviewed source and
  sync/respawn; host cleanup cannot change a soul.
- A **spawn** value (`--provider oats.okf harvest=…`) says to drop it from
  the spawn command.
- `harvest-runtime` and `harvest-model` say there is no harvest runtime or
  model: agents propose their own knowledge by PR.
- When the kernel does not say where the key came from
  (`OATS_SETTINGS_ORIGINS`), the sentence says "from an unknown origin" and
  lists where to look.

The binding check (readiness) answers the same sentence as a
`needs-configuration` problem.

### The bindings document

The absolute bindings document is capability-owned JSON:

```json
{
  "version": 1,
  "stateDir": "../durable-okf-state",
  "bases": {
    "project": {
      "id": "project-knowledge",
      "kind": "git",
      "repository": "https://github.com/example/project.git",
      "root": "knowledge",
      "acceptedBranch": "main",
      "pr": {"repository": "example/project"}
    },
    "team": {
      "id": "team-knowledge",
      "kind": "directory",
      "path": "../team-knowledge"
    }
  }
}
```

- Paths inside it resolve from its own directory, not the working directory.
- **Git bases** support HTTPS, SSH and durable local repositories;
  `root: "."` is a dedicated knowledge repository. PRs are same-repository
  branches (`pr.repository` is the GitHub `owner/repo`). A repository URL
  carrying a credential (`user:token@`) is refused: use a credential helper
  or an SSH key. A local repository must be a canonical repository, not a
  linked worktree. Shallow repositories are refused (`E_BASE_SHALLOW`).
- A Git base's `repository` is the URL as written. This host's global and
  system Git `url.<base>.insteadOf` and `pushInsteadOf` rules apply to it,
  so a host that routes the repository through an ssh alias needs no
  host-specific binding. okf's clone must keep that URL as its only
  `origin` URL, with no `pushurl`, and resolve to the destinations the host
  gives the binding: a changed origin, or a rewrite in the clone's own
  config, is refused (`E_OWNER`), naming the side (fetch or push) and both
  URLs. URLs compare byte for byte, whitespace included. Change a binding's
  `repository` to the plain URL only after every seat that reads it has been
  **re-spawned on oats.okf 5.0.4 or later**; a session restart keeps the copied
  provider and does not upgrade it (#79).
- **Directory bases** need no Git or `gh`. A directory inside any Git working
  tree is refused (`E_DIRECTORY_GIT`): relabelling tracked files must not
  bypass PR review. Directory bases can be consulted, initialized and
  validated, but `oats okf propose` skips them (see
  [How knowledge is proposed](#how-knowledge-is-proposed)).
- Bases, `stateDir` and the bindings document must not overlap. A bound
  base's `id` must equal the `id` in that base's `okf-base.json`; the alias
  (`project` above) is yours to choose and is what souls name.
- `cron` or `tz` (4.1 schedules) is refused with
  `E_HARVEST_SCHEDULE_REMOVED` (see [Upgrading from 4.1](#upgrading-from-41)).

What oats.okf 5.0 keeps under `stateDir`:

```text
<stateDir>/cache/<base-id>.git     # host-wide consult cache (bare partial clone)
<stateDir>/migrations/<uuid>/      # explicit migration preservation
```

4.x left `owners.json` and `sources/` there; 5.0 neither reads nor deletes
them. [4.x source records after the pin](#4x-source-records-after-the-pin)
says what they hold and when an operator may remove them.

### The soul declaration and base metadata

Each knowledge-owning soul carries **`okf.json`** (not knowledge bytes):

```json
{"version":1,"owner":"domain-expert-stable-id","owns":["project/expert"],"reads":["project/steward","team/operations"]}
```

Each accepted base carries **`okf-base.json`**:

```json
{"version":1,"id":"project-knowledge","nodes":{"expert":{"path":"expert","owner":"domain-expert-stable-id"},"steward":{"path":"steward","owner":"steward-stable-id"}}}
```

- References are `alias/node`. Nodes are non-overlapping subdirectories, each
  with `index.md` and `log.md`, owned by one stable owner id. The base root
  has `index.md` and `log.md`; every other file is Markdown inside a node, and
  hidden paths are refused.
- `owns` names the nodes the soul's proposals may write; an owned node's
  `owner` in `okf-base.json` must equal the soul's `owner` (`E_OWNER`
  otherwise). `reads` selects initial context. Neither is an access control:
  every configured base is readable.
- oats.okf 6.0 adds `okf.json` **version 2**, `{"version":2,"subjects":[...]}`,
  for a base with the subject layout (below); version 1 keeps working.
- A soul without `okf.json` cannot spawn with oats.okf: provision it
  (`init`, or `migrate` for a legacy soul) or deactivate oats.okf for that
  soul. The soul-scaffold hook creates no knowledge.

## Consultation

Instances read their soul's knowledge **remotely, at the accepted state**:
no knowledge is copied into an instance home. From the instance home:

```sh
oats okf index                                   # owned then read nodes' indexes
oats okf cat --base project /expert/decisions/retry-policy.md
oats okf links --base project /expert/decisions/retry-policy.md
oats okf cat --base project ../lessons/storm.md --from /expert/decisions/retry-policy.md
oats okf ls --base project /expert/lessons       # entries with frontmatter type/title/description
oats okf search backoff                          # [--base A | --all] [--node N] [--regex] [--case-sensitive]
oats okf bases                                   # accepted commit, freshness, validity, owns/reads, branch protection
oats okf inspect --json                          # declaration, bases and this home's working memory
```

From the deployment, the same commands take `--soul <soul>` and read that
soul's declaration.

- Paths resolve like OKF links: `/node/x.md` from the base root, a relative
  path against `--from`'s directory, a bare `node/x.md` from the root. `..`
  escapes, filesystem paths, URLs, hidden paths, symlinks and submodules are
  refused.
- A Git base is read from one host-wide bare partial clone per base
  (`<stateDir>/cache/<base-id>.git`) at the fetched accepted branch; blobs
  arrive on first read. The branch is refetched when `consult-max-age` has
  passed or with `--fresh`. A failed fetch serves the cached commit with
  `stale: true` and the reason; with nothing cached the read fails with
  `E_BASE_UNAVAILABLE`.
- A directory base is read in place under its cooperative lock; a pending
  publication journal refuses reads with `E_RECOVERY`.
- Every answer carries a receipt (`base`, `kind`, `commit` or `digest`,
  `fetchedAt`, `stale`). Cite what you relied on as
  `alias/node/concept.md@<short-oid>`.
- An open PR is not accepted knowledge.
- `inspect` returns the declaration, the bound bases and the home's STATE.md,
  log.md and `notes/**/*.md` (each capped at 256 KiB, with `truncated` and
  the original `bytes`). A `./knowledge/` left by okf 2.x is reported as
  `legacy-local-view` and never read.

The `okf-consultation` skill teaches the consult CLI.

## The subject layout (bridged bases)

oats.okf 6.0 reads a base **by subject** when its `okf-base.json` (still
`version: 1`) lists the three reserved nodes `claims`, `subjects` and
`verdicts`, each at the path of its name and owned by the sentinel
`00000000-0000-0000-0000-000000000000`. Such a base is **bridged**. A base
without all three, exactly so, is a plain version-1 base and is read as
before. oats.okf 5.8.0 accepts a bridged base unchanged; the suite proves it
on every run by validating its bridged fixture with the unchanged `v5.8.0`
validator (`git show v5.8.0:oats-package/capabilities/oats-okf/lib/okf-validate.mjs`).

| Path | What | Frontmatter |
|---|---|---|
| `subjects/<kind>/<slug>.md` | a subject; kind `system`, `workstream` or `project` | `type: System \| Workstream \| Project`, `title`, `description`, optional `repo`, `in-workstreams: [workstream/...]`, `depends-on: [system/...]`, `status`, `legacy-nodes: [<node>, ...]` (the old per-soul nodes it absorbs; a node belongs to one subject) |
| any concept in a node (old node directories stay canonical; new claims go under `claims/`) | a claim or document | `about: [<kind>/<slug>, ...]` (one or more existing subjects), `kind:` where the type has kinds, `id:` (stable; stamped by the bridge PR or by the maintainer at acceptance, never by a proposer), and `type`, `title`, `description`, `tags`, `timestamp` as before |
| `verdicts/<id>.md` | the maintainer's verdict on a claim id | `type: Verdict`, `verdict: rejected \| superseded \| duplicate`, `claim-type`, `claim-title`, `claim-description`, `title-hash`, `reason`, `pr`, `decided-by`, `decided-on`, `canonical` (the id) for `duplicate` and `superseded` |
| `subjects/<kind>/<slug>/index.md`, `subjects/index.md`, `verdicts/index.md`, the root `index.md`'s `## Subjects` section | **generated**: a subject's claims by type (and kind), the subjects by kind, the verdict record, the root link | none |

Claim types: each file keeps the `type` it was accepted with; the layer reads
`Lesson`, `Conclusion` and `Limitation` as **Insight** (default kinds
`lesson`, `finding`, `constraint`) and `Roadmap` as **Decision** (kind
`direction`) in the generated views, the brief's counts, `claims --type` and
the title hash. Frontmatter stays flat: scalars and flow lists (`[a, "b"]`, bare or
JSON-double-quoted items). `title-hash` is the first 16 hex digits of the
sha256 of `<claim-type>|<claim-title>`, the title lowercased, trimmed and
its whitespace collapsed. `claims/index.md` is written by hand.

### The validator and the regenerator

`okf-validate.mjs` (validator v2) and `okf-reindex.mjs` (the regenerator,
new) ship together, byte-identical, in `oats-okf/lib/` and in each
`okf-authoring/scripts/`; neither has dependencies.

```sh
node okf-reindex.mjs <base-dir>            # write the generated indexes
node okf-reindex.mjs <base-dir> --check    # exit 1 when any differs; writes nothing
node okf-validate.mjs <base-dir> --strict  # validator v2
```

Frontmatter prose copied into a generated index (titles, descriptions, type
and kind headings) is rendered as plain text, brackets as parentheses (and
a link label's backslashes escaped): a
link in a concept's description would otherwise resolve against the index,
not the concept. `--type` and `--kind` filters are read the same way. A verdict record's
line is `verdict; claim type; title hash; claim description`, with `\` and
`;` escaped by `\` in the claim type. The root `## Subjects` section is found
only outside fenced code blocks and ends at the next `## ` heading or fence,
so fenced text stays; with none it is appended, before a fence left open at
the end.

The regenerator refuses (`E_PATH`, exit 2), before reading or writing, a
base that holds a symlink, a non-regular file or a file with more than one
link, and writes each generated file through a fresh temporary file renamed
over it, so a checked-out base cannot redirect a write outside itself (the
validator refuses the same trees on a base with the subject layout, with an
error, rather than follow them). It
also refuses a file name holding a backslash, and never links a path that a
reader would resolve to another file (spaces, parentheses, angle brackets,
`?`, `#` or `%`): such a base does not validate with `--strict`. Every
reader (validator, regenerator, `propose` and the subject verbs) classifies a
base the same way: an `okf-base.json` that is a link, not a regular
single-link file, or larger than 16 MiB is refused, never read as plain.

On a bridged base the validator also errors on: a malformed flow list (a
value starting with `[` that is not a flat list, or has no `]` at all; a
`[WIP] title` scalar stays a scalar); a
claim whose `about` is missing, empty, not a list or names a subject with no
file; a subject file off `subjects/<kind>/<slug>.md` (lowercase slug), or
whose `type` does not match its kind directory; an `in-workstreams` or
`depends-on` entry that is not a subject of that kind; a node absorbed by two
subjects; a `Verdict` outside `verdicts/`, or a verdict file that is not
`verdicts/<id>.md` of type `Verdict` with a valid `verdict`, its
`claim-type`/`claim-title`, the derived `title-hash` and, for `duplicate`
and `superseded`, `canonical`; a claim under `claims/` without `id`; and a
duplicate `id`. With `--strict` it warns on an old-node claim without `id`
and on a generated index that differs from the regenerator's output (an
error exit with `OKF_STRICT_EXIT=1`). A plain version-1 base gets exactly
5.8's findings.

A spawn and `oats okf bases` validate the accepted base with `--strict` and
refuse any warning, as before. So a stale generated index, or a claim
without `id`, on the accepted branch makes the base invalid for 6.0 readers
until it is fixed: the knowledge maintainer stamps ids and regenerates
before every merge.

### okf.json version 2

```json
{"version": 2, "subjects": ["system/oats-okf", "workstream/knowledge"]}
```

- `subjects` are the subjects a fresh instance reads first: reading
  defaults, not access and not write scope. There is no `owner`, `owns` or
  `reads`. Every bound base stays readable.
- The spawn hook and readiness resolve each subject to its file in a bound
  base with the subject layout: `E_CONFIG: unresolved subject: <ref>`, or,
  when no bound base has the layout, `E_CONFIG: base <alias> has no subject
  layout; declare owns/reads (version 1) or bridge the base (release note
  §7.2)`. A subject found in two bridged bases is refused too (one base per
  subject layout). Readiness reports either as `declaration:unresolved`.
- A version-1 declaration keeps working on a bridged base: its nodes resolve
  and `E_OWNER` applies to `owns`, as before.
- The portable binding (`oats.okf.locations@1`, below) still carries version
  1 only: a payload with `subjects` is refused with `E_CONFIG` naming the
  limit. A version-2 soul is bound through the `bindings-file` setting.
- The spawn brief of a version-2 soul names, instead of the owns/reads
  clause, one line per declared subject (at most eight), from its generated
  index: `system/oats-okf — The knowledge provider package (12 decisions, 9
  insights, 1 reference)`. The spawn reads only bases it has just validated
  and never fetches for the brief; an unreadable index leaves the bare ref.

A soul moves to version 2 once its base is bridged. This repository's soul
keeps version 1 until the bridge PR on its base is accepted; its version 2
file waits beside it as `souls/oats-okf-expert/okf.json.v2`, so the switch
is one rename.

### Reading by subject

```sh
oats okf subjects [--kind system|workstream|project]   # one line per subject
oats okf subject system/oats-okf     # its file, legacy nodes, workstreams or members, claim counts
oats okf claims --about system/oats-okf [--type Decision] [--kind architecture]
oats okf index                       # a version-2 soul: its subjects' generated indexes
oats okf index workstream/knowledge  # any soul: that subject's generated index
oats okf verdicts --check <claim file>
```

- Each verb reads committed generated indexes (one blob each, plus the
  subject file for `subject`), never scans the base, and keeps the receipt
  (`alias@oid`): cite as before, `alias/path@oid`. A committed index is
  untrusted input: it is parsed in linear time (a filter is compared once per
  distinct type and kind; text over 16,000 characters is keyed by its sha256),
  and `claims` and `subject` cut a type or kind heading over 200 characters in
  what they show (`--type`/`--kind` match the whole heading).
- `subject`, `claims` and `index <ref>` read each subject from the one bound
  base with the layout that holds its file (a version-2 soul's subjects may
  live in several bases; the same ref in two is `E_USAGE`, pass `--base`).
  `subjects` and `verdicts --check` read `--base ALIAS`, else the only bound
  base, else the only bound base with the layout. On a plain base each
  answers `E_USAGE: base <alias> has no subject layout`.
- `index` without an argument keeps its version-1 behaviour for a version-1
  soul, and `--base ALIAS` alone still reads the base's root index. A
  `<kind>/<slug>` argument always reads a subject for a version-2 soul; for a
  version-1 soul it does unless its kind is a bound alias (then it is that
  base's node, as before).
- `--type` and `--kind` match case-insensitively.

### Proposing on a bridged base

`oats okf propose --check` (see [How knowledge is proposed](#how-knowledge-is-proposed))
does more on a base whose **accepted** `okf-base.json` has the layout:

- a version-1 soul's new claims in its owned nodes get `about:` from the
  subject whose `legacy-nodes` names the node, added first to any `about:`
  the proposer wrote (`E_SUBJECT` when none does, or when `about` is not a
  list);
- every generated index is regenerated in the clone (the diff shows it);
- the **write surface**: a version-1 soul writes its owned nodes and the root
  `index.md`, as before (`E_OWNER`, `E_SCOPE`); a version-2 soul may add or
  change files under `claims/**`, add files under `subjects/system/**` and
  `subjects/project/**`, and set `status: superseded` on a concept one of
  its claims supersedes (`supersedes: [/<path>]` or the concept's id); never `verdicts/**`, `subjects/workstream/**`,
  `okf-base.json`, the root `index.md` beyond its generated section, a
  deletion, or another old-node file. For both, a generated index must be
  exactly the regenerator's output. Outside it: `E_SCOPE`, naming every path
  and its rule. The check is advisory (it runs with the proposer's push
  rights); the knowledge maintainer's review is the gate;
- a claim the proposal adds or changes may lack `id` (the maintainer stamps
  it); every other validator finding still refuses (`E_VALIDATION`);
- verdict lanes 1 and 2 over the proposal's claims, from the clone's
  `verdicts/`: `E_VERDICT`, or title-hash candidates in a `## Verdict
  candidates` section of the PR body.

A version-2 soul's plan clones only the bound Git bases with the layout
(`E_CONFIG: base <alias> has no subject layout; ...` when none has it), and
its provenance block carries `source.subjects` with `owner: null`. A
pre-push base-move recovery replays the delta onto the moved tip without
regenerating: the maintainer regenerates before merge in any case.

### The verdict check

`oats okf verdicts --check <claim file>` reads a local claim file and the
base's committed `verdicts/index.md` (a base without one refuses
`E_NOT_FOUND`: a missing record is not "no verdicts"), in two lanes:

1. **Identity.** When the claim names a known id (its `id`, or the id its
   `reconsiders:` names) that id's verdict is read. A `rejected` id proposed
   again without a `reconsiders:` line refuses `E_VERDICT` with the
   verdict's reason, date and PR.
2. **Exact title hash.** The claim's `title-hash` against every verdict's.
   A hit is a candidate for the PR body and the reviewer, never a refusal: it
   catches whitespace and case retries, not paraphrases.

The lexical lane of the design is not in 6.0.

## Instance knowledge and the spawn hook

The `oats.okf` spawn hook is required. For a working instance it:

1. checks only bases referenced by the soul's `owns` or `reads`, validating
   the whole base before resolving its nodes/owners. A usable cached Git
   commit is checked offline first, regardless of age, without renewing its
   fetch timestamps. If a referenced node or owner fails to resolve and the
   cache is due, the same bounded worker tries normal online resolution once
   before refusing. Fresh caches and recently failed fetches retain the normal
   TTL/`attemptedAt` rule; successful cached checks never fetch. A cold cache
   is primed within a bounded time (at most 64 Git
   bases); unavailable priming, including cached objects missing for
   validation, warns with `oats okf bases` rather than refusing. An invalid
   base or unresolved node/owner still refuses. Validation reads blobs in
   one byte-framed `git cat-file --batch`, with paths/modes confined first;
   consultation still refetches on `consult-max-age` or `--fresh`, including
   the first read after spawn. There is no background fetch. A soul with
   `okf.json` version 2 (subjects) primes and validates **every** bound base,
   since a subject may live in any base with the subject layout, and resolves
   its subjects across the cached commits; only when they do not resolve does
   it prime once more, refreshing the due caches, before refusing;
2. creates the home's instance knowledge if missing: `STATE.md`, `log.md`
   and `notes/`;
3. writes `okf-harvest-policy.json` in home with the effective soul opt-out,
   exposed by `oats okf status`;
4. answers a brief naming consultation commands and owned/read nodes only
   (version 1), or one line per declared subject with its claim counts
   (version 2).
   No harvest or proposal direction goes into TASK.md.

A service (capability) instance gets a brief and no knowledge upkeep. A
failure answers `{warning: "oats-okf <CODE>: <message>"}` with exit 1, so the
kernel refuses the spawn. The hook never answers `meta`: the kernel keeps a
hook's meta as the receipt of external state, and a capability without a
retire hook that reported one is quarantined when a spawn rolls back. This
hook creates only the home's own memory and policy files (removed with the home) and primes the
shared host cache, so there is nothing to undo and there is no retire hook.
Before anything else it refuses a soul `knowledge.propose` key and any
`publish` other than the soul's own `off` (`E_CONFIG`).

The inject's **IMPORTANT** block requires current STATE.md (rewritten),
log.md (append-only) and notes/ (one concept per note), and proposing at the
checkpoints below. Reading **okf-propose** is compulsory. This shared text
ships even for an opted-out soul, with an explicit exception removing its
duty to propose. There is no conditional kernel composition. The
`okf-instance-knowledge` skill teaches capture; `okf-propose` holds the
proposal procedure. Both are capability instructions, independent of task
wording. Instances never push to an accepted branch or merge their own
proposals.

### Read the spawn-recorded duty

Run `oats okf status` from instance home (`--home PATH` selects an explicit
home). It returns the usual JSON envelope, with `result.harvest: "on"` and
`reason: "default"`, or `harvest: "off"` and `reason: "soul-opt-out"`; from
6.0 `result.publish` repeats the same value under its new name (the file
`okf-harvest-policy.json` keeps its name and shape).
The command reads only the provider's spawn-written state: no network, base
fetch, TASK.md interpretation or soul-file lookup. Later invocation settings
do not rewrite it. A missing record yields `harvest: "unknown"` with
`reason: "spawn-state-missing"`; malformed state refuses. Neither permits a
proposal: report it and respawn with the current provider, never repair the
record by hand. It is instruction state, not publication authority;
`oats okf propose` reads it and refuses `off` and `unknown` homes itself.

## How knowledge is proposed

**At a knowledge checkpoint** the working agent first updates STATE.md,
log.md and its notes. The checkpoints are: a PR handed over for review, a
finished task, and, in a long-lived role such as a maintainer's, a feature
ready (its last PR merged or approved), a release or deploy shipped, and a
direction decision taken with its human. It reads `okf-propose` and
`oats okf status`; `off`, `unknown` or an error means no proposal. Capture
decisions as they happen, but never propose per commit, per decision, per
review round or per new head of the same PR. One proposal per checkpoint,
carrying only what no earlier proposal carried, and a line in log.md for
every checkpoint, including one with nothing to propose. The agent applies
the promotion test itself (`knowledge-theory`: it would change how a future
instance of the soul decides or acts, and it is not already in the code, the
tracker, the docs or the accepted knowledge); nothing promotable means no
proposal.

Then, from its instance home, in five steps:

1. **Plan:** `oats okf propose --plan --slug <slug>`. It clones every Git
   base the soul owns, at its accepted branch, into
   `proposals/<date>-<slug>/work/<alias>`, writes the skeleton
   `proposals/<date>-<slug>/proposal.md` (a `# OKF proposal: <claim>` title,
   `## What`, `## Why`, `## Evidence`, `## Backing notes`) and prints the
   **write surface** (the owned nodes' directories and the base root
   `index.md`) and the open `okf-proposal`/`okf-harvest` PRs on each base:
   duplicate candidates, informative only (unavailable when `gh` is absent).
2. **Write:** one concept per Markdown file in an owned node, its `index.md`
   entry and a node `log.md` line, supersessions explicit, each concept
   citing its evidence; then fill `proposal.md`, with one
   `- notes/<file>.md` line per backing note. Files only: no commit or push
   in the clone.
3. **Check:** `oats okf propose --check --slug <slug>`. It validates the
   proposed tree (`okf-validate --strict`), checks every changed path
   against the write surface, hashes the named notes, runs the content screen
   over everything that would leave the host (the tree delta, file names,
   the commit text, the PR body) and prints the **complete outgoing diff**,
   the commit text, the PR body with its provenance block and a **digest**
   of the clone's proposed tree, `proposal.md`, the note hashes and the
   generated commit text and PR body themselves (payload version 2), so
   `--apply` publishes exactly the bytes `--check` printed. The
   `okf-propose` skill requires the agent to read that diff once as a
   reviewer would, against `knowledge-theory`'s reject list and the
   personal-data sentence, before the next step. Nothing remote changes.
4. **Apply:** `oats okf propose --apply --slug <slug> --digest <digest>`. It
   refuses `E_DIGEST` if anything changed since the check, then commits (the
   package's fixed author text), pushes create-only to a fresh
   `okf-proposal/<UTC date>-<uuid>` branch through the publication helper's
   `create` (which replays the proposal onto an accepted branch that moved
   before the push, up to three times, unless the base's `okf-base.json`
   changed: `propose` passes it as the helper's `--guard-file`, and a changed
   one refuses `E_BASE_MOVED`, reason `guarded-file-changed`, before any
   push), labels it `okf-proposal`, opens the
   PR with a version 3 provenance block, and prints each PR's URL, head,
   branch, the accepted commit it is parented on (`base`) and `recovered`.
   One PR per changed owned base; **one attempt per proposal**: the
   `publish/` directory marks it, and a second `--apply` refuses
   `E_PROPOSAL_EXISTS` (plan a new proposal instead). `tasks.refs` in the
   provenance is always `[]`: the proposal's own `## Evidence` carries any
   task refs.
5. **Record and go back to work.** The agent writes the PR URLs in log.md.
   It never shepherds the PR: the `proposal-review` trigger spawns the
   maintainer; where no trigger is installed the agent may spawn one
   (`oats spawn oats.okf/knowledge-maintainer --task "<PR url at head>"
   --relation unrelated`), a call, not a station.

**The operator form.** For a source that retired without proposing, from the
deployment: `oats okf propose --home <retirement recovery directory> --soul
<soul> --plan | --check | --apply ...`, the same three steps. `--home` names
the recovery directory holding `recovery.json`; the record, the policy and
the notes are read from its copied home, and the proposal directory is made
**in that copied home** (`<recovery>/home/proposals/…`, or under
`after-hooks/home` when the recovery says so), never in the caller's home.
The provenance names the form (`proposer.form: "recovery"`) and the caller:
`proposer.instance` is the instance the operator runs it from, or `null`
when run from the deployment with no instance. A live
home works the same way with `--home <instance home>`.

A recovery copy without the spawn-recorded policy (a retired 4.x or 5.0/5.1
seat) is decided as 5.8's harvest spawn hook decided it (#125, #128), and
that accepted path survives 6.0: the opt-out comes from the recorded
`soul.yaml` text (which no host setting masks); a soul `harvest` or
`publish` value other than `off` is `E_SOURCE`; the record's removed 4.x keys
(`harvest`, `harvest-runtime`, `harvest-model`) are judged by their recorded
origin: a manifest default is ignored, a soul-origin `off` opts out, any other
soul value or a key with no recorded origin is `E_SOURCE`, and a key the host,
the spawn or the workspace set is ignored and named in `--plan`'s
`legacyKeysIgnored`. A **live** home without the policy stays `E_SOURCE`.

**Refusals**, typed, each with its remedy in the message:

| Code | When |
|---|---|
| `E_USAGE` | not exactly one of `--plan`, `--check`, `--apply`; a bad `--slug`; `--apply` without `--digest`; nothing changed in any clone ("nothing to propose") |
| `E_CONFIG` | an owned base not bound, an unreadable or mismatched accepted `okf-base.json`, `screen-terms-file` not a normalized absolute path; at spawn, `publish` set by the host or a spawn flag, a soul `publish` value other than `off`, or a soul `knowledge.propose` key |
| `E_SOURCE` | no usable record: not an instance home or recovery, a record naming another home, a service home, an incomplete recovery, a soul that is not the record's, or a live home without a spawn-recorded duty (a 5.0/5.1 home: respawn it; `oats instance upgrade` keeps the duty unknown); in the recovery form, a retired seat without one whose soul or record cannot be decided (below) |
| `E_OPTED_OUT` | the spawn-recorded policy is `off`, or the soul's own text says `harvest: off` or `publish: off` |
| `E_PROPOSAL_EXISTS` | `--plan`: a proposal directory of that slug exists; `--apply`: the proposal was already applied or attempted (never retried) |
| `E_SCOPE` | a changed path outside the write surface (named): `okf-base.json`, the root `log.md`, a hidden, non-Markdown or executable file, anything outside the base root |
| `E_OWNER` | `okf.json` and the accepted `okf-base.json` disagree on an owned node (as `resolveNodes`), or a changed path inside a node the soul does not own |
| `E_VALIDATION` | the proposed tree is not a valid OKF base (`okf-validate --strict`) |
| `E_DIGEST` | the clone, `proposal.md`, a named note or the generated commit text or PR body changed since `--check` (a changed record changes the PR body) |
| `E_CONTENT_REFUSED` / `E_CONTENT_INPUT` | the content screen's codes (findings name locations and rules only; `host-term` is the host's own list) |
| `E_PROPOSAL_FORMAT` | `proposal.md` malformed (title, a missing or empty section, a provenance block of its own) or a backing-note line unreadable under the 5.8 note-locator rules; or the clone is not the one plan made (a symlink in its path or anywhere under its `.git`, a `.git` that is a file, or a shared or alternate object store) |
| `E_GIT` | a Git command on a proposal clone failed (a required filter, a corrupt clone): the message names the subcommand and exit status only; Git's own output is withheld, as it may carry private content |
| `E_NOTE` | a warning in `--check`, not a refusal: a named note missing or unreadable is listed without a hash, never hashed silently |
| `E_UNSUPPORTED` | every owned base is a directory base ("convert it to a Git base or edit it in a reviewed change"); a directory base among Git bases is skipped with that reason |
| `E_BASE_MOVED`, `E_PUSH_UNCERTAIN`, `E_GH`, `E_PR_UNCERTAIN` | the publication helper's codes, unchanged: the clone, the commit text, the PR body and a safe result stay in the proposal directory; the agent reports and does not retry, and never assumes no remote branch or PR exists |

The source record is consistency, not authorship: any caller that can run the
command can name a home. What bounds a proposal is the soul's owned nodes, the
OKF validation, the content screen and the maintainer's review.

### What is enforced and what is an instruction

**Personal data is excluded by instruction and a bounded publication screen;
neither is a universal privacy guarantee.** The capturing and proposing
instance and the maintainer are given the same sentence:

> Never include personal data about people outside the team (clients,
> correspondents, any other third party): a name, a contact detail, or
> anything else that identifies a person, including detail derived from
> correspondence. Keep the lesson and leave the person out. Naming the
> author of a published source you cite is fine.

- The instruction guides contextual judgment. A name or an identifying
  paraphrase still needs a reader: the proposer reads its own outgoing diff
  first, the maintainer reads it again as the second reader. Patterns cannot
  recognize every excluded detail, and native publication credentials remain
  available to the agent.
- The propose command copies evidence hashes but does not judge content. The
  validator still checks only frontmatter, links and reachability, with its
  existing interface and exit codes.
- The shared **publication gate** screens exact outgoing commit objects,
  paths/blobs and immutable outward text bytes before every supported push,
  comment and merge. Exit 1 refuses content; exit 2 refuses incomplete/input
  or operational errors. Neither allows publication. Diagnostics give only
  location/line/rule, never values. No flag/environment bypass exists; the
  host's `screen-terms-file` can only add refusals.
- Rules and exclusions are reviewed package code. Only reserved example
  domains/documentation IPs and noreply commit-trailer addresses are excluded.
  Before release, accepted-tree scans measure false positives per rule as counts
  only; timestamps, versions, ports, PR/issue IDs and run IDs are not phones.
- A **rewrite** (v3 or v2) reconciles the sanitized PR delta from its unique
  fork with the current accepted tree, preserving intervening accepted
  additions, edits and deletions rather than reparenting a stale full
  checkout. Conflicts refuse before publication. It produces one sanitized
  commit from that tip, replaces only the exact old PR head with a lease, and
  requires a fresh verdict bound to the new head. This removes branch-only
  rejected history from that branch, not the initial exposure or GitHub's retained pull refs/caches/clones.
  **Legacy v1 removals close and delete the branch** rather than violate 4.x
  completion ancestry. Remaining real exposure is routed privately for rotation
  and warranted platform cleanup; a branch deletion is not erasure.
- Provenance names (note files, task refs, instance names), PR bodies and
  maintainer verdicts are included. A file changed after checking cannot replace
  the stdin bytes sent to `gh`. Merge text is fixed safe text, not an automatic
  summary of old commits. CI may repeat the screen but is too late to prevent
  a first push.

The [publication safety contract](oats-package/capabilities/oats-okf/skills/okf-authoring/references/publication-safety.md)
contains exact commands, resource limits, legacy handling and detection limits.
A clean screen is never proof that every secret or person's detail is absent.

**The soul's opt-out is enforced in code.** With `knowledge: { harvest: off }`
(or `publish: off`) in soul.yaml, the provider records duty off at spawn, the
shared instructions exempt the soul's instances, and `oats okf propose`
refuses them independently, also reading the soul's own text. No TASK brief
carries proposing direction. The opt-out has two limits:

- **It is per soul.** No instance, note, host or spawn setting opts out.
- **It covers that soul's own proposals.** The command checks the home it is
  given. What an instance of that soul writes to other seats in messages is
  theirs to capture and propose.

A soul whose work is reading third-party correspondence should opt out.

### The provenance block (version 3)

````markdown
```okf-proposal
{
  "version": 3,
  "source": {
    "soul": "<soul.yaml name>",
    "owner": "<okf.json owner>",
    "instance": "<source instance>",
    "incarnation": "<instance.json createdAt>",
    "ownedNodes": ["<alias>/<node>"],
    "readNodes": ["<alias>/<node>"],
    "bases": [{ "alias": "<alias>", "id": "<base id>", "kind": "git", "root": "<root>", "repository": "<owner>/<repo>" }]
  },
  "evidence": [
    { "note": "notes/<file>.md", "sha256": "<64-hex of what was read>" },
    { "note": "notes/<missing>.md" }
  ],
  "tasks": { "provider": "<tasks provider, or null>", "refs": [] },
  "proposer": { "form": "live", "instance": "<source instance>", "alias": "<messaging alias, or null>" }
}
```
````

`proposer.form` is `live` (the instance home) or `recovery` (the operator
form; `proposer.instance` is then the caller's instance, or `null` from the
deployment). The maintainer's parser (`oats.okf-maintenance`
`lib/provenance.mjs`) reads the first `okf-proposal` or `okf-harvest` block
strictly: the fence must match the version (3 in `okf-proposal`, 1 and 2 in
`okf-harvest`), unknown keys are refused, `source.owner` is required
(except below),
`evidence` holds at most 100 `notes/…/*.md` paths (5.8's note rules: any
filename, a space or parentheses included; no empty, `.`, `..` or hidden
segment, no backslash or control character), with an optional 64-hex
`sha256` only for a note that was read. It
still reads **version 2** (a 5.x harvester's, with `harvester` instead of
`incarnation` and `proposer`) and **version 1** (4.x run and input ids), so
older PRs stay reviewable.

Version 3 also has an optional `source.subjects` (`["<kind>/<slug>", …]`,
non-empty, distinct), written for a soul declared by subjects (`okf.json`
version 2, [The subject layout](#the-subject-layout-bridged-bases)); only with
`subjects` may `source.owner` be `null`, and then `ownedNodes` and
`readNodes` are `[]`. `subjects` is a version 3 key only.

## The knowledge maintainer

`oats.okf/knowledge-maintainer` reviews one knowledge PR per instance and
**gates every merge**, following the `knowledge-review` skill. Its main job is
knowledge theory: verify each claim against the source it cites and judge
whether it is worth keeping long term, in one canonical home. It is also the
second reader for personal or private data, but that is not its main job.

- `oats okf-maintenance review-context (--event FILE | --pr URL)` validates
  the provenance as untrusted input and returns a reading list; for a
  version 3 or 2 PR it lists the evidence notes the proposer relied on (and
  which it could not read), and for version 3 the proposer.
- The maintainer merges, amends and merges, or closes through the executable
  publication gate, recording an `okf-review` verdict bound to the exact head.
  Rewrites invalidate earlier verdicts; an open PR with a posted verdict is not
  settled. A behind PR refuses direct merge with `E_REWRITE_REQUIRED`: v3/v2
  must publish an exact screened replacement on the current accepted tip and
  receive a fresh verdict; a behind legacy v1 PR closes for re-proposal. A
  locally computed three-way merge is not a screen for potentially different
  hosted squash bytes. Hosted merge semantics remain uncertified. An uncertain
  write is inspected before any authorized recovery.
- It never parks a PR. A PR that supersedes a human-accepted decision is
  merged only when it cites the human's acceptance (checked when the record
  is on GitHub, otherwise recorded as source-reported), and closed otherwise.
- It reports to no one: the proposer reads the PR.
  `oats okf-maintenance notify-harvester` answers `E_REMOVED` ("there is no
  harvester; the proposer reads the PR").

**Protect the accepted branch.** The maintainer can only gate what cannot
bypass it: every Git base's accepted branch must refuse direct pushes and
force-pushes and accept changes by pull request only, merged by the knowledge
maintainer's account. On GitHub, a branch ruleset on the accepted branch
(restrict updates to a bypass role or team holding the maintainer's account,
"for pull requests only"; require a pull request; block force pushes and
deletion), or the classic equivalent with "Do not allow bypassing the above
settings" (otherwise GitHub exempts administrators); a deployment that
protects the branch by other means meets it too. The `okf-trigger-setup`
skill has the steps. `protection: enforced` does not read bypass lists or
the admin-bypass setting.
`oats okf bases` reports `protection: enforced | none | unknown` per Git
base, from two reads: `gh api repos/<owner>/<repo>/rules/branches/<branch>`
(rulesets) and `gh api repos/<owner>/<repo>/branches/<branch>/protection`
(classic branch protection, which the first never shows). `enforced` when an
active ruleset, or classic protection, requires a PR or restricts who may
push; `none` only when both reads succeed and neither does (GitHub answers the
classic read with 404 `Branch not protected`; classic protection with status
checks only gates no direct push and reads `none` too); `unknown` when
either read cannot be made (`gh` absent, 404 `Not Found` or 403 for a caller
without admin read, a failure) or the base is not on GitHub. It is read-only,
best-effort and bounded by `git-timeout`, never a refusal.

The maintainer is spawned per PR by the **`proposal-review` trigger
template** (`oats.okf:proposal-review`, definition id `okf-proposal-review`):
GitHub `pull_request` events `opened`, `reopened` and `ready_for_review` with
the label `okf-proposal`, polled every 2 minutes, spawning
`oats.okf/knowledge-maintainer` with concurrency `max 2, perKey 1`.
Parameters: `repo` (required, `github.com/<owner>/<repo>`), `base` (default
`main`), `harness` (default `claude`) and `model` (default `opus`).
`oats.okf:harvest-review` is its old name and now watches only the 5.x label
`okf-harvest`, with the same parameters: the kernel requires every label a
trigger names (`on.labels` is AND), so one trigger cannot watch both. Keep
`harvest-review` beside `proposal-review` only while a 5.x harvester may
still open an `okf-harvest` PR; the two never fire on the same PR.

oats.okf never installs the trigger. The `okf-trigger-setup` skill teaches
the workspace automation file (`oats-triggers/okf-proposal-review.yaml`,
`kind: oats-trigger`, `from: oats.okf:proposal-review`, `runsOn` naming the
one host, `owner` the merge-capable GitHub account) and `oats trigger add`.
Without the trigger, proposal PRs wait for a human reviewer, or for a
maintainer the proposer spawns.

## Explicit provisioning: init, migrate, unlock

Bases and node ownership change only through explicit operator actions, run
from the deployment with `--soul <soul>`.

**init** creates a new base from a node map, for example
`/absolute/config/team-nodes.json`:

```json
{"operations":{"path":"operations","owner":"operations-stable-id"}}
```

```sh
# A NEW directory base, provisioned in place; refuses an existing path.
oats okf init --base team --nodes /absolute/config/team-nodes.json --confirm --soul domain-expert --json
# A Git base is staged for an operator-owned commit and a reviewed PR; nothing is pushed.
oats okf init --base project --nodes /absolute/config/project-nodes.json --output /absolute/new-bundle-stage --soul domain-expert --json
```

**migrate** moves a v1 soul-contained `soul/knowledge/` into an external
node. A soul that still has `knowledge/` cannot spawn (`E_MIGRATION`); first
provision the empty owned node, then:

```sh
oats okf migrate --legacy /absolute/soul/knowledge --base project --node expert --output /absolute/empty-migration-stage --soul domain-expert --json
oats okf migrate --deliver /absolute/state/migrations/UUID/migration.json --soul domain-expert --json
# Git: review and merge the PR, then rerun --deliver to confirm acceptance.
oats okf migrate --cutover /absolute/state/migrations/UUID/migration.json --soul-dir /absolute/soul --soul domain-expert --json
oats okf migrate --forget UUID --soul domain-expert --json   # drop a record that never delivered
```

Migration preserves the full original under `<stateDir>/migrations/<uuid>/`,
stages the base before writing any record, refuses a non-empty destination
node, rewrites bundle-root links into the node, and validates the base.
Cutover requires accepted delivery, unchanged original bytes and current
bindings still mapping the alias to the delivered base; it renames the
original into custody and updates `okf.json`. Skills are never changed.

**unlock** releases a directory base lock left by a dead local holder; the
`E_LOCKED` error names the command:

```sh
oats okf unlock --lock /absolute/path/to/lock --token TOKEN_FROM_OWNER_JSON --soul domain-expert --json
```

It refuses living holders and other hosts. Never remove a publication
journal by hand.

## Portable binding (payloadVersion 2)

A soul can carry its knowledge declaration portably, as the `knowledge` value
`oats.okf.locations@1`:

```json
{
  "contract": "oats.okf.locations",
  "version": 1,
  "payload": {
    "owner": "domain-expert",
    "stores": {
      "reference": {"fixed": {"id":"public-reference","kind":"git","repository":"https://example.invalid/knowledge.git","root":"knowledge","acceptedBranch":"main","pr":{"repository":"example/knowledge"}}},
      "local": {"default": {"id":"local-notes","kind":"directory","path":"path:/srv/oats/example/local-notes"}},
      "destination": {"inherit": "write.default"}
    },
    "reads": [{"store":"reference","node":"conventions"}],
    "owns": [{"node":"expert","destination":"destination"}]
  }
}
```

`fixed` is an equality requirement, `default` a fallback candidate, and
`inherit` requires a separately supplied binding. Reads never become write
destinations. The declaration contract stays version 1.

The manifest declares the binding wire (`binding.version: 1`):
`binding-normalize`, `binding-bind` and `binding-check`, bounded JSON
stdin/stdout entrypoints for the kernel, not operator commands.

- **normalize** emits requirements and candidates under
  `/bindings/knowledge/...` for the kernel's single resolver, from the soul's
  declaration and the workspace, adoption and operator binding maps; it
  needs `bindings-file` and `state-dir`.
- **bind** renders the selected choices into a ProviderBinding1 with
  **`payloadVersion: 2`**: payload keys `owner`, `stores`, `reads`, `owns`
  and `runtime` (`descriptorFile`, `bindings`, `declaration`). The 4.x
  `execution` (harvest runtime and model) is gone.
- **check** is read-only readiness: settings, the soul declaration, each
  base (Git bases through the host cache and a bounded `ls-remote`) and the
  declared nodes. It answers `ready`, `needs-configuration` or
  `unavailable` with problems and warnings drawn only from the 24 fixed
  strings and templates in the manifest's `binding.reasons`, which must
  match the provider's byte for byte. A failed node check is
  `declaration:unresolved`.

A **payloadVersion 1** binding (4.x) is refused: check answers
`needs-configuration` with `E_REMOVED: OKF binding payloadVersion 1 (harvest
runtime/model) was removed in oats.okf 5.0; respawn to bind with oats.okf 5
…`, and a captured `OATS_BINDING_FILE` holding one makes the command fail
with `E_REMOVED`.

The released 0.44 kernel runs the check phase (readiness) and names no
`OATS_BINDING_FILE`; consultation then uses the soul's `okf.json` and the
bindings file. A present `OATS_BINDING_FILE` must be a private,
single-link, owner-only regular file and fails closed on any defect. Captured
`setup`, `init`, `migrate` and `unlock` refuse. Data examples are in
[`examples/portable-binding/`](examples/portable-binding/), and the domain is
described in [PORTABLE-BINDING-DOMAIN.md](PORTABLE-BINDING-DOMAIN.md).

## Removed in 5.0

Each removed surface answers `E_REMOVED` with the new way; none captures,
runs, completes or drains anything.

| Removed | Instead |
|---|---|
| `oats okf harvest` and the `knowledge:harvest` operation | from 6.0: run `oats okf propose` from the instance home (5.x: a proposal and a harvester spawn) |
| `oats okf run-source`, `complete`, `retry` | nothing: 5.0 keeps no runs or custody |
| `oats okf harvest-status` | nothing: there is no harvest state to report |
| `oats okf setup --harvest`, `--enable`, `--disable`, `--install-host`, `--remove-schedules` | `oats okf setup --remove-legacy-settings` removes the old keys |
| `oats okf migrate --source-home` | nothing: there is no source registration |
| `--source FILE` on any command | run from the instance home, or from the deployment with `--soul` |
| `OATS_SOURCE_RECEIPT_FILE` or `OATS_INVOCATION_CONTEXT_FILE` in the environment | nothing: captured receipts and invocation contexts are gone |
| `oats okf-harvest complete`, `harvest-status` | gone with the capability in 6.0 (the kernel answers an unknown command); `oats okf propose` opens the PR |
| settings `harvest`, `harvest-runtime`, `harvest-model` | remove them (see [Settings](#settings)) |
| the `harvester-max-age` setting of `oats.okf-harvest` | none (the capability itself is removed in 6.0) |
| the retire hook, and the spawn hook's `sourceReceipt` input | none |
| binding `payloadVersion` 1 and its `execution` | `payloadVersion` 2 |

`oats okf read` (removed in 4.0, use `cat`) and `oats okf refresh` (removed
in 3.0) keep their earlier `E_REMOVED` answers. The `harvest` operation stays
declared in the manifest so an old caller gets that answer rather than an
unknown operation.

## Upgrading to 6.0

6.0 removes the knowledge harvester. What changes for a deployment:

- **New spawns propose themselves** with `oats okf propose` (plan, check,
  apply), taught by the `okf-propose` skill and the inject. Their duty is the
  same spawn-recorded policy: `oats okf status` answers `harvest` and now
  also `publish`, with the same value.
- **Harvester spawns stop.** `oats.okf/knowledge-harvester` and
  `oats.okf-harvest` are reduced to a stub until 7.0 (then the name becomes
  unknown). `oats okf harvest` answers `E_REMOVED` naming `oats okf propose`;
  `oats okf-harvest complete|harvest-status` and
  `oats okf-maintenance notify-harvester` answer `E_REMOVED`.
  A stub command answers only where it is composed: a home that does not
  compose `oats.okf-harvest` (every working home) gets the kernel's own
  `E_UNKNOWN_COMMAND` for `oats okf-harvest …`; the stub soul's spawn refusal
  and `oats okf harvest` are what reach every caller.
- **Harvesters already running** keep their 5.x modules and finish, or a
  person retires them; a retained one is retired and its claims re-proposed
  by the source with `oats okf propose`, or by the operator form on its
  retirement recovery. Homes spawned under 5.x are not upgraded by the pin:
  a running 5.x home keeps its composed 5.x skills until it is respawned or
  moved with `oats instance upgrade` (a 5.2+ home adopts with its policy file
  unchanged).
- **A retired seat's notes** are proposed by the operator form:
  `oats okf propose --home <retirement recovery directory> --soul <soul>
  --plan|--check|--apply` from the deployment, a retired 4.x or 5.0/5.1 seat
  included (decided as 5.8 decided it; see
  [How knowledge is proposed](#how-knowledge-is-proposed)).
- **The trigger:** `oats.okf:proposal-review` (label `okf-proposal`) must be
  added: an existing `harvest-review` watches only `okf-harvest`, so it never
  reviews a 6.0 proposal. Step 4 below has the hand steps for a workspace
  file and for a local trigger (which keeps the values it was added with).
- **Protect the accepted branch** of every Git base: PRs only, merged by the
  knowledge maintainer's account ([The knowledge maintainer](#the-knowledge-maintainer)).
  `oats okf bases` reports `protection`.
- **Give proposing hosts branch-create access** on the knowledge repository
  (their `gh`/Git account), or use the fork flow; never accepted-branch push.
- **Optional:** `screen-terms-file`, a host deny list for the content screen.
- **The subject layout** (see [The subject layout](#the-subject-layout-bridged-bases)):
  nothing a deployment must change. A base is read by subject only once it
  is bridged; a soul moves to `okf.json` version 2 when its base is. Readers
  on 5.x keep working on a bridged base.
- **No change** to bindings, `okf.json` version 1, `okf-base.json`, the soul opt-out
  (now also spelled `publish: off`) or any handled error code. A soul
  `knowledge.propose` key is refused at spawn (`E_CONFIG`). Open
  `okf-harvest` PRs (provenance version 2) stay reviewable and mergeable.

### What to delete, and what replaces the harvest

A spawn of `oats.okf/knowledge-harvester` is refused by the stub soul's
required spawn hook, before any home is kept:

```text
oats-okf-harvest E_REMOVED: oats.okf 6.0 removed the knowledge harvester. The instance proposes its knowledge itself: run `oats okf propose --plan` from its home (or `oats okf propose --home <retirement recovery> --soul <soul>` from the deployment for a retired source). Delete any souls.launch key for oats.okf/knowledge-harvester and any --provider oats.okf harvest=... spawn flag; rename the trigger template oats.okf:harvest-review to oats.okf:proposal-review. See the 6.0 release note.
```

The hand steps, from the deployment directory:

1. **What replaces the harvest:** at a checkpoint the instance runs, from its
   home, `oats okf propose --plan --slug <slug>`, writes the knowledge in the
   clone and fills `proposal.md`, then `oats okf propose --check --slug <slug>`
   and `oats okf propose --apply --slug <slug> --digest <digest>`. For a
   retired source, the operator runs
   `oats okf propose --home <retirement recovery directory> --soul <soul> --plan --slug <slug>`
   (then `--check` and `--apply` with the same `--home` and `--soul`).
2. **Delete the harvester's launch preference**, if any, with the kernel's
   own writer (it keeps every other entry and its comments):
   `oats soul launch remove oats.okf/knowledge-harvester --plan`, then
   without `--plan`. A key stored in another spelling is removed by its
   exact text (`grep -n "knowledge-harvester" oats-local.yaml` shows it):
   `oats soul launch remove '<exact key>'`. No such entry answers
   `E_LAUNCH_PREFERENCE_UNKNOWN`: nothing to delete.
3. **Delete every `--provider oats.okf harvest=…` spawn flag** from the
   scripts and briefs that spawn instances:
   `grep -rn -- "--provider oats.okf harvest" <your scripts>`. A leftover host
   `harvest` key is removed with
   `oats okf setup --remove-legacy-settings --soul <soul>` (`--plan` first).
4. **Add the `proposal-review` trigger beside `harvest-review`, then
   retire the old one.** The kernel requires *every* label of a trigger
   (`on.labels` is AND), so each template watches one label:
   `proposal-review` the 6.0 `okf-proposal` PRs, `harvest-review` the 5.x
   `okf-harvest` PRs only (as in 5.8). Without `proposal-review` no new
   proposal is reviewed automatically. Keep `harvest-review` while a 5.x
   harvester may still open an `okf-harvest` PR, then remove it; that
   completes the rename the removal error asks for.
   - **A workspace automation file** (in a member repository) is
     re-instantiated from the package template at the pinned commit, so the
     old file keeps working for `okf-harvest` PRs. Copy it under the new
     template and a new id (`oats trigger add --workspace` writes an explicit
     `id:` line; two files with one id are `E_AUTOMATION_DUPLICATE`), keeping
     its `set:`, `runsOn` and `owner`:
     `sed -e 's/oats.okf:harvest-review/oats.okf:proposal-review/' -e 's/^id: okf-harvest-review$/id: okf-proposal-review/' oats-triggers/okf-harvest-review.yaml > oats-triggers/okf-proposal-review.yaml`,
     then commit and merge it. On the review host, if `oats-local.yaml` lists
     named `automations: trust:` entries (not `"*"`), add the new one beside
     the old: `- <member>/okf-proposal-review`. A new id is untrusted until
     then and never runs. Run `oats automations refresh` and check that
     `oats trigger show <member>/okf-proposal-review --json` answers
     `result.trigger.runsHere: true` (not `reason: "untrusted"`). Later, `git rm oats-triggers/okf-harvest-review.yaml`
     and drop its trust line.
   - **A local trigger** (`oats trigger add`) stores the definition it was
     given and is never re-instantiated: read its values first,
     `oats trigger show okf-harvest-review --json` (`result.trigger.on.repo`,
     `on.base`, `spawn.harness`, `spawn.model`), then add the new one with
     the same values,
     `oats trigger add --from oats.okf:proposal-review --set repo=<on.repo> --set base=<on.base> --set harness=<spawn.harness> --set model=<spawn.model>`
     (the template's defaults, `main`, `claude` and `opus`, would replace
     yours); later `oats trigger remove okf-harvest-review`.
5. **Retire harvesters still listed** once they have handed over:
   `oats status`, then `oats retire <harvester instance>`; re-propose a
   retained one's claims by step 1 (the source, or the operator form on the
   harvester's source's recovery).

## Upgrading a home in place: `oats instance upgrade`

OATS 0.68's `oats instance upgrade` moves a stopped home's package modules in
place. It refuses to move a module that runs a spawn hook unless that module
declares an `upgrade` hook. oats.okf declares a non-required one
(`bin/oats-okf.mjs upgrade`, in `lib/upgrade.mjs`), so a 5.x home can move
to a later 5.x without a respawn. The hook decides from what the home holds:

| The home holds | `plan` | `apply` |
|---|---|---|
| a service home (`instance.json` kind `capability`) | adopt | the meta as recorded |
| a valid spawn policy (`okf-harvest-policy.json`) | adopt; the policy and working memory are untouched | the meta as recorded (`{}`: 5.x records none) |
| no spawn policy and no 4.x state | adopt | the meta as recorded |
| a spawn policy that is invalid | refuse, as `oats okf status` does; remedy respawn | fails the same way |
| 4.x state (`.okf-source.json`, `.okf-instance.json`, `.okf-harvest-record*.json`, or a recorded 4.x meta) | refuse; remedy `oats retire <instance>`, then `oats spawn` | fails the same way |

A 5.0/5.1 home without a harvest policy adopts and stays unknown; respawn it
to set the policy.

A home spawned under 4.x cannot become a 5.x home in place. Only a spawn
writes the 5.x policy, 5.x never processes a 4.x source, and 5.x has no
retire hook to take a registered source's final capture. A refused home keeps
its 4.x modules, so `oats retire` runs its own 4.x hooks, and any final
capture is taken. Then `oats spawn` gives a 5.x home (see
[Upgrading to 5.0](#upgrading-to-50)).

Both phases only read the home: no write, no kernel or host call. The hook
answers before the provider's settings check, so a 4.x home's recorded
harvest keys get its refusal and remedy, not `E_REMOVED`.

## Upgrading to 5.0

Pinning 5.0 changes the package a deployment resolves; it does not rewrite
what an existing home already holds. Four separate things:

- **Default data: nothing to do for it alone.** A home spawned under 4.x
  recorded the 4.x manifest defaults (`harvest: off`, `harvest-runtime: pi`)
  in its instance.json, with origin `manifest-default`. That home's own
  commands, hooks and readiness and binding checks keep running the 4.x
  modules it was spawned with; the pin does not change them. The 5.0 code
  that reads such an old record is the harvester's spawn gate, when the home
  is a proposal's source: it ignores a legacy key with origin
  `manifest-default`, as if absent. So a record with only these defaults
  needs no respawn for them; it still needs one for the 5.0 proposal brief
  (below). (A `harvest: off` default is not an opt-out; only a soul's own
  is.) The record is never rewritten.
- **Explicitly set removed keys: clean up.** The commands, settings and hooks
  in [Removed in 5.0](#removed-in-50) are gone; each answers `E_REMOVED`
  naming the proposal flow. A key someone set (host, spawn, or a soul value
  other than `off`), or one whose origin is not recorded, refuses until it is
  removed. Remove the host ones from the deployment's `oats-local.yaml` with
  `oats okf setup --remove-legacy-settings --soul <soul> [--plan] --json`,
  run from the deployment. It only deletes `settings.oats.okf.harvest`,
  `harvest-runtime` and `harvest-model` (`--plan` writes nothing), and only
  from the `oats.okf` map directly under `settings:` (an emptied map stays
  `{}`, before any inline comment; the file keeps its permissions). It refuses with `E_UNSUPPORTED`, before
  writing, on YAML it cannot edit line by line, an `oats.okf` nested under
  another key included (report that to the deployment's owner), and never
  touches a soul: a soul's
  `knowledge: { harvest: off }` stays valid. Until the host keys are gone,
  every command and the spawn hook refuse. A spawn key is dropped from the
  spawn command; a soul key is changed in the soul's reviewed source. A key
  an old home recorded with a host (or other explicit) origin stays in its
  instance.json after the host cleanup, so the harvester refuses that home
  as a proposal's source (`E_SOURCE`) while it is alive: retire it, then
  propose from its retirement recovery (next bullet).
- **A retired 4.x seat's notes: propose from its retirement recovery
  (#125).** A home spawned on 4.x recorded the deployment's `harvest`
  switch (and `harvest-runtime`, `harvest-model`) in its instance.json, a
  record that is never rewritten, so it can never become a 5.x source by
  respawning: respawn retires it, and its notes survive only in the
  retirement recovery copy, whose record carries the same keys. Write a
  proposal in the shape above naming the retired instance, its home and
  soul, and `incarnation` copied from the recovery copy's `instance.json`
  `createdAt`; list its notes under `## Backing notes`; spawn the
  harvester. From 5.9.0 the harvester ignores, on a **retired** source
  only, a removed key whose recorded origin is the host, the spawn or the
  workspace, and lists it in the snapshot's `source.json`
  (`legacyKeysIgnored`). The soul's own `knowledge: { harvest: off }`,
  read from the recorded soul snapshot's text, still refuses; so does a
  soul `harvest:` value other than `off`, and a key with no recorded
  origin. **A 4.x host `harvest: off` is not an opt-out**, even an explicit
  one: it declined 4.x's own machinery (source registration, transcript
  capture, scheduled runs), which is gone. Under 5.x nothing runs unless
  someone in the deployment writes a proposal and spawns a harvester, and
  that act is the deployment's consent; only the soul's declaration is the
  soul's. The route needs: the recovery at `phase: complete`, kept until
  the harvester has captured it; the soul snapshot
  (`agents/<soul>/souls/<commit>`) still present; complete event history
  with a single retired incarnation (OATS >=0.49.0). A live 4.x home is
  still refused: retire it first. `--preview` does not run this check. The
  4.x custody under `<stateDir>/sources/` is not read by this route;
  [4.x source records after the pin](#4x-source-records-after-the-pin)
  governs it.
- **Old instructions and modules: respawn when the 5.0 brief is wanted.** A
  running home keeps the modules, skills, AGENTS.md and TASK.md brief it was
  spawned with; pinning 5.0 does not replace them. A 4.x home is told about
  the 4.x harvest until it is respawned, and only a home spawned under 5.0
  gets the proposal brief and runs the 5.0 modules. Respawn the homes that
  should propose.
- **Registered 4.x sources: finish them under 4.x, or leave them.** 5.0
  code never reads 4.x state (`<stateDir>/sources/`, `owners.json`) and never
  deletes it. Finish a source's harvest while 4.x is still pinned: after the
  pin nothing processes it. No version of oats.okf has a command that removes
  a source record.
  [4.x source records after the pin](#4x-source-records-after-the-pin) says
  what a home spawned on 4.x does when it retires, what a record can hold,
  and when it may be removed by hand. 4.x harvest PRs (provenance version 1)
  stay reviewable. A retired 4.x home's notes are harvested from its
  retirement recovery (bullet above), never from its 4.x record.

### 4.x source records after the pin

5.0 code never reads `<stateDir>/sources/` or `owners.json`. A home spawned
on 4.x still does: it runs the 4.x modules copied into it, and they read the
one record that the home's marker, `.okf-source.json`, names by id.

**Retiring a registered 4.x home after the pin** depends on the version it
was spawned on:

- **A 4.2 home is kept.** Its copied retire hook asks the deployment for the
  harvest switch with a command 5.0 removed, so the retirement is refused
  with `E_HARVEST_CONSENT_UNKNOWN`.
- **A 4.1 home retires, and leaves a scheduler job.** Its copied hook reads
  its own spawn-time settings, registers its job `okf-<source id>` again,
  takes a final capture, and leaves the job enabled while input is pending.
  The job runs `oats okf run-source`, which 5.0 answers with `E_REMOVED`: the
  capture stays unprocessed and the job fails each time it runs. Remove it
  with `oats schedule remove <id> --dir <deployment>`
  ([Upgrading from 4.1](#upgrading-from-41)). This is read from the 4.1.1
  code; no test runs a 4.1 home against a 5.0 pin.

**What a record can hold.** Captured notes and windows of session records,
which can include what people outside the team wrote. They stay on disk
until someone removes them. Nothing will ever prompt that: keeping or
deleting them is the operator's decision.

**Removal by hand** is the only removal there is. It is safe in two cases:

1. **A record that holds nothing, at any time.** This is the record a failed
   spawn leaves. All of these hold:
   - no home's `.okf-source.json` names its id;
   - its `status.json` has no captured input, nothing processed, delivered
     or accepted and no active run, and it has no `inputs/` or `runs/`
     directory;
   - no scheduler job `okf-<id>` exists
     (`oats schedule list --dir <deployment> --json`);
   - it holds no `*.lock` and no `oats okf` process is running.
2. **Any 4.x record, once nothing can use it.** The deployment pins 5.0, no
   live home spawned on 4.x names the record, and its harvest is settled or
   given up. 4.x said never to erase custody because 4.x had yet to process
   it; under 5.0 nothing will.

Remove a record's whole directory or nothing.

**What is never touched:**

- while any home spawned on 4.x is alive: the record its marker names, the
  marker itself, and `owners.json`. Once none is alive, the whole `sources/`
  directory and `owners.json` are the operator's files and no code reads
  them;
- at any time: `cache/` and `migrations/`, which 5.0 uses.

**Two records for one home.** A respawn under the same name registers a new
record with the same `home`. Tell them apart by the id in the home's marker,
never by the `home` field in `source.json`. The other record cannot affect
the home: 4.x finds a home's source through its marker only, and refuses to
capture for a source whose id the marker does not name.

## Upgrading from 4.1

oats.okf 4.2 and later manage no scheduler job. A live bindings document
with `cron` or `tz` answers:

```text
E_HARVEST_SCHEDULE_REMOVED: … oats.okf harvests no schedule since 4.2: remove cron/tz from the bindings file, and remove each okf-<source id> job okf <= 4.1 created with oats schedule remove <id> --dir <deployment> (README#upgrading-from-41).
```

Remove `cron` and `tz` from the bindings file. In every deployment that ran
4.1, list its jobs (`oats schedule list --dir <deployment> --json`); an old
OKF job is `okf-<source id>` running `oats okf run-source --source …`.
Remove each with `oats schedule remove <id> --dir <deployment>`, deciding by
its definition, never by the `okf-` prefix alone and never with `--force`.
The kernel refuses while the job has a tracked instance or an unresolved
effect: settle it (`oats schedule reconcile <id> --dir <deployment>`), then
remove it.

## Tests and CI

```sh
npm test    # npm run validate (the manifests), then node --test test/*.test.mjs
```

The suite uses real temporary Git repositories, real directories and the
package's CLI:

- `okf5-consult`: Git bases read through the host cache at the accepted
  state (`bases`, `cat`, `ls`, `links`, `search`, `--fresh`), a host-wide
  `insteadOf` on the bound repository, the refusals of credential-bearing
  locators, escaping paths and unknown aliases, and the `bases` protection
  report (`enforced`, `none`, `unknown`);
- `okf5-remote`: the frozen-remote guard, passing under host-wide
  `insteadOf` and `pushInsteadOf` rules and refusing a changed or added
  origin URL (whitespace included), a `pushurl` and a clone-local
  `insteadOf` or `pushInsteadOf`, with okf's own Git isolated from the
  host's global and system config;
- `okf5-working`: the spawn and soul-scaffold hooks (with the `publish: off`
  spelling and the `knowledge.propose` refusal), `inspect`, consulting from a
  home, `init`, `migrate --legacy/--deliver/--cutover`, and the removed
  surfaces and `harvest` operation answering `E_REMOVED` with
  `oats okf propose`;
- `okf5-legacy-settings`: the removal sentence for each origin and key, and
  `setup --remove-legacy-settings` (plan, removal, `{}` before an inline
  comment, idempotence, the refused shapes and files, a nested `oats.okf`, the deployment scope, soul-origin keys);
- `okf5-provenance`: the version 1, 2 and 3 parser (fence names, unknown
  keys, the proposer), `review-context` and the removed `notify-harvester`;
- `okf6-propose`: `oats okf propose` on a local Git remote with the shipped
  helper and a fake `gh`: `--plan` (the clone, the skeleton, the write
  surface, open proposals; `E_SOURCE`, `E_OPTED_OUT`, `E_PROPOSAL_EXISTS`,
  `E_OWNER`, a 5.0/5.1 home without a policy), `--check` (`E_SCOPE`,
  `E_OWNER`, `E_VALIDATION`, `E_CONTENT_REFUSED`, `host-term`,
  `E_PROPOSAL_FORMAT`, a missing note dropped with `E_NOTE`, the digest),
  `--apply` (`E_DIGEST`, the pushed `okf-proposal/` branch and labelled PR
  with a v3 block the maintenance parser accepts, a pre-push base move
  recovered, a publication failure retained and never retried) and the
  operator form on a retirement recovery copy.
- `okf6-subjects-propose`: `propose` on a bridged base: a version-1 soul's
  claim gets `about:` from `legacy-nodes` and the indexes are regenerated
  and published, `E_SUBJECT` and `E_OWNER`; a version-2 soul's claim under
  `claims/` with provenance v3 `subjects`; `E_SCOPE` for `verdicts/`, a
  workstream subject and an old-node file; `E_VERDICT` and the PR body's
  verdict candidates; a version-2 plan on a plain base refused;
- `okf6-subjects`: the subject layout on a bridged fixture base (a small
  version-1 base plus the reserved nodes, two subjects, three claims with
  `about` and one verdict, its indexes written by the regenerator): validator
  v2 accepts it and refuses each error, the 5.8 fact (the unchanged `v5.8.0`
  validator passes it with 0 errors and 0 warnings; needs the tag, so CI
  checks out with full history), a plain base gets 5.8's findings, the
  regenerator is deterministic and `--check` catches a stale or orphaned
  index, `okf.json` version 2 resolves (and refuses on a plain base or an
  unknown subject) at spawn and readiness, the brief, each verb's output and
  `E_USAGE` on a plain base, a version-1 soul's `index` unchanged on the
  bridged base, the verdict lanes, the write-surface rule (each refusal, the
  regenerator requirement, a proposal's missing ids) and the portable
  binding's refusal.

`okf5-real-kernel` runs only when `OATS_OKF_REAL_CLI` names a kernel; CI's
`real-kernel-0692` job installs the released **OATS 0.69.2** in a disposable
prefix and runs it, failing if it skips. In an isolated file-Git workspace
with this package pinned from the checkout, it runs the legacy-key cleanup,
a real working-soul spawn running `oats okf propose --plan` and `--check`
against a real Git base through the kernel's in-home dispatch, the stub's
refusal of `oats spawn oats.okf/knowledge-harvester` with the `E_REMOVED` fix
and no home kept, the removed surfaces, the source's retirement and the operator form on its real
retirement recovery, both opt-out spellings (status `off`, propose
`E_OPTED_OUT`), the spawn refusal of a soul `knowledge.propose`, and the
maintainer soul's preview and `background: true` default. Instances are
spawned with `--no-launch`: no model, messaging or GitHub PR is involved.

`okf6-subjects-real-kernel` runs in the same job on the same kernel: a
version-2 soul spawns against a bridged Git base (its TASK.md brief lists
its subjects with counts) and `oats okf index` prints its subjects'
generated indexes; a version-1 soul against the same base prints its node
indexes exactly as on the plain base; a version-2 soul against a plain base
is refused at spawn.

`okf5-upgrade-hook` runs the upgrade hook (above) on homes made by the
released v5.8.0, v5.3.0, v5.1.0 and v4.2.2 code (a 5.8.0 home adopts under
6.0 with its policy file unchanged), under a preload that refuses every
write and child process. `okf5-kernel-upgrade` runs only when
`OATS_OKF_UPGRADE_CLI` names a kernel. CI's `kernel-upgrade-0692` job installs
the released **OATS 0.69.2** and runs it, failing if it skips. It does three
things:

- It spawns a home on v5.3.0.
- A home spawned on v5.2.1 cannot move to the hook-less v5.3.0 (the
  negative control).
- This checkout adopts the v5.3.0 home. The policy and working memory are
  byte-identical afterwards.
- It refuses a home spawned on v4.2.2 with the respawn remedy.

`okf5-content-screen` exercises the bounded rules and code-only exclusions.
`okf5-publication` exercises the shipped gate with real Git and bare remotes:
refused content/history, stale leases, sanitized rewrites, legacy removal
refusals, exact-byte text and new-head verdicts. Fake `gh` proves invocation,
not hosted acceptance. Accepted-corpus false-positive scans are a separate
read-only pre-release gate, not a fixture-based claim.

Not covered by tests: a model-run proposer judging its own knowledge, a real
GitHub PR, the `bases` protection read against a real ruleset, and the
maintainer's review on GitHub. Hosted acceptance remains the first live
proposal after the authorized release, not a claim from the local tests. [SCHEMA-STATUS.md](SCHEMA-STATUS.md)
lists the schemas and these limits.
