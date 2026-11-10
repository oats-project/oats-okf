#!/bin/sh
# Negative and edge-case tests of the bridge scripts against a real clone of the base.
#
#   scripts/bridge/selftest.sh <oats-okf checkout> <oats-knowledge clone> <base ref> [<bridged ref>]
#
# <base ref> is the unbridged main the PR was generated from; <bridged ref> defaults to the clone's HEAD.
# Every case runs in a throwaway clone; the given clone is not touched. Exits nonzero on the first case
# whose outcome is wrong.
set -eu
OKF=$(cd "$1" && pwd); KB=$(cd "$2" && pwd); BASE=$3; BRIDGED=${4:-$(git -C "$KB" rev-parse HEAD)}
S="$OKF/scripts/bridge"; T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
PR='PR [#342](https://github.com/oats-project/oats-knowledge/pull/342)'
fresh() { rm -rf "$T/c"; git clone -q "$KB" "$T/c"; git -C "$T/c" checkout -q --detach "$1"; }
commit() { git -C "$T/c" -c user.name=t -c user.email=t@t commit -q -am "$1"; }
expect_fail() { name=$1; shift; if "$@" > "$T/out" 2>&1; then echo "FAIL (passed): $name"; tail -5 "$T/out"; exit 1; else echo "ok, refused: $name -- $(grep -m1 -E "FAIL|Error|failures|assert|E_" "$T/out" | cut -c1-120)"; fi; }
expect_ok() { name=$1; shift; if "$@" > "$T/out" 2>&1; then echo "ok: $name"; else echo "FAIL (refused): $name"; tail -5 "$T/out"; exit 1; fi; }
L=knowledge/nodes/oats-okf-expert/limitations/spawn-preview-runs-no-spawn-hook.md
D=knowledge/nodes/integrations-expert/decisions/a-workspace-has-a-default-team-there-is-no-personal-team.md

# The bridged ref passes all three proofs.
fresh "$BRIDGED"
expect_ok "verify on the bridged ref" node "$S/verify.mjs" "$T/c" "$BASE"
expect_ok "bridge --check on the bridged ref" node "$S/bridge.mjs" "$T/c" --pr "$PR" --check
expect_ok "rehearsal on the bridged ref" "$S/rehearse-580.sh" "$OKF" "$T/c" "$BASE" HEAD

# verify.mjs refuses out-of-scope edits.
fresh "$BRIDGED"
echo 'REVIEW-PROBE' >> "$T/c/knowledge/nodes/oats-okf-expert/index.md"
expect_fail "verify: a legacy node index edited" node "$S/verify.mjs" "$T/c" "$BASE"
fresh "$BRIDGED"; echo '* extra line' >> "$T/c/knowledge/log.md"
expect_fail "verify: an extra root log line" node "$S/verify.mjs" "$T/c" "$BASE"
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
node "$S/bridge.mjs" "$T/c" --pr "$PR" > /dev/null
grep -q '^about: \[workstream/provider-integration, workstream/messaging\]$' "$T/c/$D" && echo "ok: a quoted tag still maps" || { echo "FAIL: quoted tag"; exit 1; }
fresh "$BASE"; sed -i 's/^\(description: .*\)$/\1 # private editor note/' "$T/c/$D"
node "$S/bridge.mjs" "$T/c" --pr "$PR" > /dev/null
! grep -rq 'private editor note' "$T/c/knowledge/subjects" && echo "ok: a description comment is not copied into views" || { echo "FAIL: comment copied"; exit 1; }
fresh "$BASE"; sed -i 's/^title: \(.*\)$/title: "\1"/' "$T/c/$D"
node "$S/bridge.mjs" "$T/c" --pr "$PR" > /dev/null
grep -q '^\* \[A workspace has a default team' "$T/c/knowledge/subjects/workstream/provider-integration/index.md" && echo "ok: a fully quoted title is unquoted in views" || { echo "FAIL: quoted title"; exit 1; }
fresh "$BASE"; sed -i 's/^tags: \[/tags: [{x}, /' "$T/c/$D"
expect_fail "bridge: a tag list the reader cannot parse" node "$S/bridge.mjs" "$T/c" --pr "$PR"
fresh "$BASE"; sed -i 's/^\(description: .*\)$/\1\nid: dec-000000000000/' "$T/c/$D"
expect_fail "bridge: a stray bridge key on main" node "$S/bridge.mjs" "$T/c" --pr "$PR"
[ "$(git -C "$T/c" status --porcelain)" = " M $D" ] && echo "ok: a refused run wrote nothing" || { echo "FAIL: refused run wrote files"; exit 1; }
echo "SELFTEST PASSED"
