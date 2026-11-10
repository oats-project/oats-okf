#!/bin/sh
# The 5.8.0 consult rehearsal of the bridge PR (spec §2): the released CLI over local Git bindings of the
# base before (BEFORE ref) and after (AFTER ref) the bridge.
#
#   scripts/bridge/rehearse-580.sh <oats-okf checkout> <oats-knowledge clone> [BEFORE] [AFTER]
#
# BEFORE defaults to main, AFTER to the clone's current branch. Everything is created in a fresh temporary
# directory. The CLI runs with a cleared environment: an instance's ambient OATS_INSTANCE_HOME would make
# 5.8.0 refuse a local repository under that home (E_PATH, disposable source custody).
# Exits nonzero unless: every CLI call succeeds (except the one expected refusal); the v1 soul's index is
# byte-identical before and after; each sampled `cat` differs only by the bridge's frontmatter block right
# after `description:`; the reserved nodes are listed after; and before the bridge a soul reading them gets
# exactly E_NOT_FOUND for `claims`.
set -eu
OKF=$(cd "$1" && pwd); KB=$(cd "$2" && pwd)
BEFORE=${3:-main}; AFTER=${4:-$(git -C "$KB" rev-parse --abbrev-ref HEAD)}
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
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
# Only the bridge's block (about, kind, status, decided-by, id; contiguous, right after description:, in the frontmatter)
# may separate the two outputs.
cat > "$T/only-bridge-keys.mjs" <<'JS'
import { readFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2).map(f => readFileSync(f, 'utf8').split('\n'));
const close = b.indexOf('---', 1), d = b.findIndex((l, i) => i < close && l.startsWith('description:'));
let n = 0;
while (/^(about|kind|status|decided-by|id): /.test(b[d + 1 + n] ?? '') && d + 1 + n < close) n++;
const stripped = [...b.slice(0, d + 1), ...b.slice(d + 1 + n)];
const ok = b[0] === '---' && d > 0 && n >= 2 && b[d + 1].startsWith('about: ') && b[d + n].startsWith('id: ')
  && JSON.stringify(stripped) === JSON.stringify(a);
console.log(ok ? `  only the bridge block differs (${n} lines)` : '  FAIL: more than the bridge block differs');
process.exit(ok ? 0 : 1);
JS
okf() { side=$1; soul=$2; shift 2
  env -i PATH="$PATH" HOME="$HOME" OATS_SETTINGS="{\"bindings-file\":\"$T/bindings-$side.json\"}" OATS_SOUL="$T/$soul" node "$CLI" "$@"; }
# run SIDE SOUL OUT ARGS...: the CLI must succeed; OUT gets its output without the receipt line.
run() { side=$1; soul=$2; out=$3; shift 3
  okf "$side" "$soul" "$@" > "$out.raw" || { echo "FAIL: okf $* ($side) exited $?"; cat "$out.raw"; exit 1; }
  grep -v '^— oats@' "$out.raw" > "$out" || true; }

echo "## bases (after, v1 soul)"; run after soul-v1 "$T/bases" bases; sed "s|$T|<tmp>|g" "$T/bases"
grep -q 'valid OKF base' "$T/bases" || { echo "FAIL: base not valid"; exit 1; }
run before soul-v1 "$T/idx-before" index; run after soul-v1 "$T/idx-after" index
echo "## index, v1 soul: $(wc -l < "$T/idx-before") lines before, $(wc -l < "$T/idx-after") after"
cmp -s "$T/idx-before" "$T/idx-after" || { echo "FAIL: index differs"; diff "$T/idx-before" "$T/idx-after" | head; exit 1; }
echo "  identical"
for p in /nodes/oats-maintainer/decisions/optional-reference-theory.md \
         /nodes/integrations-expert/lessons/a-fake-that-hangs-must-have-a-child.md \
         /nodes/oats-okf-expert/limitations/spawn-preview-runs-no-spawn-hook.md; do
  run before soul-v1 "$T/cat-before" cat --base oats "$p"; run after soul-v1 "$T/cat-after" cat --base oats "$p"
  echo "## cat $p"; diff "$T/cat-before" "$T/cat-after" | grep '^>' || true
  node "$T/only-bridge-keys.mjs" "$T/cat-before" "$T/cat-after"
done
echo "## ls /claims (after)"; run after soul-v1 "$T/ls-claims" ls --base oats /claims; cat "$T/ls-claims"
grep -qx 'index.md' "$T/ls-claims" && grep -qx 'log.md' "$T/ls-claims" || { echo "FAIL: /claims"; exit 1; }
echo "## ls /subjects/system (after)"; run after soul-v1 "$T/ls-system" ls --base oats /subjects/system; cut -c1-100 "$T/ls-system"
[ "$(grep -c '^[a-z0-9-]*\.md  \[System\]' "$T/ls-system")" -ge 1 ] || { echo "FAIL: /subjects/system"; exit 1; }
echo "## index sections, soul reading oats/claims and oats/subjects (after)"
run after soul-reserved "$T/idx-reserved" index; grep '^## oats/' "$T/idx-reserved"
[ "$(grep -c -E '^## oats/(claims|subjects) \(reads\)$' "$T/idx-reserved")" -eq 2 ] || { echo "FAIL: reserved reads"; exit 1; }
echo "## the same soul before the bridge (expected refusal)"
if okf before soul-reserved index > "$T/refusal" 2>&1; then echo "FAIL: expected E_NOT_FOUND before the bridge"; exit 1; fi
cut -c1-80 "$T/refusal"
grep -q 'E_NOT_FOUND: base "oats" has no node "claims"' "$T/refusal" || { echo "FAIL: unexpected refusal"; exit 1; }
echo "REHEARSAL PASSED"
