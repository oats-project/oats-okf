# Design: recover a pre-push `E_BASE_MOVED` inside the publication path (#129)

Status: spec and plan for decision, nothing built. Lane `lane:setup`;
maintainer setup-maintainer-pepe; author kb-by-subject-okf-expert (the
package expert). Gate: a shipped package's behaviour changes, so the build
starts only on Pepe's word, relayed by setup. Written against the released
`v5.8.0` (`cfc595a9edea`) and the default branch at `1d74816e8bb2`; the
publication helper on the default branch (`ba87389`) differs from the tag
only in its uncertain-push diagnostics, not in the checks this design
changes.

Issue: [#129](https://github.com/awebai/oats-okf/issues/129).

## 1. The gap

`okf-authoring/scripts/okf-publication.mjs` (two byte-identical copies, in
`oats-okf-harvest` and `oats-okf-maintenance`) publishes a harvest with
`create`: `screenedPush` runs `verifyBase` (the remote accepted tip must
equal `--base`, the commit the harvest cloned), screens the range, runs
`verifyBase` again, then pushes create-only under an exact lease. Both
checks are **before** `git push`; a changed tip fails with `E_BASE_MOVED`,
exit 2, and nothing has left the host.

The `knowledge-harvest` skill (section 8's publication block, section 9)
treats every nonzero publication result alike: "Publication failed; DO NOT
RETIRE. Retain this live home", notify the source, wait for a human. So on
a base that merges other PRs while a harvest runs, the harvester stops with
its claims written, screened and unpushed. On 2026-11-09 two harvests on
one deployment did exactly that.

Retention is right for an **uncertain** result (`E_PUSH_UNCERTAIN` after the
push, any `gh` failure after it). It is wrong for a refusal before the push:
the clone is the only state, the accepted tip is readable, and the
maintainer judges the PR against the accepted tip at review anyway.

## 2. What changes

### 2.1 The helper: `create` recovers a pre-push base move, bounded

Inside `create`, before `screenedPush`, and again whenever `screenedPush`
would fail `verifyBase` before its push:

1. Read the remote tip of the accepted branch (`tip`). Equal to `--base`:
   proceed as today.
2. Otherwise, **recover**, at most three times per `create`:
   - `git fetch origin <base-branch>` in the clone, with the helper's usual
     environment (no `GIT_*` selectors, no prompts, no hooks), so the new tip's
     objects are local. The fetch is the one network read the recovery adds.
   - Require `--base` to be an ancestor of the new tip (fast-forward). A
     rewritten accepted branch is not something to replay onto: refuse as
     today.
   - Rebuild the proposal on the new tip with the existing `reconcileTree`:
     fork point = the old base, accepted = the new tip, proposed = the current
     head's tree; per file, the PR's delta is kept and intervening accepted
     changes are preserved (3-way `merge-file` for a file both sides touched).
     A conflict (`E_REWRITE_CONFLICT` inside `reconcileTree`) ends the
     recovery: refuse as today.
   - A reconciled tree equal to the new accepted tree means the proposal is
     already accepted (or empty): refuse as today; nothing to publish.
   - Make the new commit with `commitFromTree` on the new tip, with the
     original head's commit message (read from the old head), update the
     local `refs/heads/<branch>` from the old head to the new one (compare and
     swap), and set `--base` and `--head` to the new tip and new head for the
     rest of the command.
   - Re-run the whole `screenedPush`: it re-screens the new range and checks
     the tip again. If the tip moved once more, that is the next attempt.
3. After the third attempt, or on any refusal inside a recovery, fail with
   **`E_BASE_MOVED`** as today, with a `diagnostic` object in the fixed
   style the helper already uses for uncertain pushes:
   `{ phase: 'recover', attempts: <n>, reason: 'retries-exhausted' |
   'conflict' | 'not-fast-forward' | 'nothing-to-publish' | 'fetch-failed' }`.
   Fixed constants only; never Git's text.

The successful result gains two additive fields: `base` (the tip the PR is
parented on, which may differ from `--base`) and `recovered` (the number of
recoveries, 0 normally). Everything after the push (`gh label create`,
`verifyBase`, `gh pr create`, `confirmPr`) is unchanged: a base move
**after** the push still takes today's path (`E_PR_UNCERTAIN`), because
something has left the host.

The skill passes `--base`/`--head` as before; no new flag. The bound is a
constant in the helper (3), not an option: an option would be one more thing
a deployment could set wrong, and three recoveries cover a base that merges
several PRs an hour without turning the helper into a loop.

### 2.2 The skill: section 8's block and section 9

- Section 8: the publish function reads `base` and `recovered` from the
  `create` result and writes them into the publication report (the PR is
  parented on `base`; the harvester's "accepted commit" in its hand-over is
  that one). The commit text and PR body are unchanged: neither names the
  base OID.
- Section 9 gains one paragraph: a pre-push base move is recovered inside
  `create`, up to three times, and reported in the result; only the refusal
  after that, or any post-push uncertainty, is the stop. The stop's text is
  unchanged.
- The README's harvester section (step 8) says the same in one sentence, so
  an operator does not read a retained harvester as a publication incident.

### 2.3 The maintenance copy

The two helper copies stay byte-identical (the manifests test checks it).
`rewrite`, `merge`, `close` are unchanged: a maintainer runs them against a
tip it just read, and `rewrite` already reconciles onto the current tip.

### 2.4 What does not change

No binding, setting, file or error code changes for deployments. No new
command. `E_BASE_MOVED` keeps its meaning (the accepted tip moved and the
helper could not publish); `E_REWRITE_CONFLICT` stays internal to `rewrite`
and to the recovery's reason. The create-only lease, the content screen on
the exact outgoing range, and the forge readback are untouched. 6.0's
`propose` (the knowledge-base-by-subject design, §5.1) reuses `create` and
inherits the recovery.

## 3. Alternatives rejected

- **Retry by re-cloning and re-running the agent's edits.** The agent's
  edits are judgement, not a script; replaying them means a second model
  pass per retry. The delta is already in the commit, and `reconcileTree`
  replays a delta deterministically.
- **`git rebase`/`cherry-pick` in the clone.** Touches the working tree,
  honours hooks and merge drivers, and leaves conflict markers in files the
  screen would then read. `reconcileTree` works on trees with a private
  index, the way `rewrite` already does.
- **A flag for the bound, or an unbounded loop.** See §2.1.
- **Teach the skill to re-run `create`** (shell loop) instead of the helper.
  The skill is prose a model follows; the invariant (recover only before any
  push) belongs in the code that knows whether the push happened.
- **A new error code for the exhausted recovery.** Deployments and the
  maintainer's review-context would need to learn it; the diagnostic carries
  the detail under the existing code.

## 4. Tests

In `test/okf5-publication.test.mjs`, with the existing local-remote fixture
(`publish`, `receiveHook`, `snapshot`):

1. Base moves once before `create` (another writer's commit on `main`):
   `create` succeeds, the PR head is parented on the new tip, contains the
   proposal's delta and the other writer's file, `recovered: 1`, screened
   range is `newTip..head`.
2. Base moves twice (second move injected between attempts through the
   fixture's hook): `recovered: 2`.
3. Base moves four times: `E_BASE_MOVED`, `diagnostic.reason:
   'retries-exhausted'`, `attempts: 3`, remote unchanged.
4. Conflict: the other writer edits the same line of the same file the
   proposal edits: `E_BASE_MOVED`, `reason: 'conflict'`, remote unchanged.
5. Already accepted: `main` moved to the proposal's own head (today's
   `moved-base` preflight case): `E_BASE_MOVED`, `reason:
   'nothing-to-publish'`, remote unchanged.
6. Not fast-forward: `main` rewritten to an unrelated commit:
   `E_BASE_MOVED`, `reason: 'not-fast-forward'`, no reconcile attempted.
7. Post-push move: the fixture advances `main` after the push, before `gh`:
   today's `E_PR_UNCERTAIN`, unchanged.
8. The screen runs on the recovered range: a secret introduced by the
   recovery's merge result (fixture) is refused with `E_CONTENT_REFUSED`
   before any push.
9. The two helper copies are identical (existing manifests test).

The existing `moved-base` preflight test's expectation changes from
"nothing written locally" to "remote unchanged, local clone gained the fetch
and the reconciled commit"; its refusal code stays `E_BASE_MOVED`.

A live rehearsal before hand-over: a harvest in a scratch deployment against
a scratch Git base whose `main` is advanced by a second writer during the
harvester's run, once and then twice; the PR opens parented on the moved tip
with `recovered` reported. A unit test against the fixture proves the fixture.

## 5. Release

A 5.x release of `oats.okf` with the two helper copies, the skill, the README
sentence and a CHANGELOG entry: "A pre-push `E_BASE_MOVED` in `create` is
recovered by replaying the proposal onto the new accepted tip, up to three
times; the result reports `base` and `recovered`." The version number is the
release lane's call (a 5.9.0 may already be planned with other content).
Deployments need no action. A harvester retained on 5.8.0 does not pick it
up: a running home keeps its modules, and the PR description says so: a
person retires that harvester and the source relaunches its proposal on the
new version (or the person publishes the retained clone by hand).

## 6. Plan

1. Spec (this document) to setup; **wait for Pepe's word**.
2. On the word: one developer (an `oats-okf-expert` child on a worktree of
   this branch, on a model family other than the reviewers') implements §2
   and §4 in one PR; two `code-reviewer` instances on pi
   `github-copilot/gpt-6.1-sol` attached to its tree; no Astra or Fable
   model anywhere in this effort.
3. The developer's loop converges; I verify: unit suite green, the two copies
   identical, the live rehearsal of §4 run from a scratch deployment, the
   README and CHANGELOG changed with the code.
4. CI green; the PR goes to setup at its exact head by mail, the lead copied
   on the done line. Juan's side reads first, then the release lane.
