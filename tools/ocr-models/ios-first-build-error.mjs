import { spawnSync } from "node:child_process";
import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from "node:fs";
import path from "node:path";

const captureBytes = 32 * 1024 * 1024;
const lineBytes = 4096;
const sourceBytes = 1024 * 1024;
const sourcePath = /^(?:apps\/mobile\/(?:ios|lib)|tools\/ocr-models)\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:dart|swift|m|mm|h|hpp|c|cc|cpp|py|rb|sh)$/;
const locationPrefix = /^(\/[^:\x00-\x1f]{1,1024}):\s*(?:line )?([1-9][0-9]{0,5})(?::([1-9][0-9]{0,5}))?:[ \t]*/;
const flutterPrefix = /^(?:\[[+ 0-9.]{0,24}(?:ms)?\][ \t]*)?[ \t]*/;
const errorPrefix = /^(?:(?:clang(?:\+\+)?:[ \t]+)?(?:fatal )?error:|ld:|Error(?: \(Xcode\))?:)[ \t]*/;
const scriptError = /^(?:[A-Za-z]+Error:|(?:.+:[ \t]*)?(?:command not found|No such file or directory|Permission denied)$|cannot load such file -- )/;
const verifierRejection = "ios_arm64_acceptance_setup_rejected";

// Copy only reviewed words from a recognized diagnostic form. Arguments,
// identifiers, paths and any follow-on lines are deliberately omitted.
const redactions = [
  [/^no such module ['"][^'"]+['"]$/, "no such module '[redacted]'"],
  [/^cannot find ['"][^'"]+['"] in scope$/, "cannot find '[redacted]' in scope"],
  [/^use of undeclared identifier ['"][^'"]+['"]$/, "use of undeclared identifier '[redacted]'"],
  [/^['"][^'"]+['"] file not found$/, "'[redacted]' file not found"],
  [/^library not found(?: for .+)?$/, "library not found"],
  [/^linker command failed(?: with exit code [1-9][0-9]{0,2}(?: \(use -v to see invocation\))?)?$/,
    "linker command failed"],
  [/^Couldn't resolve the package ['"][^'"]+['"] in ['"][^'"]+['"]\.?$/,
    "Couldn't resolve the package '[redacted]' in '[redacted]'"],
  [/^(?:LoadError: )?cannot load such file -- xcodeproj(?: \(LoadError\))?$/,
    "cannot load such file -- xcodeproj"],
  [/^(?:LoadError: )?cannot load such file -- [^\s]+(?: \(LoadError\))?$/,
    "cannot load such file -- [redacted]"],
  [/^ModuleNotFoundError: No module named ['"][^'"]+['"]$/, "No module named '[redacted]'"],
  [/^(?:FileNotFoundError: )?\[Errno 2\] No such file or directory(?:: .+)?$/,
    "No such file or directory"],
  [/^(?:PermissionError: )?\[Errno 13\] Permission denied(?:: .+)?$/, "Permission denied"],
  [/^(?:.+:[ \t]*)?command not found$/, "command not found"],
  [/^(?:.+:[ \t]*)?No such file or directory$/, "No such file or directory"],
  [/^(?:.+:[ \t]*)?Permission denied$/, "Permission denied"],
];

function readBounded(file, limit) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = fstatSync(fd);
    if (!info.isFile()) return { status: "capture_unavailable" };
    if (info.size > limit) return { status: "capture_limit_exceeded" };
    const bytes = Buffer.allocUnsafe(info.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, null);
      if (count === 0) break;
      offset += count;
    }
    return offset === info.size
      ? { bytes: bytes.subarray(0, offset) }
      : { status: "capture_changed_during_read" };
  } finally {
    closeSync(fd);
  }
}

