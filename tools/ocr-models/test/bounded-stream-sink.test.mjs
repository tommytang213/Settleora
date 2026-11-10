import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { captureBoundedStream } from "../bounded-stream-sink.mjs";

// These fakes model only stream events and buffered flow. They do not create
// real streams, files, children, timers, signals, or a wrapper CLI invocation.
class FakeInput extends EventEmitter {
  queue = [];
  flowing = true;
  pumping = false;
  eofRequested = false;
  ended = false;
  pauseCalls = 0;
  resumeCalls = 0;

  push(...chunks) {
    this.queue.push(...chunks.map((chunk) => Uint8Array.from(chunk)));
    this.pump();
  }

  finish() {
    this.eofRequested = true;
    this.pump();
  }

  pause() {
    this.pauseCalls += 1;
    this.flowing = false;
    return this;
  }

  resume() {
    this.resumeCalls += 1;
    this.flowing = true;
    this.pump();
    return this;
  }

  pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.flowing && this.queue.length > 0) {
        this.emit("data", this.queue.shift());
      }
      if (this.flowing && this.eofRequested && this.queue.length === 0 && !this.ended) {
        this.ended = true;
        this.emit("end");
      }
    } finally {
      this.pumping = false;
    }
  }

  flushAfterChildExit() {
    // Node 22 child_process schedules one flushStdio() resume on exit.
    this.resume();
  }
}

class FakeOutput extends EventEmitter {
  writes = [];
  writeResults = [];
  destroyed = false;
  endCalls = 0;
  duringWrite = null;

  write(chunk) {
    this.writes.push([...chunk]);
    if (this.duringWrite) this.duringWrite();
    // A destroyed Writable returns false and cannot subsequently emit drain.
    if (this.destroyed) return false;
    return this.writeResults.length > 0 ? this.writeResults.shift() : true;
  }

  fail() {
    this.destroyed = true;
    this.emit("error", new Error("synthetic sink failure"));
  }

  drain() {
    assert.equal(this.destroyed, false, "a destroyed sink cannot drain");
    this.emit("drain");
  }

  end() {
    this.endCalls += 1;
  }

  close() {
    this.emit("close");
  }
}

function fixture({ maxBytes = 16, writeResults = [] } = {}) {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.writeResults = [...writeResults];
  const failures = { calls: 0, latched: false };
  const done = captureBoundedStream(input, output, maxBytes, () => {
    failures.calls += 1;
    failures.latched = true;
  });
  return { input, output, failures, done };
}

test("bounded sink retains healthy bytes and completes only on output close", async () => {
  const h = fixture();
  let settled = false;
  h.done.then(() => { settled = true; });
  h.input.push([1, 2], [3]);
  h.input.finish();
  assert.deepEqual(h.output.writes, [[1, 2], [3]]);
  assert.equal(h.output.endCalls, 1);
  assert.equal(h.failures.calls, 0);
  await Promise.resolve();
  assert.equal(settled, false);
  h.output.emit("finish");
  await Promise.resolve();
  assert.equal(settled, false);
  h.output.close();
  await Promise.resolve();
  assert.equal(settled, true);
});

test("bounded sink preserves healthy backpressure until drain", () => {
  const h = fixture({ writeResults: [false, true] });
  h.input.push([1], [2]);
  h.input.finish();
  assert.equal(h.input.flowing, false);
  assert.equal(h.input.queue.length, 1);
  assert.equal(h.input.ended, false);
  assert.equal(h.output.listenerCount("drain"), 1);
  h.output.drain();
  assert.deepEqual(h.output.writes, [[1], [2]]);
  assert.equal(h.input.queue.length, 0);
  assert.equal(h.input.ended, true);
  assert.equal(h.output.listenerCount("drain"), 0);
  assert.equal(h.failures.calls, 0);
  h.output.close();
});

test("bounded sink accepts the exact byte cap without failure", () => {
  const h = fixture({ maxBytes: 4 });
  h.input.push([1, 2], [3, 4]);
  h.input.finish();
  assert.deepEqual(h.output.writes, [[1, 2], [3, 4]]);
  assert.equal(h.failures.calls, 0);
  assert.equal(h.input.ended, true);
  h.output.close();
});

