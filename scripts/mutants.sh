#!/bin/bash
# Mutation check: each mutant must turn its suite red (unit for src/shared, else a rebuild
# + e2e). Runs in a throwaway copy of the working tree, so the checkout is never touched,
# even if the run is killed. Usage: scripts/mutants.sh
root="$(cd "$(dirname "$0")/.." && pwd)"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
rsync -a --exclude node_modules --exclude out --exclude dist --exclude test-results \
  --exclude playwright-report --exclude .git "$root/" "$work/"
ln -s "$root/node_modules" "$work/node_modules"
cd "$work" || exit 1
fail=0
bak=$(mktemp)
suite() { # unit mutants need only the unit project; renderer mutants need a rebuild + e2e
  case $1 in
    src/shared/*) npx playwright test --project=unit -x --reporter=dot ;;
    *) npx electron-vite build && npx playwright test --project=e2e -x --reporter=dot ;;
  esac
}
mutate() { # file, perl substitution, description
  cp "$1" "$bak"
  perl -0pi -e "$2" "$1"
  if cmp -s "$1" "$bak"; then echo "NOT APPLIED: $3"; fail=1
  elif suite "$1" >/dev/null 2>&1; then echo "SURVIVED: $3"; fail=1
  else echo "killed: $3"; fi
  cp "$bak" "$1"
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
mutate $O 's/if \(subtreeEnd\(out, k\) > end\) draft\[k\]\.collapsed = false/void 0/' 'outdent leaves adopted siblings hidden'
mutate $O 's/end = Math\.max\(end, subtreeEnd\(cs, k\)\)/end = end/' 'block leaves selected cells children behind'
mutate $D 's/cells: z\.array\(Cell\)\.min\(1\)/cells: z.array(Cell)/' 'empty doc accepted'
mutate $D 's/const max = i === 0 \? 0 : cells\[i - 1\]\.depth \+ 1/const max = i === 0 ? 0 : cells[i - 1].depth + 2/' 'depth jump accepted'
mutate $D 's/ids\.has\(c\.id\)/false/' 'duplicate ids accepted'
R=src/renderer/src
mutate $R/nav.ts 's/cursorLineUp\(v\) \|\| bodyEdge\(v, -1\)/cursorLineUp(v)/' 'up arrow stops at the body top'
mutate $R/focus.ts "s/a: e\.shiftKey \? 'outdent' : 'indent'/a: e.shiftKey ? 'indent' : 'outdent'/" 'Tab and Shift+Tab swapped'
mutate $R/focus.ts 's/isMd\(cell\) \? next && focusTitle\(next\) : focusBody/focusBody/' 'down arrow opens markdown raw'
mutate $R/Cell.tsx 's/, d\.max\)/, Infinity)/' 'resize unclamped'
mutate $R/CodeBody.tsx 's/crossCellArrows, pasteDedented,/crossCellArrows,/' 'paste not dedented'
mutate $R/state.ts "s/act\.a === 'insert' && act\.kind === 'md' \? focusId : s\.editingId/s.editingId/" 'new markdown cell not raw'
mutate $R/MdBody.tsx "s/\['Mod-Enter', 'Shift-Enter'\]/['Shift-Enter']/" 'cmd-enter does not render'
mutate $R/Fenced.tsx 's/if \(support\)\n/if (false)\n/' 'fenced code not highlighted'
mutate $R/theme.css 's/\.rendered h1 \{\n  font-size: 1\.6em;/.rendered h1 {\n  font-size: 1em;/' 'headings flat'
mutate $R/state.ts 's/const editingId = n\.editingId === n\.focusId \? n\.editingId : null/const editingId = n.editingId/' 'markdown stays raw when another cell is focused'
mutate $R/state.ts 's/const keepSel = n\.focusId === s\.focusId \|\| act\.a === .init. \? n\.selectTo : null/const keepSel = n.selectTo/' 'selection survives focus moving away'
mutate $R/App.tsx 's/dispatch\(\{ a: e\.shiftKey \? .outdent. : .indent., id: focusId, to: selectTo \}\)/dispatch({ a: e.shiftKey ? "outdent" : "indent", id: focusId })/' 'Tab ignores the selection'
mutate $R/CodeBody.tsx 's/      wrappedLineIndent,\n//' 'wrapped lines restart at column 0'
mutate $R/reveal.ts 's/left < o \|\| right > o \+ sc\.clientWidth \? left : o/o/' 'focus never reveals'
mutate $R/reveal.ts 's/left < o \|\| right/right/' 'a cell off to the left is not revealed'
mutate $R/theme.css 's/\.clip \{\n  overflow: clip;/.clip {\n  overflow: visible;/' 'clip layer removed'
M=src/main
mutate $R/state.ts 's/if \(edited\) window\.api\.docChanged\(serializeDoc\(next\.cells\)\)/if (edited) setTimeout(() => window.api.docChanged(serializeDoc(next.cells)), 50)/' 'edits pushed 50ms late'
mutate $M/windows.ts 's/w\.file !== null && w\.json !== w\.file\.saved/w.json !== w.file?.saved/' 'untitled windows count as dirty'
mutate $M/windows.ts 's/w\.file\.saved = w\.json\n//' 'save does not record the saved text'
mutate $M/windows.ts 's/auto \?\?(\s*)saved \?\?/saved ??$1auto ??/' 'file preferred over autosave'
mutate $M/windows.ts 's/saveSession\(\)(\s*)quitting = true/quitting = true/' 'session not written at quit'
mutate $M/windows.ts 's/(w\.file\.saved = w\.json\s*present\(w\))\s*await dropAutosave\(w\)/$1/' 'save keeps the stale autosave'
mutate $M/windows.ts 's/if \(!ok\) return false/if (!ok) return true/' 'failed save reported as saved'
mutate $M/windows.ts 's/if \(!w\.live \|\| /if (/' 'flush waits for a page that is not listening'
mutate $M/windows.ts 's/if \(w\.closing\) return\n//' 'a second close starts another'
mutate $R/Cell.tsx 's/!root\.current!\.contains\(document\.activeElement\)/false/' 'focus does not follow the focused cell'
exit $fail
