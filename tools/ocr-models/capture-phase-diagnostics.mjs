// Observations only: no process control, I/O, timing, or acceptance decisions.
// The caller supplies a synchronous best-effort writer. Callback return values
// are ignored; diagnostic failures must never alter the observed operation.
const EVENTS = new Set([
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
  "capture_failure",
]);
const MAX_LINES = 16;
const FAILURE_EVENT = "capture_failure";

export function createCapturePhaseDiagnostics(write) {
  const seen = new Set();
  let attempts = 0;
  let terminal = false;

  const emit = (event) => {
    if (typeof event !== "string" || !EVENTS.has(event) || terminal || seen.has(event)) return;
    const failure = event === FAILURE_EVENT;
    // Reserve one terminal failure line. Count attempts before invoking the
    // writer so thrown or reentrant callbacks cannot evade the bound.
    if (attempts >= (failure ? MAX_LINES : MAX_LINES - 1)) return;
    seen.add(event);
    attempts += 1;
    if (failure) terminal = true;
    try {
      if (typeof write === "function") write(`bounded_capture_phase=${event}\n`);
    } catch {
      // Never emit arbitrary exception content or fall back to another writer.
    }
  };

  const observe = (emitter, event, token) => {
    try {
      const once = emitter?.once;
      if (typeof once === "function") once.call(emitter, event, () => emit(token));
    } catch {
      // A missing/broken observer interface is diagnostic unavailability only.
    }
  };

  return Object.freeze({
    emit,
    observeChild(child) {
      observe(child, "spawn", "child_spawn");
      observe(child, "exit", "child_exit");
      observe(child, "close", "child_close");
    },
    observeInput(stream, channel) {
      if (channel === "stdout") {
        observe(stream, "end", "stdout_end");
        observe(stream, "close", "stdout_close");
      } else if (channel === "stderr") {
        observe(stream, "end", "stderr_end");
        observe(stream, "close", "stderr_close");
      }
    },
    observeSink(output, channel) {
      if (channel === "stdout") observe(output, "close", "stdout_sink_close");
      else if (channel === "stderr") observe(output, "close", "stderr_sink_close");
    },
  });
}
