# Probe P3 — direct working-instance proposals

## Question

Can a working instance replace the harvester by writing a knowledge-base branch and handing its exact head to a reviewer? Which released oats.okf 5.8.0 pieces remain useful, and what must change?

**Short answer:** the local commit, content screen and create-only Git push are already caller-role-independent. The released end-to-end procedure is not: it assumes a harvester snapshot, node ownership, GitHub PR publication and v2 provenance requiring a harvester. A branch-only proposer needs a new orchestration/receipt/provenance surface, not a new Git transport implementation.

### Version and authority boundary

- Exact released tag: `v5.8.0`, peeled commit `cfc595a9edea7f08f5094a848dc260e1ac162e0b`.
- The supplied `./work` was actually at **`1d74816e8bb245a8c464a6e82ef94caf5d771169`**, after the release; its package version still says 5.8.0. I extracted the tagged capability files into scratch and exercised those, not HEAD. Post-release uncertain-push diagnostics and retired-4.x-source changes are not attributed to the release.
- Base copy: accepted `1b6d6ea70f713176e7ce448ce849343a2bc6c986` from the supplied local clone. No GitHub clone/fetch was used for the experiment; only ordinary read-only `oats okf` consultation used the accepted remote knowledge capability. No external push, PR, accepted-base edit, deployment change or repository-code change was performed.
- The task's explicit local-bare-push experiment is treated as the exception to its general no-remote-publication rule. All write destinations were local scratch.

## What I built

Everything executable for the spike is under `/tmp/kb-design/P3/`:

- `released/`: unmodified tag exports of the harvest and maintenance capabilities.
- `base/`: a local, non-hardlinked clone of the supplied knowledge repository, at the accepted commit; bundle root is `knowledge/`.
- `origin.git/`: initialized using `git init --bare`, seeded by a local fetch of the accepted commit, with only `main` and the probe branch. It has no upstream remote.
- `base`'s sole configured remote is `file:///tmp/kb-design/P3/origin.git`.
- One new claim: `knowledge/claims/insights/scratch-review-boundary.md`, `type: Insight`, `kind: finding`, `about: [system/oats-okf]` and source soul/instance fields.
- One subject definition, one subject-view index, and a root-index link. Four changed files total, **38 added lines**, no existing concept modified. This is a minimal fixture alongside the old nodes, not a corpus migration or a generated-index implementation.
- No `accepted-by`/`accepted-on` values were invented for this unaccepted fixture. That part of the sketch must be stamped at acceptance, not falsely asserted by a proposer.
- `artifacts/commit.txt` and `artifacts/pr.md`: native-file-written publication text. The latter deliberately represents a direct source: v2 plus source incarnation, **without** a fictitious harvester.
- `run-probe.mjs`: runs the unmodified released helpers from this working instance's home. Its child environment has a scratch HOME/XDG directory and a PATH containing real Git only. Node runs by its absolute executable path. **`gh` is absent**, not a success fake. No host GitHub credentials are passed into those children.
- `artifacts/observations.json`: safe JSON results and readbacks. No raw Git/gh stderr is retained in the report. The live working instance was not disguised as a harvester, and no harvest snapshot was manufactured.

Tools exercised: **Git 2.55.0**, **Node v26.12.1**.

## What I measured/observed

### Local commit and create, end to end to the GitHub boundary

Single measured executions; durations are local wall-clock observations, not benchmarks.

| Operation | Result | Duration |
| --- | --- | ---: |
| `okf-validate.mjs <base>/knowledge --strict --json` | Exit 0; **420 concepts, 0 errors, 0 warnings** (418 inherited + 2 new) | 127 ms |
| Released reviewer `parseProvenance` on the direct-source body | Invalid: source incarnation is an unknown v2 field; harvester object is required | — |
| Stage the four paths; `okf-publication.mjs commit` with accepted OID as both base and head | Exit 0; committed | 139 ms |
| `create` with no `--github` | **`E_USAGE`, exit 2**; argument parsing, no push | 46 ms |
| `create --github file:///…` | **`E_GITHUB`, exit 2**; owner/repo syntax check, no push | 48 ms |
| `create --github scratch/probe` with `gh` absent | **`E_GH`, exit 2**, after the local push | 184 ms |

