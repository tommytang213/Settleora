import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const shaPattern = /^[0-9a-f]{40}$/;
const zeroSha = '0'.repeat(40);
const docsPattern = /^docs\/.+\.(md|mdx|txt|png|jpg|jpeg|gif|svg|webp|avif|pdf)$/;
const mobileAndIosPatterns = [
  /^apps\/mobile\//,
  /^packages\/client-dart\//,
];
const mobileAndIosExactPaths = new Set([
  '.github/workflows/scaffold-validation.yml',
  '.github/workflows/mobile-ios-validation.yml',
  'tools/ci/scaffold-validation-changes.mjs',
  'tools/ci/test/scaffold-validation-changes.test.mjs',
  'tools/ci/test/ci-workflow-policy.test.mjs',
  'tools/release/day1-release-identity-cli.mjs',
  'tools/release/day1-release-identity.mjs',
  'tools/release/sealed_android_verifier.py',
  'codemagic.yaml',
]);
const mobileOnlyExactPaths = new Set([
  'package.json',
  'tools/doctor-validation.mjs',
]);
const webUserPatterns = [
  /^apps\/web-user\//,
  /^packages\/client-web\//,
];
const webUserExactPaths = new Set([
  '.github/workflows/scaffold-validation.yml',
  'tools/ci/scaffold-validation-changes.mjs',
  'tools/ci/user-web-dist-manifest.mjs',
  'tools/ci/test/scaffold-validation-changes.test.mjs',
  'tools/ci/test/ci-workflow-policy.test.mjs',
  'tools/ci/test/user-web-dist-manifest.test.mjs',
  'tools/release/day1-release-identity-cli.mjs',
  'tools/release/day1-release-identity.mjs',
]);
const gitCommand = (args) => execFileSync('git', args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000,
});

// The workflow and offline tests use this same policy. Any failed proof is full.
export function classifyChanges(env, git = gitCommand) {
  const full = (reason) => ({
    docs_only: false,
    run_full_validation: true,
    run_mobile_validation: true,
    run_ios_validation: true,
    run_web_user_validation: true,
    reason,
  });
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
    const runIosValidation = paths.some((p) =>
      mobileAndIosExactPaths.has(p) || mobileAndIosPatterns.some((pattern) => pattern.test(p)));
    const runMobileValidation = runIosValidation || paths.some((p) => mobileOnlyExactPaths.has(p));
    const runWebUserValidation = paths.some((p) =>
      webUserExactPaths.has(p) || webUserPatterns.some((pattern) => pattern.test(p)));
    return {
      docs_only: docsOnly,
      run_full_validation: !docsOnly,
      run_mobile_validation: runMobileValidation,
      run_ios_validation: runIosValidation,
      run_web_user_validation: runWebUserValidation,
      reason: proof,
      base,
      head,
      paths,
    };
  } catch {
    return full('Git proof failed');
  }
}

export function aggregateGateDecision(env) {
  const booleanKeys = [
    'RUN_FULL_VALIDATION',
    'RUN_MOBILE_VALIDATION',
    'RUN_IOS_VALIDATION',
    'RUN_WEB_USER_VALIDATION',
  ];
  const invalidBoolean = booleanKeys.find((key) => !['true', 'false'].includes(env[key]));
  if (invalidBoolean) return { ok: false, reason: `Invalid or missing ${invalidBoolean}` };
  if (env.CLASSIFY_RESULT !== 'success') return { ok: false, reason: 'Classifier/scaffold validation did not succeed' };

  const requirements = [
    ['full validation', env.RUN_FULL_VALIDATION === 'true', env.FULL_RESULT],
    ['mobile validation', env.EVENT_NAME === 'pull_request' && env.RUN_MOBILE_VALIDATION === 'true', env.MOBILE_RESULT],
    ['iOS validation', env.EVENT_NAME === 'pull_request' && env.RUN_IOS_VALIDATION === 'true', env.IOS_RESULT],
    ['user-web validation', env.EVENT_NAME === 'pull_request' && env.RUN_WEB_USER_VALIDATION === 'true', env.WEB_USER_RESULT],
  ];
  for (const [label, required, result] of requirements) {
    const expected = required ? 'success' : 'skipped';
    if (result !== expected) return { ok: false, reason: `${label} was ${result || 'missing'}; expected ${expected}` };
  }
  return { ok: true, reason: 'All classifier-required validations succeeded' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--validate-gate') {
    const decision = aggregateGateDecision(process.env);
    console.error(JSON.stringify(decision));
    if (!decision.ok) process.exitCode = 1;
  } else {
    const result = classifyChanges(process.env);
    // Stdout is only fixed booleans; evidence stays on stderr, never in outputs.
    process.stdout.write(
      `run_full_validation=${result.run_full_validation}\n` +
      `docs_only=${result.docs_only}\n` +
      `run_mobile_validation=${result.run_mobile_validation}\n` +
      `run_ios_validation=${result.run_ios_validation}\n` +
      `run_web_user_validation=${result.run_web_user_validation}\n`,
    );
    console.error(JSON.stringify({ event: process.env.EVENT_NAME, before: process.env.BEFORE_SHA, ...result }));
  }
}
