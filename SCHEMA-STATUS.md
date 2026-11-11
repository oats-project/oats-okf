# Schema and verification status

oats.okf (6.0 unreleased; manifests read 5.8.0) requires **OATS >=0.69.2**,
the first kernel that reads the `background:` key used by the
`knowledge-maintainer` soul and the `knowledge-harvester` stub (removed in 6.0; it refuses every spawn until 7.0).
Version declarations are not evidence of a published release.

## Schemas

The OKF JSON Schemas ship in the capability's `schemas/`, with copies in the
repository's `schemas/`:

| Schema | Describes |
|---|---|
| `okf-bindings.schema.json` | the bindings document (`version: 1`, `stateDir`, `bases`; no `cron`/`tz`) |
| `okf-soul.schema.json` | a soul's `okf.json`: `version: 1` (`owner`, `owns`, `reads`) or, 6.0, `version: 2` (`subjects`) |
| `okf-base.schema.json` | a base's `okf-base.json` (`version: 1`, `id`, `nodes`) |
| `okf-portable-declaration.schema.json` | the portable `knowledge` envelope, `oats.okf.locations@1` |
| `okf-portable-payload.schema.json` | the ProviderBinding1 OKF payload, **payloadVersion 2** (`owner`, `stores`, `reads`, `owns`, `runtime`; no `execution`) |

The generic ProviderBinding1 envelope is a kernel contract. Runtime code
also checks what a schema cannot: filesystem containment, identities,
overlap, base metadata, ownership and OKF conformance.

A knowledge PR's provenance block has no JSON Schema; its parser
(`oats.okf-maintenance` `lib/provenance.mjs`) is strict, requires the fence to
match the version, and accepts:

- **version 3** (6.0, fence `okf-proposal`): `source {soul, owner, instance,
  incarnation, subjects?, ownedNodes, readNodes, bases}` (`subjects` is the
  `<kind>/<slug>` list of a soul declared by subjects, an `okf.json`
  version 2; 6.0 writes it for such a soul, with `owner` `null` and empty node
  lists),
  the same `evidence` and
  `tasks`, and `proposer {form: live | recovery, instance (null only in the
  recovery form), alias}`;
- **version 2** (5.0, fence `okf-harvest`): `source {soul, owner (required), instance,
  ownedNodes, readNodes, bases}`, `evidence [{note: notes/…/*.md, sha256?}]`
  (at most 100), `tasks {provider, refs}`, `harvester {instance, alias}`;
  a base's `repository` is its GitHub `owner/repo`, never a path or URL;
- **version 1** (4.x): `run`, `input` ids and `source` with `soulId`, so 4.x
  PRs stay reviewable.

Unknown keys are refused in all three.

## What the tests check

`npm test` runs `scripts/validate-manifests.mjs` (package and capability
manifests against the vendored schema keywords, exported resources inside
the distribution, skill trees) and the 5.x suite (`test/okf5-*.test.mjs`;
the 4.x tests of the removed machinery were removed, not ported):
consultation of Git bases through the host cache, the hooks, `inspect`,
`init` and `migrate`, the removed surfaces, the legacy-settings guard and
cleanup, the provenance parser for versions 1, 2 and 3, and `oats okf
propose` (`test/okf6-propose.test.mjs`: plan, check and apply on a local
remote with the shipped helper and a fake `gh`, the refusals, the recovery
form).
The vendored `schemas/capability-manifest.schema.json` is oats v0.27.1's
`docs/capability-manifest.schema.json` plus the `hooks.upgrade` property from
OATS v0.68.1 (13f8f133), byte for byte; `test/okf5-manifests.test.mjs` pins
its hash. `test/okf5-upgrade-hook.test.mjs` runs the upgrade hook on homes
made by released v5.8.0, v5.3.0, v5.1.0 and v4.2.2 code, under a preload that refuses
every write and child process.

CI's `kernel-upgrade-0692` job installs the released **OATS 0.69.2** and runs
`test/okf5-kernel-upgrade.test.mjs` through it. A v5.2.1 home cannot move to the
hook-less v5.3.0. A v5.3.0 home is adopted by this checkout, with its spawn
policy and working memory byte-identical afterwards. A v4.2.2 home is refused with
the respawn remedy.

CI's `real-kernel-0692` job installs the released **OATS 0.69.2** in a
disposable prefix and runs `test/okf5-real-kernel.test.mjs` through it: the
legacy-key cleanup, a real spawn running `oats okf propose --plan` and
`--check` through the kernel's in-home dispatch, `oats spawn
oats.okf/knowledge-harvester` refused by the stub's spawn hook with the
`E_REMOVED` fix, the removed surfaces, the operator form on the retired source's real recovery, both
opt-out spellings, the spawn refusal of `knowledge.propose`, and the
knowledge-maintainer's preview and `background: true` default. All spawns use
`--no-launch` (no model, messaging or GitHub).

The schemas themselves are not exercised by the suite: no test validates
documents or the `examples/portable-binding/` data against them, or checks
that the repository copies match the capability's. The binding wire
(`binding-normalize`, `binding-bind`, `binding-check`) and `unlock` have no
tests in the 5.x suite either.

## Not covered

- A model-run proposer judging its own knowledge, and a real maintainer review.
- That an agent follows an instruction, the personal-data exclusion included:
  the suite pins the shipped text, not the behaviour.
- A real GitHub PR, merge and accepted-head visibility.
- Package acquisition, lock/restore and trust of the published distribution.

These are verified by running the flow on a real deployment and knowledge
base, outside this repository's tests.