test("bounded sink retains only the capped prefix and reports later overflow", () => {
  const h = fixture({ maxBytes: 3 });
  h.input.push([1, 2], [3, 4, 5], [6]);
  h.input.finish();
  assert.deepEqual(h.output.writes, [[1, 2], [3]]);
  assert.equal(h.failures.calls, 2);
  assert.equal(h.input.ended, true);
  h.output.close();
});

test("bounded sink forwards input failure to the existing failure callback", () => {
  const h = fixture();
  h.input.emit("error", new Error("synthetic input failure"));
  assert.equal(h.failures.calls, 1);
  assert.equal(h.failures.latched, true);
  assert.deepEqual(h.output.writes, []);
  h.output.close();
});

test("bounded sink empty-buffer failure control can finish after exit flush", () => {
  const h = fixture({ writeResults: [false] });
  h.input.push([1]);
  h.input.finish();
  assert.equal(h.input.flowing, false);
  assert.equal(h.input.queue.length, 0);
  h.output.fail();
  h.output.close();
  h.input.flushAfterChildExit();
  assert.equal(h.failures.latched, true);
  assert.equal(h.input.ended, true);
  assert.deepEqual(h.output.writes, [[1]]);
});

test("bounded sink exhausted-cap failure control does not write again during exit flush", () => {
  const h = fixture({ maxBytes: 1, writeResults: [false] });
  h.input.push([1], [2], [3]);
  h.input.finish();
  assert.equal(h.input.queue.length, 2);
  h.output.fail();
  h.output.close();
  h.input.flushAfterChildExit();
  assert.equal(h.failures.latched, true);
  assert.equal(h.input.queue.length, 0);
  assert.equal(h.input.ended, true);
  assert.deepEqual(h.output.writes, [[1]]);
});

test("bounded sink failure cannot re-pause buffered input after Node exit flush", () => {
  const h = fixture({ maxBytes: 16, writeResults: [false] });
  h.input.push([1], [2], [3]);
  h.input.finish();
  assert.equal(h.input.flowing, false);
  assert.equal(h.input.queue.length, 2);
  assert.deepEqual(h.output.writes, [[1]]);
  h.output.fail();
  h.output.close();
  // Model the runtime's automatic resume rather than assuming it is absent.
  h.input.flushAfterChildExit();
  assert.equal(h.failures.latched, true);
  assert.equal(h.input.queue.length, 0, "failed capture must discard all buffered input");
  assert.equal(h.input.ended, true);
  assert.equal(h.input.flowing, true);
  assert.deepEqual(h.output.writes, [[1]], "destroyed capture must receive no further writes");
});

test("bounded sink failure without prior backpressure discards subsequent input", () => {
  const h = fixture();
  h.input.push([1]);
  h.output.fail();
  h.input.push([2], [3]);
  h.input.finish();
  assert.equal(h.input.queue.length, 0);
  assert.equal(h.input.ended, true);
  assert.deepEqual(h.output.writes, [[1]]);
  assert.equal(h.failures.latched, true);
  h.output.close();
});

test("bounded sink failure detaches its pending drain listener", () => {
  const h = fixture({ writeResults: [false] });
  h.input.push([1], [2]);
  assert.equal(h.output.listenerCount("drain"), 1);
  h.output.fail();
  assert.equal(h.output.listenerCount("drain"), 0);
  const resumes = h.input.resumeCalls;
  // An already queued or adversarial late notification must do nothing.
  h.output.emit("drain");
  assert.equal(h.input.resumeCalls, resumes);
  assert.deepEqual(h.output.writes, [[1]]);
  h.output.close();
});

test("bounded sink synchronous error during write cannot be followed by pause", () => {
  const h = fixture();
  h.output.duringWrite = () => {
    h.output.duringWrite = null;
    h.output.fail();
  };
  h.input.push([1], [2], [3]);
  h.input.finish();
  assert.equal(h.input.pauseCalls, 0);
  assert.equal(h.input.queue.length, 0);
  assert.equal(h.input.ended, true);
  assert.deepEqual(h.output.writes, [[1]]);
  assert.equal(h.failures.latched, true);
  h.output.close();
});

