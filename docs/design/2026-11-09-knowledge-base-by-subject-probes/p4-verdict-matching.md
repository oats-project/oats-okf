# Probe P4: verdict matching catches wording, not claim identity

## Question

Does the draft verdict key `sha256("<Type>|<normalized title>")[0:16]` prevent a rejected claim being proposed again under a paraphrased title? What can dependency-free lexical candidate retrieval add?

**Answer in one line:** exact hashes caught **0/180** deliberately retitled queries; a conservative union of title and rewritten-summary Jaccard caught **144/180 (80%)**, with a different-concept candidate on **6/180 queries (3.3%)**. Use **stable maintainer-assigned claim IDs for verdict identity**, and hashes/lexical scores for **candidate review, not semantic refusal**. These are synthetic-probe rates, not an estimate of production recurrence.

## What I built

Everything is scratch-only. No push, PR, accepted-base write, deployment change, or oats.okf source change.

- `/tmp/kb-design/p4/probe.mjs`: dependency-free Node script; metadata extraction, seeded sampling, matching, assertions and tables. Run with Node 26: `node /tmp/kb-design/p4/probe.mjs`.
- `/tmp/kb-design/p4/corpus-repo/`: local clone of `/tmp/kb-design/oats-knowledge`, pinned to **1b6d6ea70f713176e7ce448ce849343a2bc6c986**. Its only remote points to that local clone, never GitHub.
- `/tmp/kb-design/p4/corpus.json`: 418 original concept records (`type`, `title`, `description`, path), plus draft mapped type.
- `/tmp/kb-design/p4/sample.json` and `sample.md`: random 60-concept sample. Sorted paths → Mulberry32 seed **20261109** → Fisher–Yates shuffle → first 60, without replacement.
- **Paraphrases:** `/tmp/kb-design/p4/paraphrases.json`. Three hand-authored-by-the-assistant titles per sampled concept, written before any matching scores were computed. Also one independently worded, concise description per concept, reused across its three titles. No external model/service calls. SHA-256: `7f95622d76c2c585dc7b9a0f1f99601842c64f26f8f6580b077ccc83212faa53`.
- `/tmp/kb-design/p4/queries.json`: expanded 180 queries, source paths and chosen substring terms.
- `/tmp/kb-design/p4/results.json`, `per-query.json`, `tables.md`: complete numerical results, target scores and highest-scoring wrong candidates, full sweeps including description/type-filter sensitivities.
- `/tmp/kb-design/p4/initial-token-keywords/`: preserved first implementation and outputs before refining substring selection from arbitrary tokens to words. Archival script snapshot, not an independent installation.

### Corpus and draft ontology

The 418 typed concepts are 179 Decisions, 213 Lessons, 13 Conclusions, 5 Limitations, 2 Roadmaps, 5 References and 1 Playbook. The random sample contains 19 Decisions, 34 Lessons, 2 Conclusions, 2 Limitations, 1 Roadmap, 1 Reference and 1 Playbook.

Applied the supplied draft's mapping: Decision/Roadmap → Decision; Lesson/Conclusion/Limitation → Insight; Reference and Playbook unchanged. That gives 181 Decisions, 231 Insights, 5 References and 1 Playbook. Hashes use the **mapped claim type**, not the record's `type: Verdict`. No About-based pruning: this experiment does not need subject migration, and cross-subject near-duplicates must remain possible candidates. References/Playbooks remain in the requested full corpus, although the ontology explicitly calls them documents rather than claims.

**Schema gap identified:** the draft verdict preserves `claim-title` but no claim description or stable claim ID. A title+description retrieval lane cannot run over verdict records alone as drafted. It needs a retained ruled-description snapshot (or a reliably resolvable proposal snapshot). This is a proposed schema extension, not something silently assumed to exist.

## What I measured/observed

### Definitions and implementation

