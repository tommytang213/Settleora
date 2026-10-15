import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";

// Diagnostic hints only: never fed into the acceptance/scoring decision. These
// limits are independent of the larger, strict acceptance parser's limits.
const maxStreamBytes = 1024 * 1024;
const maxLineBytes = 64 * 1024;
const maxCount = 10000;
const eventTypes = ["start", "allSuites", "suite", "group", "testStart", "testDone", "error", "print", "done"];
// Match fixed Flutter/tool failure wording and emit only these constant enums.
// Do not retain matched text, exception details, test names, paths, URIs,
// stack traces, hashes of private output, or arbitrary JSON properties.
const signatures = [
  ["test_load_failed", /(?:^|\n)Failed to load ["']/],
  ["app_start_failed", /Unable to start the app on the device\./],
  ["vm_service_unavailable", /The VM Service is not available on the test device\./],
  ["vm_service_connect_timeout", /Connecting to the VM Service timed out\./],
  ["debug_connection_failed", /Error waiting for a debug connection:/],
  ["ios_build_failed", /(?:Could not build the application for the simulator|Failed to build iOS app)/],
  ["simulator_control_failed", /Error executing simctl:/],
  ["device_unavailable", /(?:No supported devices connected|No devices found|No supported devices found with name or id matching)/],
  ["dart_compilation_failed", /(?:Compilation failed for testPath=|The Dart compiler exited unexpectedly)/],
  ["process_exception", /(?:^|\n|\s)ProcessException:/],
  ["socket_exception", /(?:^|\n|\s)SocketException:/],
  ["timeout_exception", /(?:^|\n|\s)TimeoutException(?: after [0-9:.]+)?:/],
];

function readPrefix(file) {
  let fd;
  try {
    if (typeof file !== "string") return { state: "unavailable" };
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile()) return { state: "unavailable" };
    const bytes = Buffer.alloc(maxStreamBytes + 1);
    let count = 0;
    while (count < bytes.length) {
      const received = readSync(fd, bytes, count, bytes.length - count, null);
      if (received === 0) break;
      count += received;
    }
    const after = fstatSync(fd, { bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
      return { state: "changed_during_read" };
    }
    const truncated = count > maxStreamBytes;
    return {
      state: truncated ? "prefix_only" : count === 0 ? "empty" : "complete",
      bytes: bytes.subarray(0, Math.min(count, maxStreamBytes)),
    };
  } catch {
    return { state: "unavailable" };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function summarize(file, machineEvents) {
  const input = readPrefix(file);
  const result = {
    state: input.state,
    scannedBytes: input.bytes?.length ?? 0,
    omittedOversizeLines: 0,
    omittedPartialLine: false,
    countsCapped: false,
    unclassifiedLines: 0,
    signatureCategories: [],
    ...(machineEvents ? {
      eventCounts: Object.fromEntries(eventTypes.map((type) => [type, 0])),
      failedTestEvents: 0,
      doneSuccessEvents: 0,
      doneFailureEvents: 0,
      vmServiceAnnouncementEvents: 0,
    } : {}),
  };
  if (!input.bytes) return result;
  const categories = new Set();
  const increment = (object, key) => {
    if (object[key] < maxCount) object[key] += 1;
    else result.countsCapped = true;
  };
  const classify = (text) => {
    for (const [category, pattern] of signatures) {
      if (pattern.test(text)) categories.add(category);
    }
  };
  let offset = 0;
  while (offset < input.bytes.length) {
    const newline = input.bytes.indexOf(10, offset);
    const end = newline === -1 ? input.bytes.length : newline;
    if (newline === -1 && input.state === "prefix_only") {
      result.omittedPartialLine = true;
      break;
    }
    const line = input.bytes.subarray(offset, end);
    offset = end + 1;
    if (line.length > maxLineBytes) {
      increment(result, "omittedOversizeLines");
      continue;
    }
    const text = line.toString("utf8").trim();
    if (!text) continue;
    if (!machineEvents) {
      classify(text);
      increment(result, "unclassifiedLines");
      continue;
    }
    let event;
    try { event = JSON.parse(text); } catch { /* Unstructured tool output. */ }
    if (event && !Array.isArray(event) && typeof event === "object" && typeof event.type === "string" &&
        Object.hasOwn(result.eventCounts, event.type)) {
      increment(result.eventCounts, event.type);
      if (event.type === "error" && typeof event.error === "string") classify(event.error);
      if (event.type === "testDone" && (event.result === "failure" || event.result === "error")) {
        increment(result, "failedTestEvents");
      }
      if (event.type === "done" && event.success === true) increment(result, "doneSuccessEvents");
      if (event.type === "done" && event.success === false) increment(result, "doneFailureEvents");
      // print messages may contain OCR/user content: never inspect them here.
    } else if (Array.isArray(event) && event.length === 1 &&
        event[0]?.event === "test.startedProcess") {
      increment(result, "vmServiceAnnouncementEvents");
    } else {
      increment(result, "unclassifiedLines");
      if (event === undefined) classify(text);
    }
  }
  // Constant order; not the order of arbitrary input. Unrecognized content is
  // deliberately represented by counts only, not a fallback text excerpt.
  result.signatureCategories = signatures.map(([name]) => name).filter((name) => categories.has(name));
  return result;
}

export function summarizeFlutterRunner(stdoutPath, stderrPath) {
  return {
    schemaVersion: 1,
    authority: "diagnostic_only_unvalidated_observations",
    maxStreamBytes,
    maxLineBytes,
    maxCount,
    stdout: summarize(stdoutPath, true),
    stderr: summarize(stderrPath, false),
  };
}
