// Stream wiring only: callers own files, diagnostics, processes, and failure policy.
export function captureBoundedStream(stream, output, maxBytes, onOverflow) {
  let bytes = 0;
  let failed = false;
  let inputFinalized = false;
  let waitingForDrain = false;
  const resumeAfterDrain = () => {
    waitingForDrain = false;
    if (!failed && !inputFinalized) stream.resume();
  };
  const detachDrain = () => {
    if (waitingForDrain) {
      output.removeListener("drain", resumeAfterDrain);
      waitingForDrain = false;
    }
  };
  const finalizeInput = (reportFailure, error) => {
    const shouldEnd = !inputFinalized;
    inputFinalized = true;
    detachDrain();
    try {
      if (reportFailure) onOverflow(error);
    } finally {
      try {
        // Keep accepted bytes queued for flushing; the output owns its close.
        if (shouldEnd) output.end();
      } finally {
        if (reportFailure) stream.resume();
      }
    }
  };
  stream.on("data", (chunk) => {
    if (failed || inputFinalized) return;
    const remaining = maxBytes - bytes;
    if (remaining > 0) {
      const retained = chunk.subarray(0, remaining);
      bytes += retained.length;
      if (!output.write(retained) && !failed && !inputFinalized) {
        stream.pause();
        if (!waitingForDrain) {
          waitingForDrain = true;
          output.once("drain", resumeAfterDrain);
        }
      }
    }
    if (chunk.length > remaining) onOverflow();
  });
  stream.on("end", () => finalizeInput(false));
  stream.on("error", (error) => finalizeInput(true, error));
  stream.on("close", () => {
    if (!inputFinalized) finalizeInput(true);
  });
  output.on("error", (error) => {
    failed = true;
    detachDrain();
    // A destroyed sink cannot drain. Consume input without further writes so
    // Node's exit-time stdio flush cannot pause again before reaching EOF.
    try {
      onOverflow(error);
    } finally {
      stream.resume();
    }
  });
  return new Promise((resolve) => output.on("close", resolve));
}
