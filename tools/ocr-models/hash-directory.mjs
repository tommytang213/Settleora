import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function hashDirectory(root) {
  const resolvedRoot = path.resolve(root);
  const digest = createHash("sha256");
  const visit = (directory, prefix = "") => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(absolute);
        if (path.isAbsolute(target)) throw new Error(`Artifact contains an absolute symbolic link: ${relative}`);
        const resolvedTarget = path.resolve(directory, target);
        if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
          throw new Error(`Artifact contains an escaping symbolic link: ${relative}`);
        }
        digest.update(`symlink\0${relative}\0${target}\0`);
      } else if (stat.isDirectory()) {
        digest.update(`directory\0${relative}\0`);
        visit(absolute, relative);
      } else if (stat.isFile()) {
        digest.update(`file\0${relative}\0${stat.mode & 0o777}\0${stat.size}\0`);
        digest.update(readFileSync(absolute));
        digest.update("\0");
      } else {
        throw new Error(`Artifact contains an unsupported entry: ${relative}`);
      }
    }
  };
  visit(resolvedRoot);
  return digest.digest("hex");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.length !== 3) throw new Error("Usage: hash-directory.mjs <directory>");
  console.log(hashDirectory(process.argv[2]));
}
