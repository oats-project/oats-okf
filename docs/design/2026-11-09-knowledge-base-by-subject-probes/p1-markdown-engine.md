# Probe P1 — Markdown-in-Git subject engine

## Question

Can the accepted 418-concept OKF base carry the draft subject ontology, retain navigability after automatic conversion, and support selective `claims --about SUBJECT [--type T]` queries economically from a bare partial clone?

**Scope:** experimental evidence for the design, not an accepted migration or a published implementation. Input: the required local clone of `oats-project/oats-knowledge`, commit `1b6d6ea70f713176e7ce448ce849343a2bc6c986`, bundle root `knowledge/`. The ontology is the parent's 2026-11-09 sketch. No remote publication, deployment changes, external-material reads, or edits to `./work` were made.

## What I built

Everything is under `/tmp/kb-design/p1/`:

- `source/`: local `git clone --no-hardlinks` of the supplied clone; its only remote is the supplied local path, not GitHub.
- `convert.mjs`: dependency-free conversion, old-path redirects, secondary-subject heuristic, body/log link rewriting, generated subject/root indexes, file-link and root-index reachability audits.
- `bundle/`: final converted bundle, committed to a new **scratch-only** Git repository with no remote. `bundle-regenerated/` is byte-identical (excluding `.git`), checking deterministic generation.
- `okf-validate-original.mjs`, `okf-validate.mjs`, `parser.diff`: unchanged copy and minimal flow-list extension of the requested validator. `parser.mjs` extracts that exact copied parser for reuse in conversion/query/tests.
- `claims-about.mjs`: summary queries returning the same sorted `(path, type, title, description)` records via (a) `ls-tree` + `cat-file --batch` + frontmatter parsing, (b) the same scan with explicit missing-blob prefetch, or (c) one committed generated subject index, optionally filtered by type.
- `benchmark.mjs`: independent blobless clones for each mode/workload/trial; cold then warm queries; wall time and physical object inventories; result equality assertions.
- `check.mjs`: parser positive/negative cases, About-edge target/cardinality checks, scalar/tag/timestamp preservation, and baseline-versus-converted file-link comparison.

The conversion retains original `title`, `description`, `tags`, `timestamp` spelling, rewrites `type`, adds the sketch's `kind` where applicable, marks the two Roadmaps `status: proposed`, and adds `source-soul` plus `about`. It does **not** invent acceptance dates, people, source instances, decision status, dependency evidence, or subject-to-subject relations. Subject files are minimal `System`/`Workstream` records; no existing data warrants a `Project` or `Verdict` instance.

Heuristic interpretation, made explicit for reproducibility:

1. Every concept gets the exact node→primary-subject mapping in the sketch.
2. Three or more **link occurrences** in its body to existing concepts in the same other node add that node's primary subject. Index/log links do not count; links to three different nodes once each do not count.
3. Exact case-insensitive tag membership for the sketch's six words: `kernel`→`system/oats-kernel`, `desktop`→`system/oats-desktop`, `messaging`→`workstream/messaging`, `knowledge`→`workstream/knowledge`, `operator`→`workstream/operations`, `integrations`→`workstream/provider-integration`. No substring/semantic tagging or inherited subject membership. Duplicate About-edges are removed.

## What I measured/observed

### Conversion and links

| Measure | Result |
|---|---:|
| Original typed concepts | 418 |
| Converted canonical claims/documents | 418 |
| Declared nodes / nodes containing concepts | 14 / 10 |
| Subject records | 16: 8 Systems, 8 Workstreams |
| Generated indexes | 17: root plus 16 subjects |
| Preserved history logs | 15 |
| `redirects.json` entries | 472: every original Markdown file |
| Canonical slug collisions | 0 |
| Existing body/log links rewritten | 2,673 |
| Of those, claim-body links / history-log links | 1,650 / 1,023 |
| Converted local inline Markdown links, including generated indexes | 3,262 |
| Newly introduced broken file links | 0 |
| Pre-existing broken file links retained | 2, both in root `log.md` |
| Claims unreachable through root→generated-index traversal | 0 |
| Subjects unreachable through root indexes | 0 |
| About-edges | 516 |
| Concepts with 1 / 2 / 3+ subjects | 331 / 76 / 11 |
| Concepts with ≥2 subjects | **87 / 418 (20.8%)** |

