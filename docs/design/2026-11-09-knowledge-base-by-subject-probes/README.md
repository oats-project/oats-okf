# Probe reports for the knowledge-base-by-subject design

Evidence appendices to [the design](../2026-11-09-knowledge-base-by-subject.md),
§9. Each report was written by a separate OATS child instance on a different
model from the design's author (author `claude-fable-5.1`; probes
`github-copilot/gpt-6-astra` on pi), in a scratch copy of the base
`oats-project/oats-knowledge` at `1b6d6ea70f71`, never the real one. Nothing
was published. Scratch paths under `/tmp/kb-design/` named in the reports
were the probes' working directories and are not kept.

- `ontology-sketch.md`: the working ontology the probes exercised (the design's
  §2 is the refined version).
- `p1-markdown-engine.md`: Markdown-in-Git conversion, link rewrite, generated
  indexes, cold/warm query cost from a bare partial clone.
- `p2-graph-store.md`: an OATS-only schema on Omnigraph 0.12.0 standalone:
  load, verbs, branch/merge, export; what oats.okf would change.
- `p3-direct-proposal.md`: the released publication helpers run from a working
  home against a local bare remote; the `propose` surface; write access.
- `p4-verdict-matching.md`: exact title hash versus lexical candidate retrieval
  on 60 × 3 paraphrased titles.
