import assert from "node:assert/strict";
import test from "node:test";
import { readGithubGetWithRetry } from "../lib/github-get-retry.mjs";

const route = "repos/example/repo/pulls?state=all&head=example%3Atask&per_page=100&page=2";
const options = { cwd: "/test/repo", encoding: "utf8", env: { PATH: "/usr/bin:/bin" } };
const transportError = (reason = "net/http: TLS handshake timeout", overrides = {}) => Object.assign(new Error("fixture transport failure"), {
  status: 1, signal: null, stdout: "", stderr: `Get "https://api.github.com/${route}": ${reason}\n`, ...overrides,
});

function fixture(steps) {
  let time = 100;
  const calls = [];
  const waits = [];
  const read = (overrides = {}) => readGithubGetWithRetry({
    route, options,
    now: () => time,
    sleep: (ms) => { waits.push(ms); time += ms; },
    command: (executable, args, commandOptions) => {
      calls.push({ executable, args, options: commandOptions });
      const step = steps[calls.length - 1];
      assert.ok(step, "unexpected attempt");
      time += step.elapsed ?? 0;
      if (step.error) throw step.error;
      return step.output;
    },
    ...overrides,
  });
  return { calls, waits, read, advance: (ms) => { time += ms; } };
}

test("successful GET uses a fixed executable/method and retains the caller environment", () => {
  const f = fixture([{ output: "[]" }]);
  assert.equal(f.read(), "[]");
  assert.deepEqual(f.calls, [{ executable: "/usr/bin/gh", args: ["api", "--method", "GET", route], options: {
    ...options, timeout: 30_000, killSignal: "SIGKILL", stdio: ["ignore", "pipe", "pipe"],
  } }]);
  assert.deepEqual(f.waits, []);
});

test("classified transport failure retries the identical GET once with a bounded delay", () => {
  const f = fixture([{ error: transportError(), elapsed: 100 }, { output: "[]", elapsed: 50 }]);
  assert.equal(f.read(), "[]");
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls[1], { ...f.calls[0], options: { ...f.calls[0].options, timeout: 29_650 } });
  assert.deepEqual(f.waits, [250]);
});

test("each supported transport diagnostic permits one retry", () => {
  for (const reason of [
    "EOF", "unexpected EOF", "net/http: TLS handshake timeout",
    "context deadline exceeded (Client.Timeout exceeded while awaiting headers)",
    "dial tcp 192.0.2.1:443: i/o timeout", "dial tcp [2001:db8::1]:443: i/o timeout",
    "read tcp 192.0.2.2:12345->192.0.2.1:443: read: connection reset by peer",
    "read tcp [2001:db8::2]:12345->[2001:db8::1]:443: i/o timeout",
  ]) {
    const f = fixture([{ error: transportError(reason) }, { output: "[]" }]);
    assert.equal(f.read(), "[]", reason);
    assert.equal(f.calls.length, 2, reason);
  }
});

test("exhausted retry throws the final error without a third attempt or wait", () => {
  const finalError = transportError("EOF");
  const f = fixture([{ error: transportError() }, { error: finalError }]);
  assert.throws(() => f.read(), (error) => error === finalError);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.waits, [250]);
});

test("permanent, ambiguous, partial-response, and local process failures never retry", () => {
  for (const error of [
    ...[401, 403, 404, 422, 429, 500, 502, 503, 504].map((status) => transportError("EOF", { stderr: `gh: failure (HTTP ${status})` })),
    transportError("EOF", { status: 4 }),
    transportError("tls: failed to verify certificate: x509: certificate signed by unknown authority"),
    transportError("dial tcp: lookup api.github.com: no such host"),
    transportError("EOF", { stderr: "error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com\n" }),
    transportError("EOF", { stderr: "To get started with GitHub CLI, please run: gh auth login" }),
    transportError("EOF", { stderr: "unknown flag: --invalid" }),
    transportError("EOF", { stdout: "{\"message\":\"Bad credentials\"}" }),
    transportError("EOF", { stdout: Buffer.from("[") }),
    transportError("EOF", { code: "ENOENT" }),
    transportError("EOF", { code: "ENOBUFS" }),
    transportError("EOF", { code: "ETIMEDOUT", status: null, signal: "SIGKILL" }),
    transportError("EOF", { signal: "SIGTERM" }),
    transportError("EOF", { stderr: `Get "https://api.github.com/repos/other/repo": EOF` }),
    transportError("EOF\ngh: Bad credentials (HTTP 401)"),
    transportError("unknown network failure"),
    new Error("semantic validation failed"),
  ]) {
    const f = fixture([{ error }]);
    assert.throws(() => f.read(), (actual) => actual === error);
    assert.equal(f.calls.length, 1, error.stderr);
    assert.deepEqual(f.waits, []);
  }
});

test("parsing failure is outside the retry boundary", () => {
  const f = fixture([{ output: "[malformed" }]);
  assert.throws(() => JSON.parse(f.read()), SyntaxError);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.waits, []);
});

test("a permanent error after a transient failure terminates the retry", () => {
  const permanent = transportError("EOF", { stderr: "gh: Forbidden (HTTP 403)" });
  const f = fixture([{ error: transportError() }, { error: permanent }]);
  assert.throws(() => f.read(), (actual) => actual === permanent);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.waits, [250]);
});

test("remaining deadline, including delay, bounds the second attempt timeout", () => {
  const f = fixture([{ error: transportError(), elapsed: 15_000 }, { output: "[]", elapsed: 14_749 }]);
  assert.equal(f.read(), "[]");
  assert.equal(f.calls[1].options.timeout, 14_750);
});

test("retry stops before sleeping when the remaining budget cannot cover the delay", () => {
  for (const elapsed of [29_750, 30_000, 31_000]) {
    const error = transportError();
    const f = fixture([{ error, elapsed }]);
    assert.throws(() => f.read(), (actual) => actual.code === "GITHUB_GET_DEADLINE" && actual.cause === error);
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.waits, []);
  }
});

test("an overslept backoff cannot start a request after the deadline", () => {
  const f = fixture([{ error: transportError(), elapsed: 100 }]);
  assert.throws(() => f.read({ sleep: () => f.advance(30_000) }), { code: "GITHUB_GET_DEADLINE" });
  assert.equal(f.calls.length, 1);
});

test("a response completing at or after the deadline is rejected", () => {
  for (const elapsed of [14_750, 14_751]) {
    const f = fixture([{ error: transportError(), elapsed: 15_000 }, { output: "[]", elapsed }]);
    assert.throws(() => f.read(), { code: "GITHUB_GET_DEADLINE" });
    assert.equal(f.calls.length, 2);
  }
});

test("separate reads have independent budgets and never reuse an earlier response", () => {
  const f = fixture([{ output: "first" }, { output: "second" }]);
  assert.equal(f.read(), "first");
  f.advance(60_000);
  assert.equal(f.read(), "second");
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].options.timeout, 30_000);
});

test("invalid or option-like routes are rejected before any command runs", () => {
  const f = fixture([]);
  for (const invalid of ["--method=POST", "graphql", "https://api.github.com/repos/example/repo", "repos/example/repo\n--method=POST", 'repos/example/repo"', ""]) {
    assert.throws(() => f.read({ route: invalid }), /GitHub GET route invalid/u);
  }
  assert.equal(f.calls.length, 0);
});
