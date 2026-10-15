import { closeSync, constants, fstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";

export function collectReport(config, promptInfo) {
  const expected = promptInfo.reportPath;
  let text;
  try {
    const parent = path.dirname(expected);
    if (realpathSync(parent) !== parent) throw new Error("report directory is not canonical");
    const directoryFd = openSync(parent, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      const reportFd = openSync(`/proc/self/fd/${directoryFd}/${path.basename(expected)}`,
        constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const info = fstatSync(reportFd);
        if (!info.isFile() || info.size > 1024 * 1024
            || (typeof process.getuid === "function" && info.uid !== process.getuid())) {
          throw new Error("report file is unsafe");
        }
        text = readFileSync(reportFd, "utf8");
      } finally { closeSync(reportFd); }
    } finally { closeSync(directoryFd); }
  } catch {
    return {
      found: false,
      expectedPath: expected,
      error: "Expected safe Codex report was not found.",
    };
  }
  const reportsDir = path.join(config.logsRoot, "reports");
  mkdirSync(reportsDir, { recursive: true });
  if (realpathSync(reportsDir) !== reportsDir) throw new Error("report copy directory is unsafe");
  const copyPath = path.join(reportsDir, path.basename(expected));
  const copyFd = openSync(copyPath, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(copyFd, text); } finally { closeSync(copyFd); }
  return {
    found: true,
    expectedPath: expected,
    copyPath,
    statusMentioned: /\b(status|Status):\s*(success|partial|blocked|failed)/i.test(text),
    summary: text.slice(0, 3000),
  };
}
