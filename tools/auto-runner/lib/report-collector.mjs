import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export function collectReport(config, promptInfo) {
  const expected = promptInfo.reportPath;
  if (!existsSync(expected)) {
    return {
      found: false,
      expectedPath: expected,
      error: "Expected Codex report was not found.",
    };
  }
  const reportsDir = path.join(config.logsRoot, "reports");
  mkdirSync(reportsDir, { recursive: true });
  const copyPath = path.join(reportsDir, path.basename(expected));
  copyFileSync(expected, copyPath);
  const text = readFileSync(expected, "utf8");
  return {
    found: true,
    expectedPath: expected,
    copyPath,
    statusMentioned: /\b(status|Status):\s*(success|partial|blocked|failed)/i.test(text),
    summary: text.slice(0, 3000),
  };
}