**Exact stop:** released `okf-publication.mjs:361`, the first `gh` call in `create`, **`gh label create`**. The executable lookup condition is **`ENOENT`**, mapped to **`E_GH`** by the helper. `gh pr create` is never reached. `scratch/probe` was syntactic fixture input only; no command could contact that GitHub repository.

**The create-only lease push worked.** The helper used:

`git push --porcelain --no-signed --no-follow-tags --recurse-submodules=no --force-with-lease=refs/heads/okf-harvest/p3-direct: origin <screened-OID>:refs/heads/okf-harvest/p3-direct`

The empty expected-old lease requires a new ref; the helper requires porcelain `*` confirmation and reads the ref back before advancing to `gh`. Local readback confirmed:

- Candidate and remote branch head: **`e4048a302b9fcb5ec50a7e34f8a158b0cf9d66c7`**.
- Remote `main` unchanged: **`1b6d6ea70f713176e7ce448ce849343a2bc6c986`**.
- Scratch worktree clean after the helper commit.
- Both author and committer: **`OKF harvest <okf@localhost>`**, regardless of this working instance's identity.
- No retry after the post-push `E_GH`; branch and artifacts remain for inspection.

This is actual Git file-transport behavior, not a fake-CLI assertion. It proves neither authenticated GitHub pushing nor PR creation, labels, delivery or acceptance.

### Two important non-gates

1. **`create` validates one JSON provenance fence and `version === 2`, not the complete provenance schema.** It pushed this direct-source body despite the released reviewer rejecting it. `source.incarnation` is present in the private source snapshot today, but absent from the allowed public v2 fields. Removing `harvester`, or just adding incarnation, requires a coordinated schema/consumer change; do not pretend the working instance is an independent harvester to make v2 parse.
2. **The publication helper enforces neither node ownership nor the subject ontology.** It never reads `instance.json`, `okf.json`, `okf-base.json` or `harvest-source/`, and never invokes the structural validator. The fixture's `claims/` and `subjects/` paths are outside `nodes/oats-okf-expert`, yet commit/push succeeded. The existing skill's ownership/diff gates would disallow them. A helper success is not permission to use those paths in production.

The unchanged structural validator accepts freeform `Insight`/`System` types and the `about` flow-list text. It does **not** resolve About-edges, require nonempty lists, check subject kinds or verdict hashes, generate indexes, or enforce that accepted-attribution fields are reviewer-written. Its parser stores frontmatter values as strings; this is syntactic compatibility, not ontology support. For general runs, `--strict` reports warnings but makes them exit-nonzero only when `OKF_STRICT_EXIT` is set; this run had no warnings either way.

## Answer

### Step table: keep, adapt, drop

“Runs as is” refers to the code/operation, not to current authorization or whether the ordinary working capability ships that script. Today `okf-authoring`/publication helpers are composed for knowledge operations, not this ordinary working instance; a supported proposer needs them packaged through its capability or exposed behind its command.

