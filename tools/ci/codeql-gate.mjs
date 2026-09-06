import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { classifyChanges } from './scaffold-validation-changes.mjs';

export const languages = Object.freeze(['actions', 'c-cpp', 'csharp', 'javascript-typescript', 'python']);
const workflow = '.github/workflows/security-codeql.yml';
const policyFiles = [workflow, 'tools/ci/codeql-gate.mjs', 'tools/ci/scaffold-validation-changes.mjs'];
const shaPattern = /^[0-9a-f]{40}$/;
const gitCommand = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
const digest = (value) => createHash('sha256').update(value).digest('hex');

export function applicability(env, event, git = gitCommand) {
  const identity = {
    event: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF, head: env.GITHUB_SHA,
    source: event.pull_request?.head?.sha || env.GITHUB_SHA,
    base: event.pull_request?.base?.sha || null,
    workflowRef: env.GITHUB_WORKFLOW_REF || null,
    workflowSha: env.GITHUB_WORKFLOW_SHA || null,
    classifierSource: env.GITHUB_SHA, versions: {},
  };
  try {
    if (shaPattern.test(env.GITHUB_SHA || '')) {
      for (const file of policyFiles) identity.versions[file] = digest(git(['show', `${env.GITHUB_SHA}:${file}`]));
    }
  } catch { /* Missing version evidence cannot enable the docs path. */ }
  const full = (reason) => ({ ...identity, mode: 'analysis', languages, reason });
  if (env.GITHUB_EVENT_NAME !== 'pull_request') return full('Repository-wide scan');
  try {
    const pr = event.pull_request;
    if (!pr || pr.base.repo.full_name !== env.GITHUB_REPOSITORY || !shaPattern.test(pr.head.sha) ||
        env.GITHUB_REF !== `refs/pull/${pr.number}/merge`) return full('Untrusted PR identity');
    const proof = classifyChanges({ EVENT_NAME: 'pull_request', CURRENT_SHA: env.GITHUB_SHA, PR_BASE_SHA: pr.base.sha }, git);
    if (!proof.docs_only) return full(proof.reason);
    const parents = git(['show', '-s', '--format=%P', env.GITHUB_SHA]).trim().split(' ');
    if (parents.length !== 2 || parents[0] !== pr.base.sha || parents[1] !== pr.head.sha) return full('Untrusted merge parents');
    const versions = {};
    for (const file of policyFiles) {
      const base = git(['show', `${pr.base.sha}:${file}`]);
      const current = git(['show', `${env.GITHUB_SHA}:${file}`]);
      if (base !== current) return full('Changed policy/workflow authority');
      versions[file] = digest(base);
    }
    return { ...identity, mode: 'docs-only', languages: ['docs-only'], reason: 'Trusted exact PR docs proof', ...proof,
      source: pr.head.sha, ref: env.GITHUB_REF, versions };
  } catch { return full('Unprovable applicability'); }
}

export function coverage(analyses, sha) {
  return languages.every((language) => analyses.some((a) => a.tool?.name === 'CodeQL' &&
    a.commit_sha === sha && a.analysis_key === `${workflow}:analyze` &&
    a.category === `/language:${language}` && a.error === '' && a.warning === ''));
}

export function gateResult(proof, expected, needs, checks = []) {
  if (!proof || proof.head !== expected.head || proof.source !== expected.source ||
      needs.prepare !== 'success' || needs.analyze !== 'success') return false;
  if (proof.mode === 'docs-only') return proof.docs_only === true && proof.paths?.length > 0 &&
    proof.languages?.length === 1 && proof.languages[0] === 'docs-only' &&
    policyFiles.every((file) => /^[a-f0-9]{64}$/.test(proof.versions?.[file] || ''));
  return proof.mode === 'analysis' && checks.some((c) => c.name === 'CodeQL' &&
    c.app?.slug === 'github-advanced-security' && c.head_sha === expected.source &&
    c.status === 'completed' && c.conclusion === 'success');
}

async function api(env, suffix) {
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/${suffix}`, {
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub read failed: ${response.status}`);
  return response.json();
}
export async function analysesFor(env, ref, sha, request = api) {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await request(env, `code-scanning/analyses?ref=${encodeURIComponent(ref)}&tool_name=CodeQL&per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error('Malformed analysis response');
    all.push(...batch);
    // Positive exact-commit coverage needs no inventory of unrelated history.
    if (coverage(all, sha) || batch.length < 100) return all;
  }
  throw new Error('Incomplete analysis pagination');
}
async function currentIdentity(env, event) {
  if (env.GITHUB_EVENT_NAME !== 'pull_request') return;
  const pr = await api(env, `pulls/${event.pull_request.number}`);
  if (pr.state !== 'open' || pr.head.sha !== event.pull_request.head.sha || pr.base.sha !== event.pull_request.base.sha ||
      pr.merge_commit_sha !== env.GITHUB_SHA) throw new Error('Stale PR identity');
}
async function main(env) {
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  let proof = applicability(env, event);
  if (proof.mode === 'docs-only') {
    try {
      await currentIdentity(env, event);
      if (!coverage(await analysesFor(env, `refs/heads/${event.pull_request.base.ref}`, proof.base), proof.base)) throw new Error('Missing base scanning authority');
    } catch { proof = { ...proof, mode: 'analysis', languages, reason: 'Unproven live identity/base scanner state' }; }
  }
  console.log(JSON.stringify(proof));
  if (process.argv[2] === 'prepare') {
    appendFileSync(env.GITHUB_OUTPUT, `matrix=${JSON.stringify({ language: proof.languages })}\nmode=${proof.mode}\n`);
    return;
  }
  const needs = JSON.parse(env.NEEDS_RESULTS);
  if (proof.mode !== env.PREPARED_MODE) throw new Error('Applicability changed; rerun with current authority');
  await currentIdentity(env, event);
  const expected = { head: env.GITHUB_SHA, source: event.pull_request?.head.sha || env.GITHUB_SHA };
  if (proof.mode === 'analysis') {
    if (!coverage(await analysesFor(env, env.GITHUB_REF, env.GITHUB_SHA), env.GITHUB_SHA)) throw new Error('Missing successful exact-commit advanced language analyses');
    if (env.GITHUB_EVENT_NAME === 'pull_request') {
      for (let attempt = 0; attempt < 60; attempt++) {
        const checks = await api(env, `commits/${expected.source}/check-runs?check_name=CodeQL&filter=latest&per_page=100`);
        if (gateResult(proof, expected, needs, checks.check_runs)) {
          await currentIdentity(env, event);
          appendFileSync(env.GITHUB_STEP_SUMMARY, `Real CodeQL: all five language jobs, uploads, processing and native findings gate succeeded.\n\n${JSON.stringify(expected)}\n`);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      }
      throw new Error('Native exact-head CodeQL findings gate did not succeed');
    }
    if (needs.prepare !== 'success' || needs.analyze !== 'success') throw new Error('Required analysis job failed');
  } else if (!gateResult(proof, expected, needs)) throw new Error('Invalid docs gate proof');
  appendFileSync(env.GITHUB_STEP_SUMMARY, `${proof.mode === 'docs-only' ? 'CodeQL not applicable: trusted docs-only proof; no language analysis launched.' : 'Real repository-wide CodeQL: all five language analyses uploaded and processed.'}\n\n${JSON.stringify(proof)}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.env).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
