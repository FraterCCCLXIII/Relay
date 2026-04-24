#!/usr/bin/env python3
"""Merge Cursor read_file chunks (L123: or | prefix) into plain markdown, drop '... not shown' lines."""
import re
import sys
from pathlib import Path

# Lines from read_file: "L1: # title" or "  1|# title"
L_PREFIX = re.compile(r"^L[0-9]+:\s?(.*)$")
P_PREFIX = re.compile(r"^\s*[0-9]+\|(.*)$")

def line_body(line: str) -> str | None:
    s = line.rstrip("\n")
    if re.search(r"lines? not shown", s, re.I):
        return None
    m = L_PREFIX.match(s)
    if m:
        return m.group(1) + "\n" if m.group(1) is not None else "\n"
    m = P_PREFIX.match(s)
    if m:
        b = m.group(1)
        return b + "\n" if b is not None else "\n"
    if s.strip() == "" or s.lstrip().startswith("..."):
        return s + "\n" if s else "\n"
    return s + "\n"


def main() -> int:
    paths = [Path(p) for p in sys.argv[1:]]
    if not paths:
        print("Usage: _merge_holon_read_chunks.py part1 [part2 ...]", file=sys.stderr)
        return 1
    out: list[str] = []
    for p in paths:
        t = p.read_text(encoding="utf-8", errors="replace")
        for line in t.splitlines(keepends=True):
            if "lines not shown" in line and "..." in line:
                continue
            if line.rstrip() == "..." and "lines" in line:
                continue
            # Split raw lines if they are whole-file lines without newlines
            for sub in line.splitlines(keepends=False):
                if not sub and not out:
                    continue
                b = line_body(sub + ("" if sub.endswith("\n") else ""))
                if b is None:
                    continue
                b = b.rstrip("\n")
                if b == "" and out and out[-1] == "":
                    continue
                if b is not None and "lines not shown" in b:
                    continue
                if sub.startswith("L") and ":" in sub[:6]:
                    m = L_PREFIX.match(sub)
                    if m:
                        out.append(m.group(1) + "\n")
                    continue
                m = P_PREFIX.match(sub)
                if m:
                    out.append(m.group(1) + "\n")
                    continue
                out.append(sub + "\n" if not sub.endswith("\n") else sub)
    # Second pass: strip leading L[0-9]+: on any remaining
    text = "".join(out)
    fixed: list[str] = []
    for line in text.splitlines(keepends=True):
        t2 = re.sub(r"^L[0-9]+:\s?", "", line)
        if "lines not shown" in t2:
            continue
        fixed.append(t2)
    Path(sys.argv[0]).parent.joinpath("Holonsv3.2.md").write_text("".join(fixed), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