function git(repo, args, limit) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const result = spawnSync("git", ["--no-replace-objects", "-C", repo, ...args], {
    env, timeout: 5000, maxBuffer: limit, stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout : null;
}

function verifiedLocation(location, repo, captureRoot, head) {
  if (!location) return null;
  const [, file, line, column] = location;
  try {
    const checkout = [repo, path.join(captureRoot, "ios-acceptance-source")]
      .find((candidate) => file.startsWith(candidate + path.sep));
    if (!checkout) return null;
    const relative = file.slice(checkout.length + 1);
    if (relative.length > 240 || !sourcePath.test(relative) || realpathSync(file) !== file) return null;
    if (git(checkout, ["rev-parse", "--show-toplevel", "HEAD"], 4096)?.toString() !==
        checkout + "\n" + head + "\n") return null;
    const entry = git(repo, ["ls-tree", "-z", head, "--", relative], 4096)?.toString();
    const object = /^100(?:644|755) blob ([0-9a-f]{40})\t([^\0]+)\0$/.exec(entry ?? "");
    if (object?.[2] !== relative) return null;
    const expected = git(repo, ["cat-file", "blob", object[1]], sourceBytes);
    const observed = readBounded(file, sourceBytes).bytes;
    if (!expected || !observed?.equals(expected)) return null;
    const lines = expected.toString("utf8").split("\n");
    if (lines.at(-1) === "") lines.pop();
    const exactLine = lines[Number(line) - 1];
    if (exactLine === undefined || (column && Number(column) > Buffer.byteLength(exactLine) + 1)) return null;
    return { path: relative, line: Number(line), ...(column ? { column: Number(column) } : {}) };
  } catch {
    return null;
  }
}

function firstError(bytes) {
  for (let start = 0; start < bytes.length; ) {
    const end = bytes.indexOf(10, start);
    const stop = end === -1 ? bytes.length : end;
    const length = stop - start;
    const line = bytes.subarray(start, Math.min(stop, start + lineBytes))
      .toString("utf8").replace(flutterPrefix, "").trimEnd();
    start = stop + 1;
    const location = locationPrefix.exec(line);
    const detail = line.slice(location?.[0].length ?? 0)
      .replace(/^in [\x60'][^\x60'\x00-\x1f]{1,96}['\x60]:[ \t]+/, "");
    const prefixed = errorPrefix.test(detail);
    const message = detail.replace(errorPrefix, "").replace(errorPrefix, "");
    if (!prefixed && detail !== verifierRejection && !scriptError.test(detail)) continue;
    if (length > lineBytes) return { status: "line_limit_exceeded" };
    if (end === -1) return { status: "partial_line" };
    // These summaries do not identify the underlying error.
    if (message === "Command PhaseScriptExecution failed with a nonzero exit code" ||
        message === "Failed to build iOS app") continue;
    // The registered verifier reports this literal after catching its error.
    // Its CLI suppresses the traceback, so no location can be inferred.
    const safe = message === verifierRejection || message === "ValueError: " + verifierRejection
      ? verifierRejection
      : redactions.find(([pattern]) => pattern.test(message))?.[1];
    return safe && !/[\x00-\x08\x0b-\x1f\x7f]/.test(line)
      ? { status: "observed", message: safe, location }
      : { status: "redaction_rejected" };
  }
  return { status: "no_error" };
}

export function readIosFirstBuildError(captureRoot, repo, head) {
  try {
    if (!/^[0-9a-f]{40}$/.test(head) || realpathSync(captureRoot) !== captureRoot ||
        git(repo, ["rev-parse", "--show-toplevel", "HEAD"], 4096)?.toString() !== repo + "\n" + head + "\n") {
      return { status: "source_unverified" };
    }
    // Flutter verbose emits the Xcode process trace on stdout. Use stderr
    // only when stdout has no candidate. The streams have no shared clock.
    for (const [stream, filename] of [
      ["stdout", "settleora-ios-build-link-trace.log"],
      ["stderr", "settleora-ios-build-link-errors.log"],
    ]) {
      const capture = readBounded(path.join(captureRoot, filename), captureBytes);
      if (!capture.bytes) return { status: capture.status, stream };
      const found = firstError(capture.bytes);
      if (found.status === "no_error") continue;
      if (found.status !== "observed") return { status: found.status, stream };
      return {
        status: found.status, stream, message: found.message,
        sourceLocation: verifiedLocation(found.location, repo, captureRoot, head),
      };
    }
    return { status: "no_error" };
  } catch {
    return { status: "capture_unavailable" };
  }
}