| Released step / component | Runs as is | Needs a change (what) | Drops (why) |
| --- | --- | --- | --- |
| Skill §1: read one proposal in TASK.md | Reading claims, rationale and cited evidence as data | Direct proposer input must not overwrite its actual TASK. Use explicit claim/evidence inputs and derive source identity from the caller's record, not a user-supplied Source assertion | Legacy 4.x run/task intake is not part of a new self-propose flow |
| Required harvester spawn hook and skill §2 | `checkSource`/`snapshotSource` do **not** require a harvester principal; their exported routines can be called with checked task/deployment/destination arguments | Replace “spawn then read `harvest-source/`” with per-proposal capture in the working instance. Keep live record/incarnation/history consistency, soul opt-out, bindings and bounded atomic snapshot protections. One fixed `harvest-source/` directory refuses reuse, so it is not a multiple-proposal command interface | Harvester spawn, identity mint, lifecycle relation and separate home are unnecessary for direct proposals |
| Source-snapshot retired-source path | Useful unchanged for a separately authorized import of old source evidence | Cross-host verification cannot walk another host's deployment/events/recovery paths; use a portable provenance/evidence receipt with explicit trust limits | Normal self-propose is live; retired-source lookup is not its main path. Do not silently drop it for historical imports |
| Skill §3: only named notes, hash what was read | Path containment, no symlinks/nonregular files, bounded reads, stable-byte hashes and missing/refused-note outcomes | Capture in a per-proposal receipt; retain reviewer-usable evidence independently of source retirement. A hash alone neither supplies the bytes nor proves authorship. Align snapshot's 128-note and reviewer v2's 100-note limits | No need to interview the source or sweep its home/transcript |
| Skill §4: clone accepted Git base | Full local clone, bound locator/root/accepted branch and pinned base OID | A subject-based destination still needs recorded configuration, never destination from claim prose | No directory-base PR path exists to reuse; continue to refuse unsupported backends |
| §4 ownership intersection; §6 owned-node edit scope | Existing `okf.json owner + owns` intersected with accepted `okf-base.json` is reusable **only for the old node design** | Subject paths need a reviewed replacement policy: allowed proposal namespaces, metadata protection and reviewer jurisdiction. `about` is routing, not write authority. It is not a mechanical rename of `owns` | Drop per-soul-node placement only when the replacement policy is adopted, not because helpers fail to check it |
| Skill §5: open/recent PR duplicate check | Existing explicit-repository `gh pr list` calls can run from a worker with credentials | Add all pending direct proposals/branches, complete/paginated PR coverage, accepted claims and durable verdict records. Existing queries are instruction-level, labelled-open + last 20 merged, not a dedup transaction | Nothing drops conceptually; a no-PR flow cannot rely on labelled-PR discovery |
| Skill §6: promotion/canonical-home judgment | Worker can apply the same self-check; reviewer can apply the independent check | Reviewer must explicitly own semantic duplicate/supersession/exclusion judgment and receive adequate evidence at a pinned head | Drop the extra harvester model invocation, not the judgment duties |
| Skill §7: whole-base `okf-validate.mjs` | Unchanged for generic Markdown/frontmatter/link lint; no identity or snapshot dependency | Add subject/About/verdict validation and generated-view checks. Enforce warning-free producer output explicitly | Do not replace structure checks with content screening, or vice versa |
| `okf-content-screen.mjs`; publication `screen`, `screen-text`, `screen-tree` | Unchanged, bounded byte/content screening; no caller identity, snapshot or ownership dependency | Continue contextual people/private-path review; these regex rules are not universal privacy enforcement | Nothing |
| §7: diff-path and contextual content review | Same old-node scope review is reusable for old-node proposals | Allowed subject/claim/generated-view paths need a new policy. The gate must check it before push rather than infer it from About-edges | Nothing |
| §8: safe text files, fresh UUID branch, explicit OIDs and quoted arguments | Reusable; no identity-derived ref or credential needed | Working instance gets a per-proposal artifact directory and operation receipt; retain safe errors and partial state | Harvester naming/retirement bookkeeping is not proposer bookkeeping |
| `okf-publication.mjs commit` | **Observed unchanged** from worker home; staged-tree capture, screen and local old-head CAS work | Fixed “OKF harvest” author is harmless transport metadata but not truthful role-specific attribution. Change wording if desired; real provenance must remain separate. It requires `head == base`, so this is not arbitrary incremental editing of an existing proposal branch | Nothing in safe commit mechanics |
| `screenedPush` / create-only lease | **Observed unchanged** against the bare file remote; exact screened OID and new-ref/readback checks | Expose a supported branch-only submit operation which validates provenance/scope first and returns a receipt; today this is an exported function, not a standalone CLI verb | Nothing in the push safety checks |
| `create` GitHub label/PR steps | Can run unchanged from a worker **only if** using current branch prefix, current provenance and a GitHub target/credentials | Branch-only design needs to decouple submit from GitHub; optional PR mode needs updated provenance and truthful partial-outcome reporting | GitHub label/PR creation drops for branch-message-only review, not for retained PR mode |
| §8 public v2 provenance block | Source soul/owner/instance, checked base metadata, note hashes and task refs remain useful | New version/mode: source incarnation; explicit proposer instead of mandatory harvester; subject/claim scope; accepted base and evidence receipt references. Update reviewer parser/read-context, not only the writer | Do not fabricate a harvester field or claim independent capture |
| §9 handover/retirement/failure retention | Preserve artifacts, report safe codes, distinguish pushed/opened/labelled/reviewed/accepted, stop after uncertainty | Send reviewer a configured, screened, exact-head handoff; report send result separately. Worker retains its ordinary task/lifetime. Define delivery retry/dedup separately from Git publication | Harvester self-retirement and source-notification-as-separate-agent become unnecessary |

