---
name: okf-trigger-setup
description: >-
  Set up and verify the OKF proposal-review trigger (harvest-review is its
  old name), which spawns a knowledge maintainer for each knowledge PR
  (labels okf-proposal and okf-harvest): declare it as a workspace automation
  (`oats-triggers/okf-proposal-review.yaml` in a member repo, `from:
  oats.okf:proposal-review`, with `runsOn` naming the one host and `owner`
  the GitHub account that can merge on the knowledge-base repo), or locally
  with `oats trigger add` for a machine-private setup. Covers protecting the
  accepted branch (a ruleset: PRs only, merged by the maintainer's account),
  the self-approval limit and `oats trigger test`. Use when
  setting up knowledge operations, when knowledge PRs are not being
  reviewed, when moving the reviewer to another host, or when asked whether
  a host may run the maintainer.
---

# Setting up the proposal-review trigger

The trigger makes a knowledge PR get reviewed: when a PR labelled
`okf-proposal` (an instance's own proposal, oats.okf 6) or `okf-harvest` (a
5.x harvester's) opens on the knowledge-base (KB) repository, the host tick
spawns a new `oats.okf/knowledge-maintainer` to review it and gate its merge.
It runs on one machine, acting as one GitHub account, and that account must
be able to **merge** on the KB repository.

`harvest-review` is the template's old name: through oats.okf 6.x it is an
identical alias (`from: oats.okf:harvest-review` keeps working and fires on
both labels). Never declare both: that reviews every PR twice.

## 1. Choose the host and the account

- **The account (`owner`)** must be able to merge on the KB repository (push,
  maintain or admin). Check from the host:
  `gh api repos/<owner>/<repo> --jq .permissions`.
- **The host (`runsOn`)** is the one machine that runs the trigger, named by
  its `oats-local.yaml` `host: { name: <slug> }`, and logged in with `gh` as
  that account.
- **Proposers run anywhere**: working agents open their own proposal PRs
  (`oats okf propose`) from their own deployment; the review host need not
  be one of them. Each proposing host needs a `gh`/Git account that can
  create branches on the KB repository (or use a fork flow), never one that
  can push the accepted branch.

## 2. The self-approval limit

GitHub forbids approving your own account's PR. If the proposer's host and
the reviewer's account are the same GitHub account, then either:
- the KB repository's `main` must not require approving reviews (merge
  permission is enough; the maintainer records its verdict as a PR comment,
  not an approval), or
- the trigger's `owner` is a separate reviewer account or machine user.

Say which one applies when you report the setup.

## 2a. Protect the accepted branch

There is no harvester and no other gate: the knowledge base changes only
through PRs the knowledge maintainer merges. **Every Git base's accepted
branch must refuse direct pushes and force-pushes and accept changes by pull
request only, merged by the knowledge maintainer's account.** Proposing
hosts then need only branch-create access (or a fork flow); none of them can
change the accepted branch.

On GitHub, add a **branch ruleset** on the KB repository (Settings → Rules →
Rulesets → New branch ruleset), enforcement **Active**, targeting the
accepted branch:

- **Restrict updates**: only actors on the bypass list may update the branch.
- **Require a pull request before merging.**
- **Block force pushes** and **Restrict deletions.**
- **Bypass list**: the role or team that holds the maintainer's account (the
  trigger's `owner`), set to **For pull requests only**, so it too changes
  the branch only by merging a PR. Rulesets grant bypass to roles, teams and
  apps, not to a single user: give the maintainer account a role or team no
  proposing account has.

The classic equivalent (Settings → Branches → a protection rule on the
accepted branch: require a pull request, restrict who can push to the
maintainer's account, no force pushes, no deletions) meets it too, as does a
deployment that protects the branch by other means. Then check:

```sh
oats okf bases --soul <a soul that reads the base>    # protection: enforced | none | unknown, per Git base
```

`oats okf bases` reads the branch's active rulesets with one `gh api
repos/<owner>/<repo>/rules/branches/<branch>`: `enforced` when a rule
requires a PR or restricts updates, `none` when no such ruleset applies,
`unknown` when `gh` is absent, the read fails or the base is not on GitHub.
It is read-only and never refuses anything. Classic branch protection is not
visible to that read, so a classically protected base reports `none`: say
which one you set up when you report it.

## 3. Messaging

The maintainer messages nobody about a PR: the proposer reads the PR, and the
`okf-review` verdict comment is the record. A maintainer instance still gets
the soul's messaging capability (`oats.aweb`, the workspace default) for its
own hand-back; there is no okf team to declare or map.

## 4. Declare it in the workspace (the default)

A team relies on the review, so declare it in Git, in a member repository (the
workspace's host repo), in its `oats-triggers/` folder:

```yaml
# <member>/oats-triggers/okf-proposal-review.yaml
kind: oats-trigger
schemaVersion: 1
description: Review and gate every OKF knowledge PR on the knowledge base
from: oats.okf:proposal-review
set: { repo: github.com/<owner>/<kb-repo> }     # optional: base, harness, model
runsOn: <host.name of the one machine>
owner: github.com/<the merge-capable account>
```

- `kind: oats-trigger` and `schemaVersion: 1` make the file self-describing; a
  wrong kind is `E_AUTOMATION_SCHEMA`.
- The id is `id:` if present, else the filename stem (`okf-proposal-review`).
  Two files with the same id in one member are `E_AUTOMATION_DUPLICATE`.
- A file named `*.oats-trigger.yaml` anywhere in the member works too (never
  under `oats-package/`, `.git/` or `node_modules/`); `oats-triggers/` is the
  canonical place.

Or let the CLI write it: `oats trigger add --from oats.okf:proposal-review
--set repo=github.com/<owner>/<kb-repo> --workspace <member>` (it prints the
file when that repository is not the current checkout). Commit and merge it
like any other change.

A host runs it only when **both** its `host.name` equals `runsOn` **and** its
`gh` account equals `owner`. Everywhere else it is listed with the reason:
`assigned-elsewhere`, `owner-mismatch` or `host-unnamed`. That keeps exactly
one machine on it, and the operator's consent explicit. A host can opt out
without a commit: `automations.disabled: [<member>/okf-proposal-review]` in its
`oats-local.yaml`. Changes reach the host within about ten minutes (after
`oats sync`, or the tick's refresh).

## 5. Or add it locally (machine-private)

For a personal or experimental setup, add it to this deployment only. It runs
on this host with this host's `gh`, with no `runsOn` or `owner`:

```sh
oats trigger add --from oats.okf:proposal-review --set repo=github.com/<owner>/<kb-repo>
#   optional: --set base=main --set harness=claude --set model=opus --id okf-proposal-review
```

Never run the same review from two places: one workspace declaration, or one
local trigger on one host.

## 6. Test it on the host that runs it

```sh
oats trigger test <member>/okf-proposal-review   # or: oats trigger test okf-proposal-review (local)
oats schedule host status                     # is the host timer installed and active?
oats trigger status
```

**If this host has none yet, installing the timer is the operator's step, in
their own shell, never yours:** `install` renders the unit from the
environment of the shell it runs in, and an agent's shell can carry a
session's own `PATH` and node. Hand the operator the exact command to run in
their own terminal, from the deployment directory and outside every instance
home:

```sh
oats schedule host install
```

Do not run it yourself, with or without flags. On OATS 0.52.0 and later, do
not offer its `--print` from your shell as a preview: that renders your
environment, not the operator's. After the operator has run it, check the
result yourself with `oats schedule host status`. With no operator at the machine, the timer stays
as it is until they run the command: say what is waiting, and do not run it in
their place.

- **Why a schedule command here:** the shared host tick that
  `oats schedule host install` installs is what polls PR triggers such as this
  one ([OATS v0.41.0 schedules, Triggers](https://github.com/awebai/oats/blob/v0.41.0/docs/schedules.md)).
  The timer supports this review trigger. It adds no scheduler job, and
  proposing needs no timer: working agents propose at their checkpoints.

- `oats trigger test` checks gh auth and where its credential comes from, the
  repository and your merge permissions, the soul, its messaging capability,
  the host/owner match, and what would fire now. It spawns
  nothing. It must pass before you report the setup done; fix what it names.
- **Credentials reach the tick through the host timer, not your shell.** A
  `GH_TOKEN` exported in your shell does not reach it; `gh auth login` with the
  keyring or config file does.
- Pause with `oats trigger disable <id>`; `remove` leaves running maintainers
  alone.

## 7. Labels

Proposal PRs carry `okf-proposal` (`oats okf propose` creates the label if
the repository lacks it); 5.x harvest PRs carry `okf-harvest`. To pre-create
them:

```sh
gh label create okf-proposal --repo <owner>/<repo> --force --color 0E8A16 --description "OKF knowledge proposal PR (oats.okf)"
gh label create okf-harvest --repo <owner>/<repo> --force --color 0E8A16 --description "OKF harvest PR (oats.okf)"
```

A label `okf-needs-human` left from an older release no longer stops
anything, but a PR it parked is reviewed again only on a new trigger event.
The trigger polls: a close it never saw is no reopen. On this host, once the
lock has 5.7.0:

1. Retire the knowledge-maintainer instances left from older reviews, running
   or stopped (`oats retire <instance>`): a retained home holds a concurrency
   slot, and one composed from an older package keeps the old behaviour.
2. Remove the label from each parked PR, then close it
   (`gh pr edit <number> --repo <owner>/<repo> --remove-label okf-needs-human`,
   `gh pr close <number> --repo <owner>/<repo>`).
3. Wait until `oats trigger status <id> --json` shows a `lastPoll` after the
   closes with `ok: true` and `prs` under 100. Only such a poll records a
   close: a failed poll records none (keep waiting), and one that fetched 100
   open PRs may be truncated (stop and report the poll cap; do not reopen).
   `oats trigger test` does not count: it records nothing.
4. Reopen each PR (`gh pr reopen <number> --repo <owner>/<repo>`), and check
   that `oats trigger status <id> --json` lists a `pending` or `fired` entry
   with `event: "reopened"` for each PR's number. With `max` 2, the rest wait
   as `held` until a maintainer retires.

Never clear the trigger's dedup state.
