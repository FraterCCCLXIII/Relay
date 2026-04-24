#!/usr/bin/env python3
"""Strip L123: or '  123| ' prefixes from read_file output; drop '...n lines not shown...' lines."""
import re
import sys

L = re.compile(r"^L[0-9]+:\s?(.*)$")
P = re.compile(r"^\s*[0-9]+\|(.*)$")
NOT_SHOWN = re.compile(r"lines? not shown", re.I)


def main() -> None:
    out: list[str] = []
    for line in sys.stdin.read().splitlines():
        if not line.strip() and not out:
            continue
        if NOT_SHOWN.search(line):
            continue
        m = L.match(line)
        if m:
            out.append(m.group(1) + "\n")
            continue
        m = P.match(line)
        if m:
            out.append(m.group(1) + "\n")
            continue
        out.append(line + "\n")
    sys.stdout.write("".join(out))


if __name__ == "__main__":
    main()
