#!/bin/bash
# Mutation check: each mutant must turn the unit suite red. Usage: scripts/mutants.sh
cd "$(dirname "$0")/.." || exit 1
fail=0
bak=$(mktemp)
file=
trap '[ -n "$file" ] && cp "$bak" "$file"' EXIT INT TERM
mutate() { # file, perl substitution, description
  file=$1
  cp "$1" "$bak"
  perl -0pi -e "$2" "$1"
  if cmp -s "$1" "$bak"; then echo "NOT APPLIED: $3"; fail=1
  elif npx playwright test --project=unit -x --reporter=dot >/dev/null 2>&1; then echo "SURVIVED: $3"; fail=1
  else echo "killed: $3"; fi
  cp "$bak" "$1"
  file=
}
O=src/shared/ops.ts; D=src/shared/doc.ts
mutate $O 's/if \(kids && !cs\[i\]\.collapsed\)/if (false)/' 'open parent treated as leaf'
mutate $O 's/depth: d - 1 \}/depth: 0 }/' 'out jumps to depth 0'
mutate $O 's/cs\[end\]\.depth < d\)/cs[end].depth <= d)/' 'lastInGroup ignores next depth'
mutate $O 's/const lastInGroup = d > 0 &&/const lastInGroup =/' 'out allowed at depth 0'
mutate $O 's/if \(slot\.depth > draft\[i\]\.depth\) draft\[i\]\.collapsed = false/void 0/' 'insert does not expand'
mutate $O 's/for \(let j = i \+ 1; j < end; j\+\+\) draft\[j\]\.depth--/void 0/' 'remove does not promote'
mutate $O 's/return out\.length \? out : \[blank\]\n\}\n\nexport function removeWithIndented/return out\n}\n\nexport function removeWithIndented/' 'remove may empty the doc'
mutate $O 's/j >= subtreeEnd\(cs, i\)\)/j > subtreeEnd(cs, i))/' 'removeWithIndented off by one'
mutate $O 's/cs\[i - 1\]\.depth < d\) return cs/cs[i - 1].depth < d - 1) return cs/' 'indent guard loosened'
mutate $O 's/draft\[p\]\.collapsed = false/void 0/' 'indent does not open target'
mutate $O 's/subtreeEnd\(cs, i\) > i \+ 1\n    \?/true\n    ?/' 'toggle on leaves'
mutate $O 's/hideBelow = c\.collapsed && subtreeEnd\(cs, i\) > i \+ 1 \? c\.depth : Infinity/if (c.collapsed) hideBelow = c.depth/' 'hideBelow never resets'
mutate $O 's/\[A-Za-z\]\[A-Za-z0-9\]\*/[A-Za-z0-9]+/' 'numeric extensions match'
mutate $O 's/l\.filter\(\(l\) => l\.trim\(\)\)/l.filter(() => true)/; s/lines\.filter\(\(l\) => l\.trim\(\)\)/lines.filter(() => true)/' 'dedent counts blank lines'
mutate $O 's/draft\[i\]\.collapsed = false \/\/ adopted siblings must not vanish/void 0/' 'outdent leaves adopted siblings hidden'
mutate $D 's/cells: z\.array\(Cell\)\.min\(1\)/cells: z.array(Cell)/' 'empty doc accepted'
mutate $D 's/const max = i === 0 \? 0 : cells\[i - 1\]\.depth \+ 1/const max = i === 0 ? 0 : cells[i - 1].depth + 2/' 'depth jump accepted'
mutate $D 's/ids\.has\(c\.id\)/false/' 'duplicate ids accepted'
exit $fail
