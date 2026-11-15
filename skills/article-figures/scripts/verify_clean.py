"""Run the skill's self_check on a copy with the embedded font block removed.

self_check rejects any CSS url() that is not a #fragment, which also catches
base64 data: font payloads — i.e. it rejects the very thing that makes a page
self-contained. This strips the @font-face rules and re-runs the check so the
structural findings are visible instead of being buried under that false positive.
"""
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path


def _self_check():
    env = os.environ.get("DIAGRAM_SKILL_DIR")
    if env:
        return Path(env) / "scripts" / "self_check.py"
    here = Path(__file__).resolve().parent
    for cand in (here.parent / "vendor" / "diagram-design" / "skills" / "diagram-design",
                 here / "vendor" / "diagram-design"):
        if (cand / "scripts" / "self_check.py").exists():
            return cand / "scripts" / "self_check.py"
    return None


SKILL = _self_check()
FACE_RE = re.compile(r"@font-face\{[^}]*\}")


def main():
    if SKILL is None:
        print("self_check.py not found — set DIAGRAM_SKILL_DIR to the diagram-design skill directory")
        return 2
    for arg in sys.argv[1:]:
        src = Path(arg)
        text = src.read_text(encoding="utf-8")
        stripped = FACE_RE.sub("", text)
        with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as fh:
            fh.write(stripped)
            tmp = fh.name
        out = subprocess.run([sys.executable, str(SKILL), tmp], capture_output=True, text=True)
        lines = [l for l in (out.stdout + out.stderr).splitlines() if l.strip()]
        head = lines[0] if lines else ""
        summary = lines[-1] if lines else ""
        print(f"{src.name}: {head} | {summary}")
        for l in lines[1:-1]:
            print("   " + l)
        Path(tmp).unlink(missing_ok=True)


if __name__ == "__main__":
    main()
