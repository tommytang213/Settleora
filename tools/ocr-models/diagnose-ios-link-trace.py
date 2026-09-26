#!/usr/bin/env python3
"""Print bounded linker facts from a failed simulator build trace."""

import re
import sys


LINK_STEP = re.compile(
    r"\bLd\s+(?P<output>\S*/Runner\.app/(?P<image>Runner(?:\.debug\.dylib)?))\s+normal\b"
    r".*\(in target ['\"]Runner['\"] from project ['\"]Runner['\"]\)"
)
NEXT_STEP = re.compile(r"\(in target ['\"][^'\"]+['\"] from project ['\"][^'\"]+['\"]\)")
CLANG_COMMAND = re.compile(r"/(?:clang|clang\+\+)\s")


def trace_bytes():
    trace = sys.stdin.buffer.read(64 * 1024 * 1024 + 1)
    if len(trace) > 64 * 1024 * 1024:
        raise ValueError("build trace exceeds the bounded capture")
    return trace


def linked_commands(lines):
    commands = {"Runner": [], "Runner.debug.dylib": []}
    for index, line in enumerate(lines):
        step = LINK_STEP.search(line)
        if not step:
            continue
        image = step.group("image")
        output = re.compile(r"\s-o\s+" + re.escape(step.group("output")) + r"(?:\s|$)")
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
    anchor = dylib.rsplit("/", 1)[0] + "/settleora-network-interposer-anchor.o"
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
        needed_wl = re.compile(r"(?<!\S)-Wl,-needed_library," + re.escape(dylib) + r"(?=\s|$)")
        needed_search = re.compile(r"(?<!\S)-Wl,-needed-lSettleoraOcrNetworkDeny(?=\s|$)")
        needed_xlinker = re.compile(
            r"(?<!\S)-Xlinker\s+-needed_library\s+-Xlinker\s+" + re.escape(dylib) + r"(?=\s|$)"
        )
        xlinker_operand = re.compile(r"(?<!\S)-Xlinker\s+" + re.escape(dylib) + r"(?=\s|$)")
        separate_option_operand = re.compile(
            r"(?<!\S)(?:-L|-F|-o|-isysroot|-weak_library|-reexport_library|-force_load)\s+"
            + re.escape(dylib) + r"(?=\s|$)"
        )
        direct_path = re.compile(r"(?<!\S)" + re.escape(dylib) + r"(?=\s|$)")
        anchor_path = re.compile(r"(?<!\S)" + re.escape(anchor) + r"(?=\s|$)")
        library_search = re.compile(r"(?<!\S)-L" + re.escape(dylib.rsplit("/", 1)[0]) + r"(?=\s|$)")
        forced_symbol = re.compile(
            r"(?<!\S)-Wl,-u,_settleora_network_interposer_loaded(?=\s|$)"
        )
        exact_order = re.compile(
            r"(?<!\S)-L" + re.escape(dylib.rsplit("/", 1)[0])
            + r"\s+" + re.escape(dylib)
            + r"\s+-Wl,-needed-lSettleoraOcrNetworkDeny(?=\s|$)"
        )
        proofs = []
        for command in invocations:
            forced = bool(needed_wl.search(command) or needed_xlinker.search(command) or needed_search.search(command))
            mask = lambda match: "#" * len(match.group())
            without_forced_operands = separate_option_operand.sub(
                mask, xlinker_operand.sub(
                    mask, needed_xlinker.sub(mask, needed_search.sub(mask, needed_wl.sub(mask, command)))
                )
            )
            direct = bool(direct_path.search(without_forced_operands))
            search = bool(library_search.search(command))
            ordered = bool(exact_order.search(command))
            proofs.append((forced, direct, bool(anchor_path.search(command)), bool(forced_symbol.search(command)), search, ordered))
        print(f"ios_{label}_needed_library_in_link_invocation={'present' if any(p[0] for p in proofs) else 'absent'}", file=sys.stderr)
        print(f"ios_{label}_dylib_direct_input={'present' if any(p[1] for p in proofs) else 'absent'}", file=sys.stderr)
        print(f"ios_{label}_same_invocation_link_inputs={'present' if any(all(p[:2]) for p in proofs) else 'absent'}", file=sys.stderr)
        print(f"ios_{label}_anchor_in_link_invocation={'present' if any(p[2] for p in proofs) else 'absent'}", file=sys.stderr)
        print(f"ios_{label}_forced_symbol_in_link_invocation={'present' if any(p[3] for p in proofs) else 'absent'}", file=sys.stderr)
        print(f"ios_{label}_anchor_same_invocation={'present' if any(all(p[:3]) for p in proofs) else 'absent'}", file=sys.stderr)
        print(f"ios_{label}_forced_symbol_same_invocation={'present' if any(all(p[:4]) for p in proofs) else 'absent'}", file=sys.stderr)
        print(f"ios_{label}_library_search_path_in_link_invocation={'present' if any(p[4] for p in proofs) else 'absent'}", file=sys.stderr)
        print(f"ios_{label}_link_argument_order={'present' if any(p[0] and p[1] and p[4] and p[5] for p in proofs) else 'absent'}", file=sys.stderr)
    diagnostics = {
        "undefined_interposer_symbol": any(
            "Undefined symbol: _settleora_network_interposer_loaded" in line
            or '"_settleora_network_interposer_loaded", referenced from:' in line
            for line in lines
        ),
        "interposer_library_not_found": any(
            ("library not found" in line or "file not found" in line)
            and (dylib in line or "libSettleoraOcrNetworkDeny" in line)
            for line in lines
        ),
        "interposer_wrong_architecture": any(
            ("building for iOS Simulator" in line or "wrong architecture" in line)
            and (dylib in line or "libSettleoraOcrNetworkDeny" in line)
            for line in lines
        ),
        "linker_error": any(
            line.startswith("ld: ") or "clang: error: linker command failed" in line
            for line in lines
        ),
        "swift_error": any("Swift Compiler Error" in line or "error: " in line and ".swift:" in line for line in lines),
    }
    for label, found in diagnostics.items():
        print(f"ios_{label}={'present' if found else 'absent'}", file=sys.stderr)


def main():
    if len(sys.argv) != 3 or not re.fullmatch(r"(?:0|[1-9][0-9]{0,2})", sys.argv[2]):
        raise ValueError("invalid build diagnostic arguments")
    dylib, capture_status = sys.argv[1:]
    if int(capture_status) > 255:
        raise ValueError("invalid build status")
    if not dylib.startswith("/") or "\n" in dylib:
        raise ValueError("invalid interposer path")
    report(trace_bytes(), dylib, capture_status)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError):
        print("ios_link_trace_diagnostic=unavailable", file=sys.stderr)
        sys.exit(98)
