# Design: OATS's knowledge base by subject (plan part 9)

Status: design for decision by both sides, nothing built. Lead:
oats-expert-coordination-rethink; author: kb-by-subject-okf-expert (the
oats.okf package expert). Written against the released `v5.8.0`
(`cfc595a9edea`): every consult, metadata and validator fact below was
checked on the default branch at `1d74816e8bb2`, whose `config.mjs`,
`consult.mjs`, `okf-validate.mjs` and `bin/oats-okf.mjs` are byte-identical
to the tag. The base inventoried is `oats-project/oats-knowledge` at
`1b6d6ea70f71` (2026-11-09).

Direction: Pepe, 2026-11-09, "use basically the same ontology that the LFX
instances have come up with for their OmniGraph knowledge base, but adapted
to OATS. Essentially, the knowledge base is not going to be personal."

## 0. The decisions, in one table

| # | Decision for both sides | Recommendation | Status (2026-11-10) |
|---|---|---|---|
| D1 | Engine | Markdown in Git with typed frontmatter and `about:` edges; committed generated subject indexes (probe P1: one blob per subject walk against 418 for a scan; probe P2: a graph store answers the same verbs in tens of milliseconds but replaces the review, citation and distribution contracts) (§3) | decided by both |
| D2 | Ontology | subjects `system`, `workstream`, `project`; claims `Decision`, `Insight`, `Requirement`, `Risk`, `Question`; documents `Reference`, `Playbook`; `Verdict` records. No person, organisation, meeting, conversation, artifact, signal, commitment or work-item types (§2) | decided by both |
| D3 | Bridge before break | Introduce the subject layout inside the version-1 base contract (reserved nodes + `about:` frontmatter), verified to pass 5.8.0 code unchanged; a live rehearsal in a scratch deployment (a 5.8.0 home harvesting and a 6.0 home proposing against a bridged copy) is a condition of the bridge PR; no path moves, no `okf-base.json` v2 until 7.0 (§7) | decided by both (rehearsal widened, §7.2) |
| D4 | Ownership | No soul owns a node. `okf.json` v2 declares `subjects` (defaults for reading); the owner-id check retires; the write surface is a path rule the proposing tool applies and the maintainer's review checks; the review at merge is the real gate (§4) | decided by both (Juan yes, 10 Nov) |
| D5 | Review | One fresh knowledge maintainer per proposal PR, spawned as a call at the exact head, on a model family other than the proposer's and none a side's direction excludes. Its main job is knowledge theory: verify each claim against its primary source and judge whether it is worth keeping long term; it also catches personal or private data, but that is not its main job. It gates every merge, never parks; a decided claim yields only to a newer human ruling, and `direction`/`contract` decisions need a cited acceptance record (§4.3) | decided by both (model rule, §4.3); gate wording per Pepe's direction of 10 Nov |
| D6 | Writing | **No harvesters, on any base, OATS's public one included** (Pepe's direction, 10 Nov). An instance proposes its own knowledge as a PR at its checkpoints through `oats okf propose`, which runs the validator, the content screen and the write-surface rule before the push; the knowledge maintainer gates every merge; the accepted branch is protected. The `propose` override (`direct` or `harvester`) is dropped; `knowledge: { harvest: off }` stays as the opt-out (also spelled `publish: off`); the harvester soul and the `oats.okf-harvest` capability are removed in 6.0 (§5) | decided by both (Juan's side yes at cf751e9, 10 Nov, with three conditions built in, §5.8); Juan's second read at the PR's exact head before release sign-off |
| D7 | Verdict record | Markdown `Verdict` files under `verdicts/`, written only by the maintainer, keyed by a stable claim id the maintainer assigns at first adjudication; title hashes and lexical similarity are candidate retrieval for the proposer and the reviewer, never a refusal on their own (probe P4: an exact title hash caught 0 of 180 paraphrases) (§2.6) | decided by both |
| D8 | Reading | The spawn brief names the soul's default subjects with one line each; everything else is walked with the verbs in §6 | decided by both |
| D9 | The four area nodes | Their directories stay; their concepts get `about:` edges in the bridge PR; no rebinding is needed, so C2 (removing the area souls) is gated on the 6.0 pin and the merged bridge PR, not on owner changes (§7.5) | decided by both (corrected, §7.5) |
| D10 | Initial workstreams | The eight in §2.1, accepted by Pepe as structure; systems and projects are added by reviewed proposal | decided (Pepe's delegation of 10 Nov, "All fine on the decisions do what you think is best, you have my permission", relayed to setup the same day; the lead accepted the workstream list on it) |
| D11 | Write access in shared workspaces | Needed now that nothing but the instance pushes: each proposing host's forge account needs branch-create on the base repository (OATS's host account already has it); a host's person is asked before its instances propose; proposals are same-repository branches (the helper refuses a cross-repository PR, so there is no fork flow); a host without branch-create proposes through the operator form run from a host that has it; account access is never widened by default; the accepted branch is protected so no account merges but the maintainer's (§5.4) | deployment decision, no build dependency: `propose` pushes with the host's account and reports `E_PUSH_UNCERTAIN` (`auth-*`) when it lacks branch-create; each host's person decides for its deployment, Juan's side for his (§8.2) |
| D12 | Order and errors | 6.0 additive (provenance v3 parser first or in the same release; `propose`; harvester removed with `E_REMOVED` remedies); live bridge rehearsal; bridge PR; souls move declarations; 7.0 removes v1 declarations with named `E_REMOVED` remedies (§7.3) | decided by both (one deployment on Juan's side, one host unchecked); harvester removal moved to 6.0 per Pepe's direction |
| D13 | One base or two | One base for OATS, with product knowledge as workstreams (`oats-direction`, `positioning`) beside the engineering subjects; a second base would double hosting, bindings and review for 418 concepts; commercial material stays out of a public base (§2.8) | decided by both (Juan yes, 10 Nov: one public base; commercial material stays on private bases) |

## 1. Why, and what breaks today

Today's base has one node per soul (14 nodes, 418 concepts: 213 Lesson, 179
Decision, 13 Conclusion, 5 Reference, 5 Limitation, 2 Roadmap, 1 Playbook).
oats.okf keys writing by one owner id per soul: `resolveNodes`
(`oats-package/capabilities/oats-okf/lib/config.mjs:121`) refuses `E_OWNER`
unless every node in a soul's `owns` carries that soul's single `owner` id in
`okf-base.json`. The roster plan (souls split by way of working) therefore
cannot fold four area experts into one engineering expert without rebinding
owners, and a rebinding fails every live home of the old souls at its
registration check and final harvest. The subject layout removes the premise:
a claim is about subjects, not owned by a soul.

The base already behaves as if organised by subject: 271 of the 418 concepts
link into another soul's node (385 cross-node links in all); the most
frequent tags are areas (`kernel` 103, `desktop` 70, `integrations` 42,
`messaging` 33, `operator` 37) and practices (`verification`, `review`,
`testing`, `planning`). Ownership by soul is the layer that fights the
content.

Prior decisions this design keeps (cited at `oats@1b6d6ea7`):

- `oats/nodes/oats-maintainer/decisions/flexible-knowledge-and-situated-instances.md`:
  a mandatory topic model and a permanent one-soul/one-folder rule were both
  rejected; the knowledge capability owns its learning model. This design is
  that capability's model changing, not a kernel taxonomy.
- `oats/nodes/oats-maintainer/decisions/external-knowledge-custody.md`:
  learning never rides the code work branch; Git knowledge changes only by
  reviewed PR. Kept (§5).
- `oats/nodes/oats-maintainer/stewardship/direct-knowledge-proposals-retain-maintainer-review.md`
  (direction, 2026-11-02): working agents open knowledge PRs themselves under
  unchanged doctrine; the package owner must resolve independent judgement and
  write access. §5 is that resolution.
- `oats/nodes/oats-okf-expert/decisions/personal-data-exclusion-is-not-a-publication-guarantee.md`:
  capturer, harvester and reviewer are three judges; removing the harvester
  changes that premise. §5.3 says how it carries forward.
- `oats/nodes/oats-expert/lessons/sort-a-trials-costs-into-design-instructions-or-measurement.md`
  and `.../send-a-hand-off-by-message-to-every-waiter-at-an-exact-head.md`:
  in T7 v2 knowledge PRs stalled because of how the path was woken and
  released, not because knowledge was reviewed apart from code. §5.2.

Knowledge theory (the two-part test, the reject list, promotion) is
`oats/nodes/oats-maintainer`'s and the `knowledge-theory` skill's; this
design changes where a claim lives and who checks it, not what counts.

## 2. The ontology

### 2.1 Subjects

A subject is something knowledge can be about. Three kinds, each a Markdown
file `subjects/<kind>/<slug>.md` with frontmatter (flat scalars and flow lists
only, so the dependency-free validator stays one small parser):

| kind | meaning for OATS | initial set |
|---|---|---|
| `system` | a repository, package, app or service OATS builds or integrates; has a `repo`, optional `depends-on` (each with code evidence in the body) and `in-workstreams` | `oats-kernel`, `oats-desktop`, `oats-okf`, `oats-aweb`, `oats-jira`, `oats-linear`, `oats-authoring`, `oats-apps`, `oats-cloning`, `oats-engineering` (the coordination package), `aweb` (integrated) |
| `workstream` | a lasting area of responsibility or practice with no end date | `oats-direction` (stewardship, project-wide decisions), `coordination` (how agents and people work together), `provider-integration`, `operations` (deployment, onboarding, adoption), `positioning` (research, comparisons), `workspace-administration`, `knowledge`, `messaging` |
| `project` | a bounded effort with an end state: a plan, an epic, a trial series; `in-workstreams`, `status`, a tracker reference | `coordination-rethink`, `okf-5`, `roster-2026-11` |

Workstreams are structure and need the human's acceptance. Since nothing has
an owner, the carrier is the PR's lane maintainer: it carries the person's
words, cited exactly (the message or comment and its date), and the
knowledge maintainer merges a workstream change only on that citation.
Systems and projects are added by any proposer in the same PR as the claims
that need them, reviewed like a claim.

Rejected as subjects:

- **Roles or souls.** "Not personal" is the direction; a `role` subject would
  rebuild the per-soul layout under another name. A soul's name stays as
  provenance (`source-soul`), never as scope.
- **Person, Organization, Meeting, Conversation, Artifact (verbatim
  capture).** OATS's reject list excludes third-party correspondence and
  personal data; its evidence is the repository, issues and PRs, cited by URL
  and commit. OATS's base is agent-authored judgement, not ingested
  correspondence or tracker data, and it names people by role, so a person
  type would have no rows.
- **Signal, Commitment, WorkItem.** Dated facts live inside a claim's evidence
  section; commitments and work items are the tasks layer's. A system
  dependency needs code evidence, so it is a `depends-on` entry on the
  system file with the evidencing commit in the body, not a separate node.

### 2.2 Claims and documents

One canonical file per claim under `claims/<type-plural>/<slug>.md`:

| type | kinds | status | mapped from today |
|---|---|---|---|
| `Decision` | `architecture`, `contract`, `process`, `direction` | `proposed`, `decided`, `superseded`, `reversed`; `decided-by` `human` or `maintainer`; `supersedes: [paths]` | Decision; Roadmap → `direction`, `proposed` |
| `Insight` | `lesson`, `finding`, `constraint` | none | Lesson → `lesson`; Conclusion → `finding` (keeps its evidence limits); Limitation → `constraint` |
| `Requirement` | `principle`, `constraint`, `convention`, `functional` | `proposed`, `accepted`, `dropped`, `superseded` | none today; conventions now embedded in decisions can be pulled out later |
| `Risk` | `technical`, `dependency`, `schedule`, `scope`, `other` | `open`, `mitigating`, `accepted`, `realized`, `closed` | none today |
| `Question` | — | `open`, `answered`, `dropped`; `resolved-by: [decision paths]` | none today |
| `Reference` (document) | — | — | Reference |
| `Playbook` (document) | — | — | Playbook |

Rejected: Limitation → Risk (a limitation is an established fact with a
workaround, not a threat); Roadmap as its own type (a roadmap is a proposed
direction decision; the status field carries it); dropping Reference and
Playbook (they exist and are cited; a document still gets `about:`).

### 2.3 Scope: the About-edge

Every claim and document carries `about: [<kind>/<slug>, ...]` with at least
one subject reference. That list is the About-edge: one decision can be about
three systems and a workstream without living in four places. Unknown
references are refused by the validator (`E_SUBJECT`). The file's directory
says its type; its meaning is its `about`.

### 2.4 Provenance and acceptance

Flat keys: `source-soul`, `source-instance`, `timestamp` (as today),
`accepted-by` (`human` or `maintainer`), `accepted-on`. The body keeps today's
"Evidence and limits" section. A human-accepted decision (`decided-by: human`)
yields only to a newer human ruling, as the review protocol already says.
Two decision kinds never merge on `decided-by: maintainer`: a `direction`
decision needs the person's own ruling, and a `contract` decision needs both
sides' decision as the lane map requires, each cited exactly (`accepted-by:
human`, with the record's reference in the body). The maintainer's
verification step checks the record, not only the claim.

### 2.5 Relations between claims

`supersedes`, `resolves` (Decision → Question), `deviates-from` (Decision →
Requirement: this system breaks that convention on purpose, so "which rules
does this repository break" is one read) and `refines` (any → any), as flow
lists of paths; everything else stays a prose link. Rejected: a full typed
edge vocabulary; OATS's agents read bodies, and prose links are already
validated and resolvable.

### 2.6 The verdict record and claim identity

Every accepted claim carries a stable `id` (stamped by the maintainer at
acceptance; the bridge PR stamps the 418 existing concepts mechanically, for
example from a hash of the original path, and the id never changes after
that). A path is where the file is; the id is what the claim is, so the
optional 7.0 move changes no identity.

When the maintainer closes a proposed claim, or supersedes one, it writes
`verdicts/<id>.md` (`type: Verdict`, `verdict: rejected | superseded |
duplicate`, `claim-type`, `claim-title`, `claim-description` as ruled,
`title-hash` as a secondary index, `reason`, `pr`, `decided-by`,
`decided-on`, and for `duplicate`/`superseded` the canonical id). A rejected
claim that never had a path gets its id at rejection.

The proposer's check (`oats okf verdicts --check`) has three lanes, from
probe P4's measurements on 60 × 3 hand-paraphrased titles against the 418
concepts:

1. **Identity.** A proposal that names a known `id` (a reconsideration or a
   supersession) reads that id's verdict; an unchanged retry of a rejected
   id without new evidence is refused (`E_VERDICT`, with the reason).
2. **Exact title hash.** Catches verbatim and whitespace-only retries
   (60/60 controls) and nothing else (0/180 paraphrases); a hit is a
   candidate, not a verdict.
3. **Lexical candidates.** Token-set Jaccard on title (≥ 0.30) or on title
   plus description (≥ 0.20), union: 144/180 paraphrases found, a wrong
   candidate on 6 of 180 queries, at most two candidates per query. The
   candidates go into the PR body with their verdicts; the proposer says
   for each whether its claim is the same, a reconsideration or different,
   and the reviewer resolves them to canonical ids. Never a refusal: a title
   prefixed with "it is false that" still matches its original at 0.50
   (60/60), so similarity is not agreement.

Rejected: the title hash as identity (P4: wording, not claim identity);
a title-plus-description hash (0/180 too, and one more mutable surface);
refusing on a lexical score (contradictions match); verdicts as PR
comments only (memory on the forge, unreadable offline, not citable);
verdicts in a side database (the base must carry its own memory).

### 2.7 Mapping from today's nodes

| node | primary subject | notes |
|---|---|---|
| oats-kernel-expert | `system/oats-kernel` | |
| oats-desktop-expert | `system/oats-desktop` | |
| oats-okf-expert, oats-aweb-expert, oats-jira-expert, oats-linear-expert, oats-authoring-expert, oats-apps-expert | `system/<package>` | four of these nodes are empty: a subject file each, nothing to move |
| oats-maintainer | `workstream/oats-direction` | `stewardship/` concepts also get the project they steer |
| oats-expert | `workstream/coordination`, many also `project/coordination-rethink` | |
| integrations-expert | `workstream/provider-integration` | |
| oats-operator-expert | `workstream/operations` | |
| market-research-expert | `workstream/positioning` | |
| oats-setup-admin | `workstream/workspace-administration` | |

Secondary subjects are judged, not computed: the bridge PR's author uses
tags and cross-links as hints and the maintainer reviews the result. Probe
P1's heuristic (a tag naming another subject, or three or more body links
into another node) gave 87 of 418 concepts two or more subjects (76 with
two, 11 with three or more; 516 About-edges in all), a floor for what
judgement will find. Four package systems (`oats-jira`, `oats-linear`,
`oats-authoring`, `oats-apps`) have no concepts yet; they get a subject file
and an empty index.

### 2.8 One base

OATS keeps one base. Product knowledge (direction, positioning, users) is
workstreams beside the engineering subjects, so a product decision about a
system carries both in `about:` and no cross-base reference is needed. A
separate product base would double hosting, bindings and review for a base
of 418 concepts, and every cross-base reference would be an unchecked slug
in text. Rejected for OATS now; a second base is a bindings entry later if
the product side ever needs its own review stream.

One rule follows from the base being public: commercial material (pricing,
customers, any partner's specifics) stays out of it, however it is scoped.
If OATS ever needs such knowledge kept, it goes to a private base bound
beside this one, never into a public claim's body or evidence.

## 3. The engine

### 3.1 The three options

**A. Markdown in Git with typed frontmatter and About-edges** (today's bases
extended). Subject views (`subjects/<kind>/<slug>/index.md`, one section
per claim type) and the root index of subjects are generated by a script in
oats.okf and committed; the proposing tool regenerates them and the
maintainer's check diffs them.

What oats.okf changes: the validator parses flow lists and checks `about`
against the subject files and the reserved types; consult gains the verbs
in §6 (reading one committed index per question); `okf.json` v2 (§4);
`oats okf propose` (§5); the maintainer skill gains verification and
verdicts. Bindings, the host-wide bare partial clone cache, receipts
(`alias/path@oid`), the publication helper and the PR flow are unchanged.

**B. A graph store** (Omnigraph). Claims are rows, About-edges are edges,
verdicts are rows, search is built in.

What oats.okf changes: a new base kind beside `git`; a per-host store or a
server every reader can reach; the consult cache, receipts and citations
rebuilt on graph commits; the validator replaced by the schema; the
publication helper and the maintainer's PR review replaced by graph
branches and merges; the public base is no longer readable on GitHub.
Probe P2 ran on Omnigraph 0.12.0.

**C. Hybrid**: Markdown canonical, with a derived query index (JSON or
SQLite) built by `oats okf` from the accepted commit and cached per commit
under `stateDir`. Same contract as A; the first read after a new accepted
commit scans every claim's frontmatter from the partial clone.

### 3.2 Recommendation: A

- The accepted custody decision requires reviewed PRs on Git; A keeps the
  review on the forge where the human already reads and rules.
- The compatibility bridge (§7, verified) exists only for A: a graph store is
  a hard cut for every reader and every other workspace.
- The base is small (418 concepts, 3.9 MB, 330k words). Every verb in §6 is a
  frontmatter query, and with committed indexes each is one blob read from
  the cache. C becomes the fallback only if committed indexes prove
  unmaintainable; the regenerate-and-diff check is what keeps them honest.
- A graph buys typed multi-hop queries, dedup edges and embeddings. OATS's
  agents read bodies; the questions they ask (claims of a type about a
  subject, systems in a workstream, a system's dependencies, a supersession
  chain) are one-hop.

What the probes found:

- **P1 (A, Markdown).** An automatic conversion moved all 418 concepts to
  canonical paths with 0 slug collisions, rewrote 2,673 links with 0 new
  broken links (two already-broken links in the root `log.md` stay broken),
  left every claim reachable from the generated indexes, and passed the
  unchanged 5.8.0 validator (434 concepts, 0 errors, 0 warnings) and a
  flow-list extension of its parser (net +8 lines). From a cold bare partial
  clone, `claims --about` by lazy scan took 10–15 s and fetched all 418
  blobs; with an explicit prefetch, 0.28–0.54 s and 418 blobs; from one
  committed subject index, 0.1–0.2 s and 1 blob (3 KB for `oats-okf`, 38 KB
  for `oats-kernel`). Warm, all three are within noise of each other. The
  spawn-time base validation already prefetches the whole accepted commit
  once, so the index wins on selective I/O, predictable blob demand and a
  readable subject page, not on warm latency. The unchanged validator
  accepts a bogus type and an unknown subject: a green validator today is
  format conformance, so 6.0's semantic checks (`E_SUBJECT`, allowed types,
  index freshness) are the real work, not list parsing.
- **P2 (B, Omnigraph 0.12.0 standalone).** An OATS-only schema (3 subject
  types, 4 claim/document types, Verdict, 16 edge types) loaded the 418
  concepts with 516 About-edges in 0.34 s into a 3–5 MB store; every verb
  answered in 30–100 ms per process; branch, load on branch, commit history,
  historical reads and merge all work standalone, so proposal-as-branch is
  possible. Costs found: no interfaces, so About needs one concrete edge type
  per claim-type×subject-type pair and a cross-type question is one query
  per type; no `branch diff` (change records instead of a text diff);
  nothing in the store requires a reviewer to merge (`--as` is attribution,
  not authority) and no exact-head merge precondition; JSONL export loses
  commit ids, so a citation survives only in a copied native store (same
  host tested, no second machine); and every oats.okf seam changes (binding
  kind, cache, validator, publication gate, maintainer intake, distribution).
  P2's own recommendation: not as the authoritative base on this evidence;
  if typed traversal ever proves worth it, a derived graph index of an
  accepted Git commit is the experiment that keeps citations and review.

Rejected: B for OATS now (the cut and the cost above; OATS ingests nothing
at scale and runs no PM state in its base); C as
the primary (a derived index that is not in the base cannot be cited or
reviewed, and the base should be readable without oats.okf).

## 4. Ownership and review

### 4.1 No soul owns a node

- `okf.json` version 2: `{"version": 2, "subjects": ["system/oats-okf",
  "workstream/knowledge"]}`. `subjects` are reading defaults, not access or
  write scope. `owner`, `owns` and `reads` are gone from v2; v1 keeps working
  through 6.x (§7). The spawn hook resolves each declared subject to its
  file in the bound base (`E_CONFIG: unresolved subject: <ref>` otherwise),
  the same fail-closed check `resolveNodes` does for nodes today, minus the
  owner comparison.
- `okf-base.json` keeps version 1 through 6.x with the reserved nodes
  `claims`, `subjects`, `verdicts` owned by a sentinel id no soul declares;
  version 2 in 7.0 is `{"version": 2, "id", "layout": "subjects"}` with no
  nodes. The `owner` fields become vestigial in the bridge period and are
  dropped in 7.0.

### 4.2 What replaces the owner-id check

A **write-surface rule**, applied twice. It is advisory where the tool
applies it: `propose` runs as the agent's own user with that user's push
rights, so a tool refusal bounds a cooperating agent, not a credential. The
real gate is the maintainer's review at merge, where "rejects out-of-surface
writes" is a checked item.

1. by `oats okf propose` before it pushes: a proposal may add or change files
   under `claims/**`, add files under `subjects/system/**` and
   `subjects/project/**`, and must regenerate the indexes; it may not touch
   `verdicts/**`, `subjects/workstream/**`, `okf-base.json`, the root
   `index.md` by hand, or any old node directory except to set
   `status: superseded` on a concept it supersedes. Outside the
   rule: `E_SCOPE`, naming the path and the rule.
2. by the maintainer's review: `review-context` lists out-of-surface paths
   as findings, the checklist item is explicit, and an out-of-surface change
   closes the PR with a verdict. This is the gate.

Expertise is still not authorization: the rule bounds every proposer the
same way, and nothing in a soul's declaration widens it.

### 4.3 Review: a fresh maintainer per proposal, verifying sources

- A `proposal-review` trigger template (label `okf-proposal`) joins
  `harvest-review` (label `okf-harvest`, kept through 6.x): the kernel ANDs a
  trigger's labels, so one template cannot watch both; each spawns one
  `knowledge-maintainer` per PR as today. Where no trigger is installed, the
  proposer spawns the maintainer itself at the exact head
  (`--relation unrelated`), a call, not a station.
- The maintainer's main job is knowledge theory. `knowledge-review` gains a
  verification step: for each claim, open the cited primary source (the
  repository at the cited commit and at its default branch, the issue or PR,
  the acceptance record for a human decision) and confirm the claim, then
  judge whether it is worth keeping long term (the promotion test, one
  canonical home, supersession); a claim with no checkable source and no
  human acceptance is closed with a verdict, never merged on trust. Catching
  personal or private data is also its job, as the second reader after the
  proposer, but not its main one. Nothing merges without it: the accepted
  branch is protected (§5.5).
- The reviewer runs on a model family other than the proposer's (the
  provenance block names the proposer's model), and on no model a side's
  direction excludes; the trigger's `model` parameter and the proposer's
  spawn of a maintainer both honour that.
- The maintainer never parks: merge, amend and merge, or close with a verdict
  bound to the exact head. A proposal that supersedes a `decided-by: human`
  decision merges only when it cites the newer human ruling.
- The maintainer's own change to the base, a verdict recorded on a
  rejection or a supersession, is itself a PR under the `okf-proposal`
  label, so the trigger spawns a fresh maintainer for it; a maintainer never
  merges a PR it opened. The second maintainer checks only that the verdict
  names the exact head and claim id it closed, states a reason a future
  proposer can act on, and (for `decided-by: human`) points at the human's
  record. Why: a verdict binds every later proposer through lane 1 of §2.6,
  so it needs the same two pairs of eyes as a claim, and a fresh instance has
  no stake in the rejection it reads.
- Lane maintainers hold code merges, not knowledge; the knowledge maintainer
  is one role for the whole base, with no split by subject.

Rejected: a maintainer per subject (recreates ownership); review by the
proposing soul's own expert (the proposer judging itself); no verification
beyond doctrine (the harvester's independent read is what removing it costs,
and verification against sources is the replacement).

## 5. Writing

### 5.1 The working instance publishes its own branch

At a checkpoint the instance keeps today's procedure up to the proposal
(STATE.md, log.md, notes, `knowledge-theory`'s promotion test, the duplicate
search), then writes the claims themselves in the ontology's form under
`proposals/<date>-<slug>/claims/` in its home and runs
`oats okf propose --proposal <dir>`. There is no other path: Pepe's
direction of 10 November is that no harvester runs on any base, OATS's
public one included; an instance proposes its own knowledge as a PR at its
checkpoints, as it works, and the knowledge maintainer gates every merge.
Working instances keep the `knowledge-theory` skill through the capability
(they have it today) to decide what to promote. The command, in the
`oats.okf` capability:

1. validates each claim (frontmatter, `about` resolving to existing or
   proposed subjects, type and kinds), applies the write-surface rule;
2. checks the verdict record with the three lanes of §2.6 (a known rejected
   id without reconsideration refuses; hash and lexical hits go into the PR
   body as candidates) and open `okf-proposal` PRs for duplicates;
3. runs the content screen (`okf-content-screen.mjs`) over every outgoing
   byte, as the harvester does;
4. clones the base at its accepted branch into the home's `work/<alias>`,
   writes the claims to their canonical paths, regenerates the indexes,
   commits with a provenance trailer, pushes create-only to
   `okf-proposal/<UTC date>-<uuid>` with the same lease rule as today's
   helper, opens the PR with a version 3 provenance block (source soul,
   instance, incarnation, declared subjects, evidence note hashes, proposer
   alias) and the label `okf-proposal`;
5. prints the full remote-readback head OID, branch and PR URL, and the
   instance mails them to the reviewer (or spawns it) and goes back to work.
   It never shepherds the PR. The reviewer fetches and reviews that OID, never
   whatever the branch name later resolves to.

`--plan` does steps 1 to 3 and freezes a receipt digest without publishing;
apply names that digest so a changed input or base cannot substitute. The
command derives soul, instance and incarnation from the caller's own
`instance.json`, never from a `Source:` line in prose, and records the proposer
as the publication actor. `accepted-by`, `accepted-on` and a new claim's
`id` are stamped by the maintainer in its amend-and-merge, never asserted by
a proposer.

What probe P3 established on the released 5.8.0 helpers, run from a working
home against a local bare remote: `okf-publication.mjs commit`, the content
screen and the create-only lease push are role-independent and work
unchanged (the branch landed at the screened OID, `main` untouched, no
retry); `create` then stops at its first `gh` call (`gh label create`,
`E_GH`), so the branch-only mode is a split of `create`, not a new transport.
Two non-gates it found shape the command: the helper validates only that a
version-2 provenance fence exists, and the maintenance parser refuses a
source `incarnation` and requires a `harvester` object, so provenance
version 3 is a coordinated writer-and-parser change; and the helper checks
neither ownership nor the ontology (it pushed `claims/` paths the harvest
skill would have refused), so the write-surface rule and `about` resolution
must live in `propose`, before the push, not in the transport.

The refusals are typed and name the remedy: `E_SCOPE`, `E_SUBJECT`
(unknown subject; propose the subject file too), `E_VERDICT` (rejected
before; the verdict's reason), `E_DUPLICATE` (an open proposal already
carries it), `E_CONTENT` (the screen's location/rule, never values),
`E_PUSH_UNCERTAIN` (today's fixed diagnostics). One condition is recovered,
not refused: a pre-push `E_BASE_MOVED` (the accepted branch advanced since
the clone; today's helper checks this twice before pushing,
`verifyBase` in `okf-publication.mjs`). Nothing has left the host at that
point, so `propose` re-clones at the new accepted tip, re-applies the
claims, regenerates the indexes, re-screens and pushes again, a bounded
number of times, before reporting. The maintainer judges against the
accepted tip at review in any case.

### 5.2 Against OATS's own evidence on stalls

OATS's T7 finding was that knowledge PRs an instance had to shepherd alone
sat open for days. The cause sat in how the path was woken and released,
not in separate review. Here nobody shepherds: the proposer hands the head
to a fresh maintainer by message (or spawn) and the maintainer owns landing
and never parks. The proposer's duty ends at the hand-off; a rework request is a message back,
answered by a new head and a new hand-off.

### 5.3 What removing the harvester costs, and what carries it

- **An independent judge with a clean context, before the first push.** The
  harvester read the proposal as untrusted evidence and judged it against
  the base before anything left the host. The maintainer now does the
  judging, with verification against primary sources (§4.3) that the
  harvester never did; two judges remain (proposer, verifying maintainer)
  instead of three, and the second is stronger than before. What is lost is
  timing: on a public base a PR is public the moment it is pushed, before
  the maintainer reads it, and a post-push reviewer cannot undo first
  exposure (P3; this design's own first head is the evidence: a document
  pushed directly to a public branch carried a partner's private material
  for about twenty minutes until a reader caught it). Pepe's direction
  accepts that trade for every base, so the design puts what can be done
  before the push into `propose` and the proposer's skills (§5.6) and says
  plainly what cannot: no script sees private material it has no list for,
  and the accepted personal-data decision that this is not a publication
  guarantee stands. Rejected (superseded by the direction): a per-base
  `visibility` that defaulted a public base to the harvester path, and a
  soul override `knowledge: { propose: direct | harvester }`; neither ever
  shipped, so nothing is removed from a deployment.
- **Source-independent custody.** The harvester snapshotted evidence so a
  retired source could not strand a harvest. In direct proposal the PR itself
  carries the claims and the provenance block carries the evidence hashes;
  the source's retirement cannot strand it. Learning still never rides the
  code branch: the proposal branch is on the knowledge repository.
- **Personal-data exclusion.** The same sentence stays at every teaching
  point; the content screen runs in code before the push, as today; the
  maintainer is the second reader. The accepted decision that this is not a
  publication guarantee stands unchanged.
- **The retired-source path.** A source that retired without proposing (the
  recovery copy case, oats.okf 5.8's #125 design) is published by the
  operator form: `oats okf propose --home <retirement recovery> --soul
  <soul>` from the deployment reads the recovery's proposal and named notes
  and runs the same command, with the recovery named as the source in the
  provenance. No harvester is needed; a person decides to run it.

The reasons are Pepe's direction (2 November: less ritual; 10 November: no
harvesters, the maintainer gates) and one fewer spawn per checkpoint; the
cost is the first point above. The 5.x machinery is not failure-free either, and the design records
tonight's evidence: on 5.8.0, two harvests of this design's own checkpoints
refused with `E_BASE_MOVED`, because the base's accepted branch merged other
PRs while each ran and the helper checks that the tip is unchanged before
pushing; both harvesters are now retained, waiting on a human, although
nothing had left the host. `propose` reuses the same commit, screen and
lease push (P3) and would refuse the same way, which is why §5.1 makes a
pre-push `E_BASE_MOVED` a recovery, not a refusal. The 5.x harvester's
stopping for a human on that pre-push refusal is a package finding reported
as its own issue on `awebai/oats-okf` (#129).

### 5.4 Write access

The harvester pushes and opens PRs with the host user's `git` and `gh`
credentials; a working instance on the same host uses the same. Nothing
changes on a single-operator host. With no harvester, every proposing
host's forge account needs branch-create on the base repository: a host's
person is asked before its instances propose there, proposals are
same-repository branches (the publication helper refuses a cross-repository
PR, so there is no fork flow; a host without branch-create proposes through
the operator form run from a host that has it), and account access is never
widened by default (D11). The accepted branch is protected, so no
proposing account can merge (§5.5). Knowledge declarations grant no access;
`oats okf propose` reports `E_PUSH_UNCERTAIN` with the fixed `auth-*` cause
when the account lacks it.

Rejected: keeping the harvester as the only writer (against the direction,
and one spawn per checkpoint for no gain in acceptance quality once the
maintainer verifies sources); the proposer merging its own knowledge
(never); a reviewer reading the proposal before the push without a branch
(there is no place but the forge for a second instance to read it, so
"review before push" is the harvester path by another name).

P3 also found that the published helper stamps a fixed `OKF harvest` Git
author regardless of caller: attribution text, not authentication, and not
provenance. `propose` keeps provenance in the block and the trailer, and may
change the author text.

### 5.5 Branch protection

The knowledge repository's accepted branch is protected: no direct push,
changes by pull request only, merge restricted to the knowledge
maintainer's account, no force-push or deletion. The setup skill
(`okf-trigger-setup`; 6.0 kept the name and added a section "Protect the
accepted branch" rather than renaming it, so existing references stay
valid) says so as a requirement of a Git base and gives the GitHub steps (a
branch ruleset or classic protection on the accepted branch; the maintainer
account as the only one allowed to push to it), and `oats okf bases`
reports `protection: enforced|none|unknown` with the question the field
answers. Deployments that protect by other means
meet the requirement; the instruction is the floor.

Reporting: the binding `check` (readiness) and `oats okf bases` read the
rules on the accepted branch through the forge's branch-rules endpoint
(readable with read access on a public repository) and report
`protection: enforced | none | unknown`; `none` is a readiness warning
(`base-branch-unprotected`, with the setup skill named), `unknown` (no
access, not GitHub) a note. A read-only, best-effort report, never a
refusal: `oats okf doctor` is not a thing, so readiness is where it shows.

### 5.6 What the proposer runs before the push

The harvester's pre-push screen does not disappear; it moves into
`propose`, which runs on the proposing host before anything leaves it:

1. The structural validator (`okf-validate.mjs --strict`) and the
   ontology checks (`E_SUBJECT`, types and kinds, the write-surface rule).
2. The content screen (`okf-content-screen.mjs`), unchanged, over every
   outgoing byte: commit objects, paths, blobs and the PR body; the fixed
   rules (credentials, reserved patterns, personal-data shapes) refuse with
   location and rule, never values. Bounded detection, as today.
3. A host-private term list, new: the host setting `screen-terms-file`
   names a file of terms (organisation names, project codenames, people)
   the screen refuses wherever they appear. Private to the host, never in
   the base, so a deployment can name what it must keep out without
   publishing the list. Optional; absent means the fixed rules only.
4. The exclusion list as instruction: `knowledge-theory`'s reject list and
   the shared personal-data sentence are in the proposer's skills
   (`okf-instance-knowledge`, `knowledge-theory`, `okf-propose`), and
   `okf-propose` gains one required step: run `propose --plan` and read
   the plan's full outgoing diff once as a reviewer would, against that
   list, before apply. A proposer that skips it is the risk the direction
   accepts; no script replaces the reading.

### 5.7 What replaces the harvester's source checks

| the harvester did | now `propose` does | now the maintainer does |
|---|---|---|
| established the source from the deployment's records (live home or recovery), with incarnation and history consistency | reads soul, instance and `createdAt` from the caller's own `instance.json` in the home it runs in (or the named recovery, operator form); writes them into provenance v3 as the proposer; consistency, not authorship, as today | `review-context` validates the v3 block strictly; where the deployment is reachable it checks that the named instance exists or retired; otherwise it records the source as reported |
| refused an opted-out soul from the recorded soul text | refuses `E_OPTED_OUT` when the spawn-recorded policy (`okf-harvest-policy.json`, written by the spawn hook from `knowledge: { harvest: off }` or `publish: off`) says off | closes a PR whose provenance names an opted-out soul, if one ever arrives |
| read bindings and owned nodes from the record | reads the bindings from the home's settings as consult does; the write surface replaces owned nodes (§4.2) | checks the write surface at merge (§4.2) |
| snapshotted the proposal and the named notes with hashes | hashes the named notes into provenance v3 `evidence`; the PR carries the claims, so no snapshot is needed for custody | reads the evidence list; a missing or unreadable note weakens its claim |
| checked open and recent harvest PRs for duplicates | checks open `okf-proposal` PRs and the verdict record (§2.6) | re-checks against the accepted tip and resolves candidates to ids |
| judged the claims against the promotion test | the proposer judges with `knowledge-theory` (the skill it has) | the independent judgement, now the gate (§4.3) |
| validated, screened, published with provenance | the same scripts, same lease push, provenance v3 | reads the PR at its exact head; merges, amends and merges, or closes with a verdict |

### 5.8 Migrating off the harvester

- A harvester already running at the 6.0 pin keeps its 5.x modules (a
  running home never changes) and finishes or is retired by a person;
  `oats okf status` run from the deployment lists such homes as
  `legacy-harvester`. A harvester retained after a publication failure is
  retired by a person; its source re-proposes with `propose` if live, or a
  person runs the operator form on the source's recovery.
- The `knowledge-harvester` soul and the `oats.okf-harvest` capability are
  reduced in 6.0 to a stub whose required spawn hook refuses every spawn
  with `E_REMOVED` naming the change and the fix (run `oats okf propose`
  from the instance home, or the operator form on a recovery; delete the
  harvester's `souls.launch` keys and `--provider` harvest flags; add the
  `proposal-review` trigger beside `harvest-review`), because a bare
  unknown-soul error tells a deployment nothing
  (Juan's side's condition). The stub leaves the package in 7.0. The `okf-authoring` scripts the proposer needs
  (validator, screen, publication helper) move into `oats.okf`, with the
  maintenance copy kept byte-identical.
- A `proposal-review` trigger template (label `okf-proposal`) is added
  beside `harvest-review` (label `okf-harvest`, kept through 6.x), so a PR
  opened by a 5.x harvester before the pin still gets its maintainer; the
  old template is removed in 7.0 (`E_REMOVED` naming `proposal-review`).
- `knowledge: { harvest: off }` keeps its meaning (this soul's instances
  never publish knowledge) and gains the spelling `publish: off`;
  `propose: harvester` or `propose: direct` in a soul is refused at spawn
  with `E_CONFIG: knowledge.propose is not a setting; instances propose
  directly in oats.okf 6; use harvest: off to opt out`, since neither ever
  shipped.
- `oats okf status` keeps its `harvest` key (`on|off`) for readers that
  know it and adds `publish` with the same value.
- Three conditions Juan's side attached (10 November), built in whatever the
  final answer: the proposer's pre-push screen is the same screen the
  harvester's publication uses today, moved, not a weaker copy; removing the
  soul refuses with an error that names the change (what to delete from the
  deployment's configuration, what replaces the harvest) and the release note
  carries the hand steps; every instance's knowledge instructions change in
  the same release, so no text says a harvester decides what is promoted or
  that an agent waits for one. Pepe's word is to build without waiting; the
  merge waits on Juan's yes.

## 6. Reading

### 6.1 What a soul declares

`okf.json` v2 `subjects`: the subjects a fresh instance reads first. The
whole base stays readable; defaults are a starting point, not access.
Example for this soul: `["system/oats-okf", "workstream/knowledge",
"workstream/provider-integration"]`.

### 6.2 What goes into the prompt at spawn

Today's one-paragraph brief, with the owns/reads clause replaced by one line
per default subject: its title, one-line description and claim counts by
type, for example `system/oats-okf — The knowledge provider package (12
decisions, 9 insights, 1 reference)`. At most eight lines; the index is read
by the agent, not injected. Rejected: injecting subject indexes (the brief
must stay small).

### 6.3 How an agent walks from there

| verb | answers |
|---|---|
| `oats okf subjects [--kind K]` | the subjects, one line each |
| `oats okf subject <ref>` | the subject file: description, systems in a workstream, projects, `depends-on` and dependents, claim counts, start-here |
| `oats okf index [<ref>]` | the default subjects' generated indexes (no argument), or one subject's |
| `oats okf claims --about <ref> [--type T] [--kind K] [--status S]` | claims scoped to a subject, title and description each |
| `oats okf cat`, `links`, `ls`, `search`, `bases` | as today, same paths and receipts |
| `oats okf verdicts --check <claim file>` | the identity, hash and lexical lanes of §2.6, for a proposer |

Every answer keeps today's receipt (`alias@oid`) so a citation stays
`alias/path@oid`. The `okf-consultation` skill's start-of-task loop becomes
index of defaults → subject pages → claims → bodies, with search before any
design decision as now.

## 7. Migration and compatibility

### 7.1 The bridge, verified against 5.8.0

A version-1 `okf-base.json` may list `claims`, `subjects` and `verdicts` as
ordinary nodes (each with `index.md` and `log.md`, owner the sentinel
`00000000-0000-0000-0000-000000000000`), and existing concepts may carry
`about:` and `kind:` beside their frontmatter. Checked on a scratch clone of
the base at `1b6d6ea7` against the 5.8.0 code: `metadata()` accepted 17
nodes; the strict validator reported 420 concepts, 0 errors, 0 warnings; the
5.8.0 consult CLI over a local Git binding served `bases`, `ls`, `cat` and
`index` for the new paths. So:

- **Accepted paths stay valid literally** (Juan's condition): no concept
  moves, no redirects, old `owns` and `reads` resolve, old citations resolve.
- **Live homes of souls to be removed keep working**: a 5.x area home
  consults and harvests into its old node exactly as today.
- **Other workspaces keep working**: a base without the reserved nodes is a
  plain v1 base, served as today by 5.x and 6.x alike; other workspaces'
  bases are untouched.

The layout is detected by the reserved node names, because 5.x refuses
unknown keys in `okf-base.json` and any non-Markdown file inside a base.

### 7.2 What the bridge PR does (the knowledge maintainer, human-accepted)

One reviewed PR on `oats-knowledge`: add the reserved nodes, the subject
files (§2.1), `about:` on all 418 concepts (primary subject from §2.7,
secondary subjects judged), `kind:` where the type maps (§2.2), a stable
`id` per concept (§2.6), and the generated subject indexes. Each subject
file records the old nodes it absorbs (`legacy-nodes: [oats-kernel-expert]`),
which is the map a 6.x harvester uses to add `about:` to a claim landed
through a v1 `owns`. No file moves. The release note on `oats-okf` names the
convention. The PR is reviewable as a diff of frontmatter and new files; the
5.8.0 validator must pass on it.

**Condition before the PR: a live rehearsal**, because §7.1's checks were
library-level and local-binding. In a scratch deployment bound to a bridged
scratch copy of the base: a 5.8.0 home of a soul that owns an area node
spawns, consults (`index`, `cat`, `search`), proposes and harvests into its
node, and runs its final harvest at retirement; a 6.0 home with a v2
declaration spawns, consults through the subject verbs and proposes with
`propose`. Each home also reads by its old paths (`cat`, `search` on
`nodes/<node>/...`), and the `alias/node/concept.md@oid` citations in a
live home's STATE.md and notes must still resolve. All of it must pass
before the bridge PR opens; a refusal is reported with its code and stops
the order.

This re-labels accepted content; it does not re-judge it. OATS's concepts
keep their files, bodies and acceptance; the only judgement in the bridge is
the secondary subjects, and the maintainer's "rebuilt by audit, never
bulk-copied" rule
(`oats/nodes/oats-maintainer/decisions/domain-expert-rebuild.md`) is about
content, which this PR does not touch. The cutover is in place, with no
parallel base: one accepted commit is the old layout, the next is the bridge.

### 7.3 The order of contract changes, and the errors

| step | change | existing deployments see |
|---|---|---|
| **oats.okf 6.0** (additive) | validator v2 (flow lists, `about`, reserved types, `E_SUBJECT`); the verbs of §6; `okf.json` v2 `subjects` accepted beside v1 `owns`/`reads`; `oats okf propose` (live and operator forms, §5.6, §5.7); the harvester soul and `oats.okf-harvest` removed, `okf-authoring` scripts moved into `oats.okf`, `proposal-review` trigger added beside `harvest-review` (§5.8); branch-protection report in readiness (§5.5); maintainer verification and verdicts; provenance version 3 with its maintenance parser landing first or in the same release, so no 5.x maintenance run meets a v3 block it cannot read; `propose` writes `about:` on every claim and, for a v1 declaration, lands it in the owned node (the `legacy-nodes` map, §7.2); `instance upgrade` adopts 5.x homes | a running 5.x harvester finishes or is retired by a person (§5.8); `oats spawn oats.okf/knowledge-harvester` is refused by the stub soul with `E_REMOVED`; a soul with `knowledge.propose` is `E_CONFIG` with the remedy. A v1 declaration on a bridged base: `E_OWNER` still applies to `owns`, as today. A v2 declaration on a base without reserved nodes: `E_CONFIG: base <alias> has no subject layout; declare owns/reads (v1) or bridge the base (release note §7.2)` |
| **live rehearsal** (scratch deployment, bridged scratch copy) | §7.2's condition: a 5.8.0 area home and a 6.0 v2 home spawn, consult (new and old paths, old citations), propose and retire against it | nothing; a refusal stops the order |
| **bridge PR** (after the rehearsal; readers on 6.0 or 5.x, both fine) | §7.2 | none; 5.x homes unchanged |
| **souls move** | each soul's `okf.json` to v2 as its repository releases; area souls removed (C2) | a soul still on v1 keeps `owns`; its homes keep proposing into its node through `propose`, which adds `about:` |
| **oats.okf 7.0** | `okf-base.json` v2 (no nodes); optional physical move of old node concepts into `claims/` with a committed redirect map that `cat` follows (receipt gains `moved-from`); v1 declarations: `E_REMOVED: okf.json owns/reads were removed in oats.okf 7.0; declare subjects: [...] (see <release note>)`; the sentinel owner and `E_OWNER` gone; the `harvest-review` template and the `okf-harvest` label match removed with `E_REMOVED` naming `proposal-review` | a 5.x or 6.x home against a v2 base: `E_BASE` as today for an unknown version, with the release note named; the operator respawns or upgrades |

The 7.0 physical move is optional and separate: the path is history, the
`about` is meaning, and leaving old paths in place costs nothing but a
longer subject index. Probe P1 shows the move is mechanical when wanted
(418 files, 2,673 links rewritten, a 472-entry redirect map, no new broken
links); the `id` makes it identity-preserving.

### 7.4 Other workspaces

A deployment that binds `oats-knowledge` keeps consulting through the bridge
on 5.x or 6.x: OATS's own, and one deployment on Juan's side (one host
unchecked, D12). A deployment with its own v1 base is unaffected by 6.0 and bridges
when it chooses; 7.0's `E_REMOVED` remedies name the bridge.

### 7.5 The four area nodes

`oats-kernel-expert`, `oats-desktop-expert`, `integrations-expert`,
`oats-operator-expert` become `system/oats-kernel`, `system/oats-desktop`,
`workstream/provider-integration`, `workstream/operations` in the bridge PR;
their directories stay and their concepts carry `about:`. Nothing is rebound,
so the roster's C2 no longer waits on an owner change or on the last live
area home's final harvest: a live 5.x area home keeps harvesting into its
node and a 6.0 one proposes into it, and once the area souls are gone their `owner` ids are
vestigial until 7.0 drops them. C2 is gated on the 6.0 pin **and** the
merged bridge PR: a v2 `subjects` declaration on a base without the
reserved nodes is `E_CONFIG` (§7.3, row 1), so `oats-engineering-expert`
can declare the four subjects instead of reading four nodes only once the
bridge is accepted.

## 8. Decisions for both sides

See §0, whose status column records each decision; as of 10 November every
decision is decided by both sides (D10 by Pepe's delegation), D11 is each
deployment's own with no build dependency, and nothing in this design waits
on a decision. Each row's
alternatives and reasons are in the section it points to.

### 8.1 What changes for an existing deployment at the 6.0 pin

1. New spawns get `oats okf propose` and the `okf-propose` skill's new
   checkpoint (write claims, `--plan`, read the diff, apply). Nothing else
   in a home changes; running homes keep their modules.
2. `oats spawn oats.okf/knowledge-harvester` is refused by the stub soul's
   required spawn hook with `E_REMOVED`, naming the change and the fix.
   A running harvester finishes or a person retires it; a retained one is
   retired and its claims re-proposed by the source or by the operator form
   on its recovery (§5.8).
3. Add the trigger `from: oats.okf:proposal-review` beside
   `oats.okf:harvest-review`, which keeps watching `okf-harvest` through 6.x;
   remove the old one once no 5.x harvester can open an `okf-harvest` PR;
   the maintainer's trigger `model` must honour the model rule.
4. The forge: protect the accepted branch of every Git base as §5.5 says
   (`oats okf bases` reports `protection: enforced|none|unknown` until then); give each
   proposing host's account branch-create; there is no fork flow (D11).
5. Optional: a host-private `screen-terms-file` under `settings.oats.okf`.
6. No change to bindings, `okf.json`, `okf-base.json`, the base layout or
   any error code a deployment handles today; the bridge (§7) is separate
   and later.

### 8.2 Questions for Juan's side (status 10 Nov: 4 and 6 accepted; 1, 2, 3 and 5 are Juan's for his own deployments, which adopt the release when he answers; none blocks the build)

1. First-push exposure on the public base is accepted by Pepe's direction
   for OATS; does Juan's side accept it for the deployment that binds
   `oats-knowledge`, or does it want that deployment's proposers to go
   through the operator form from a host it trusts until the maintainer has
   read (which does not remove exposure, only moves it)?
2. Branch protection on `oats-knowledge`: who holds admin, and is
   "merge by the maintainer's account only" acceptable?
3. D11: which hosts on Juan's side will propose to `oats-knowledge`, and
   do their accounts get branch-create, or do they propose through the
   operator form from a host that has it?
4. The operator form `propose --home <recovery>` as the replacement for
   the recovery harvest: acceptable?
5. The model rule: the proposer is the working instance on its own model;
   the maintainer's model is constrained (§4.3). Does the rule constrain the
   proposer too, now that it publishes?
6. The `harvest-review` template's life beside `proposal-review` (through 6.x) and the `okf-harvest`
   label match: long enough for the PRs 5.x harvesters opened on Juan's side?

## 9. What was probed and what each probe found

Four children (reports in [`2026-11-09-knowledge-base-by-subject-probes/`](2026-11-09-knowledge-base-by-subject-probes/README.md)), each on a different model from the author's (author:
`claude-fable-5.1`; probes: `github-copilot/gpt-6-astra` on pi), each in a
scratch copy of the base under `/tmp/kb-design/`, never the real base.

| probe | approach | result |
|---|---|---|
| P1 | Markdown engine: automatic conversion of the 418 concepts, link rewrite, generated indexes; `claims --about` by scanning frontmatter from a bare partial clone vs one committed index; the validator's flow-list extension | conversion complete (418/418, 2,673 links rewritten, 0 new broken, 87 concepts with ≥ 2 subjects by heuristic); cold lazy scan 10–15 s / 418 blobs, prefetched scan 0.3–0.5 s / 418 blobs, committed index 0.1–0.2 s / 1 blob; parser +8 lines; the unchanged validator is format conformance only. Recommends committed indexes. Report [`p1-markdown-engine.md`](2026-11-09-knowledge-base-by-subject-probes/p1-markdown-engine.md) |
| P2 | Graph store: OATS's own small schema on Omnigraph 0.12.0 standalone; load, verbs, branch/merge as review, export for other machines; what oats.okf would change | storage, typed traversal, search, branches, history and merge all work locally (load 0.34 s, verbs 30–100 ms); no interfaces, no `branch diff`, no reviewer requirement or exact-head merge gate, JSONL export loses commit ids; every oats.okf seam changes. Recommends against a graph-authoritative base now. Report [`p2-graph-store.md`](2026-11-09-knowledge-base-by-subject-probes/p2-graph-store.md) |
| P3 | Direct proposal: which harvester steps run unchanged from a working home; the publication helper against a local bare remote; the `propose` surface; write access | commit, screen and lease push run unchanged from a working home against a local bare remote (branch at the screened OID, `main` untouched); `create` stops at `gh label create` (`E_GH`) with no `gh`; the helper enforces neither ownership nor ontology and validates only a version-2 fence; the maintenance parser refuses a direct-source block (needs `harvester`), so provenance v3 is a coordinated change; no judgement competence is tied to the harvester role, but the pre-push second judge is a real timing loss (§5.3). Report [`p3-direct-proposal.md`](2026-11-09-knowledge-base-by-subject-probes/p3-direct-proposal.md) |
| P4 | Verdict matching: exact title hash vs cheap second lanes on 60 × 3 paraphrases | exact hash 0/180 (60/60 on whitespace-only controls); Jaccard title ≥ 0.30 or title+description ≥ 0.20: 144/180 found, 6/180 queries with a wrong candidate; a denied title still matches at 0.50 (60/60), so similarity is never a verdict. Recommends a stable maintainer-assigned claim id as identity and candidates for the reviewer. Report [`p4-verdict-matching.md`](2026-11-09-knowledge-base-by-subject-probes/p4-verdict-matching.md) |
| bridge | author: reserved nodes + `about:` on a v1 base against 5.8.0 `metadata()`, strict validator and consult CLI | passes unchanged (§7.1) |

## 10. Limits

- Every compatibility claim so far is a library-level or local-binding
  rehearsal on 5.8.0 code; the live rehearsal of §7.2 is a stated condition
  of the bridge PR, not yet run.
- The probes ran on one host with local `file://` transport and warm OS
  caches; P1's timings are not network measurements, P2's are process-level
  on one binary version, P3 never reached GitHub, and P4's paraphrases were
  written by one model on 60 concepts (three correlated queries each), so
  its rates are synthetic, not production recurrence.
- Verification against primary sources is specified as a skill step; whether
  a model does it reliably is a trial question, not settled here.
- Without a harvester, the pre-push reading of the plan's diff (§5.6) is an
  instruction the proposer follows or does not; the screen and the term
  list are bounded detection; first-push exposure on a public base is a
  trade the direction accepts, not a solved problem.
- One deployment on Juan's side binds `oats-knowledge` and one host is
  unchecked (D12); the bridge is safe for 5.x readers either way.