### What proposer-side orchestration must provide

The helper today is a **Git/content publication gate**, not a proposal controller. In particular it provides no source attestation, evidence capture, schema-complete provenance validation, ownership check, knowledge judgment, duplicate query, durable verdict lookup or reviewer messaging.

**Provenance without a harvester:** derive soul, instance and verbatim `createdAt` incarnation from the checked calling record; record the publication actor as the proposer. Keep source owner/bound base identity and accepted OID as policy requires, and carry claim paths/subjects. Freeze named evidence and compute SHA-256 from the exact bytes actually consumed; missing/refused evidence is explicit and cannot support an asserted hash. Keep homes, bindings-file paths, machine/account details and recovery locators private. Do not turn record consistency or Git attribution into an authorship proof. Cross-host reviewers need an authorized immutable evidence route or sufficiently supported public citations; note path + hash by itself is insufficient.

**Duplicate lanes:** first compare current accepted content and pending proposals; then compute the sketch's exact `SHA256("<Type>|<normalized title>")[0:16]` and look in accepted verdict records. The normalization must be one versioned rule shared by writers/reviewers, not independently guessed here. A prior rejection/supersession should return its reference and require explicit new evidence/reconsideration rather than republishing silently. Title changes, paraphrases and collisions mean the exact lane does not replace reviewer semantic judgment. The existing head-bound `okf-review` PR comment is not the sketch's claim-keyed `verdicts/` record. Two hosts can race their preflight reads; keep reviewer reconciliation/idempotence even if preflight is complete.

**Exact-head handoff:** base/repository identity, full branch ref, **full remote-readback head OID**, accepted base OID, relative claim paths, provenance/evidence receipt identity, duplicate findings and explicit `review requested` state. Send to a configured reviewer address through the composed messaging capability with a body file. The reviewer must fetch/compare that OID, not review whichever head a branch name later resolves to. Sending a message is not receiving a review. Current `create` returns a head/branch/URL but sends no reviewer message; the skill relies on a labelled-PR trigger.

### Hypothetical `oats okf propose`: inputs / outputs / refusals (design only)

**Inputs**

- `--base <bound-alias>`: required destination selection, resolved against captured authorized bindings; no freeform repository override supplied by claim text.
- `--claims <relative-paths>` plus rationale and explicit supersession/reconsideration references. Require the sketch's typed metadata and nonempty valid About-edges.
- `--evidence <instance-relative-note-paths>` and optional public/task references; only named evidence, no implicit transcript or home sweep.
- `--reviewer <configured-role-or-address>`: selected by declared routing or an explicit authorized choice; not inferred from untrusted content.
- Submission mode: **branch handoff** for this design; an explicitly supported GitHub-PR mode may preserve compatibility. Do not pretend branch-only success has a PR URL.
- `--plan`: read/check/freeze inputs, accepted OID, scope, duplicate/verdict findings and safe candidate artifacts without publishing; return a plan/receipt digest. Apply names that exact digest so changed inputs or base cannot silently substitute.
- Apply uses a fresh UUID-based proposal ref/key, persisted before effects. Identity/incarnation, bound target and base OID are derived/checked values, not caller-authority overrides. This is one proposal per selected base; a multi-base convenience command must return independent per-base results.

**Outputs**

