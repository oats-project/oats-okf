# The accepted branch's ruleset

`accepted-branch-ruleset.json` is the GitHub branch ruleset the README's
"Bringing up a deployment's knowledge store" asks for: updates restricted,
a pull request required, force pushes and deletion blocked, and one bypass,
for pull requests only, for the repository role the merging identity holds.

Before applying it, set two things:

- `conditions.ref_name.include`: the knowledge base's accepted branch
  (`refs/heads/main` here).
- `bypass_actors[0].actor_id`: the repository role of the merging identity.
  The file names the built-in maintain role (`2`); the built-in admin role is
  `5`, and an organisation's custom role has its own id. The proposer
  credential's identity must not hold that role.

An administrator applies it from outside the agents' trust group:

```sh
gh api --method POST repos/<owner>/<repo>/rulesets --input accepted-branch-ruleset.json
```

Then read the ruleset back in the repository's settings (Settings, Rules,
Rulesets) and check the bypass list by eye: `oats okf setup --check` reads
that a rule exists, not who may bypass it.
