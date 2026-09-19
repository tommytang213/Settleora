#!/usr/bin/env node
import { createWriteStream } from "node:fs";
import { spawn } from "node:child_process";

function parseArgs(values) {
  const separator = values.indexOf("--");
  if (separator < 0 || separator === values.length - 1) throw new Error("invalid arguments");
  const allowedOptions = new Set(["stdout", "stderr", "max-bytes"]);
  const options = new Map();
  for (const value of values.slice(0, separator)) {
    const equals = value.indexOf("=");
    if (!value.startsWith("--") || equals < 3) throw new Error("invalid option");
    const name = value.slice(2, equals);
    if (!allowedOptions.has(name) || options.has(name)) throw new Error("invalid option");
    options.set(name, value.slice(equals + 1));
  }
  const maxBytes = Number(options.get("max-bytes"));
  if (
    !options.get("stdout") ||
    !options.get("stderr") ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 32 * 1024 * 1024
  ) {
    throw new Error("invalid bounds");
  }
  return {
    stdoutPath: options.get("stdout"),
    stderrPath: options.get("stderr"),
    maxBytes,
    command: values.slice(separator + 1),
  };
}

function boundedSink(stream, filePath, maxBytes, onOverflow) {
  const output = createWriteStream(filePath, { flags: "w", mode: 0o600 });
  let bytes = 0;
  stream.on("data", (chunk) => {
    const remaining = maxBytes - bytes;
    if (remaining > 0) {
      const retained = chunk.subarray(0, remaining);
      bytes += retained.length;
      if (!output.write(retained)) {
        stream.pause();
        output.once("drain", () => stream.resume());
      }
    }
    if (chunk.length > remaining) onOverflow();
  });
  stream.on("end", () => output.end());
  stream.on("error", onOverflow);
  output.on("error", onOverflow);
  return new Promise((resolve) => output.on("close", resolve));
}

async function main() {
  const { stdoutPath, stderrPath, maxBytes, command } = parseArgs(process.argv.slice(2));
  let overflow = false;
  let child;
  let killTimer;
  const failClosed = () => {
    if (overflow) return;
    overflow = true;
    if (child?.pid) {
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
      killTimer = setTimeout(() => {
        try { process.kill(-child.pid, "SIGKILL"); } catch {}
      }, 5000);
      killTimer.unref();
    }
  };
  child = spawn(command[0], command.slice(1), {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdoutDone = boundedSink(child.stdout, stdoutPath, maxBytes, failClosed);
  const stderrDone = boundedSink(child.stderr, stderrPath, maxBytes, failClosed);
  const outcome = await new Promise((resolve) => {
    child.once("error", () => resolve({ code: null, signal: null, wrapperError: true }));
    child.once("close", (code, signal) => resolve({ code, signal, wrapperError: false }));
  });
  if (killTimer) clearTimeout(killTimer);
  await Promise.all([stdoutDone, stderrDone]);
  if (overflow) process.exit(97);
  if (outcome.wrapperError || outcome.signal != null || !Number.isInteger(outcome.code)) process.exit(98);
  process.exit(outcome.code);
}

main().catch(() => {
  process.stderr.write("bounded_process_capture_failed\n");
  process.exit(98);
});