- Safe machine result: schema version, proposal ID, checked source identity/incarnation, bound base ID and accepted OID, branch, candidate/remote head OID, claims/subjects and evidence digests.
- Separate durable states: `planned`, `nothing-to-propose`, `duplicate`, `refused`, `branch-published`, `handoff-sent` or `handoff-failed`/`handoff-unavailable`; optional forge mode additionally distinguishes PR created, created-unlabelled and uncertain outcomes. None means accepted.
- Frozen local receipt and safe diagnostic/artifact roles, with observed partial effects. Uncertain publication is retained for read-only inspection; no automatic create/push replay.
- Handoff result/delivery identity separately from publication. A later reviewer verdict names the exact head; a new head needs new review. Accepted/verdict records are reviewer writes, not proposer claims.

**Refusals / non-successes**

- Missing/unknown calling record, mismatched incarnation/history, opted-out source or unreadable/ambiguous bindings/authority; no invented fallback source.
- Unsupported base backend, unapproved target/scope, attempted accepted-branch write, existing proposal ref, changed head/base, ambiguous/shallow history, unsafe file modes or altered origin routing.
- Malformed/unknown subject/claim schema, missing About target, protected acceptance/verdict edits, generated indexes out of sync, structural errors/producer warnings or content-screen findings.
- Missing/mutating required evidence, unsafe locators, input limits, unsupported public provenance schema or unverifiable required receipt. Hashes never replace access to sufficient evidence.
- Already accepted/pending exact duplicate, or prior verdict without explicit reconsideration. An incomplete duplicate scan is reported as incomplete, never a clean result.
- No configured review route before publication; failure after push reports `branch-published` plus handoff failure, never rolls back or retries publication implicitly.
- Native Git/forge failure or uncertain result: safe code only, retained partial state. Prior application of the same proposal receipt returns its recorded/inspected status rather than creating another branch.

These are proposed semantics, **not shipped commands or approved changes**. The existing accepted publication-recovery direction must be reconciled, not overwritten, if a PR backend remains.

### Write access and multiple hosts

**Today:** the harvester uses native host-user Git credentials to push (SSH/key agent or HTTPS credential helper/config, depending on the recorded locator/routing) and native `gh` authentication to create/upsert labels and open/read back the PR. The helper does not mint a GitHub token, copy credentials, impersonate the source, or use its aweb alias as GitHub authorization. Its child environment retains native non-`GIT_*` credentials/config context; inherited `GIT_*` selectors are deliberately removed, interactive Git prompting disabled and hooks disabled. The fixed Git author/committer is attribution text, **not authentication**.

A working instance under the **same OS user, credential context and access policy** would ordinarily use the same credentials. Merely being on the same host is not sufficient if HOME, environment, container, account or broker grants differ. An ambient credential supplied only through stripped `GIT_*` variables will not work simply because a native shell push did. No authentication was required by this local file transport, and this probe did not inspect or test live credentials.

**Several hosts:** every proposing host needs its own approved credential route to the canonical repository (and forge access if PR mode is used), or a separately designed publisher service with delegated authority. Do not copy one harvester's secrets into every home. Keep branch-create versus accepted-branch/merge authority distinct using repository policy/credentials; current instructions and the screen are not an ACL. Ensure branch IDs are globally unique, duplicate queries use shared remote state, evidence survives host/source retirement, and reviewer addressing works across hosts. A source's local incarnation/history check cannot automatically establish a remote host's source. The policy for portable source identity and trust is a design decision, not something `source-snapshot.mjs` solves today.

### Does removing the harvester lose an irreplaceable independent judge?

**No unique judgment competence is tied to the harvester role.** The maintainer already repeats the promotion, canonical-home, duplicate, supersession, provenance and exclusion checks, on a specific head. An independent reviewer can own those duties; a separate snapshotter's name is not proof of authorship or authority.

**But there is a real timing loss:** today another model judges before the first push. A reviewer who sees only an already-pushed branch cannot replace that pre-publication opportunity to catch unsafe or low-value material, nor undo first exposure. The unchanged deterministic screen is only bounded detection. If the required property is independent approval *before publication*, review must move before push (with an adequate evidence route), and a true authority boundary would require separation of publish credentials. A post-push reviewer alone cannot provide that property. No empirical claim is made here about one-versus-two-model error rates or review workload.

