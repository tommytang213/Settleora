import test from "node:test";
import assert from "node:assert/strict";
import { createCapturePhaseDiagnostics } from "../capture-phase-diagnostics.mjs";

// This suite imports only the pure observer. No wrapper, filesystem, child
// process, signal, native tool, timer, or provider is used.
const PRIVATE = "PRIVATE_OCR_secret@example.invalid_/private/receipt_4111111111111111";
const ORDINARY_EVENTS = [
  "capture_enter",
  "child_spawn",
  "child_exit",
  "child_close",
  "stdout_end",
  "stdout_close",
  "stderr_end",
  "stderr_close",
  "stdout_sink_close",
  "stderr_sink_close",
  "capture_return",
];
const ALL_EVENTS = [...ORDINARY_EVENTS, "capture_failure"];
const lineFor = (event) => `bounded_capture_phase=${event}\n`;

class FakeEmitter {
  constructor() {
    this.listeners = new Map();
    this.registrations = [];
  }

  once(event, listener) {
    this.registrations.push(event);
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  fire(event, ...args) {
    const listeners = this.listeners.get(event) ?? [];
    this.listeners.delete(event);
    for (const listener of listeners) listener(...args);
  }
}

test("serializes only the exact closed vocabulary without dynamic values", () => {
  const lines = [];
  const diagnostics = createCapturePhaseDiagnostics((line) => lines.push(line));
  for (const event of ALL_EVENTS) diagnostics.emit(event, PRIVATE, { private: PRIVATE });
  assert.deepEqual(lines, ALL_EVENTS.map(lineFor));
  assert.equal(lines.join("").includes(PRIVATE), false);
});

test("malformed events are rejected without coercion or writer calls", () => {
  let coercions = 0;
  const hostile = {
    toString() { coercions += 1; throw new Error(PRIVATE); },
    [Symbol.toPrimitive]() { coercions += 1; throw new Error(PRIVATE); },
  };
  const lines = [];
  const diagnostics = createCapturePhaseDiagnostics((line) => lines.push(line));
  for (const value of [undefined, null, true, 1, NaN, Symbol(PRIVATE), hostile,
    new String("child_exit"), [], "", "CHILD_EXIT", PRIVATE,
    `child_exit\n${PRIVATE}`, `child_exit=${PRIVATE}`]) {
    assert.doesNotThrow(() => diagnostics.emit(value));
  }
  assert.equal(coercions, 0);
  assert.deepEqual(lines, []);
  diagnostics.emit("child_exit");
  assert.deepEqual(lines, [lineFor("child_exit")]);
});

test("repeated observations remain finitely bounded with one reserved failure", () => {
  const lines = [];
  const diagnostics = createCapturePhaseDiagnostics((line) => lines.push(line));
  for (let index = 0; index < 1000; index += 1) {
    for (const event of ORDINARY_EVENTS) diagnostics.emit(event);
    diagnostics.emit(`${PRIVATE}${index}`);
  }
  assert.deepEqual(lines, ORDINARY_EVENTS.map(lineFor));
  diagnostics.emit("capture_failure");
  for (let index = 0; index < 1000; index += 1) {
    for (const event of ALL_EVENTS) diagnostics.emit(event);
  }
  assert.deepEqual(lines, ALL_EVENTS.map(lineFor));
  assert.ok(lines.length <= 16);
  assert.equal(lines.filter((line) => line === lineFor("capture_failure")).length, 1);
});

test("terminal failure suppresses later observations even when its writer throws", () => {
  const attempts = [];
  const diagnostics = createCapturePhaseDiagnostics((line) => {
    attempts.push(line);
    throw new Error(PRIVATE);
  });
  assert.doesNotThrow(() => diagnostics.emit("capture_failure"));
  for (const event of ALL_EVENTS) assert.doesNotThrow(() => diagnostics.emit(event));
  assert.deepEqual(attempts, [lineFor("capture_failure")]);
});

test("throwing and non-callable synchronous writers never affect caller flow", () => {
  const throwingFunction = new Proxy(() => {}, { apply() { throw new Error(PRIVATE); } });
  const hostileObject = new Proxy({}, { get() { throw new Error(PRIVATE); } });
  for (const write of [undefined, null, false, 1, PRIVATE, hostileObject,
    () => { throw new Error(PRIVATE); }, throwingFunction]) {
    const diagnostics = createCapturePhaseDiagnostics(write);
    let progressed = 0;
    for (const event of ALL_EVENTS) {
      assert.doesNotThrow(() => diagnostics.emit(event));
      progressed += 1;
    }
    assert.equal(progressed, ALL_EVENTS.length);
  }
});

for (const throws of [false, true]) {
  test((throws ? "throwing" : "returning") + " writer cannot report premature terminal failure", () => {
    const lines = [];
    let diagnostics;
    diagnostics = createCapturePhaseDiagnostics((line) => {
      lines.push(line);
      if (line === lineFor("capture_enter")) {
        diagnostics.emit("capture_failure");
        if (throws) throw new Error(PRIVATE);
      }
    });
    const child = new FakeEmitter();
    const outcome = { code: 7, signal: null, private: PRIVATE };
    const received = [];
    child.once("exit", (value) => received.push(value));
    diagnostics.observeChild(child);
    assert.doesNotThrow(() => diagnostics.emit("capture_enter"));
    assert.deepEqual(lines, [lineFor("capture_enter")]);
    assert.doesNotThrow(() => {
      child.fire("spawn");
      child.fire("exit", outcome);
      child.fire("close", outcome);
      diagnostics.emit("capture_return");
    });
    const realEvents = ["capture_enter", "child_spawn", "child_exit", "child_close", "capture_return"];
    assert.deepEqual(lines, realEvents.map(lineFor));
    assert.deepEqual(received, [outcome]);
    assert.equal(received[0], outcome);
    diagnostics.emit("capture_failure");
    for (const event of ALL_EVENTS) diagnostics.emit(event);
    assert.deepEqual(lines, [...realEvents, "capture_failure"].map(lineFor));
    assert.equal(lines.join("").includes(PRIVATE), false);
    assert.ok(lines.length <= 16);
  });
}

test("reentrant writers cannot consume events, terminal state, or the cap", () => {
  for (const throws of [false, true]) {
    const lines = [];
    let diagnostics;
    diagnostics = createCapturePhaseDiagnostics((line) => {
      lines.push(line);
      for (const event of ALL_EVENTS) diagnostics.emit(event);
      if (throws) throw new Error(PRIVATE);
    });
    assert.doesNotThrow(() => diagnostics.emit("capture_enter"));
    assert.deepEqual(lines, [lineFor("capture_enter")]);
    // Ignored callbacks must not mark ordinary events as seen or use the
    // reserved failure; each later real event remains observable once.
    for (const event of ORDINARY_EVENTS) assert.doesNotThrow(() => diagnostics.emit(event));
    assert.deepEqual(lines, ORDINARY_EVENTS.map(lineFor));
    assert.doesNotThrow(() => diagnostics.emit("capture_failure"));
    for (let index = 0; index < 1000; index += 1) {
      for (const event of ALL_EVENTS) diagnostics.emit(event);
    }
    assert.deepEqual(lines, ALL_EVENTS.map(lineFor));
    assert.equal(new Set(lines).size, lines.length);
    assert.ok(lines.length <= 16);
    assert.equal(lines.join("").includes(PRIVATE), false);
  }
});

test("lifecycle hooks retain only fixed events and ignore all callback arguments", () => {
  const lines = [];
  const diagnostics = createCapturePhaseDiagnostics((line) => lines.push(line));
  const child = new FakeEmitter();
  const stdout = new FakeEmitter();
  const stderr = new FakeEmitter();
  const stdoutSink = new FakeEmitter();
  const stderrSink = new FakeEmitter();
  diagnostics.observeChild(child);
  diagnostics.observeInput(stdout, "stdout");
  diagnostics.observeInput(stderr, "stderr");
  diagnostics.observeSink(stdoutSink, "stdout");
  diagnostics.observeSink(stderrSink, "stderr");
  assert.deepEqual(child.registrations, ["spawn", "exit", "close"]);
  assert.deepEqual(stdout.registrations, ["end", "close"]);
  assert.deepEqual(stderr.registrations, ["end", "close"]);
  assert.deepEqual(stdoutSink.registrations, ["close"]);
  assert.deepEqual(stderrSink.registrations, ["close"]);

  diagnostics.emit("capture_enter");
  child.fire("spawn", PRIVATE);
  child.fire("exit", 71, PRIVATE, { arbitrary: PRIVATE });
  stdout.fire("end", PRIVATE);
  stdout.fire("close", PRIVATE);
  stderr.fire("end", PRIVATE);
  stderr.fire("close", PRIVATE);
  stdoutSink.fire("close", PRIVATE);
  stderrSink.fire("close", PRIVATE);
  child.fire("close", 71, PRIVATE);
  diagnostics.emit("capture_return");
  assert.deepEqual(lines, [
    "capture_enter", "child_spawn", "child_exit", "stdout_end", "stdout_close",
    "stderr_end", "stderr_close", "stdout_sink_close", "stderr_sink_close",
    "child_close", "capture_return",
  ].map(lineFor));
  assert.equal(lines.join("").includes(PRIVATE), false);
  assert.equal(lines.join("").includes("71"), false);
});

test("observing does not replace existing listeners or modify their arguments", () => {
  const child = new FakeEmitter();
  const argument = { private: PRIVATE };
  const received = [];
  child.once("exit", (...args) => received.push(args));
  const diagnostics = createCapturePhaseDiagnostics(() => { throw new Error(PRIVATE); });
  diagnostics.observeChild(child);
  child.once("exit", (...args) => received.push(args));
  assert.doesNotThrow(() => child.fire("exit", 7, argument));
  assert.equal(received.length, 2);
  assert.deepEqual(received[0], [7, argument]);
  assert.deepEqual(received[1], [7, argument]);
  assert.equal(received[0][1], argument);
  assert.equal(received[1][1], argument);
});

test("invalid channels do not register listeners or coerce supplied values", () => {
  const emitter = new FakeEmitter();
  let coercions = 0;
  const hostile = { toString() { coercions += 1; throw new Error(PRIVATE); } };
  const lines = [];
  const diagnostics = createCapturePhaseDiagnostics((line) => lines.push(line));
  for (const channel of [undefined, null, 0, false, Symbol(PRIVATE), hostile,
    new String("stdout"), "STDOUT", `${PRIVATE}stdout`, "stdout\nprivate"]) {
    assert.doesNotThrow(() => diagnostics.observeInput(emitter, channel));
    assert.doesNotThrow(() => diagnostics.observeSink(emitter, channel));
  }
  assert.equal(coercions, 0);
  assert.deepEqual(emitter.registrations, []);
  assert.deepEqual(lines, []);
});

test("missing and broken emitter interfaces cannot throw or expose their errors", () => {
  const lines = [];
  const diagnostics = createCapturePhaseDiagnostics((line) => lines.push(line));
  const throwingGetter = { get once() { throw new Error(PRIVATE); } };
  const throwingMethod = { once() { throw new Error(PRIVATE); } };
  const hostileProxy = new Proxy({}, { get() { throw new Error(PRIVATE); } });
  for (const emitter of [undefined, null, false, 0, PRIVATE, {}, { once: true },
    throwingGetter, throwingMethod, hostileProxy]) {
    assert.doesNotThrow(() => diagnostics.observeChild(emitter));
    assert.doesNotThrow(() => diagnostics.observeInput(emitter, "stdout"));
    assert.doesNotThrow(() => diagnostics.observeInput(emitter, "stderr"));
    assert.doesNotThrow(() => diagnostics.observeSink(emitter, "stdout"));
    assert.doesNotThrow(() => diagnostics.observeSink(emitter, "stderr"));
  }
  assert.deepEqual(lines, []);
});

test("hostile registration can emit only its fixed token before throwing", () => {
  const lines = [];
  const diagnostics = createCapturePhaseDiagnostics((line) => lines.push(line));
  const emitter = {
    once(event, listener) {
      listener(PRIVATE, { event, private: PRIVATE });
      listener(PRIVATE);
      throw new Error(PRIVATE);
    },
  };
  assert.doesNotThrow(() => diagnostics.observeChild(emitter));
  assert.doesNotThrow(() => diagnostics.observeInput(emitter, "stdout"));
  assert.doesNotThrow(() => diagnostics.observeSink(emitter, "stdout"));
  assert.deepEqual(lines, [
    "child_spawn", "child_exit", "child_close", "stdout_end", "stdout_close", "stdout_sink_close",
  ].map(lineFor));
  assert.equal(lines.join("").includes(PRIVATE), false);
});

test("the default silent factory preserves normal lifecycle listener outcomes", () => {
  const diagnostics = createCapturePhaseDiagnostics();
  const child = new FakeEmitter();
  const stdout = new FakeEmitter();
  const stderr = new FakeEmitter();
  const stdoutSink = new FakeEmitter();
  const stderrSink = new FakeEmitter();
  const expected = { code: 7, signal: null, private: PRIVATE };
  const received = [];
  child.once("spawn", () => received.push("spawn"));
  child.once("exit", (outcome) => received.push(outcome));
  child.once("close", (outcome) => received.push(outcome));
  stdout.once("end", () => received.push("stdout_end"));
  stderr.once("end", () => received.push("stderr_end"));
  stdoutSink.once("close", () => received.push("stdout_sink_close"));
  stderrSink.once("close", () => received.push("stderr_sink_close"));

  assert.doesNotThrow(() => {
    diagnostics.observeChild(child);
    diagnostics.observeInput(stdout, "stdout");
    diagnostics.observeInput(stderr, "stderr");
    diagnostics.observeSink(stdoutSink, "stdout");
    diagnostics.observeSink(stderrSink, "stderr");
    diagnostics.emit("capture_enter");
    child.fire("spawn");
    child.fire("exit", expected);
    stdout.fire("end");
    stderr.fire("end");
    stdout.fire("close");
    stderr.fire("close");
    stdoutSink.fire("close");
    stderrSink.fire("close");
    child.fire("close", expected);
    diagnostics.emit("capture_return");
  });
  assert.deepEqual(received, [
    "spawn", expected, "stdout_end", "stderr_end",
    "stdout_sink_close", "stderr_sink_close", expected,
  ]);
  assert.equal(received[1], expected);
  assert.equal(received[6], expected);
  assert.deepEqual(expected, { code: 7, signal: null, private: PRIVATE });
});
