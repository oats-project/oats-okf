# Design: knowledge writes in a container deployment (#149, #150, #151)

Status: contract agreed by both sides on 2026-11-12 (section 6); build in progress. Lane `lane:setup`;
maintainer setup-maintainer-pepe; author container-knowledge-writes-lead (the
package expert). Gate: this changes what a deployment provisions and what a
knowledge change records, so the build starts only when both sides agree the
contract in section 3. Written against the released `v6.0.3` (`fa13ca0`),
which is also the default branch, and the kernel's `docs/trust-model.md` and
`docs/container.md` on its default branch (OATS 0.69.17).

Issues: [#149](https://github.com/oats-project/oats-okf/issues/149),
[#150](https://github.com/oats-project/oats-okf/issues/150),
[#151](https://github.com/oats-project/oats-okf/issues/151). Related and not
overlapped: #148 (`propose` checks `gh` before it pushes).

## 1. The three gaps are one

A container deployment runs one team as one operating-system user, and the
kernel's trust model says what that means: one team is one trust group, and
nothing inside the group is hidden from any agent in it. Three consequences
reach knowledge writes.

1. **#149, who can write.** `oats okf propose` pushes and opens the PR with
   whatever `git` and `gh` find: a credential helper, `gh`'s stored login or
   `GH_TOKEN`. In a container that credential is readable by every agent. If
   it is the maintainer's own, every agent can merge, push the accepted
   branch or post a verdict as the maintainer. The package's own checks
   (owned nodes, the write surface, the content screen, "the maintainer gates
   every merge") are made by a tool the agent may simply not use.
2. **#150, how it is provisioned.** Nothing says what a deployment must put
   in place for knowledge to work, and nothing checks it. An operator
   assembles it by hand.
3. **#151, what a write records.** Every proposal commit has the same fixed
   author, and the PR is opened by the shared account. The agent's name is
   in the commit message and the PR body's provenance block, and after the
   squash merge the accepted history has neither.

One design answers the three: **the forge enforces, the package checks and
records.**

- The credential inside the trust group can propose and nothing more. What
  stops it from landing a change is the repository's branch rule, not the
  package.
- The identity that merges lives outside the trust group.
- One command says whether a deployment is provisioned that way, and names
  the fix for each thing missing.
- A knowledge change names the agent that made it, and that agent's human
  where OATS knows one, in the commit and in the accepted history. The name
  is a statement by a member of the trust group, and the docs say so.

## 2. What the package promises, written down

This statement goes in the README, and the kernel's container document links
to it. It is the answer to "what is the guarantee":

> Inside one trust group, whatever the group's knowledge credential may do,
> any agent may do. oats.okf does not hide that credential from an agent and
> cannot. A deployment gets a real gate by provisioning two things: a
> **proposer credential** that can create branches and pull requests on the
> knowledge repository and cannot update its accepted branch, and an accepted
> branch that changes only through a pull request merged by an identity held
> **outside** the agents' trust group (a person, or a knowledge maintainer in
> its own trust group with its own credential). oats.okf checks that
> provisioning at bring-up and reports what is missing. It records which
> agent proposed a change; that record is the agent's own statement, not
> proof.

A knowledge maintainer agent that shares the proposers' container shares
their credential, so it cannot be the gate there. The docs say that plainly
rather than imply a gate.

## 3. The contract (what both sides agree before the build)

Each item is a change to what a deployment provisions, runs or reads.

### C1. A new setting, `github-token-file` (#149)

`settings.oats.okf.github-token-file`: the normalized absolute path of a file
that holds one GitHub token, the deployment's proposer credential. The
deployment keeps the file current (a mounted secret, a refreshed App
installation token, a machine user's token: the package does not care which).

**It is host-only.** The value is a path on one machine, so it is read from
the deployment's `oats-local.yaml` only. A value a soul, a workspace or a
spawn flag set would point every host at a file one of them holds; it
refuses with `E_CONFIG`, naming the setting, the layer that set it and the
move (set it in this deployment's `oats-local.yaml` under
`settings.oats.okf`, and remove it there). When the kernel does not say where
a value came from, it refuses the same way and lists where to look.

When it is set:

- Every `git` call of the package that talks to a remote (clone, fetch,
  ls-remote, push) and every `gh` call uses that token and no other
  credential. The file is read at each call, so a rotated token is picked up
  without a restart. Ambient credential helpers, `gh`'s stored login and an
  inherited `GH_TOKEN` or `GITHUB_TOKEN` are not consulted.
- The token is given to `git` through a credential helper the package
  supplies for `https://github.com` only, and to `gh` in that one child
  process's environment. It never appears in an argument, an error, a
  receipt or a log, and the harness's own environment never holds it.
- A Git base must be bound by its `https://github.com/` URL. Any other
  locator refuses, naming the base and the fix (bind it by its HTTPS URL).
- A missing, unreadable, empty or malformed file refuses every command that
  needs the network with `E_CREDENTIAL`, naming the setting, the path and
  both fixes: provision the file, or remove the setting to use this user's
  own login. There is no silent fall-back to ambient credentials.

When it is not set, nothing changes: the package uses the user's own `git`
and `gh` login as today. **No existing deployment has to change.**

**A file is a stated, interim exception.** Juan's side's deployments hold
provider credentials behind a secrets broker and never as agent files. This
one credential is a file because `git` and `gh` consume it inside the
container and no brokered Git credential helper exists yet. The exception is
bounded: the credential is team-scoped, has the write role only on the
knowledge repository, and is read inside one trust group. The README says so.

**The shape leaves room for the broker.** The package resolves the credential
through one internal seam, a credential source that yields a token for one
call. `github-token-file` selects the file source. A brokered source arrives
later as its own setting, exclusive with this one (both set refuses, naming
both), and `setup --check` reports it as a third mode beside `file` and
`ambient`. Nothing a deployment wrote for the file source changes meaning.

**One predicate with #148.** #148 gives `propose --apply` a preflight that
refuses before the push when `gh` cannot publish. There is one predicate,
"this deployment's credential can publish to this base", with one
implementation: in file mode it tests the file's token and its write access
to the repository, in ambient mode `gh`'s own login. The #148 preflight and
`setup --check` item 5 both call it. Whichever of the two changes lands
second uses the other's predicate and adds no second one.

The publication helper gains an optional `--token-file` with the same
meaning, so a maintainer in its own trust group can be provisioned the same
way. The maintainer's default stays its user's own login.

### C2. What the deployment provisions on GitHub (#149)

Documented, with the commands and a ruleset file the operator can apply. The
operator does this once, from outside the agents' trust group, with an
administrator's login that never enters it.

- **The proposer credential:** scoped to the knowledge repository, with
  contents write and pull-requests write, held by an identity that has the
  write role there and no more (no maintain, no admin).
- **The accepted branch:** a ruleset that restricts updates, requires a pull
  request, blocks force pushes and deletion, and lets only the merging
  identity's role bypass, for pull requests only. This is the rule the
  `okf-trigger-setup` skill already teaches; it becomes a required part of
  bring-up for a deployment that sets `github-token-file`.
- **The merging identity:** a person, or a knowledge maintainer in its own
  trust group. Its credential is never mounted into the proposers' container.

### C3. A bring-up check, `oats okf setup --check` (#150)

`oats okf setup --check --soul <soul> [--json]`: read-only, unattended,
exit 0 only when nothing is missing. Each line is `ok`, `warning` or
`problem`, and every `problem` names its whole fix. It checks:

1. the settings: `bindings-file` and `state-dir` set, absolute, readable; the
   state directory writable;
2. the soul's declaration, and that its nodes or subjects resolve in the
   accepted bases;
3. each Git base: the locator form, that its accepted branch is reachable,
   that the base validates;
4. `git` and `gh` on the path;
5. the credential: which mode is in use (`file` or `ambient`), that it
   authenticates, that it can write the repository, and its role there;
6. the accepted branch's protection, as `oats okf bases` reads it;
7. the `okf-proposal` label.

What is a `problem` depends on the mode, so that an existing deployment is
told, not broken:

| Finding | `github-token-file` set | not set (today's mode) |
|---|---|---|
| credential cannot write the repository | problem | problem |
| credential's identity has maintain or admin there | problem | warning |
| protection reads `none` or `unknown` | problem | warning |
| ambient mode itself | n/a | warning that states section 2's guarantee |

The command changes nothing on GitHub; locally it fills the host's consult
cache, as any read does (found while building it). It does not create the
repository, the ruleset or the credential: those need an administrator's
login, which belongs outside the trust group.

The README gains one section, "Bringing up a deployment's knowledge store",
which lists every item an operator provisions, in order, with who does it
and where: the knowledge repository and its first bundle (`oats okf init`),
the ruleset, the proposer credential and its file, the bindings file and the
state directory on durable storage, each soul's `okf.json`, the egress the
package needs (`github.com` and `api.github.com`, port 443; where a
platform cannot allow egress by hostname, GitHub's published address ranges
for Git and the API, kept current, or port 443 opened more widely as the
deployment's own stated decision), the
`proposal-review` trigger on the host that holds the merging credential, and
`setup --check` as the last step. It also states the two limits: the base
must be on github.com, and with `github-token-file` it must be bound over
HTTPS.

### C4. A knowledge change names its proposer (#151)

The proposal's commit message gains Git trailers, written by `propose` and
shown by `--check` (they are inside the digest):

```text
okf-proposal: <claim>

Source: instance <instance>, soul <soul>

Proposed-by: <instance> (soul <soul>)
Proposer-identity: <the instance's messaging address, else its alias>
Attributed-human: <label>
```

- `Proposer-identity` is present only when the home records a messaging
  identity. `Attributed-human` is present only when that identity's
  `attribution` has mode `human`, read as the kernel reads `attributedHuman`:
  through the messaging slot only, the label held to the same one-line rule,
  a malformed or absent attribution read as absent. Absence never refuses or
  warns: attribution stays optional, as in OATS.
- The trailers pass the content screen like the rest of the commit text. A
  label the screen would refuse is left out and `--check` says so in a
  warning; it never blocks a proposal the agent cannot fix.
- In the operator's recovery form, `Proposed-by` names the retired source and
  a `Published-by` trailer names the caller's instance, or `operator`.
- When the maintainer merges, the squash commit's body carries those
  trailers from the reviewed head, and a `Proposal: <PR URL>` trailer, after
  today's `Reviewed OKF head:` line. The accepted history then names the
  proposer and points at the reviewed record.
- The existing `Source:` line and the version 3 provenance block are
  unchanged. They stay a consistency pointer, not proof, and so do the
  trailers: any member of the trust group can name any home. The README says
  that the forge's account record shows the team credential, that the
  per-agent name is self-declared, and that the reviewable record is the
  pull request.

The commit's author and committer stay the package's fixed text. A squash
merge discards them, and an author field invites being read as proof.

**Compatibility.** A maintainer on 6.0.x merges a 6.1 proposal as before; its
squash body simply lacks the trailers. A 6.1 maintainer merges a 6.0.x
proposal as before; there are no trailers to carry. Nothing parses the
trailers, so no version of anything refuses on them.

## 4. Rejected, and deferred

- **Passing the token in the harness's launch environment** (`GH_TOKEN` from
  the kernel's `env.fromFile`). It works today with no code. Rejected as the
  recommended route: the token then sits in every tool call's environment
  and reaches transcripts the first time a command prints its environment.
  It remains what "not set" means, and the check names it `ambient`.
- **Refusing ambient credentials outright.** It would break every existing
  single-host deployment, where agents share a person's login by that
  person's decision. The mode is opt-in; the check warns.
- **Having the package create the repository, ruleset or credential.** Those
  need an administrator's login inside the tool, which is the thing #149
  removes from the agents' reach.
- **Checking protection on every `--apply`.** A rule can change the minute
  after it is read. The check belongs to bring-up; `--apply` stays one
  publication with no new remote reads beyond #148's.
- **The proposer's instance as the commit author.** See C4.
- **A new provenance block version.** A 6.0.x maintainer would refuse it, so
  a proposer upgraded first would lose its reviews. The trailers need none.
- **Deferred: a verified signature.** The proposer signs the `--check`
  digest with its messaging identity's key and the maintainer verifies it.
  It needs a provider-neutral "sign as the served identity" contract from
  the kernel and the messaging capability, and a decision from Juan's side.
  It is the next step only if a deployment asks for proof rather than a
  record. Recorded in `KERNEL-API-NEEDS.md`.
- **Deferred: an audit event** per proposal, until the audit log's contract
  for agent-originated events exists.
- **Not this package's:** the kernel's container document and the deployment
  bundle's acceptance journey (one claim proposed, reviewed and merged on a
  fixture repository). This design gives each the text and the command to
  call; their owners make the change.

## 5. Plan

Three pull requests against this repository, each landing separately, each
with its CHANGELOG entry and the docs and skills it makes untrue. Together
they are oats.okf 6.1.0 (a new setting, a new command form, new commit text;
nothing a deployment must change).

1. **Attribution (#151).** Trailers in `propose`; the merge body in the
   publication helper (both byte-identical copies); README "How knowledge is
   proposed" and the provenance section; the `okf-propose` and
   `knowledge-review` skills where they describe the commit.
2. **The proposer credential (#149).** The setting, the credential helper,
   one environment builder that every remote `git` and `gh` call goes
   through, `--token-file` on the publication helper, `E_CREDENTIAL`; README
   settings and section 2's statement; `okf-trigger-setup`. Coordinated with
   #148's lead: its `gh` preflight runs through the same builder.
3. **Bring-up (#150).** `setup --check`, the README section, the ruleset
   file. Depends on 2.

Acceptance of 2 and 3 is a rehearsal against real GitHub on a private test
repository, deleted afterwards: a ruleset as documented, a credential with
the write role only, one proposal opened through `github-token-file`, a
direct push and a merge by that credential both refused by GitHub, and
`setup --check` reading each state it reports. A unit test against a fake
`gh` proves the fake. The rehearsal needs a second GitHub identity with the
write role only; if none can be provided, the PR says exactly which claims
were rehearsed and which were not.

## 6. Points settled with both sides

1. **The setting's name is `github-token-file`.** Juan's side offered
   `githubTokenFile`; every setting of this package is kebab-case
   (`bindings-file`, `state-dir`, `screen-terms-file`), and one package keeps
   one spelling.
2. **`Attributed-human` is written by default** where OATS records the
   human, stated as self-declared (Juan's side, 2026-11-12).
3. **An identity with maintain or admin is a `problem` in file mode,** never
   a warning: that role can bypass or change the ruleset, so the agents could
   merge their own proposals. The fix named is a write-role-only credential
   (Juan's side, 2026-11-12). The rehearsal establishes what GitHub reports
   for each kind of token.
4. **The journey step** (one claim proposed, reviewed and merged on a fixture
   repository) belongs to the acceptance journey of a deployment that runs
   oats.okf, and its owner adds it there. No deployment's journey is
   committed to it here (amended 2026-11-13: the deployment this was first
   planned with keeps its own knowledge capability; the design stays generic).

5. **The separated credential is opt-in** (Pepe's side, 2026-11-12, settled
   from recorded decisions and reported to Pepe, who may overrule): refusing
   knowledge writes on a person's login would break every existing
   deployment at upgrade with no migration.
6. **`github-token-file` is host-only, and its check is one predicate with
   #148's preflight** (Pepe's side, 2026-11-12): both are in C1.

Both sides agreed C1 to C4 on 2026-11-12 with the changes recorded here. The
build may start.