The proposed simplification is therefore plausible for **acceptance quality**, with a deliberate change in pre-push review timing; it is not a demonstrated equivalent privacy guarantee.

## Limits

- Only tagged helper execution, local Git transport and the released provenance parser were exercised. No live GitHub, external credential use, source spawn/capture, trigger, reviewer session, message delivery-to-reviewer protocol or merge was rehearsed.
- The ontology is the supplied design sketch, not accepted knowledge. One claim/subject view proves parser tolerance and transport only. No generator, migration, verdict matcher, normalization rule or hypothetical CLI was implemented.
- Snapshot routine reuse is source inspection, not an exercised self-snapshot. Current source checks establish local consistency, not caller authorship or cross-host authority.
- Source-released files used: `oats-package/capabilities/oats-okf-harvest/skills/knowledge-harvest/SKILL.md` §§1–9; its `okf-authoring/scripts/{okf-publication,okf-content-screen,okf-validate}.mjs`; `lib/source-snapshot.mjs`; maintenance `lib/provenance.mjs` and review skill. Publication helper line references are to **v5.8.0**, not checkout HEAD.
- Accepted consultation: `oats/nodes/oats-okf-expert/decisions/personal-data-exclusion-is-not-a-publication-guarantee.md@1b6d6ea70f71`; `oats/nodes/integrations-expert/lessons/a-fake-cli-that-accepts-what-the-real-binary-refuses-hides-a-broken-hook.md@1b6d6ea70f71`; `oats/nodes/oats-maintainer/decisions/publication-is-proven-by-the-forge-readback.md@1b6d6ea70f71`; `oats/nodes/oats-maintainer/decisions/optional-reference-theory.md@1b6d6ea70f71`. The publication-readback decision describes intended fixes, not a claim that the tag already contains them.
- Checkout `npm test`: **512 tests, 510 passed, 0 failed, 2 skipped**, 110.6 s. The two real-kernel suites require explicit `OATS_OKF_REAL_CLI` / `OATS_OKF_UPGRADE_CLI` inputs and did not run. This does not upgrade the scratch result into real-forge or release-tag acceptance.

## Approaches tried

1. **Verify the requested baseline.** Exact-tag lookup on HEAD failed (exit 128). Comparing with the local tag exposed the post-release changes, so I exported and used the tag. First archive attempt named a nonexistent `oats-okf-maintain` path (exit 2); corrected to the actual harvest/maintenance capability names. No repository checkout was modified.
2. **Consult prior judgment.** A nested `index` reference was refused with `E_CONFIG`; read the linked index by `cat` instead, then consulted the relevant accepted concepts. No substitute knowledge was invented.
3. **Minimal local fixture.** Cloned only the supplied local base. Initial root-level file reads returned `ENOENT`; directory inspection established `knowledge/` as the bundle root. Added the one claim and minimal subject/navigation, then ran full-bundle validation.
4. **No-GitHub admission variants.** Omitted `--github`, then tried a file URL as its value: `E_USAGE` and `E_GITHUB`, both before effects. The final syntactically valid fixture value let real Git exercise the lease before `E_GH` at the deliberately absent CLI. This was not a retry of an uncertain publication; no publication was retried after the side-effecting call.
5. **Compatibility cross-check.** Ran the released reviewer parser on the same direct-source body. It refused fields that the publication helper accepted; no fake harvester was added to hide the incompatibility.
6. **Repository regression suite.** Ran `npm test` from the unchanged `./work`, with temporary output under the probe scratch directory: 512 tests, 510 passed, 0 failed, 2 explicitly gated real-kernel suites skipped, 110.6 s. This is checkout HEAD coverage, not release-tag or real-GitHub qualification. A preliminary publication-test filename glob did not match; the actual suite file is `test/okf5-publication.test.mjs`.

No alternative storage engine, new publishing implementation, real PR, harvester or deployment repair was attempted. The next authorized action is the parent's design synthesis, not rollout.
