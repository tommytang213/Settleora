#!/usr/bin/env node
import { closeSync, constants, createWriteStream, fchmodSync, openSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

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
    !path.isAbsolute(options.get("stdout")) ||
    !path.isAbsolute(options.get("stderr")) ||
    path.resolve(options.get("stdout")) === path.resolve(options.get("stderr")) ||
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

function openCaptureFile(filePath) {
  const descriptor = openSync(
    filePath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
    0o600,
  );
  fchmodSync(descriptor, 0o600);
  return descriptor;
}

function boundedSink(stream, descriptor, maxBytes, onOverflow) {
  const output = createWriteStream(null, { fd: descriptor, autoClose: true });
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

function processGroupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function terminateProcessGroup(pid) {
  try { process.kill(-pid, "SIGTERM"); } catch (error) {
    if (error?.code === "ESRCH") return;
    throw error;
  }
  const gracefulDeadline = Date.now() + 5000;
  while (Date.now() < gracefulDeadline) {
    if (!processGroupExists(pid)) return;
    await wait(50);
  }
  try { process.kill(-pid, "SIGKILL"); } catch (error) {
    if (error?.code === "ESRCH") return;
    throw error;
  }
  const forcedDeadline = Date.now() + 1000;
  while (Date.now() < forcedDeadline) {
    if (!processGroupExists(pid)) return;
    await wait(50);
  }
  if (processGroupExists(pid)) throw new Error("process group termination failed");
}

async function main() {
  const { stdoutPath, stderrPath, maxBytes, command } = parseArgs(process.argv.slice(2));
  let overflow = false;
  let child;
  let termination;
  const failClosed = () => {
    if (overflow) return;
    overflow = true;
    if (child?.pid) termination = terminateProcessGroup(child.pid);
  };
  let stdoutDescriptor;
  let stderrDescriptor;
  try {
    stdoutDescriptor = openCaptureFile(stdoutPath);
    stderrDescriptor = openCaptureFile(stderrPath);
  } catch (error) {
    if (stdoutDescriptor != null) closeSync(stdoutDescriptor);
    if (stderrDescriptor != null) closeSync(stderrDescriptor);
    throw error;
  }
  try {
    child = spawn(command[0], command.slice(1), {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    closeSync(stdoutDescriptor);
    closeSync(stderrDescriptor);
    throw error;
  }
  const stdoutDone = boundedSink(child.stdout, stdoutDescriptor, maxBytes, failClosed);
  const stderrDone = boundedSink(child.stderr, stderrDescriptor, maxBytes, failClosed);
  const outcome = await new Promise((resolve) => {
    child.once("error", () => resolve({ code: null, signal: null, wrapperError: true }));
    child.once("close", (code, signal) => resolve({ code, signal, wrapperError: false }));
  });
  await Promise.all([stdoutDone, stderrDone]);
  if (termination) await termination;
  if (overflow) process.exit(97);
  if (outcome.wrapperError || outcome.signal != null || !Number.isInteger(outcome.code)) process.exit(98);
  process.exit(outcome.code);
}

main().catch(() => {
  process.stderr.write("bounded_process_capture_failed\n");
  process.exit(98);
});