- Exact key: mapped `<Type>` plus `|` plus lowercase, trimmed, whitespace-collapsed title; SHA-256 truncated to 16 hexadecimal characters. Punctuation/order remain significant. The additional exact title+description experiment appends another `|` and normalized description.
- Jaccard: `|intersection| / |union|` of unique tokens. NFKC, lowercase, Unicode letter/digit tokenization, fixed function-word stop list recorded in `results.json`; no stemming, synonyms, embeddings or model. Negation/scope operators such as `not`, `never`, `only`, `before` and `after` are retained.
- Title lane compares query title with ruled title. Rewritten title+description lane compares each query title plus its hand-rewritten summary with original title+description.
- Substring lane selects the three rarest **in-corpus words from the query title**, using title+description document frequency, minimum three letters, with ties by length then lexical order. It does not consult the true target when selecting terms. Words absent from the corpus are skipped since they cannot yield a metadata hit. Two-word lane uses the first two. Each word is searched as a case-insensitive literal substring; separate result sets are combined by file. No word boundaries or stemming. All queries had three eligible words.
- **This combination is a wrapper, not native multiword AND in `oats okf search`.** Current worktree `consult.mjs` and the installed consultation skill specify a fixed-string query; joining the words with spaces searches a contiguous phrase. That alternative is measured too. Primary substring tables search metadata to keep the same candidate surface as Jaccard; a full-Markdown sensitivity is below.
- Search **all 418 candidates**, without type filtering, for each of 180 queries. A hit means the known source concept is included, not merely that any candidate was returned. A wrong candidate means a **different source path**, as the task requested. Such a path can be related or partly duplicative rather than semantically false.
- FP-query rate = queries with at least one wrong candidate / 180. FP-pairs = wrong returned query–concept pairs; denominator for pair FPR is **180 × 417 = 75,060**. Candidate precision = true returned pairs / all returned pairs. These definitions avoid hiding nuisance matches behind a tiny pairwise error rate.

### Selected hit-rate table

The Jaccard operating points below are exploratory choices after viewing the sweep, not independently validated cutoffs. No paraphrases were changed after scores were seen.

| Lane | Threshold | Target hits | Hit rate | Queries with wrong candidate | Wrong pairs | Candidate precision |
|---|---:|---:|---:|---:|---:|---:|
| Exact type + normalized title hash | equality | 0/180 | 0.0% | 0/180 | 0 | — |
| Exact type + title + rewritten-description hash | equality | 0/180 | 0.0% | 0/180 | 0 | — |
| Jaccard title | ≥0.30 | 105/180 | 58.3% | 5/180 (2.8%) | 5 | 95.5% |
| Jaccard title + rewritten description | ≥0.20 | 129/180 | 71.7% | 2/180 (1.1%) | 2 | 98.5% |
| Substring, two distinctive words | both | 76/180 | 42.2% | 8/180 (4.4%) | 10 | 88.4% |
| Substring, three distinctive words | at least two | 113/180 | 62.8% | 42/180 (23.3%) | 66 | 63.1% |
| Union: title ≥0.30 **or** rewritten title+description ≥0.20 | either | 144/180 | 80.0% | 6/180 (3.3%) | 6 | 96.0% |

Union pair FPR is **6/75,060 = 0.0080%**, but its query-level nuisance rate is **3.3%**. It returns 0.83 candidates/query on average, maximum 2, and still misses **36/180 paraphrases**. The union is a membership test, not a calibrated ranking; do not silently take its first candidate.

### Jaccard threshold sweep

Every cell uses the same fixed 180 queries and 418 candidates. `FP queries / pairs` counts both kinds of false-positive burden.

| Threshold | Title hits | Title hit % | Title FP queries / pairs | Rewritten title+description hits | Hit % | FP queries / pairs |
|---:|---:|---:|---:|---:|---:|---:|
| 0.10 | 157 | 87.2% | 137 / 593 | 174 | 96.7% | 89 / 188 |
| 0.20 | 129 | 71.7% | 25 / 27 | 129 | 71.7% | 2 / 2 |
| 0.30 | 105 | 58.3% | 5 / 5 | 46 | 25.6% | 0 / 0 |
| 0.40 | 83 | 46.1% | 1 / 1 | 8 | 4.4% | 0 / 0 |
| 0.50 | 64 | 35.6% | 0 / 0 | 2 | 1.1% | 0 / 0 |
| 0.60 | 44 | 24.4% | 0 / 0 | 0 | 0.0% | 0 / 0 |
| 0.70 | 30 | 16.7% | 0 / 0 | 0 | 0.0% | 0 / 0 |
| 0.80 | 16 | 8.9% | 0 / 0 | 0 | 0.0% | 0 / 0 |
| 0.90 | 9 | 5.0% | 0 / 0 | 0 | 0.0% | 0 / 0 |
| 1.00 | 6 | 3.3% | 0 / 0 | 0 | 0.0% | 0 / 0 |