test("bounded sink failure after a healthy drain still discards subsequent input", () => {
  const h = fixture({ writeResults: [false] });
  h.input.push([1]);
  h.output.drain();
  assert.equal(h.input.flowing, true);
  assert.equal(h.output.listenerCount("drain"), 0);
  h.output.fail();
  h.input.push([2], [3]);
  h.input.finish();
  assert.equal(h.input.ended, true);
  assert.deepEqual(h.output.writes, [[1]]);
  h.output.close();
});

test("bounded sink failure remains failed after repeated errors", () => {
  const h = fixture({ writeResults: [false] });
  h.input.push([1], [2]);
  h.output.fail();
  h.output.fail();
  h.input.push([3]);
  h.input.finish();
  h.input.flushAfterChildExit();
  assert.equal(h.failures.latched, true);
  assert.equal(h.input.queue.length, 0);
  assert.equal(h.input.ended, true);
  assert.equal(h.output.listenerCount("drain"), 0);
  assert.deepEqual(h.output.writes, [[1]]);
  h.output.close();
});

test("bounded sink failure is isolated from another healthy sink", () => {
  const failed = fixture({ writeResults: [false] });
  const healthy = fixture({ writeResults: [false, true] });
  failed.input.push([1], [2], [3]);
  failed.input.finish();
  healthy.input.push([4], [5]);
  healthy.input.finish();
  failed.output.fail();
  failed.input.flushAfterChildExit();
  assert.equal(healthy.input.flowing, false);
  assert.equal(healthy.input.queue.length, 1);
  assert.equal(healthy.failures.calls, 0);
  healthy.output.drain();
  assert.deepEqual(healthy.output.writes, [[4], [5]]);
  assert.equal(healthy.input.ended, true);
  assert.equal(failed.input.ended, true);
  assert.deepEqual(failed.output.writes, [[1]]);
  failed.output.close();
  healthy.output.close();
});

test("bounded sink failure does not complete before output close", async () => {
  const h = fixture({ writeResults: [false] });
  let settled = false;
  h.done.then(() => { settled = true; });
  h.input.push([1], [2]);
  h.input.finish();
  h.output.fail();
  await Promise.resolve();
  assert.equal(settled, false);
  h.output.close();
  await Promise.resolve();
  assert.equal(settled, true);
});

// This output models the autoClose lifecycle only when end() is requested.
// Pending accepted bytes flush before finish, then close occurs on a later
// microtask. Tests cannot manually close this fixture to supply missing work.
class FinalizingOutput extends FakeOutput {
  accepted = [];
  flushed = [];
  events = [];
  finalizationRequested = false;
  failWhileFinalizing = false;

  write(chunk) {
    const result = super.write(chunk);
    if (!this.destroyed) this.accepted.push([...chunk]);
    return result;
  }

  end() {
    super.end();
    if (this.finalizationRequested) return;
    this.finalizationRequested = true;
    Promise.resolve().then(() => {
      if (this.failWhileFinalizing) {
        this.events.push("error");
        this.fail();
      } else {
        this.flushed = this.accepted.map((chunk) => [...chunk]);
        this.events.push("finish");
        this.emit("finish");
      }
    }).then(() => {
      this.events.push("close");
      super.close();
    });
  }

  close() {
    throw new Error("finalizing fixture closes only after end");
  }
}

function finalizingFixture({
  maxBytes = 16,
  writeResults = [],
  failWhileFinalizing = false,
  onFailure = null,
} = {}) {
  const input = new FakeInput();
  const output = new FinalizingOutput();
  output.writeResults = [...writeResults];
  output.failWhileFinalizing = failWhileFinalizing;
  const failures = { calls: 0, latched: false };
  const completion = { settled: false };
  const done = captureBoundedStream(input, output, maxBytes, (error) => {
    failures.calls += 1;
    failures.latched = true;
    if (onFailure) onFailure(error);
  });
  done.then(() => { completion.settled = true; });
  return { input, output, failures, completion };
}

