#!/usr/bin/env node
import { closeSync, constants, createWriteStream, fchmodSync, openSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function parseArgs(values) {
  const allowedOptions = new Set(["stdout", "stderr", "max-bytes", "platform", "device"]);
  const options = new Map();
  for (const value of values) {
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
    !new Set(["android", "ios"]).has(options.get("platform")) ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 32 * 1024 * 1024
  ) {
    throw new Error("invalid bounds");
  }
  const platform = options.get("platform");
  const device = options.get("device");
  if (
    (platform === "android" && device !== "emulator-5554") ||
    (platform === "ios" && !/^[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$/.test(device ?? ""))
  ) {
    throw new Error("invalid device");
  }
  return {
    stdoutPath: options.get("stdout"),
    stderrPath: options.get("stderr"),
    maxBytes,
    platform,
    device,
  };
}

export function buildFlutterCommand(device) {
  return {
    executable: "flutter",
    args: [
      "test",
      "integration_test/receipt_ocr_real_provider_test.dart",
      "-d",
      device,
      "--timeout",
      "6h",
      "--machine",
      "--no-pub",
    ],
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

export async function runBoundedProcess({ stdoutPath, stderrPath, maxBytes, executable, args }) {
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
    child = spawn(executable, args, {
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
  if (overflow) return 97;
  if (outcome.wrapperError || outcome.signal != null || !Number.isInteger(outcome.code)) return 98;
  return outcome.code;
}

async function main() {
  const { stdoutPath, stderrPath, maxBytes, device } = parseArgs(process.argv.slice(2));
  const command = buildFlutterCommand(device);
  return runBoundedProcess({ stdoutPath, stderrPath, maxBytes, ...command });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then((status) => process.exit(status)).catch(() => {
    process.stderr.write("bounded_process_capture_failed\n");
    process.exit(98);
  });
}
