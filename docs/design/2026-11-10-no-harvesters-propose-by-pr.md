# Spec: no harvesters. The instance proposes its knowledge by PR; the maintainer gates (oats.okf 6.0)

Status: build spec. Direction: Pepe, 10 November 2026, relayed by the coordination lead: no harvesters on any
base, OATS's public one included; an instance proposes its own knowledge as a PR at its checkpoints, as it
works; the knowledge maintainer gates every merge; the knowledge repository is branch-protected; working
instances keep the `knowledge-theory` skill. "Let's not wait for Juan's side; let's just do it ourselves." Scope
is this change only. The knowledge-base-by-subject design (`2026-11-09-knowledge-base-by-subject.md`, §5) is the
rationale; its ontology, bridge and the decisions still with Juan's side (D4, D13) are **not** in this build:
today's per-soul nodes, `okf.json` `owns`/`reads` and `okf-base.json` v1 stay exactly as they are.

Written against the default branch at `7880addf` (5.8.0 plus #130's pre-push `E_BASE_MOVED` recovery).

## 1. What a working instance does at a checkpoint (the new `okf-propose`)

Checkpoints are unchanged (a PR handed over, a task finished, a feature ready, a release or deploy shipped, a
direction decision taken with the human). At one, after STATE.md, log.md and notes are current and `oats okf
status` says `harvest: on`, the instance:

1. `oats okf propose --plan --slug <slug>` from its home. The command clones every base the soul owns into
   `<home>/proposals/<date>-<slug>/work/<alias>` at the accepted branch (the harvester's §4), writes
   `proposal.md` (a skeleton: title line, `## What`, `## Why`, `## Evidence`, `## Backing notes`), and prints the
   write surface: the owned node paths per base plus the base root `index.md`, and the open `okf-proposal` /
   `okf-harvest` PRs on each base (duplicate candidates, informative). It refuses before cloning when the home is
   not a working OATS home (`E_SOURCE`), when the spawn-recorded policy says off (`E_OPTED_OUT`), or when a
   proposal directory of that slug exists (`E_PROPOSAL_EXISTS`).
2. The instance writes the knowledge in the clone the way the harvester's skill §6 did: one concept per Markdown
   file in an owned node, `index.md` entries, a `log.md` line, supersessions explicit; fills `proposal.md` (what,
   why, evidence with citations, `## Backing notes` as `- notes/<file>.md` lines). It applies
   `knowledge-theory`'s promotion test itself; nothing promotable means no proposal (`log.md` line, as today).
3. `oats okf propose --check --slug <slug>`: validates the clone (`okf-validate.mjs --strict`), checks the diff
   against the write surface (`E_SCOPE` naming the path), hashes the named notes, runs the content screen over
   the full outgoing content (tree delta, commit text, PR body), and prints the **complete outgoing diff** and a
   digest of {clone head tree, proposal.md, notes hashes}. The skill requires the instance to read that diff once
   as a reviewer would, against `knowledge-theory`'s reject list and the shared personal-data sentence, before
   step 4. A refusal here changes nothing remote.
4. `oats okf propose --apply --slug <slug> --digest <digest>`: refuses `E_DIGEST` if anything changed since the
   check, then commits (fixed package author text, as today), pushes create-only to
   `okf-proposal/<UTC date>-<uuid>` through the publication helper's `create` (which recovers a pre-push base
   move, #130), labels `okf-proposal`, opens the PR with the provenance block (§3), and prints the full
   remote-readback head, branch, PR URL, `base` and `recovered`. One PR per owned base.
5. The instance records the PR in `log.md` and goes back to work. It never shepherds the PR: the `proposal-review`
   trigger spawns the maintainer; where no trigger is installed the instance may spawn one
   (`oats spawn oats.okf/knowledge-maintainer --task "<PR url at head>" --relation unrelated`), a call, not a
   station. No harvester is spawned anywhere; the skill no longer names one.

The operator form, from the deployment: `oats okf propose --home <instance home or retirement recovery> --soul
<soul> ...` with the same three steps, for a source that retired without proposing (the recovery copy case the
5.8 harvester served). The record is read from that home; the provenance names the form.

## 2. The `propose` command

In `oats.okf` (`bin/oats-okf.mjs`, new `lib/propose.mjs`), listed in the manifest's `commands`. Flags: `--plan |
--check | --apply` (exactly one), `--slug`, `--digest` (apply), `--home`, `--soul`, `--json`. Refusals, typed and
with the remedy in the message: `E_USAGE`, `E_SOURCE` (no usable record), `E_OPTED_OUT`, `E_PROPOSAL_EXISTS`,
`E_SCOPE`, `E_OWNER` (as `resolveNodes` today), `E_DIGEST`, `E_CONTENT_REFUSED` / `E_CONTENT_INPUT` (the screen's
codes), `E_PROPOSAL_FORMAT` (proposal.md or a backing-note line malformed; the 5.8 rules for note locators),
`E_NOTE` (a named note missing or unreadable: dropped from evidence with a warning in `--check`, never a silent
hash), and the helper's publication codes unchanged (`E_BASE_MOVED` after recovery, `E_PUSH_UNCERTAIN`, `E_GH`,
`E_PR_UNCERTAIN`). An uncertain publication retains the clone and the artefacts under the proposal directory and
prints the safe report; the instance does not retry.

Source identity: the home's `instance.json` (`instance`, `createdAt`, soul name) and the soul's `okf.json`
through the kernel's `OATS_SOUL` as consult does; `okf-harvest-policy.json` for the opt-out. A live home without the
policy file (a 5.0/5.1 home) is `E_SOURCE` with "respawn or `oats instance upgrade`". In the recovery form a
copied home without the policy file (a retired 4.x or 5.0/5.1 seat) is decided as 5.8's harvester hook decided
it: the opt-out from the recorded `soul.yaml` text, other soul `harvest` values `E_SOURCE`, removed 4.x keys by
recorded origin on a retired source only (#125, #128); that accepted path survives the harvester's removal. Consistency, not
authorship, as today. Ownership: `okf.json owns` resolved against the clone's `okf-base.json` with
`resolveNodes`; the write surface is the owned nodes' directories plus the root `index.md`. Directory bases:
`E_UNSUPPORTED` as today's harvester drop ("convert it to a Git base").

Settings: one new optional host setting, `screen-terms-file`: an absolute path to a text file, one term per
line; the content screen refuses any outgoing byte sequence matching a term case-insensitively, rule
`host-term`, location only. Absent means the fixed rules only. Documented in the README's Settings table.

## 3. Provenance version 3 and the maintainer

The PR body ends with a fenced block ```okf-proposal, version 3:

```json
{ "version": 3,
  "source": { "soul": "...", "owner": "...", "instance": "...", "incarnation": "<createdAt>", "ownedNodes": [], "readNodes": [], "bases": [ { "alias": "...", "id": "...", "kind": "git", "root": "...", "repository": "<owner>/<repo>" } ] },
  "evidence": [ { "note": "notes/x.md", "sha256": "..." }, { "note": "notes/missing.md" } ],
  "tasks": { "provider": null, "refs": [] },
  "proposer": { "form": "live" | "recovery", "instance": "...", "alias": "<messaging alias or null>" } }
```

`oats.okf-maintenance` `lib/provenance.mjs` reads version 3 (fence `okf-proposal`) beside versions 1 and 2
(fence `okf-harvest`), strictly as today (unknown keys refused, limits unchanged). `review-context` lists the
evidence notes and the proposer. The `knowledge-review` skill: the maintainer's main job is knowledge theory,
verify each claim against its cited source and judge whether it is worth keeping long term; it also catches
personal or private data, as the second reader, but that is not its main job; it gates every merge and never
parks; `notify-harvester` is removed (`E_REMOVED`: "there is no harvester; the proposer reads the PR"). The
helper's `create` accepts branch prefix `okf-proposal/` and label `okf-proposal` (both prefixes and labels
through 6.x), and the `merge`/`rewrite`/`close` paths accept a v3 body. The two helper copies stay byte-identical;
the `okf-authoring` skill (SKILL.md, scripts, `references/publication-safety.md`) moves into `oats.okf` as the
proposer's copy, with the maintenance copy identical (the manifests test checks shared copies).

## 4. Removal of the harvester

- The harvester is removed, but its name keeps answering (Juan's side's condition: a bare unknown-soul error is
  not enough). `oats-package/souls/knowledge-harvester/` stays as a **stub soul** (`knowledge: none`, its own
  capability `from: here`) and `oats-package/capabilities/oats-okf-harvest/` is reduced to a stub capability
  with one required spawn hook that always refuses, before any home is kept:
  `E_REMOVED: oats.okf 6.0 removed the knowledge harvester. The instance proposes its knowledge itself: run
  `oats okf propose --plan` from its home (or `oats okf propose --home <retirement recovery> --soul <soul>` from
  the deployment for a retired source). Delete any souls.launch key for oats.okf/knowledge-harvester and any
  --provider oats.okf harvest=... spawn flag; rename the trigger template oats.okf:harvest-review to
  oats.okf:proposal-review. See the 6.0 release note.` The stub's skills, scripts and `complete`/`harvest-status`
  commands are gone (`E_REMOVED` as today for the commands). The stub is removed in 7.0, when the name becomes
  unknown. `oats-package/oats-package.json` keeps both entries and says what the stub is.
- `knowledge: { harvest: off }` in a soul keeps its meaning (this soul's instances never publish knowledge) and
  gains the spelling `publish: off`; `oats okf status` keeps `harvest` and adds `publish` with the same value. A
  soul `knowledge.propose` key is refused by the spawn hook: `E_CONFIG: knowledge.propose is not a setting;
  instances propose directly in oats.okf 6; use harvest: off to opt out`.
- Trigger: `triggers/proposal-review.json` (id `okf-proposal-review`, labels `okf-proposal` and `okf-harvest`,
  task text updated); `triggers/harvest-review.json` stays as an identical alias through 6.x with a comment in
  the README that it is the old name. `oats-package.json` lists both.
- The inject (`injects/okf.md`), the README, the `okf-propose` skill and the maintainer soul's AGENTS.md no longer
  mention a harvester except in the migration section. The `okf-instance-knowledge` skill's "Proposing knowledge"
  paragraph points at `okf-propose`.
- Removed CLI surfaces keep answering `E_REMOVED` with the new way: `oats okf harvest` ("run `oats okf propose`"),
  `oats okf-harvest complete|harvest-status` are gone with the capability (the kernel answers unknown command).

## 5. Branch protection

- The setup skill `okf-trigger-setup` gains a section "Protect the accepted branch" (and the README's maintainer
  section one paragraph): every Git base's accepted branch must refuse direct pushes and force-pushes and accept
  changes by pull request only, merged by the knowledge maintainer's account; the GitHub steps (a branch ruleset
  on the accepted branch: restrict updates to the maintainer's account, block force pushes and deletion; or the
  classic equivalent); deployments that protect by other means meet it.
- `oats okf bases` reports `protection: enforced | none | unknown` per Git base, read with one `gh api
  repos/{owner}/{repo}/rules/branches/{branch}` (enforced when a rule forbids updates outside PRs or restricts
  pushers; `unknown` when `gh` is absent, the call fails or the repository is not on GitHub). Read-only,
  best-effort, bounded by the Git timeout; never a refusal. If adding a `base-branch-unprotected` readiness
  warning fits the manifest's fixed `binding.reasons` without a kernel change, add it; otherwise `bases` alone.

## 6. Tests

- `test/okf5-harvester.test.mjs` is replaced by `test/okf6-propose.test.mjs`: on the existing local-remote fixture
  with the fake `gh`: plan creates the clone and refuses on `E_SOURCE`, `E_OPTED_OUT`, `E_PROPOSAL_EXISTS`;
  check refuses an out-of-surface path (`E_SCOPE`), an unowned node (`E_OWNER`), a secret (`E_CONTENT_REFUSED`),
  a host term (`host-term`), a malformed note line (`E_PROPOSAL_FORMAT`), and reports a missing note as dropped;
  apply refuses a stale digest (`E_DIGEST`) and, on a good digest, pushes the branch, opens the PR with a v3
  block the maintenance parser accepts, labels `okf-proposal`, recovers a pre-push base move (#130); the recovery
  form reads a retirement recovery copy; a 5.0/5.1 home without a policy file is `E_SOURCE`.
- Manifests test: the new capability list, the soul list, both trigger templates, shared copies identical
  (`oats-okf` and `oats-okf-maintenance` `okf-authoring`, `knowledge-theory` in both).
- Provenance test: v3 accepted, v1/v2 still accepted, unknown key refused, fence names.
- Real-kernel test (CI, released kernel): the spawn hook refuses `knowledge.propose`; a spawned working home runs
  `propose --plan` against a local Git base and gets the write surface; `oats spawn oats.okf/knowledge-harvester`
  is refused as unknown; the maintainer soul still previews.
- Upgrade-hook test: a 5.x home adopts under 6.0 (policy file unchanged).

## 7. Docs and release

README: new "How knowledge is proposed" (the five steps, the operator form, the refusals), "The knowledge
maintainer" (gate, branch protection, `proposal-review`), "Upgrading to 6.0" (what changes for a deployment: new
spawns get `propose`; harvester spawns stop; running harvesters finish or are retired by a person, retained ones
are retired and re-proposed by the source or the operator form; the trigger alias; protect the accepted branch;
give proposing hosts branch-create or use the fork flow; optional `screen-terms-file`; no change to bindings,
`okf.json`, `okf-base.json` or any handled error code). CHANGELOG "Unreleased" with the same. The version number
is the release lane's (this removes a soul and a capability: a major). The design document's §5 is the rationale;
this spec is the build record.

## 8. Acceptance conditions (Juan's side, relayed 10 November; the merge waits on Juan's yes)

1. The proposing instance's pre-push screen is **the same screen** the harvester's publication uses today
   (`okf-content-screen.mjs` and the helper's `screen`, `screenRange`, `screen-text` over the exact outgoing
   commit objects, paths, blobs and PR body), moved, not a weaker copy; the test suite proves `propose --check`
   and `--apply` call it with the same inputs the harvester's §8 did, plus the optional host term list.
2. Removing the soul refuses with an error that names the change and the fix: a spawn of
   `oats.okf/knowledge-harvester` is refused by the stub soul's required spawn hook with the `E_REMOVED` text of
   §4 (a bare unknown-soul error is not enough), and the release note and README name what to delete from a
   deployment's configuration (`souls.launch` keys for the harvester, any `--provider` harvest keys, the
   `harvest-review` trigger rename) and what replaces the harvest (`oats okf propose` from the instance home;
   the operator form on a recovery), with the hand steps as exact commands.
3. Every instance's knowledge instructions change in the same release: the inject, `okf-propose`,
   `okf-instance-knowledge`, `knowledge-theory`'s runtime notes, the maintainer soul's AGENTS.md and
   `knowledge-review`, the README. No text may still say a harvester decides what is promoted, or that an
   agent waits for one. A test greps the shipped capabilities for "harvester" outside the migration section.

## 9. Delivery

The PR converges in the developer's review loop; the package expert verifies and confirms CI green; the
coordination lead is told the exact head and informs the maintainer and Juan's side; Juan's side gives its
second read at that exact head; release-maintainer-pepe signs off after it. Juan's side accepted the design's
§8.2 questions 4 (the operator form replaces the recovery harvest) and 6 (the alias period); its questions 1, 2,
3 and 5 are for its own deployments, which adopt the release when he answers them; they do not block this build.

## 10. Not in this build

The subject ontology, the bridge, `okf.json` v2, verdict records, the `about:` edge, claim ids, the write-surface
rule by path family (D4), the one-base rule (D13): all wait for Juan's side. The harvester's pre-push base-move
recovery (#130) is in and reused, not changed.
