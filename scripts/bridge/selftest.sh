#!/bin/sh
# Negative and edge-case tests of the bridge scripts against a real clone of the base.
#
#   scripts/bridge/selftest.sh <oats-okf checkout> <oats-knowledge clone> <base ref> <bridged ref> <okf-reindex.mjs>
#
# <base ref> is the unbridged main the PR was generated from; <bridged ref> defaults to the clone's HEAD.
# Every case runs in a throwaway clone; the given clone is not touched. Exits nonzero on the first case
# whose outcome is wrong.
set -eu
[ $# -eq 5 ] || { echo "usage: selftest.sh <oats-okf checkout> <oats-knowledge clone> <base ref> <bridged ref> <okf-reindex.mjs>" >&2; exit 2; }
OKF=$(cd "$1" && pwd); KB=$(cd "$2" && pwd)
BASE=$(git -C "$KB" rev-parse --verify "$3^{commit}"); BRIDGED=$(git -C "$KB" rev-parse --verify "$4^{commit}")
REINDEX=$(cd "$(dirname "$5")" && pwd)/$(basename "$5")
S="$OKF/scripts/bridge"; T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
PR='PR [#342](https://github.com/oats-project/oats-knowledge/pull/342)'
fresh() { rm -rf "$T/c"; git clone -q "$KB" "$T/c"; git -C "$T/c" checkout -q --detach "$1"; }
commit() { git -C "$T/c" -c user.name=t -c user.email=t@t commit -q -am "$1"; }
expect_fail() { name=$1; shift; if "$@" > "$T/out" 2>&1; then echo "FAIL (passed): $name"; tail -5 "$T/out"; exit 1; else echo "ok, refused: $name -- $(grep -m1 -E "FAIL|Error|failures|assert|E_|stale" "$T/out" | cut -c1-120)"; fi; }
expect_ok() { name=$1; shift; if "$@" > "$T/out" 2>&1; then echo "ok: $name"; else echo "FAIL (refused): $name"; tail -5 "$T/out"; exit 1; fi; }
L=knowledge/nodes/oats-okf-expert/limitations/spawn-preview-runs-no-spawn-hook.md
D=knowledge/nodes/integrations-expert/decisions/a-workspace-has-a-default-team-there-is-no-personal-team.md

# The bridged ref passes all three proofs.
fresh "$BRIDGED"
expect_ok "verify on the bridged ref" node "$S/verify.mjs" "$T/c" "$BASE"
expect_ok "bridge --check on the bridged ref" node "$S/bridge.mjs" "$T/c" --pr "$PR" --reindex "$REINDEX" --check
# A fresh generation from the base reproduces the bridged ref's knowledge tree byte for byte.
fresh "$BASE"; node "$S/bridge.mjs" "$T/c" --pr "$PR" --reindex "$REINDEX" > /dev/null
git -C "$T/c" add knowledge
[ -z "$(git -C "$T/c" diff --cached "$BRIDGED" -- knowledge)" ] && echo "ok: fresh generation equals the bridged ref" || { echo "FAIL: fresh generation differs from $BRIDGED"; exit 1; }
expect_ok "regenerator check on the fresh generation" node "$REINDEX" "$T/c/knowledge" --check
expect_fail "bridge: --reindex is required" node "$S/bridge.mjs" "$T/c" --pr "$PR" --check
fresh "$BRIDGED"; echo '* stale' >> "$T/c/knowledge/subjects/system/oats-okf/index.md"
expect_fail "bridge --check: a stale view" node "$S/bridge.mjs" "$T/c" --pr "$PR" --reindex "$REINDEX" --check
fresh "$BRIDGED"
expect_ok "rehearsal on the bridged ref" "$S/rehearse-580.sh" "$OKF" "$T/c" "$BASE" HEAD

# verify.mjs refuses out-of-scope edits.
fresh "$BRIDGED"
echo 'REVIEW-PROBE' >> "$T/c/knowledge/nodes/oats-okf-expert/index.md"
expect_fail "verify: a legacy node index edited" node "$S/verify.mjs" "$T/c" "$BASE"
fresh "$BRIDGED"; echo '* extra line' >> "$T/c/knowledge/log.md"
expect_fail "verify: an extra root log line" node "$S/verify.mjs" "$T/c" "$BASE"
fresh "$BRIDGED"; sed -i '1s/^{$/{\n  "review-probe": true,/' "$T/c/knowledge/okf-base.json"; grep -q review-probe "$T/c/knowledge/okf-base.json"
expect_fail "verify: an extra top-level field in okf-base.json" node "$S/verify.mjs" "$T/c" "$BASE"
fresh "$BRIDGED"; echo 'extra body line' >> "$T/c/$L"
expect_fail "verify: a concept body changed" node "$S/verify.mjs" "$T/c" "$BASE"

# rehearse-580.sh fails on index or body drift.
fresh "$BRIDGED"; echo '* drift' >> "$T/c/knowledge/nodes/oats-okf-expert/index.md"; commit drift
expect_fail "rehearsal: v1 index drift" "$S/rehearse-580.sh" "$OKF" "$T/c" "$BASE" HEAD
fresh "$BRIDGED"; echo 'drift' >> "$T/c/$L"; commit drift
expect_fail "rehearsal: sampled body drift" "$S/rehearse-580.sh" "$OKF" "$T/c" "$BASE" HEAD

# bridge.mjs reads values as the reader parses them, and refuses what it cannot.
fresh "$BASE"; sed -i 's/^tags: \[\(.*\)messaging/tags: [\1"messaging"/' "$T/c/$D"
grep -q '"messaging"' "$T/c/$D"
node "$S/bridge.mjs" "$T/c" --pr "$PR" --reindex "$REINDEX" > /dev/null
grep -q '^about: \[workstream/provider-integration, workstream/messaging\]$' "$T/c/$D" && echo "ok: a quoted tag still maps" || { echo "FAIL: quoted tag"; exit 1; }
fresh "$BASE"; sed -i 's/^\(description: .*\)$/\1 # private editor note/' "$T/c/$D"
node "$S/bridge.mjs" "$T/c" --pr "$PR" --reindex "$REINDEX" > /dev/null
! grep -rq 'private editor note' "$T/c/knowledge/subjects" && echo "ok: a description comment is not copied into views" || { echo "FAIL: comment copied"; exit 1; }
fresh "$BASE"; sed -i 's/^title: \(.*\)$/title: "\1"/' "$T/c/$D"
node "$S/bridge.mjs" "$T/c" --pr "$PR" --reindex "$REINDEX" > /dev/null
grep -q '^\* \[A workspace has a default team' "$T/c/knowledge/subjects/workstream/provider-integration/index.md" && echo "ok: a fully quoted title is unquoted in views" || { echo "FAIL: quoted title"; exit 1; }
fresh "$BASE"; sed -i 's/^tags: \[/tags: [{x}, /' "$T/c/$D"
expect_fail "bridge: a tag list the reader cannot parse" node "$S/bridge.mjs" "$T/c" --pr "$PR" --reindex "$REINDEX"
fresh "$BASE"; sed -i 's/^\(description: .*\)$/\1\nid: dec-000000000000/' "$T/c/$D"
expect_fail "bridge: a stray bridge key on main" node "$S/bridge.mjs" "$T/c" --pr "$PR" --reindex "$REINDEX"
[ "$(git -C "$T/c" status --porcelain)" = " M $D" ] && echo "ok: a refused run wrote nothing" || { echo "FAIL: refused run wrote files"; exit 1; }
# regenerate.sh takes main's fetched tip even under a branch-limited fetch refspec with a stale origin/main.
rm -rf "$T/origin.git" "$T/r" "$T/w"
git clone -q --bare "$KB" "$T/origin.git"
git -C "$T/origin.git" update-ref refs/heads/main "$BASE"
git -C "$T/origin.git" update-ref refs/heads/okf-bridge/2026-11-10 "$BRIDGED"
git clone -q --branch okf-bridge/2026-11-10 "$T/origin.git" "$T/r"
git -C "$T/r" config --replace-all remote.origin.fetch '+refs/heads/okf-bridge/2026-11-10:refs/remotes/origin/okf-bridge/2026-11-10'
git clone -q "$T/origin.git" "$T/w"; git -C "$T/w" checkout -q main
echo probe > "$T/w/new-main-file.txt"; git -C "$T/w" add new-main-file.txt
git -C "$T/w" -c user.name=t -c user.email=t@t commit -q -m "advance main"; git -C "$T/w" push -q origin main
TIP=$(git -C "$T/w" rev-parse HEAD)
(cd "$T/r" && GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t "$S/regenerate.sh" "$OKF" 342 "$BRIDGED" "$REINDEX" "selftest" > /dev/null 2>&1) || { echo "FAIL: regenerate.sh refused"; exit 1; }
[ "$(git -C "$T/r" rev-parse HEAD~2)" = "$TIP" ] && [ -f "$T/r/new-main-file.txt" ] && echo "ok: regenerate.sh builds on main's fetched tip" || { echo "FAIL: regenerate.sh did not build on main's tip"; exit 1; }
echo "SELFTEST PASSED"
