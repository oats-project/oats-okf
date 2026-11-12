# Kernel surfaces oats.okf 6.0 relies on

oats.okf 6.0.3 declares **OATS >=0.69.2** (the
soul key `background:`) and is tested in CI against released **OATS 0.69.2**. It needs no private
kernel API and no knowledge-specific kernel behaviour. The capability, not
the kernel, owns OKF validation, consultation, the host cache, provisioning
and migration.

## Environment

| Variable | Used for |
|---|---|
| `OATS_SETTINGS` | the effective `oats.okf` settings (`bindings-file`, `state-dir`, `git-timeout`, `consult-max-age`, `screen-terms-file`); a 4.x harvest key refuses |
| `OATS_SETTINGS_ORIGINS` | which layer (host, soul, spawn) set a 4.x harvest key, named in the `E_REMOVED` sentence |
| `OATS_SOUL` | the soul directory whose `okf.json` an instance (or a deployment command run with `--soul`) consults; `oats okf propose` also checks it against the home's recorded soul |
| `OATS_INSTANCE_HOME`, `OATS_HOME` | the instance home (instance knowledge, `inspect`, the proposal directory) |
| `OATS_INSTANCE` | the caller's instance, named as `proposer.instance` in the operator's recovery form (`null` from the deployment) |
| `OATS_KIND` | a service (capability) instance gets no knowledge upkeep |
| `OATS_EVENT` | the hook being run (`spawn`, `soul-scaffold`) |
| `OATS_WORKSPACE`, `OATS_TEAM_SCOPE` | the deployment `setup --remove-legacy-settings` edits; absent, relative, missing or disagreeing is `E_DEPLOYMENT_SCOPE` |
| `OATS_BINDING_FILE` | an optional captured ProviderBinding1 snapshot |
| `OATS_TRIGGER_EVENT_FILE` | the maintainer's trigger event (`review-context --event`) |

`OATS_SOURCE_RECEIPT_FILE` and `OATS_INVOCATION_CONTEXT_FILE` are no longer
used; their presence answers `E_REMOVED`.

## Hooks, commands and operations

- The knowledge slot's required **spawn** hook (no declared inputs) and its
  **soul-scaffold** hook. No retire hook. Until 7.0, the removed harvester's
  stub capability declares one required spawn hook that always refuses with
  `E_REMOVED` before the kernel keeps a home.
- Manifest commands under `oats okf` (including `propose --plan|--check|--apply`)
  and `oats okf-maintenance`, dispatched from an instance home or from the
  deployment with `--soul`. A home that does not compose a capability gets the
  kernel's own `E_UNKNOWN_COMMAND` for it.
- The `knowledge:inspect` view and the `knowledge:harvest` action (the
  latter kept only to answer `E_REMOVED`).
- `oats okf status` reads the provider's home-local, spawn-written harvest
  policy. Static inject/skill composition carries a conditional duty and an
  explicit opt-out exception; no conditional kernel injection is needed.
  The spawn hook's TASK brief contains no harvest/proposal direction.
- The binding wire's `check` phase for readiness, with `binding.reasons` as
  the allowlist of text that may cross it.

## Spawning and automation

- **Proposals**: no spawn. A working agent runs `oats okf propose` from its
  own home through the kernel's ordinary in-home dispatch; the operator runs
  `oats okf propose --home <retirement recovery directory> --soul <soul>` from
  the deployment for a retired source. The command reads the home's
  `instance.json`, its spawn-written `okf-harvest-policy.json`, a recovery's
  `recovery.json` and copied home, and `OATS_SOUL`; it needs no instance
  events and no kernel identity lookup.
- **Package soul** `oats.okf/knowledge-maintainer`, and until 7.0 the stub
  `oats.okf/knowledge-harvester` (every spawn refused).
- **Trigger templates** `oats.okf:proposal-review` (label `okf-proposal`) and,
  through 6.x, `oats.okf:harvest-review` (label `okf-harvest`; the kernel ANDs
  `on.labels`, so one template per label), installed by the operator as a workspace automation
  or with `oats trigger add`.

The proposing instance and the maintainer use `git` and `gh` with the host's
ordinary credentials; the kernel is not involved in publication.

## What the package reads from the record without a kernel API

From 6.1, `oats okf propose` names the proposer in the commit's trailers. It
reads the home's `instance.json` itself, as the kernel's `attributedHuman`
does (feature `spawn-attribution`, OATS 0.69.8): the `identity` that the
capability whose `capabilityRuntime` layer is `messaging` recorded in
`capabilityMeta`, its `address` or `alias`, and its optional
`attribution: {mode, human: {id, label}|null, parent: {id}|null}`. On an
older kernel, or a home with no such record, the trailers are simply absent.

## Not available: a signature by the served identity

The trailers are the proposer's own statement. Proof needs the proposer to
sign the `--check` digest with the key of the identity it serves, and the
maintainer to verify it. That needs a provider-neutral contract ("sign these
bytes as the served identity", "verify this signature for that identity")
from the kernel and the messaging capability; oats.okf must not call one
messaging provider's CLI. It is not asked for until a deployment needs proof
rather than a record (design: `docs/design/2026-11-12-container-knowledge-writes.md`, section 4).