async function observeFinalization() {
  // Observe a fixed number of microtasks; never await a possibly stuck capture.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test("bounded sink normal input end flushes before close without failure", async () => {
  const h = finalizingFixture();
  h.input.push([1, 2], [3]);
  h.input.finish();
  h.input.emit("close");
  assert.equal(h.output.endCalls, 1);
  assert.equal(h.completion.settled, false);
  await observeFinalization();
  assert.deepEqual(h.output.flushed, [[1, 2], [3]]);
  assert.deepEqual(h.output.events, ["finish", "close"]);
  assert.equal(h.failures.calls, 0);
  assert.equal(h.completion.settled, true);
});

test("bounded sink input error finalizes output without input end or manual close", async () => {
  const h = finalizingFixture();
  h.input.push([1, 2]);
  h.input.emit("error", new Error("synthetic input failure"));
  assert.equal(h.input.ended, false);
  assert.equal(h.failures.calls, 1);
  await observeFinalization();
  assert.equal(h.output.endCalls, 1);
  assert.deepEqual(h.output.flushed, [[1, 2]]);
  assert.deepEqual(h.output.events, ["finish", "close"]);
  assert.equal(h.completion.settled, true);
  assert.equal(h.input.ended, false);
});

test("bounded sink premature input close finalizes output without input end", async () => {
  const h = finalizingFixture();
  h.input.push([1, 2]);
  h.input.emit("close");
  assert.equal(h.input.ended, false);
  await observeFinalization();
  assert.equal(h.failures.calls, 1);
  assert.equal(h.output.endCalls, 1);
  assert.deepEqual(h.output.flushed, [[1, 2]]);
  assert.deepEqual(h.output.events, ["finish", "close"]);
  assert.equal(h.completion.settled, true);
  assert.equal(h.input.ended, false);
});

test("bounded sink input error then close finalizes once even if end arrives late", async () => {
  const h = finalizingFixture();
  h.input.push([1]);
  h.input.emit("error", new Error("synthetic input failure"));
  h.input.emit("close");
  await observeFinalization();
  assert.equal(h.output.endCalls, 1);
  assert.equal(h.failures.calls, 1);
  assert.equal(h.completion.settled, true);
  h.input.emit("end");
  assert.equal(h.output.endCalls, 1);
  assert.deepEqual(h.output.events, ["finish", "close"]);
});

test("bounded sink input failure flushes only the accepted bounded prefix", async () => {
  const h = finalizingFixture({ maxBytes: 3 });
  h.input.push([1, 2], [3, 4, 5]);
  assert.deepEqual(h.output.writes, [[1, 2], [3]]);
  assert.equal(h.failures.calls, 1);
  h.input.emit("error", new Error("synthetic input failure"));
  await observeFinalization();
  assert.equal(h.failures.calls, 2);
  assert.equal(h.output.endCalls, 1);
  assert.deepEqual(h.output.flushed, [[1, 2], [3]]);
  assert.equal(h.completion.settled, true);
});

test("bounded sink input error releases backpressure and discards later data", async () => {
  const h = finalizingFixture({ writeResults: [false] });
  h.input.push([1], [2], [3]);
  assert.equal(h.input.queue.length, 2);
  assert.equal(h.output.listenerCount("drain"), 1);
  h.input.emit("error", new Error("synthetic input failure"));
  h.input.push([4]);
  await observeFinalization();
  assert.equal(h.input.queue.length, 0);
  assert.equal(h.input.flowing, true);
  assert.equal(h.output.listenerCount("drain"), 0);
  assert.deepEqual(h.output.writes, [[1]]);
  assert.deepEqual(h.output.flushed, [[1]]);
  assert.equal(h.output.endCalls, 1);
  assert.equal(h.completion.settled, true);
});

test("bounded sink premature close releases backpressure and discards later data", async () => {
  const h = finalizingFixture({ writeResults: [false] });
  h.input.push([1], [2], [3]);
  assert.equal(h.input.queue.length, 2);
  h.input.emit("close");
  h.input.push([4]);
  await observeFinalization();
  assert.equal(h.failures.latched, true);
  assert.equal(h.input.queue.length, 0);
  assert.equal(h.output.listenerCount("drain"), 0);
  assert.deepEqual(h.output.writes, [[1]]);
  assert.deepEqual(h.output.flushed, [[1]]);
  assert.equal(h.output.endCalls, 1);
  assert.equal(h.completion.settled, true);
});

