#!/bin/bash
# Mutation check: each mutant must turn its suite red (unit for src/shared, else a rebuild
# + e2e). Usage: scripts/mutants.sh
cd "$(dirname "$0")/.." || exit 1
fail=0
bak=$(mktemp)
file=
trap '[ -n "$file" ] && cp "$bak" "$file"' EXIT INT TERM
suite() { # unit mutants need only the unit project; renderer mutants need a rebuild + e2e
  case $1 in
    src/shared/*) npx playwright test --project=unit -x --reporter=dot ;;
    *) npx electron-vite build && npx playwright test --project=e2e -x --reporter=dot ;;
  esac
}
mutate() { # file, perl substitution, description
  file=$1
  cp "$1" "$bak"
  perl -0pi -e "$2" "$1"
  if cmp -s "$1" "$bak"; then echo "NOT APPLIED: $3"; fail=1
  elif suite "$1" >/dev/null 2>&1; then echo "SURVIVED: $3"; fail=1
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
R=src/renderer/src
mutate $R/nav.ts 's/cursorLineUp\(v\) \|\| bodyEdge\(v, -1\)/cursorLineUp(v)/' 'up arrow stops at the body top'
mutate $R/focus.ts "s/a: e\.shiftKey \? 'outdent' : 'indent'/a: e.shiftKey ? 'indent' : 'outdent'/" 'Tab and Shift+Tab swapped'
mutate $R/focus.ts 's/isMd\(cell\) \? next && focusTitle\(next\) : focusBody/focusBody/' 'down arrow opens markdown raw'
mutate $R/Cell.tsx 's/if \(focused && !editing\) title\.current!\.focus\(\)/void 0/' 'new cell not focused'
mutate $R/Cell.tsx 's/, d\.max\)/, Infinity)/' 'resize unclamped'
mutate $R/CodeBody.tsx 's/crossCellArrows, pasteDedented,/crossCellArrows,/' 'paste not dedented'
mutate $R/state.ts "s/act\.a === 'insert' && act\.kind === 'md' \? focusId : s\.editingId/s.editingId/" 'new markdown cell not raw'
mutate $R/anchor.ts 's/setOffset\(Math\.min\(Math\.max\(left \+ width - sc\.clientWidth, 0\), left\)\)/setOffset(0)/' 'anchor never slides'
mutate $R/anchor.ts 's/if \(pinned\.current \|\| frame\) return/if (frame) return/' 'focus pin ignored on scroll'
mutate $R/theme.css 's/padding-bottom: 90vh;/padding-bottom: var(--lh);/' 'last cell cannot reach the anchor line'
mutate $R/theme.css 's/\.clip \{\n  overflow: clip;/.clip {\n  overflow: visible;/' 'clip layer removed'
M=src/main
mutate $R/state.ts 's/if \(edited\) window\.api\.docChanged\(serializeDoc\(next\.cells\)\)/if (edited) requestAnimationFrame(() => window.api.docChanged(serializeDoc(next.cells)))/' 'edits pushed a frame late'
mutate $M/windows.ts 's/w\.file !== null && w\.json !== w\.file\.saved/w.json !== w.file?.saved/' 'untitled windows count as dirty'
mutate $M/windows.ts 's/w\.file\.saved = w\.json\n//' 'save does not record the saved text'
mutate $M/windows.ts 's/auto \?\?(\s*)saved \?\?/saved ??$1auto ??/' 'file preferred over autosave'
mutate $M/windows.ts 's/saveSession\(\)(\s*)quitting = true/quitting = true/' 'session not written at quit'
mutate $M/windows.ts 's/(w\.file\.saved = w\.json\s*present\(w\))\s*await dropAutosave\(w\)/$1/' 'save keeps the stale autosave'
mutate $M/windows.ts 's/if \(!ok\) return false/if (!ok) return true/' 'failed save reported as saved'
mutate $M/windows.ts 's/if \(!w\.live \|\| /if (/' 'flush waits for a page that is not listening'
mutate $R/Cell.tsx 's/!root\.current!\.contains\(document\.activeElement\)/false/' 'focus does not follow the focused cell'
npx electron-vite build >/dev/null # never leave a mutant's build in out/
exit $fail
