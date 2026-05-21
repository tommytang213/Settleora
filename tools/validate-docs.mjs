import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const requiredDocs = [
  "PROGRAM_ARCHITECTURE.md",
  "README.md",
  "docs/workflow/CODEX_TASK_GUIDE.md",
  "docs/workflow/LOCAL_TOOLING_TROUBLESHOOTING.md"
];

const failures = [];

for (const path of requiredDocs) {
  if (!existsSync(path)) {
    failures.push(`Missing required documentation path: ${path}`);
  }
}

const trackedMarkdown = spawnSync("git", ["ls-files", "*.md"], {
  encoding: "utf8",
  shell: process.platform === "win32",
  windowsHide: true
});

if (trackedMarkdown.status !== 0) {
  failures.push(`Could not list tracked Markdown files: ${(trackedMarkdown.stderr ?? "").trim() || "git exited non-zero"}`);
} else {
  for (const path of trackedMarkdown.stdout.split(/\r?\n/).filter(Boolean)) {
    const content = await readFile(path, "utf8");
    if (/^(<<<<<<<|=======|>>>>>>>) /m.test(content)) {
      failures.push(`Merge conflict marker found in ${path}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Documentation validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Documentation validation passed.");