test("bounded sink output error while finalizing remains failed and awaits close", async () => {
  const h = finalizingFixture({ failWhileFinalizing: true });
  h.input.push([1]);
  h.input.emit("error", new Error("synthetic input failure"));
  assert.equal(h.completion.settled, false);
  await observeFinalization();
  assert.equal(h.failures.latched, true);
  assert.equal(h.output.endCalls, 1);
  assert.deepEqual(h.output.events, ["error", "close"]);
  assert.equal(h.completion.settled, true);
  h.input.push([2]);
  assert.deepEqual(h.output.writes, [[1]]);
});

test("bounded sink input error finalizes even when its failure callback throws", async () => {
  const expected = new Error("synthetic failure callback");
  const h = finalizingFixture({ onFailure: () => { throw expected; } });
  h.input.push([1]);
  assert.throws(() => h.input.emit("error", new Error("synthetic input failure")),
    (error) => error === expected);
  await observeFinalization();
  assert.equal(h.output.endCalls, 1);
  assert.deepEqual(h.output.flushed, [[1]]);
  assert.equal(h.completion.settled, true);
});

test("bounded sink premature close finalizes even when its failure callback throws", async () => {
  const expected = new Error("synthetic failure callback");
  const h = finalizingFixture({ onFailure: () => { throw expected; } });
  h.input.push([1]);
  assert.throws(() => h.input.emit("close"), (error) => error === expected);
  await observeFinalization();
  assert.equal(h.output.endCalls, 1);
  assert.deepEqual(h.output.flushed, [[1]]);
  assert.equal(h.completion.settled, true);
});

test("bounded sink input failure completion waits for close after flush finish", async () => {
  const h = finalizingFixture();
  h.input.push([1]);
  h.input.emit("error", new Error("synthetic input failure"));
  assert.equal(h.completion.settled, false);
  await Promise.resolve();
  assert.deepEqual(h.output.events, ["finish"]);
  assert.equal(h.completion.settled, false);
  await observeFinalization();
  assert.deepEqual(h.output.events, ["finish", "close"]);
  assert.equal(h.completion.settled, true);
});

test("bounded sink still reports input error after normal end without ending output twice", async () => {
  const h = finalizingFixture();
  h.input.push([1]);
  h.input.finish();
  h.input.emit("error", new Error("synthetic late input failure"));
  h.input.emit("close");
  await observeFinalization();
  assert.equal(h.failures.calls, 1);
  assert.equal(h.output.endCalls, 1);
  assert.deepEqual(h.output.flushed, [[1]]);
  assert.equal(h.completion.settled, true);
});

test("bounded sink synchronous input error during write cannot install backpressure", async () => {
  const h = finalizingFixture({ writeResults: [false] });
  h.output.duringWrite = () => {
    h.output.duringWrite = null;
    h.input.emit("error", new Error("synthetic synchronous input failure"));
  };
  h.input.push([1], [2], [3]);
  await observeFinalization();
  assert.equal(h.failures.latched, true);
  assert.equal(h.input.pauseCalls, 0);
  assert.equal(h.output.listenerCount("drain"), 0);
  assert.equal(h.input.queue.length, 0);
  assert.deepEqual(h.output.writes, [[1]]);
  assert.deepEqual(h.output.flushed, [[1]]);
  assert.equal(h.output.endCalls, 1);
  assert.equal(h.completion.settled, true);
});

test("bounded sink synchronous input close during write cannot install backpressure", async () => {
  const h = finalizingFixture({ writeResults: [false] });
  h.output.duringWrite = () => {
    h.output.duringWrite = null;
    h.input.emit("close");
  };
  h.input.push([1], [2], [3]);
  await observeFinalization();
  assert.equal(h.failures.latched, true);
  assert.equal(h.input.pauseCalls, 0);
  assert.equal(h.output.listenerCount("drain"), 0);
  assert.equal(h.input.queue.length, 0);
  assert.deepEqual(h.output.writes, [[1]]);
  assert.deepEqual(h.output.flushed, [[1]]);
  assert.equal(h.output.endCalls, 1);
  assert.equal(h.completion.settled, true);
});
