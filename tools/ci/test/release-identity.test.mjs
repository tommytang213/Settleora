// Keep the release-identity suite in its domain directory while making the
// repository's mandatory CI test glob execute it on every relevant change.
import '../../release/test/day1-release-identity.test.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
execFileSync('python3', ['-m', 'unittest', 'discover', '-s', 'tools/release/test', '-p', 'test_*.py'], {
  cwd: repoRoot,
  stdio: 'inherit',
});
