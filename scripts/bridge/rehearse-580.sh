#!/bin/sh
# The 5.8.0 consult rehearsal of the bridge PR (spec §2): the released CLI over local Git bindings of the
# base before (BEFORE ref) and after (AFTER ref) the bridge.
#
#   scripts/bridge/rehearse-580.sh <oats-okf checkout> <oats-knowledge clone> [BEFORE] [AFTER]
#
# BEFORE defaults to main, AFTER to the clone's current branch. Everything is created in a fresh temporary
# directory. The CLI runs with a cleared environment: an instance's ambient OATS_INSTANCE_HOME would make
# 5.8.0 refuse a local repository under that home (E_PATH, disposable source custody).
set -eu
OKF=$(cd "$1" && pwd); KB=$(cd "$2" && pwd)
BEFORE=${3:-main}; AFTER=${4:-$(git -C "$KB" rev-parse --abbrev-ref HEAD)}
T=$(mktemp -d)
git -C "$OKF" archive v5.8.0 oats-package/capabilities/oats-okf | tar -x -C "$T"
CLI="$T/oats-package/capabilities/oats-okf/bin/oats-okf.mjs"
git clone -q --bare "$KB" "$T/kb.git"
git -C "$T/kb.git" branch -f rehearsal-before "$BEFORE" >/dev/null
git -C "$T/kb.git" branch -f rehearsal-after "$AFTER" >/dev/null
mkdir -p "$T/soul-v1" "$T/soul-reserved"
git -C "$OKF" show v5.8.0:souls/oats-okf-expert/okf.json > "$T/soul-v1/okf.json"
printf '%s\n' '{"version":1,"owner":"8ecb9837-b76c-498b-9989-9c3cc1179bac","owns":["oats/oats-okf-expert"],"reads":["oats/claims","oats/subjects"]}' > "$T/soul-reserved/okf.json"
for side in before after; do
  printf '{"version":1,"stateDir":"%s","bases":{"oats":{"id":"oats-knowledge","kind":"git","repository":"%s","root":"knowledge","acceptedBranch":"rehearsal-%s","pr":{"repository":"oats-project/oats-knowledge"}}}}\n' \
    "$T/state-$side" "$T/kb.git" "$side" > "$T/bindings-$side.json"
done
okf() { side=$1; soul=$2; shift 2
  env -i PATH="$PATH" HOME="$HOME" OATS_SETTINGS="{\"bindings-file\":\"$T/bindings-$side.json\"}" OATS_SOUL="$T/$soul" node "$CLI" "$@"; }
strip() { grep -v '^— oats@'; }
echo "## bases (after, v1 soul)"; okf after soul-v1 bases | sed "s|$T|<tmp>|g"
okf before soul-v1 index | strip > "$T/idx-before"; okf after soul-v1 index | strip > "$T/idx-after"
echo "## index, v1 soul: $(wc -l < "$T/idx-before") lines before, $(wc -l < "$T/idx-after") after"
cmp "$T/idx-before" "$T/idx-after" && echo "identical"
for p in /nodes/oats-maintainer/decisions/optional-reference-theory.md \
         /nodes/integrations-expert/lessons/a-fake-that-hangs-must-have-a-child.md \
         /nodes/oats-okf-expert/limitations/spawn-preview-runs-no-spawn-hook.md; do
  okf before soul-v1 cat --base oats "$p" | strip > "$T/cat-before"; okf after soul-v1 cat --base oats "$p" | strip > "$T/cat-after"
  echo "## cat $p: lines only in after"; diff "$T/cat-before" "$T/cat-after" | grep '^[<>]' || true
done
echo "## ls /claims (after)"; okf after soul-v1 ls --base oats /claims
echo "## ls /subjects/system (after)"; okf after soul-v1 ls --base oats /subjects/system | cut -c1-100
echo "## index sections, soul reading oats/claims and oats/subjects (after)"; okf after soul-reserved index | grep '^## oats/'
echo "## the same soul before the bridge"; okf before soul-reserved index 2>&1 | cut -c1-80 || true
rm -rf "$T"