A reviewer-oriented high-recall option exists: rewritten title+description at 0.10 found **174/180**, but **89 queries** included unrelated-path candidates, with 188 extra candidates total (mean 2.01 candidates/query, max 14; precision 48.1%). On this same authored sample, the target ranked first on all 174 hits. That is interesting for a candidate UI, not held-out proof that top-1 is safe. Adding description changes score scale: applying the title threshold of 0.30 unchanged loses most rewritten-summary hits.

### Substring threshold sweep

| Metadata word selection | Required matches | Target hits | Hit % | FP queries | Wrong pairs | Mean / max candidates |
|---|---:|---:|---:|---:|---:|---:|
| 2 words | 1 | 145 | 80.6% | 169 | 1,278 | 7.91 / 61 |
| 2 words | 2 | 76 | 42.2% | 8 | 10 | 0.48 / 3 |
| 3 words | 1 | 164 | 91.1% | 179 | 2,672 | 15.76 / 71 |
| 3 words | 2 | 113 | 62.8% | 42 | 66 | 0.99 / 5 |
| 3 words | 3 | 53 | 29.4% | 1 | 1 | 0.30 / 1 |

- **Full Markdown, same three words:** 1-of-3 finds 175/180, with 180 FP queries / 23,888 wrong pairs; 2-of-3 finds 148/180, with 177 / 4,518; 3-of-3 finds 82/180, with 119 / 527 (mean 3.38 candidates, max 36 for 3-of-3). Bodies, links and repeated vocabulary greatly increase candidate noise. This excludes index/log files and does not model the CLI's 50-line display cap, so it is still more favorable than indiscriminately consuming displayed native hits.
- **One contiguous phrase made by joining the rarity-ordered words:** two words find 3/180, three words 0/180, with no wrong candidates. This is intentionally a test of the naive API composition mistake, not a test of carefully selected natural-language phrases. Native substring search has no implicit term intersection.

### Controls and sensitivities

