"""Rebuild tests/fixtures/hf-trace.walkthrough from Minh's annotated HF trace.

usage: uv run --no-project python scripts/make-fixture.py /tmp/huggingface_trace
LESSON comments become markdown cells; the code around them becomes code cells.
"""
import json, re, sys, textwrap, uuid
from pathlib import Path

src = Path(sys.argv[1])
lines = {f: (src / f).read_text().splitlines() for f in ("__init__.py", "base.py", "textclassification.py")}
LESSON = re.compile(r"^\s*##? LESSON")


def code(f, a, b):
    body = [l for l in lines[f][a - 1 : b] if not LESSON.match(l)]
    return textwrap.dedent("\n".join(body)).strip("\n")


def note(f, at):
    out, ls = [], lines[f]
    for l in ls[at - 1 :]:
        s = l.strip()
        if not s.startswith("#"):
            break
        out.append(re.sub(r"^#+\s?", "", s))
    return "\n".join(out)


cells = []


def add(kind, depth, title, body):
    c = {"id": str(uuid.uuid4()), "depth": depth, "title": title, "body": body, "collapsed": False, "kind": kind}
    c.update({"lang": "Python"} if kind == "code" else {"height": "fit"})
    cells.append(c)


I = "__init__.py"
add("md", 0, "goal", "Trace `pipeline('sentiment-analysis')(\"This movie is disgustingly good !\")` end to end.")
add("code", 0, "__init__.py:441 pipeline()", code(I, 441, 456))
add("md", 1, "", note(I, 742))
add("code", 1, "__init__.py:743 resolve task", code(I, 743, 747))
add("code", 2, "__init__.py:131 SUPPORTED_TASKS", code(I, 131, 145))
add("md", 2, "", note(I, 130))
add("md", 1, "", note(I, 748))
add("code", 1, "__init__.py:749 default model", code(I, 749, 758))
add("md", 1, "", note(I, 865))
add("code", 1, "__init__.py:870 which preprocessors", code(I, 870, 879))
add("md", 2, "", note(I, 877))
add("code", 2, "__init__.py:878 infer tokenizer", code(I, 878, 899))
add("md", 3, "", note(I, 904))
add("code", 3, "__init__.py:900 AutoTokenizer", code(I, 900, 903))
add("md", 1, "", note(I, 1043))
add("code", 1, "__init__.py:1048 build the pipeline", code(I, 1048, 1066))
add("code", 2, "textclassification.py:43 TextClassificationPipeline", code("textclassification.py", 43, 85))
add("code", 3, "base.py:1198 Pipeline.__call__", code("base.py", 1198, 1240))
add("code", 4, "base.py:1275 run_single", code("base.py", 1275, 1279))
add("md", 0, "LESSON 9 — the shape of it", code(I, 1069, 1095).strip('"').strip())

out = Path(__file__).resolve().parent.parent / "tests/fixtures/hf-trace.walkthrough"
out.write_text(json.dumps({"format": "walkthrough", "version": 1, "cells": cells}, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {len(cells)} cells to {out}")
