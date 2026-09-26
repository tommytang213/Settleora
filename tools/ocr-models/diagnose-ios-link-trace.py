#!/usr/bin/env python3
"""Print bounded linker facts from a failed simulator build trace."""

import pathlib
import re
import stat
import sys


LINK_STEP = re.compile(
    r"\bLd\s+\S*/Runner\.app/(?P<image>Runner(?:\.debug\.dylib)?)\s+normal\b"
    r".*\(in target ['\"]Runner['\"] from project ['\"]Runner['\"]\)"
)
NEXT_STEP = re.compile(r"\(in target ['\"][^'\"]+['\"] from project ['\"][^'\"]+['\"]\)")
CLANG_COMMAND = re.compile(r"/(?:clang|clang\+\+)\s")


def trace_bytes(path):
    candidate = pathlib.Path(path)
    metadata = candidate.lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > 32 * 1024 * 1024:
        raise ValueError("build trace is not a bounded regular file")
    return candidate.read_bytes()


def linked_commands(lines):
    commands = {"Runner": [], "Runner.debug.dylib": []}
    for index, line in enumerate(lines):
        step = LINK_STEP.search(line)
        if not step:
            continue
        image = step.group("image")
        output = re.compile(r"\s-o\s+\S*/Runner\.app/" + re.escape(image) + r"(?:\s|$)")
        for following in lines[index + 1:index + 21]:
            if NEXT_STEP.search(following):
                break
            if CLANG_COMMAND.search(following) and output.search(following):
                commands[image].append(following)
                break
    return commands


def report(trace, dylib, capture_status):
    text = trace.decode("utf-8", errors="replace")
    lines = text.splitlines()
    commands = linked_commands(lines)
    print(f"ios_build_capture_status={capture_status}", file=sys.stderr)
    print(f"ios_build_trace_bytes={len(trace)}", file=sys.stderr)
    print(
        "ios_interposer_path_in_build_trace="
        + ("present" if dylib in text else "absent"),
        file=sys.stderr,
    )
    print(
        "ios_symbol_in_build_trace="
        + ("present" if "_settleora_network_interposer_loaded" in text else "absent"),
        file=sys.stderr,
    )
    for image, label in (("Runner", "runner"), ("Runner.debug.dylib", "debug_dylib")):
        invocations = commands[image]
        print(f"ios_{label}_link_invocation={'present' if invocations else 'absent'}", file=sys.stderr)
        flag_found = any(
            re.search(r"(?<!\S)-Wl,-needed_library," + re.escape(dylib) + r"(?=\s|$)", command)
            or re.search(r"(?<!\S)-Xlinker\s+-needed_library\s+-Xlinker\s+" + re.escape(dylib) + r"(?=\s|$)", command)
            for command in invocations
        )
        print(f"ios_{label}_needed_library_in_link_invocation={'present' if flag_found else 'absent'}", file=sys.stderr)


def main():
    if len(sys.argv) != 5 or not re.fullmatch(r"[1-9][0-9]{0,2}", sys.argv[4]):
        raise ValueError("invalid build diagnostic arguments")
    stdout, stderr, dylib, capture_status = sys.argv[1:]
    if int(capture_status) > 255:
        raise ValueError("invalid build status")
    if not dylib.startswith("/") or "\n" in dylib:
        raise ValueError("invalid interposer path")
    report(trace_bytes(stdout) + b"\n" + trace_bytes(stderr), dylib, capture_status)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError):
        print("ios_link_trace_diagnostic=unavailable", file=sys.stderr)
        sys.exit(98)
