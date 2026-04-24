#!/usr/bin/env python3
"""Strip leading line numbers from `read_file` style lines:  '   1|content'."""
import re
import sys

pat = re.compile(r"^\s*\d+\|(.*)$")

def main() -> None:
    out = []
    for line in sys.stdin.read().splitlines():
        m = pat.match(line)
        out.append(m.group(1) if m else line)
    sys.stdout.write("\n".join(out) + ("\n" if out else ""))

if __name__ == "__main__":
    main()
