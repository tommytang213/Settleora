import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const shaPattern = /^[0-9a-f]{40}$/;
const zeroSha = '0'.repeat(40);
const docsPattern = /^docs\/.+\.(md|mdx|txt|png|jpg|jpeg|gif|svg|webp|avif|pdf)$/;
const gitCommand = (args) => execFileSync('git', args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000,
});

// The workflow and offline tests use this same policy. Any failed proof is full.
export function classifyChanges(env, git = gitCommand) {
  const full = (reason) => ({ docs_only: false, run_full_validation: true, reason });
  try {
    const head = env.CURRENT_SHA;
    if (!shaPattern.test(head ?? '') || head === zeroSha) return full('Invalid current SHA');
    if (git(['rev-parse', '--verify', 'HEAD^{commit}']).trim() !== head) return full('Checkout/head mismatch');
    if (git(['rev-parse', '--is-shallow-repository']).trim() !== 'false') return full('Incomplete history');
    let base;
    let proof;
    if (env.EVENT_NAME === 'pull_request') {
      base = env.PR_BASE_SHA;
      proof = 'pull_request_base';
    } else if (env.EVENT_NAME === 'push') {
      if (!env.BEFORE_SHA || env.BEFORE_SHA === zeroSha) {
        if (!env.EVENT_REF?.startsWith('refs/heads/') || env.EVENT_REF === 'refs/heads/main') {
          return full('First push requires a non-default branch');
        }
        // No event-controlled fetch refs. Never use stale origin/main after a failed fetch.
        git(['fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main']);
        const main = git(['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}']).trim();
        if (!shaPattern.test(main)) return full('Invalid main');
        const bases = git(['merge-base', '--all', main, head]).trim().split('\n');
        if (bases.length !== 1 || !shaPattern.test(bases[0])) return full('Missing or ambiguous merge-base');
        base = bases[0];
        git(['merge-base', '--is-ancestor', base, main]);
        git(['merge-base', '--is-ancestor', base, head]);
        proof = 'first_push_main_merge_base';
      } else {
        base = env.BEFORE_SHA;
        proof = 'push_before';
      }
    } else return full('Unsupported event');
    if (!shaPattern.test(base ?? '') || base === zeroSha) return full('Invalid comparison base');
    if (git(['rev-parse', '--verify', `${base}^{commit}`]).trim() !== base) return full('Unresolved base');
    git(['merge-base', '--is-ancestor', base, head]);
    // Disable rename detection so both sides of source-to-doc renames are checked.
    const raw = git(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z', base, head, '--']);
    if (!raw || !raw.endsWith('\0')) return full('Empty or malformed changed-file evidence');
    const paths = raw.slice(0, -1).split('\0');
    if (paths.some((p) => !p || /[\r\n\uFFFD]/u.test(p))) return full('Untrusted changed-file evidence');
    const docsOnly = paths.every((p) => p === 'README.md' || docsPattern.test(p));
    return { docs_only: docsOnly, run_full_validation: !docsOnly, reason: proof, base, head, paths };
  } catch {
    return full('Git proof failed');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = classifyChanges(process.env);
  // Only fixed booleans go to GITHUB_OUTPUT; filenames cannot inject outputs.
  appendFileSync(process.env.GITHUB_OUTPUT,
    `run_full_validation=${result.run_full_validation}\ndocs_only=${result.docs_only}\n`);
  console.log(JSON.stringify({ event: process.env.EVENT_NAME, before: process.env.BEFORE_SHA, ...result }));
}
