import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

// Raw palette values are allowed only in explicit theme/token definition files.
// The current web-user app keeps its runtime CSS variables and tokenized style
// rules in one stylesheet; split CSS token files should replace that allowlist
// entry when the web theme system grows.
const allowedFiles = new Set([
  "apps/mobile/lib/ui/settleora_theme.dart",
  "apps/web-user/src/styles.css"
]);

const scannedRoots = [
  {
    label: "mobile Flutter production UI",
    root: "apps/mobile/lib",
    extensions: new Set([".dart"]),
    patterns: [
      /\bColor\s*\(\s*0x[0-9a-fA-F]+\s*\)/g,
      /\bColor\.from(?:ARGB|RGBO)\s*\([^)]*\)/g,
      /\bColors\.(?!transparent\b)[A-Za-z0-9_]+/g
    ]
  },
  {
    label: "user web production UI",
    root: "apps/web-user/src",
    extensions: new Set([".ts", ".tsx", ".js", ".jsx", ".css"]),
    patterns: [
      /#[0-9a-fA-F]{3,8}\b/g,
      /\b(?:rgb|rgba|hsl|hsla)\s*\([^)]*\)/g,
      /\b(?:bg|text|border|from|to|via|ring|outline|fill|stroke)-\[\s*(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\s*\()/g
    ]
  },
  {
    label: "admin web production UI",
    root: "apps/web-admin/src",
    extensions: new Set([".ts", ".tsx", ".js", ".jsx", ".css"]),
    patterns: [
      /#[0-9a-fA-F]{3,8}\b/g,
      /\b(?:rgb|rgba|hsl|hsla)\s*\([^)]*\)/g,
      /\b(?:bg|text|border|from|to|via|ring|outline|fill|stroke)-\[\s*(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\s*\()/g
    ]
  }
];

const ignoredSegments = new Set([
  ".dart_tool",
  ".git",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "test-results"
]);

function toRepoPath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function shouldIgnore(filePath) {
  const segments = toRepoPath(filePath).split("/");
  return segments.some((segment) => ignoredSegments.has(segment));
}

function walkFiles(root) {
  const absoluteRoot = path.join(repoRoot, root);
  if (!fs.existsSync(absoluteRoot)) {
    return [];
  }

  const files = [];
  const stack = [absoluteRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || shouldIgnore(current)) {
      continue;
    }

    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        stack.push(path.join(current, entry));
      }
      continue;
    }

    if (stat.isFile()) {
      files.push(current);
    }
  }

  return files.sort();
}

function lineNumberForOffset(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
    }
  }
  return line;
}

const violations = [];
let scannedFileCount = 0;

for (const rootConfig of scannedRoots) {
  for (const filePath of walkFiles(rootConfig.root)) {
    const repoPath = toRepoPath(filePath);
    if (allowedFiles.has(repoPath)) {
      continue;
    }

    if (!rootConfig.extensions.has(path.extname(filePath))) {
      continue;
    }

    scannedFileCount += 1;
    const source = fs.readFileSync(filePath, "utf8");
    for (const pattern of rootConfig.patterns) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        violations.push({
          area: rootConfig.label,
          file: repoPath,
          line: lineNumberForOffset(source, match.index ?? 0),
          value: match[0]
        });
      }
    }
  }
}

console.log("Theme token guardrail");
console.log(`Scanned roots: ${scannedRoots.map((root) => root.root).join(", ")}`);
console.log(`Scanned files: ${scannedFileCount}`);
console.log(`Allowlisted token/theme files: ${Array.from(allowedFiles).join(", ")}`);

if (violations.length === 0) {
  console.log("Violations: 0");
  process.exit(0);
}

console.error(`Violations: ${violations.length}`);
for (const violation of violations) {
  console.error(
    `${violation.file}:${violation.line} [${violation.area}] ${violation.value}`
  );
}

process.exit(1);