1. **Exact-key sanity:** original titles and case/whitespace-only variations each recover 60/60 sampled targets. Across the 418 records there were no duplicate normalized titles or truncated type+title hashes. Exact-match failure is wording brittleness, not a broken implementation or hash collision.
2. **Description leakage:** if each re-proposal keeps the original description verbatim, title+description Jaccard at 0.40 finds **180/180 with zero wrong candidates** (also 180/180 at 0.20, with five wrong candidates). This is an optimistic preserved-text condition, not independent paraphrase recall. At 0.20, rewritten summaries instead produce **129/180**, and a title-only query against stored title+description gives only **57/180**, with two wrong candidates. These conditions must not be mixed into one result.
3. **Paraphrase style dominates:** title variants were generally near-reordering, stronger synonym/reformulation, then moderate reformulation/qualification. At title Jaccard 0.30 the three sets hit **59/60, 2/60, 44/60**. The conservative union hits **59/60, 34/60, 51/60**. Thus 80% is conditional on this deliberately mixed set, not a natural-frequency estimate.
4. **Type filtering:** keeping only the same mapped type leaves title ≥0.30 at 105 hits / 5 wrong pairs; rewritten title+description ≥0.20 remains 129 hits and drops from 2 to 1 wrong pair. There are 37,032 negative pairs after this filter. It cannot solve lexical misses, and this trial keeps query type unchanged; hard filtering would introduce unmeasured misses for retyped claims.
5. **Similarity is not semantic agreement:** prefixing each original title with `It is false that` still matches its source at title Jaccard ≥0.50 in **60/60 controls**. Separately, changing only a description to explicitly deny it leaves a title-only hash unchanged in **60/60 controls**. These contradiction stress checks are not part of the 180 paraphrases or their FP estimates; they show why even an apparently perfect lexical threshold is not a rejection verdict.
6. **Concrete wrong candidates:** query 8.1 (soul's own/composed AGENTS.md inspection field) also retrieves the different concept about opt-in **skill** inspection at title score 0.308. Query 54.3 (team handling in oats.aweb 1.16.1) retrieves **grant custody** at 0.357. Query 44.3 plus rewritten description retrieves the **launch-without-focus** decision at 0.200. Two wrong pairs for concept 17 point to the canonical maintainer retirement/opt-out decision, demonstrating that different-file FP is not necessarily irrelevant semantics.
7. **Concrete misses:** query 4.2, `Device authorization lifetime is set by the service rather than the client waiting limit`, preserves the device-code expiry contrast but scores 0.056 on title and 0.059 on rewritten title+description. Query 1.2's executable replacement/unloading/registering wording scores 0.133 and 0.044. These need semantic review or a known claim ID, not hash widening.

### Validation

The script asserts the accepted corpus commit, 418 parsed records, complete metadata, recognized ontology types, 60 unique sampled paths by sampling construction, 60 numbered paraphrase rows, three distinct titles each, 180 expanded queries, three eligible substring words per query, normalization behavior and Jaccard examples. Syntax checking and execution passed under Node **v26.12.1**. A full rerun left the SHA-256 digests of `paraphrases.json`, `results.json`, `per-query.json` and `tables.md` unchanged. Separate checks passed for 60 unique sampled paths and monotonic hit/FP counts as thresholds rise.

The repository's own `npm test` was also attempted from this instance's `./work`: manifest validation passed, but the complete suite **timed out after 120 seconds**, with no failing assertion printed before timeout and no final test summary. This is **not a passing full-suite result**. It is not a probe-script failure, and no repository source was changed or repaired. Both `./work` and the scratch corpus clone remained Git-clean at final verification. The parent is informed of the incomplete suite; no claim about external-system acceptance follows.

## Answer

### Identity: use a stable maintainer-assigned claim ID

- **Do not use the title hash as the verdict's durable primary identity.** It is an exact-rendering lookup key, useful for detecting verbatim or normalization-only retries. This probe cannot estimate the proportion of real re-proposals that keep such wording; all 180 selected paraphrases intentionally changed it.
- **Do not replace it with a title+description hash.** That adds another mutable surface and still caught 0/180. Exact equality over more text is not semantic matching. Description helps lexical retrieval only when stored and scored, and unchanged-description results overstate independent-rewrite recovery.
- **Use an immutable claim ID assigned/confirmed by the maintainer at first adjudication, including rejection.** Preserve it across title edits, type changes and relocation; record reason, ruled content snapshot, decision provenance and status/supersession links. Keep normalized hashes (with normalization version) as secondary indexes and known wording aliases, not identity. A claim ID can fit the draft's flat-scalar constraint, but changing verdict filenames/keying is an explicit design amendment.
- **An ID does not magically recognize a new anonymous paraphrase.** Known-ID re-proposals can be checked deterministically; newly worded claims still need candidate retrieval and reviewer resolution onto the existing ID. Do not assign a fresh authoritative identity simply because the title hash missed.

### Proposer behavior: list candidates and require an explanation, not lexical refusal

1. If a proposal supplies a known claim ID, read its current verdict and any supersession. An unchanged retry of an explicitly rejected identity can be refused as a duplicate unless it uses the defined reconsideration/reopening path. New evidence or changed scope must be reviewer-adjudicated, not silently prohibited forever by an old rejection.
2. Otherwise consult exact title hashes first, then lexical candidates across ruled-title/description snapshots. Return reason/status, old title/description, source link and score/matched words. A hash hit is still a **candidate** unless identity and unchanged scope are established: two claims can share a generic title or differ only in their description.
3. Start an implementation discussion with the measured conservative union (80% recall, 3.3% queries with wrong candidates), or test a higher-recall review list such as combined-text Jaccard at 0.10. Neither cutoff is production-validated. Keep substring as a cheap fallback/manual search aid, not a reliable semantic gate.
4. Have the proposer identify existing/reopened/different and give the difference or new evidence. The reviewer resolves candidates to the canonical ID, records aliases and decides whether to reject, reconsider or supersede. A no-match result means **not found**, never **new claim proven**.

So the design's safe statement is: **a verdict record remembers an adjudicated claim; exact and lexical checks help rediscover it. Neither title hashing nor a stable ID alone prevents all renamed re-proposals.**

## Limits

- Accepted concepts stand in for previously rejected claims. No rejected-claim corpus, real re-proposal frequency or actual proposer behavior was observed.
- 60 randomly selected source concepts, but three queries per concept are correlated. No confidence interval pretending there are 180 independent real events. The sample includes one document from each of Reference and Playbook.
- One assistant authored all paraphrases after reading titles/descriptions; no independent semantic adjudicator. Strong-synonym variants and concise rewritten descriptions intentionally stress lexical matching and may omit qualifiers. The data are available for inspection rather than claiming perfect semantic equivalence.
- No held-out tuning set. Chosen operating points and the union are exploratory; keyword refinement was made after inspecting the first run and is fully retained below.
- False positives use source-path identity, as requested, not a human judgment that every different path expresses a distinct claim. The base already has related canonical/pointer concepts.
- No production verdict store was built; no CLI write path, maintainer workflow, authority migration, external service behavior or live rejection enforcement was tested. The Node scratch runner is not a released oats.okf feature. Worktree package metadata is 5.8.0; this is not a released-tag verification claim.
- Used only the task's OATS ontology sketch; no external schema was read or copied. No human acceptance of this recommendation is claimed.
- Knowledge consulted before design: `oats/nodes/oats-okf-expert/decisions/consult-explores-accepted-knowledge-remotely-no-per-instance-copy.md@1b6d6ea70f71` (accepted-read boundary) and `oats/nodes/oats-maintainer/decisions/optional-reference-theory.md@1b6d6ea70f71` (capability runtime ownership). No accepted verdict-matching decision was found by the relevant search.

## Approaches tried

1. **Strict quoted-scalar extraction:** failed on a literal title beginning with a quoted phrase followed by more text. The corpus uses flat OKF scalar text, so only wholly quoted values are unwrapped. Corpus was not edited; final extraction yielded the requested 418 records.
2. **Exact normalized title hash:** 0/180 renamed queries; 60/60 case/whitespace controls. **Exact title+description hash:** also 0/180. Rejected as durable semantic identity keys, retained as useful equality indexes.
3. **Token-set Jaccard:** full sweeps above. Title-only trades recall for almost no nuisance at ≥0.30; independently rewritten descriptions improve retrieval at a lower threshold. Rejected transferring one universal threshold between text lengths.
4. **Description conditions:** unchanged descriptions made retrieval look perfect (180/180 at 0.40); rewritten descriptions yielded 129/180 at 0.20; absent query description yielded 57/180 at 0.20. Kept all three rather than hiding preserved-text leakage.
5. **Initial substring selection allowed all normalized tokens**, including version digits/short fragments. Two-of-two found 77/180 with 10 FP queries and 14 wrong pairs; two-of-three found 114/180 with 44 and 80; three-of-three found 55/180 with 2 and 3. Inspection exposed version-fragment matches. Refined to alphabetic words of at least three letters: respective results **76/180 with 8/10**, **113/180 with 42/66**, **53/180 with 1/1**. Initial files remain under `initial-token-keywords/`; paraphrases were unchanged. This is a method correction with measured cost, not hidden tuning.
6. **Substring aggregation, full bodies and joined phrases:** measured separately above. Broad OR/body searching was noisy; requiring every word missed synonyms; concatenating rare words into one native literal query almost never matched. No inference that native search performs token AND.
7. **Mapped-type filtering:** modest nuisance reduction only, no extra recall, and vulnerable to untested retyping. Kept unfiltered primary results.
8. **Conservative Jaccard union:** 144/180 with six extra candidates, max two returned. A useful candidate list, not complete suppression. **Contradiction controls:** 60/60 lexical matches despite explicit denial, independently ruling out score-only refusal.

Next authorized action: parent incorporates these findings into the design and decides whether to propose stable claim IDs plus candidate retrieval. This probe itself authorizes no implementation or publication.
