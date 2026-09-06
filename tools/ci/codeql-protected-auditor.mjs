import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { classifyChanges } from './scaffold-validation-changes.mjs';

const repository = 'tommytang213/Settleora';
const workflow = '.github/workflows/security-codeql.yml';
const auditor = '.github/workflows/codeql-protected-auditor.yml';
const helper = 'tools/ci/codeql-protected-auditor.mjs';
const controller = 'tools/ci/codeql-gate.mjs';
const classifier = 'tools/ci/scaffold-validation-changes.mjs';
const fallback = 'c778cf3ed81a1c6146f6013d026610c575eb9243';
const shaPattern = /^[a-f0-9]{40}$/;
const languages = ['actions', 'c-cpp', 'csharp', 'javascript-typescript', 'python'];
// Complete reviewed b467cf1b definitions, approved independently on main.
// Any byte change needs a separately reviewed protected authority update first.
export const approved = Object.freeze({
  [workflow]: '2e4934485f8062feb02ab2329a15dc936fc918e787bb85f64b46ed35c5fa7473',
  [controller]: '77804da0a0c57f12e94db983a62c1a6f3f1496bda0504d2f1974a57a410247f5',
  [classifier]: '53e6402e6300ccb1068121e53c4d4eb90582a9ca10c592be27f9cc706d1226de',
});
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function requireProof(condition, reason) { if (!condition) throw new Error(reason); }
export function verifyDefinition(path, bytes) {
  requireProof(Buffer.isBuffer(bytes) && approved[path] && digest(bytes) === approved[path], `Unapproved analyzer authority: ${path}`);
}
export function decodeFile(file) {
  requireProof(file?.type === 'file' && file.encoding === 'base64' && shaPattern.test(file.sha) &&
    Number.isSafeInteger(file.size) && file.size > 0 && file.size <= 100000 && typeof file.content === 'string', 'Unavailable or malformed file evidence');
  const encoded = file.content.replace(/\n/g, '');
  requireProof(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded), 'Malformed file encoding');
  const bytes = Buffer.from(encoded, 'base64');
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  requireProof(bytes.length === file.size && blob === file.sha, 'File blob identity mismatch');
  return bytes;
}
export function validateIdentity(pr, expected, main) {
  requireProof(pr?.state === 'open' && pr.number === expected.number &&
    pr.base?.repo?.full_name === repository && pr.base.ref === 'main' && pr.head?.repo?.full_name === repository &&
    shaPattern.test(pr.head.sha) && shaPattern.test(pr.base.sha) && shaPattern.test(pr.merge_commit_sha) &&
    pr.head.sha === expected.source && pr.base.sha === expected.base && pr.merge_commit_sha === expected.merge &&
    main === expected.authority && shaPattern.test(main), 'Stale or untrusted PR/base/head authority');
}
export function classifyEvidence(expected, commit, comparison) {
  requireProof(commit?.sha === expected.merge && commit.parents?.length === 2 &&
    commit.parents[0].sha === expected.base && commit.parents[1].sha === expected.source, 'Merge parents mismatch');
  requireProof(comparison?.base_commit?.sha === expected.base && comparison.merge_base_commit?.sha === expected.base &&
    comparison.status === 'ahead' && Array.isArray(comparison.files) && comparison.files.length > 0 && comparison.files.length < 300,
  'Unavailable or truncated comparison');
  const paths = [];
  for (const file of comparison.files) {
    requireProof(['added', 'modified', 'removed', 'renamed', 'changed', 'copied'].includes(file.status) &&
      typeof file.filename === 'string' && file.filename.length > 0 && !/[\0\r\n\uFFFD]/u.test(file.filename), 'Malformed changed path');
    paths.push(file.filename);
    if (file.status === 'renamed' || file.status === 'copied') {
      requireProof(typeof file.previous_filename === 'string' && file.previous_filename.length > 0 &&
        !/[\0\r\n\uFFFD]/u.test(file.previous_filename), 'Missing rename source');
      paths.push(file.previous_filename);
    }
  }
  // Reuse the protected shared classifier with API-proven Git facts. No git,
  // checkout, import, shell, package install or PR code execution occurs here.
  const gitFacts = (args) => {
    if (args[0] === 'rev-parse' && args[1] === '--is-shallow-repository') return 'false';
    if (args[0] === 'rev-parse') return args[2] === 'HEAD^{commit}' ? expected.merge : expected.base;
    if (args[0] === 'merge-base') return '';
    if (args[0] === 'diff') return paths.join('\0') + '\0';
    throw new Error('Unexpected classifier evidence request');
  };
  return classifyChanges({ EVENT_NAME: 'pull_request', CURRENT_SHA: expected.merge, PR_BASE_SHA: expected.base }, gitFacts);
}
export function apiArgs(endpoint, publish = false) {
  const reads = /^(?:pulls\/[1-9][0-9]*|git\/ref\/heads\/main|git\/trees\/[a-f0-9]{40}\?recursive=1|commits\/[a-f0-9]{40}|compare\/[a-f0-9]{40}\.\.\.[a-f0-9]{40}|contents\/(?:\.github\/workflows\/(?:security-codeql|codeql-protected-auditor)\.yml|tools\/ci\/(?:codeql-gate|codeql-protected-auditor|scaffold-validation-changes)\.mjs)\?ref=[a-f0-9]{40}|code-scanning\/analyses\?ref=[A-Za-z0-9%_.~-]+&tool_name=CodeQL&per_page=100&page=[1-9][0-9]*)$/;
  requireProof(publish ? endpoint === 'check-runs' : reads.test(endpoint), 'Unsupported GitHub endpoint');
  return ['api', '--hostname', 'github.com', '--method', publish ? 'POST' : 'GET', `repos/${repository}/${endpoint}`,
    '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28', ...(publish ? ['--input', '-'] : [])];
}
function request(endpoint, payload) {
  return JSON.parse(execFileSync('gh', apiArgs(endpoint, payload !== undefined), {
    encoding: 'utf8', input: payload === undefined ? undefined : JSON.stringify(payload),
    stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 8 * 1024 * 1024,
  }));
}
async function fileAt(api, path, sha, trees) {
  requireProof(shaPattern.test(sha), 'Invalid file revision');
  if (!trees.has(sha)) {
    const tree = await api(`git/trees/${sha}?recursive=1`);
    requireProof(shaPattern.test(tree?.sha) && tree.truncated === false && Array.isArray(tree.tree), 'Unavailable or truncated Git tree');
    trees.set(sha, tree.tree);
  }
  const entries = trees.get(sha).filter((entry) => entry.path === path);
  requireProof(entries.length === 1 && entries[0].type === 'blob' && entries[0].mode === '100644' &&
    shaPattern.test(entries[0].sha), 'Required authority is not a regular Git file');
  const file = await api(`contents/${path}?ref=${sha}`);
  requireProof(file.sha === entries[0].sha, 'Git tree/content blob mismatch');
  requireProof(file.path === path, 'File path mismatch');
  return decodeFile(file);
}
async function baseCoverage(api, base, ref) {
  const records = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await api(`code-scanning/analyses?ref=${encodeURIComponent(`refs/heads/${ref}`)}&tool_name=CodeQL&per_page=100&page=${page}`);
    requireProof(Array.isArray(batch), 'Malformed scanner evidence'); records.push(...batch);
    if (languages.every((l) => records.some((a) => a.commit_sha === base && a.tool?.name === 'CodeQL' &&
      a.analysis_key === `${workflow}:analyze` && a.category === `/language:${l}` && a.error === '' && a.warning === ''))) return true;
    if (batch.length < 100) return false;
  }
  return false;
}
export async function audit(expected, api = request) {
  const trees = new Map();
  const readFile = (path, sha) => fileAt(api, path, sha, trees);
  const pr = await api(`pulls/${expected.number}`);
  validateIdentity(pr, expected, (await api('git/ref/heads/main')).object?.sha);
  const commit = await api(`commits/${expected.merge}`);
  const comparison = await api(`compare/${expected.base}...${expected.merge}`);
  const classification = classifyEvidence(expected, commit, comparison);
  for (const path of Object.keys(approved)) {
    for (const sha of [expected.source, expected.merge]) verifyDefinition(path, await readFile(path, sha));
  }
  // The auditor cannot be changed or removed by the PR it is certifying.
  for (const path of [auditor, helper, classifier]) {
    const trusted = await readFile(path, expected.authority);
    for (const sha of [expected.source, expected.merge]) {
      requireProof(digest(await readFile(path, sha)) === digest(trusted), 'Changed protected auditor');
    }
  }
  // Prove the exact controller which the frozen analyzer actually loads.
  let baseTrusted = false;
  try {
    verifyDefinition(controller, await readFile(controller, expected.base));
    verifyDefinition(classifier, await readFile(classifier, expected.base));
    baseTrusted = true;
  } catch (error) {
    // Only a positively absent base controller permits the frozen fallback.
    const baseCommit = await api(`commits/${expected.base}`);
    requireProof(baseCommit.sha === expected.base && expected.base === expected.authority, 'Unproven fallback base');
    // Content API failure is not absence proof; inspect the trusted local base
    // through the caller-provided absence fact, never infer 404 from any error.
    requireProof(expected.baseControllerAbsent === true, 'Unproven base controller');
    for (const path of [controller, classifier]) verifyDefinition(path, await readFile(path, fallback));
  }
  let mode = 'analysis';
  if (classification.docs_only && baseTrusted) {
    try {
      verifyDefinition(workflow, await readFile(workflow, expected.base));
      if (await baseCoverage(api, expected.base, pr.base.ref)) mode = 'docs-only';
    } catch { /* Ambiguous base scanner proof requires real analysis. */ }
  }
  validateIdentity(await api(`pulls/${expected.number}`), expected, (await api('git/ref/heads/main')).object?.sha);
  return { ...expected, mode, reason: mode === 'docs-only' ? 'Protected unchanged analyzer and exact docs/base coverage proof' : 'Real five-language analysis required',
    paths: classification.paths, definitions: approved };
}
async function main(env) {
  requireProof(env.GITHUB_EVENT_NAME === 'pull_request_target' && env.GITHUB_REPOSITORY === repository &&
    env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_SHA === env.GITHUB_WORKFLOW_SHA && shaPattern.test(env.GITHUB_SHA), 'Not protected main workflow authority');
  const event = JSON.parse(readFileSync(0, 'utf8'));
  const pr = event.pull_request;
  requireProof(Number.isSafeInteger(pr?.number) && pr.number > 0, 'Invalid PR number');
  const live = await request(`pulls/${pr.number}`);
  const expected = { number: pr.number, source: pr.head.sha, base: pr.base.sha, merge: live.merge_commit_sha,
    authority: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
    baseControllerAbsent: env.BASE_CONTROLLER_ABSENT === 'true' };
  const proof = await audit(expected);
  const check = await request('check-runs', { name: 'CodeQL protected auditor', head_sha: proof.source,
    status: 'completed', conclusion: 'success',
    details_url: `https://github.com/${repository}/actions/runs/${env.GITHUB_RUN_ID}/attempts/${env.GITHUB_RUN_ATTEMPT}`,
    external_id: `${proof.authority}:${proof.base}:${proof.source}:${env.GITHUB_RUN_ID}:${env.GITHUB_RUN_ATTEMPT}`,
    output: { title: 'Protected analyzer definition verified', summary: JSON.stringify(proof) } });
  requireProof(Number.isSafeInteger(check.id) && check.head_sha === proof.source && check.conclusion === 'success', 'Unverified published check');
  // The merge procedure authenticates THIS protected Actions job and associates
  // this ID with it; a same-name check or GitHub Actions app alone is not proof.
  console.log(JSON.stringify({ ...proof, publishedCheckId: check.id }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.env).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