Types:

| Original | Converted | Count |
|---|---|---:|
| Decision 179 + Roadmap 2 | Decision | 181 |
| Lesson 213 + Conclusion 13 + Limitation 5 | Insight (`lesson` / `finding` / `constraint`) | 231 |
| Reference | Reference | 5 |
| Playbook | Playbook | 1 |
| None | Requirement / Risk / Question | 0 |

Four declared system subjects have no concepts: apps, authoring, jira, linear. They still have navigable subject files and empty indexes. Subject view sizes: kernel 110, direction 84, desktop 77, coordination 60, provider-integration 51, operations 39, messaging 33, positioning 27, knowledge 18, aweb 9, okf 6, workspace-administration 2; the other four are empty.

The two broken links already present in the input root log are `/nodes/oats-dev-expert/index.md` and `/nodes/oats-maintainer/optional-reference-theory.md`. I preserved the history rather than inventing a target or claiming it was repaired. **Literal “every link resolves” is therefore false for the starting bundle and remains false; every previously resolvable file link is preserved.** Old node/section indexes redirect to the appropriate generated subject view. Provenance citations naming historical paths/commits are not Markdown navigation links and are not rewritten.

There are 233 local fragment-bearing links in the original bundle, none targeting an index. Fragment strings and all 418 claim files' heading lines are preserved. The audit checks file targets, not correctness of pre-existing heading anchors or remote URLs; no full Markdown renderer was used.

### Validator and parser

- Baseline bundle: **418 concepts, 0 errors, 0 warnings**.
- Converted bundle with the **unchanged** validator: **434 concepts, 0 errors, 0 warnings**.
- Converted bundle with the **extended** validator, `--strict`, `OKF_STRICT_EXIT=1`: **434 concepts, 0 errors, 0 warnings** (418 claims + 16 subjects).
- Parser diff: **10 added lines, 2 deleted lines (net +8)**. It produces arrays for `[a, b]`, `[]`, and JSON-double-quoted string items, including quoted commas and escaped quotes; malformed/nested list fixtures are rejected. Ten parser cases passed.
- About/schema audit: all 418 claims have nonempty, deduplicated lists of existing subject refs; negative empty/missing-subject fixtures are rejected by this **separate** audit. Original title/description/tags/timestamp parse values are preserved for every claim.
- Existing validator never needed a type allowlist or permission for `about`: it accepts any nonempty `type` and ignores unknown keys. A deliberately invalid `type: Subject` with `about: [system/nonexistent]` still gets **0 errors/0 warnings** in the extended validator. Thus a green validator is **format conformance, not ontology conformance**. A real design needs schema/ref checks and a regenerate-and-diff gate.
- The tiny extension is a deliberately bounded flow-list subset, **not YAML compliance**. It inherits the original parser's scalar quoting/comment and indentation limitations; single-quoted flow items, nested structures and YAML-specific scalar semantics are not implemented.
- The source file in `./work` at `1d74816` is unchanged and identical to local tag `v5.8.0`. Repository suite from `./work`: **512 tests, 510 passed, 2 skipped, 0 failed**. This does not constitute a release/deployment acceptance test.

### Query timings and fetched objects

Environment: Git **2.55.0**, Node **26.12.1**, local `file://` upload-pack with filtering enabled in the scratch source repository. Each independent clone was created with `git clone --bare --filter=blob:none file:///tmp/kb-design/p1/bundle ...`. Before every cold query its inventory was **1 commit + 40 trees + 0 blobs**. Auto-maintenance was disabled in the benchmark clones to make physical counts interpretable.

Three independent cold/warm pairs per workload/mode: **27 successful cold trials + 27 warm trials**. All 54 returned exactly the expected sorted summaries, including the optional type filter. Wall time includes Node startup, Git subprocesses, parsing and output; inventory and clone creation are outside the timer. Medians and observed min–max are below, in **milliseconds**:

| About / type | Matches | Method | Cold median (min–max) | Warm median (min–max) |
|---|---:|---|---:|---:|
| `system/oats-okf` / all | 6 | Batch scan, lazy fetch | 14,690 (6,709–17,585) | 161 (134–389) |
| same | 6 | Prefetch + batch scan | 280 (238–326) | 100 (88–114) |
| same | 6 | Generated index | 106 (83–109) | 100 (92–102) |
| `system/oats-kernel` / all | 110 | Batch scan, lazy fetch | 10,375 (10,266–12,964) | 130 (117–297) |
| same | 110 | Prefetch + batch scan | 540 (540–622) | 242 (103–266) |
| same | 110 | Generated index | 192 (181–196) | 189 (63–196) |
| `system/oats-kernel` / `Insight` | 39 | Batch scan, lazy fetch | 11,194 (8,879–13,634) | 361 (206–389) |
| same | 39 | Prefetch + batch scan | 427 (426–523) | 157 (88–259) |
| same | 39 | Generated index | 205 (188–208) | 162 (158–179) |

Blob/object counts were invariant across subjects, filters and all three repetitions:

| Method | Cold total objects before→after | Cold blobs fetched | Warm objects before→after | Warm blobs fetched |
|---|---:|---:|---:|---:|
| Batch scan, lazy fetch | 41→459 | **418** | 459→459 | 0 |
| Prefetch + batch scan | 41→459 | **418** | 459→459 | 0 |
| Generated index | 41→42 | **1** | 42→42 | 0 |

Counts are `git count-objects -v`'s `count + in-pack`, cross-checked against physical `cat-file --batch-all-objects` inventories with `GIT_NO_LAZY_FETCH=1`, not counts of reachable objects that might silently fetch missing blobs. Untuned scans left 419 packs (initial pack plus one per claim blob); prefetch and index modes left 2.

Both scans read **2,482,300 uncompressed blob-content bytes** per query, even when only six results or one type were requested. Index reads consumed **3,307 bytes** for OKF or **37,936 bytes** for kernel (the type filter reads the same kernel index). These are content bytes, **not network-transfer measurements**.

## Answer

**Markdown in Git can carry the proposed paths, typed frontmatter and multi-subject About-edges without duplicating claims.** Conversion succeeds mechanically for all 418 concepts, and generated indexes make every claim reachable. The two already-dangling history links prevent an unconditional all-links-clean claim; the current validator conceals that distinction by exempting logs.

**Choose committed generated subject indexes for the ordinary subject walk**, with claim frontmatter as the sole source of truth and a deterministic regenerate-and-diff check. Keep scans for index construction, audits and fallback; batch-prefetch before scanning. This is a recommendation from this probe, not an accepted architectural decision. The final choice remains the parent design's responsibility.

The selective index uses 1 blob instead of hydrating all 418, reads roughly 751× fewer content bytes for OKF or 65× fewer for kernel, and keeps one canonical body per claim. Even against the fairer prefetched scan, its cold medians were approximately 2.1–2.8× lower. Untuned lazy scans are clearly unsuitable as the normal cold path. Prefetch makes a full scan entirely feasible at this size on local transport (about 0.28–0.54 seconds), so the evidence is **not** that Markdown requires a graph database or that scans are unusable.

Warm queries fetched no blobs in any method, and their wall-time ranges overlap substantially: generated indexes were **not consistently fastest** in this small shared-host sample. Choose them for selective I/O, predictable blob demand and a ready agent-readable subject view, not a claimed universal warm-latency win. If a reader already pays whole-base validation, distinguish that sunk cost from query cost; these measurements alone do not authorize weakening acceptance validation.

The parser extension is small. The larger missing work is **semantic validation and provider integration**, not storing lists: About targets/cardinality, allowed claim/subject types, subject relations, index freshness, ownership, and pinning all need explicit contracts.

## Limits

- Real local Git transport and real Git binary were exercised, not a fake. The transport was `file://`, **not GitHub/HTTPS or the live host consult cache**. No network-latency, bandwidth, multi-host, concurrent-writer, incremental-update or large-growth claim follows.
- Cold means blobs absent from the particular partial clone; OS page caches were not flushed. The source repository was warm from conversion. Clone setup is excluded from query wall time; per-trial clone timings are retained in raw results. Other agents share the host.
- The draft heuristic is not a semantic classifier. The 87 multi-subject result depends on the explicit six-tag interpretation and link-occurrence threshold, not human judgment. Fourteen mapped nodes do not mean fourteen populated nodes.
- Subject skeletons are not fully authored ontology records. Subject dependencies, workstream membership, projects, verdicts and acceptance provenance are not synthesized. The original `okf-base.json` node/owner registry is **not** represented as an approved new ownership model; the new scratch bundle deliberately does not pretend to be a registered provider base.
- **Important current-provider caveat:** `consult.mjs` at the inspected `./work` commit already has explicit `prefetch()` before bulk reads, and `verdict()` prefetches/materializes the whole base for an uncached accepted-commit validation. These are source observations, not live cache measurements. The one-blob cold index result is the isolated query's cost, **not a promise that today's full `oats okf` registration/validation lifecycle fetches only one blob**. Preserve the validation contract when designing any selective-read optimization.
- The suite and parser observations are qualified to the inspected tree/local tag; no installed provider or new command was released or accepted. Worktree remained clean.

## Approaches tried

1. **Baseline validator pointed at repository root:** wrong bundle root; reported 418 concepts, 1 error, 1,316 warnings. Corrected to `source/knowledge/`: 0 errors/warnings. Both results retained.
2. **Automatic conversion with assert-all-links-clean:** assertion found two old log links the validator exempts. Kept the defects visible and compared before/after rather than silently repairing history; no new broken file links.
3. **Re-serialize all metadata through the tiny scalar parser:** rejected as a fidelity strategy because the parser is not a YAML serializer. Final converter preserves original metadata spelling and tests value preservation; generated fields alone are serialized.
4. **Untuned `cat-file --batch` scan:** measured as requested. Batch output does not by itself establish batched missing-object retrieval; it is not the recommended cold scan path.
5. **Explicit missing-blob prefetch then batch scan:** measured separately so the index comparison does not hide an obvious optimization already present in current consult code.
6. **Single committed subject index:** measured with identical results and optional type filtering, plus deterministic generation comparison.
7. **Parser-only extension plus ontology-negative fixture:** proved list parsing is cheap but the existing validator cannot certify About semantics. Separate positive/negative About checks expose the missing enforcement instead of treating format acceptance as a schema proof.
8. **Benchmark harness timeout:** the first 120-second shell limit interrupted the run after 40 complete measurements (20 cold/warm pairs). Those results were retained. The interrupted unrecorded cold clone was not reused as cold: the remaining seven pairs ran with a fresh replacement clone and a 300-second shell limit. No partial measurement appears in the final 54-row dataset. A preliminary six-result smoke scan took 10.61 seconds on an earlier conversion; it is retained separately and is not mixed into the final table.

Raw evidence: `/tmp/kb-design/p1/conversion-stats.json`, `claim-map.json`, `check-results.json`, `bundle-validation.json`, `bundle-original-validation.json`, `semantic-negative-validation.json`, `benchmark-results.json`, `benchmark-summary.json`, `parser.diff`, and `repository-tests.log`.

Consulted accepted context: `oats/nodes/oats-okf-expert/decisions/consult-explores-accepted-knowledge-remotely-no-per-instance-copy.md@1b6d6ea70f71` (one accepted-state host cache, no per-instance copy); `oats/nodes/integrations-expert/lessons/credential-free-harness-probes-have-bounded-proof.md@1b6d6ea70f71` (state the exercised boundary); `oats/nodes/oats-kernel-expert/decisions/cache-fetch-negotiates-before-one-whole-retry.md@1b6d6ea70f71` (kernel cache policy is separate, not evidence for the OKF path).
