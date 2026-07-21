import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const largeCandidateRoutingStateVersion = 1;
export const largeCandidateRoutingStates = Object.freeze([
  "external_review_normal_ready",
  "external_review_large_bundle_escalation_required",
  "external_review_large_bundle_in_progress",
  "external_review_large_bundle_approved",
  "external_review_split_required",
  "external_review_context_limit_blocked",
  "external_review_coverage_incomplete",
  "external_review_complete",
]);

const passingStates = new Set(["external_review_large_bundle_approved", "external_review_complete"]);
const historicalStates = new Map([["blocked_external_reviewer_split_required", "external_review_split_required"]]);
const domainRules = Object.freeze([
  ["workflow-docs-tooling", /^(tools\/auto-runner|docs\/(workflow|planning)\/|README\.md$)/i],
  ["auth-security", /(^|\/)(auth|identity|session|security|credential|token)(\/|[-_.])/i],
  ["money-settlement", /(^|\/)(money|settlement|payment|bill|rounding)(\/|[-_.])/i],
  ["storage-privacy", /(^|\/)(storage|file|privacy|vault|authorization|authz)(\/|[-_.])/i],
  ["schema-migration", /(^|\/)(migrations?|schema)(\/|[-_.])/i],
  ["openapi-generated", /(^|\/)(openapi|generated|client-web|client-dart)(\/|[-_.])/i],
  ["deployment-ci", /(^|\/)(\.github|infra|docker|deploy|systemd|codemagic)(\/|[-_.])/i],
  ["product-ui", /(^|\/)(apps\/mobile|apps\/web|ui)(\/|[-_.])/i],
]);

export function classifyLargeCandidate(input = {}) {
  const changedFiles = normalizeFiles(input.changedFiles);
  const domains = [...new Set(changedFiles.map(classifyPath))].sort();
  const totalChangedLines = finiteCount(input.stats?.additions) + finiteCount(input.stats?.deletions);
  const largeBySize = changedFiles.length >= 40 || totalChangedLines >= 2000;
  const explicitManual = Boolean(input.laneDecision?.manualActionRequired || input.laneDecision?.manualDecisionRequired || input.laneDecision?.genuineManualDecisionRequired || input.laneDecision?.dangerGate || input.laneDecision?.stopLabelPresent);
  const incompatible = incompatibleDomainPairs(domains);
  const laneSplit = Boolean(input.laneDecision?.splitRequired || input.laneDecision?.branchStrategy === "split-required");
  const unrelatedIssues = Array.isArray(input.issueNumbers) && new Set(input.issueNumbers).size > 1 && !input.featureBundle?.architectureConsistent;
  const architectureProof = Boolean(input.featureBundle?.architectureConsistent || input.taskContract?.architectureConsistentLargeBundle);
  const mixed = laneSplit || unrelatedIssues || (incompatible.length > 0 && !architectureProof);
  const coherent = !explicitManual && !mixed && (domains.length <= 1 || architectureProof);
  let state = "external_review_normal_ready";
  let route = "normal";
  if (explicitManual || mixed) {
    state = "external_review_split_required";
    route = "split_or_block";
  } else if (largeBySize || changedFiles.length >= 15 || totalChangedLines >= 800) {
    state = "external_review_large_bundle_escalation_required";
    route = "large_bundle_escalation";
  }
  return freeze({ state, route, coherent, largeBySize, changedFileCount: changedFiles.length, totalChangedLines, domains, incompatibleDomainPairs: incompatible, explicitManual, evidence: { lane: input.laneDecision?.lane || null, issueNumbers: boundedNumbers(input.issueNumbers), architectureProof } });
}

export function buildLargeCandidateCoverageManifest(input = {}) {
  const identity = normalizeCandidateIdentity(input.candidateIdentity);
  const changedFiles = normalizeFiles(input.changedFiles);
  if (!identity.ok) return freeze({ ok: false, state: "external_review_coverage_incomplete", reasonCode: identity.reasonCode });
  if (changedFiles.length === 0) return freeze({ ok: false, state: "external_review_coverage_incomplete", reasonCode: "coverage_changed_files_missing" });
  const sectionMap = new Map();
  if (input.sectioningRequired === false) sectionMap.set("complete-cumulative-candidate", changedFiles);
  else for (const changedPath of changedFiles) {
      const domain = classifyPath(changedPath);
      if (!sectionMap.has(domain)) sectionMap.set(domain, []);
      sectionMap.get(domain).push(changedPath);
    }
  const sections = [...sectionMap].sort(([a], [b]) => a.localeCompare(b)).map(([domain, paths], index) => freeze({ id: `section-${index + 1}-${domain}`, domain, changedPaths: [...paths].sort() }));
  const declaredIntegrationBoundaries = normalizeFiles(input.integrationBoundaries || []);
  const integrationBoundaries = declaredIntegrationBoundaries.filter((entry) => !changedFiles.includes(entry)).map((entry) => freeze({ path: entry, reasonCode: "required_unchanged_integration_boundary" }));
  const manifest = { schemaVersion: 1, candidateIdentity: identity.value, changedFiles, changedFilesDigest: digest(changedFiles), sections, declaredIntegrationBoundaries, integrationBoundaries, requiresFinalIntegration: input.sectioningRequired !== false && sections.length > 1, manifestDigest: null };
  manifest.manifestDigest = digest({ ...manifest, manifestDigest: null });
  return freeze({ ok: true, state: "external_review_large_bundle_in_progress", manifest });
}

export function validateLargeCandidateReviewEvidence({ manifest, reviewerResults = [] } = {}) {
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.sections)) return blocked("coverage_manifest_malformed");
  const assigned = manifest.sections.flatMap((section) => Array.isArray(section.changedPaths) ? section.changedPaths : []);
  if (assigned.length !== manifest.changedFiles?.length || new Set(assigned).size !== assigned.length || digest([...assigned].sort()) !== manifest.changedFilesDigest) return blocked("coverage_paths_missing_or_duplicate");
  if (!Array.isArray(reviewerResults) || reviewerResults.length !== 2) return blocked("dual_reviewer_evidence_missing");
  const providers = new Set(reviewerResults.map((result) => result.provider));
  if (!providers.has("gemini") || !providers.has("codex-local")) return blocked("dual_reviewer_identity_invalid");
  for (const result of reviewerResults) {
    if (!sameIdentity(result.candidateIdentity, manifest.candidateIdentity) || result.manifestDigest !== manifest.manifestDigest) return blocked("review_candidate_identity_mismatch");
    if (result.truncated || result.malformed || result.overBudget || result.status === "partial") return blocked("review_evidence_incomplete");
    const sectionIds = Array.isArray(result.sections) ? result.sections.map((section) => section.id) : [];
    const requiredIds = manifest.sections.map((section) => section.id);
    if (sectionIds.length !== requiredIds.length || new Set(sectionIds).size !== sectionIds.length || digest([...sectionIds].sort()) !== digest([...requiredIds].sort())) return blocked("review_sections_missing_duplicate_or_stale");
    if (result.sections.some((section) => section.status !== "pass" || section.manifestDigest !== manifest.manifestDigest)) return blocked("review_section_not_passed");
    if (manifest.requiresFinalIntegration && (result.integration?.status !== "pass" || result.integration?.manifestDigest !== manifest.manifestDigest)) return blocked("final_integration_review_missing");
    if (result.verdict !== "pass") return blocked("reviewer_verdict_not_passed");
  }
  return freeze({ ok: true, state: "external_review_complete", verdict: "pass", findings: deduplicateFindings(reviewerResults.flatMap((result) => [...result.sections.flatMap((section) => section.findings || []), ...(result.integration?.findings || [])])) });
}

export function planLargeCandidateSplit({ classification, changedFiles = [], slices = [] } = {}) {
  if (classification?.route !== "split_or_block") return freeze({ ok: false, state: "external_review_split_required", reasonCode: "split_not_required" });
  if (classification?.explicitManual) return manualSplitBlock(classification, normalizeFiles(changedFiles), "explicit_manual_or_danger_gate");
  const files = normalizeFiles(changedFiles);
  if (!Array.isArray(slices) || slices.length < 2 || slices.length > 4) return manualSplitBlock(classification, files, "split_semantic_proof_missing");
  const assignments = slices.flatMap((slice) => (slice.changedFiles || []).map((changedPath) => [changedPath, slice.id]));
  const assignedFiles = assignments.map(([changedPath]) => changedPath).sort();
  if (new Set(assignedFiles).size !== assignedFiles.length || digest(assignedFiles) !== digest(files)) return manualSplitBlock(classification, files, "split_file_ownership_ambiguous");
  if (slices.some((slice) => !slice.id || !slice.issueNumber || !slice.taskKey || !slice.allowedPathsProven || !slice.semanticOwnDeltaProven || !slice.executionAuthorityProven || !Array.isArray(slice.dependsOn))) return manualSplitBlock(classification, files, "split_contract_or_semantic_proof_missing");
  const ids = slices.map((slice) => slice.id);
  const taskKeys = slices.map((slice) => slice.taskKey);
  if (new Set(ids).size !== ids.length || new Set(taskKeys).size !== taskKeys.length) return manualSplitBlock(classification, files, "split_identity_duplicate");
  const idSet = new Set(ids);
  if (slices.some((slice) => slice.dependsOn.some((dependency) => dependency === slice.id || !idSet.has(dependency)))) return manualSplitBlock(classification, files, "split_dependency_invalid");
  if (splitGraphHasCycle(slices)) return manualSplitBlock(classification, files, "split_dependency_cycle");
  return freeze({ ok: true, state: "external_review_split_required", execution: "deterministic_split", planDigest: digest({ files, slices }), slices: slices.map((slice) => ({ id: slice.id, issueNumber: slice.issueNumber, taskKey: slice.taskKey, changedFiles: normalizeFiles(slice.changedFiles), dependsOn: [...slice.dependsOn].sort() })) });
}

export function createLargeCandidateRoutingState(input = {}) {
  const classification = input.classification || classifyLargeCandidate(input);
  return freeze({ stateVersion: largeCandidateRoutingStateVersion, taskKey: bounded(input.taskKey), candidateIdentity: normalizeCandidateIdentity(input.candidateIdentity).value || null, routeState: classification.state, reviewerVerdict: null, coverageManifest: input.coverageManifest || null, reviewerResults: [], splitPlan: input.splitPlan || null, uncoveredScope: [], runtimeStructuredRequired: input.runtimeStructuredRequired === true, mutationMarkers: {}, countersConsumed: { logicalTasks: 0, localSourceRounds: 0, githubEpochs: 0 }, updatedAt: input.updatedAt || new Date(0).toISOString() });
}

export function largeCandidateRoutingStatePath(config, stateOrKey) {
  const key = typeof stateOrKey === "string" ? stateOrKey : digest({ taskKey: stateOrKey?.taskKey, candidateIdentity: stateOrKey?.candidateIdentity });
  return path.join(config.logsRoot, "large-candidate-review", `${key}.json`);
}

export function writeLargeCandidateRoutingState(config, state) {
  const validation = validateLargeCandidateRoutingState(state);
  if (!validation.ok) throw new Error(validation.reasonCode);
  const target = largeCandidateRoutingStatePath(config, state);
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const next = { ...state, updatedAt: new Date().toISOString() };
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, target);
  return freeze(next);
}

export function loadLargeCandidateRoutingState(config, stateOrKey) {
  const target = largeCandidateRoutingStatePath(config, stateOrKey);
  if (!existsSync(target)) return { ok: false, reasonCode: "large_candidate_routing_state_missing", statePath: target };
  try {
    const state = migrateLargeCandidateRoutingState(JSON.parse(readFileSync(target, "utf8")));
    const validation = validateLargeCandidateRoutingState(state);
    return validation.ok ? { ok: true, state, statePath: target } : { ...validation, statePath: target };
  } catch {
    return { ok: false, reasonCode: "large_candidate_routing_state_corrupt", statePath: target };
  }
}

export async function runStructuredLargeCandidateReview({ state, manifest, reviewers, invokeSection, invokeIntegration, onCheckpoint = null }) {
  let current = invalidateLargeCandidateEvidence(state, manifest?.candidateIdentity);
  current = { ...current, routeState: "external_review_large_bundle_in_progress", coverageManifest: manifest, reviewerResults: Array.isArray(current.reviewerResults) ? current.reviewerResults : [] };
  for (const provider of reviewers || ["gemini", "codex-local"]) {
    let result = current.reviewerResults.find((entry) => entry.provider === provider && entry.manifestDigest === manifest.manifestDigest);
    if (!result) result = { provider, candidateIdentity: manifest.candidateIdentity, manifestDigest: manifest.manifestDigest, verdict: "not_run", sections: [], integration: null };
    for (const section of manifest.sections) {
      if (result.sections.some((entry) => entry.id === section.id && entry.status === "pass" && entry.manifestDigest === manifest.manifestDigest && (!current.runtimeStructuredRequired || validPromptBinding(entry)))) continue;
      const sectionResult = await invokeSection({ provider, section, manifest });
      if (current.runtimeStructuredRequired && !validPromptBinding(sectionResult)) return freeze({ ok: false, state: current, reasonCode: "review_section_prompt_binding_missing" });
      result = { ...result, sections: [...result.sections.filter((entry) => entry.id !== section.id), sectionResult] };
      current = { ...current, reviewerResults: [...current.reviewerResults.filter((entry) => entry.provider !== provider), result] };
      if (onCheckpoint) current = await onCheckpoint(current, { provider, phase: "section", sectionId: section.id }) || current;
      if (sectionResult.status !== "pass") {
        if (sectionResult.contextLimited) {
          const remaining = manifest.sections.slice(manifest.sections.findIndex((entry) => entry.id === section.id));
          const blockedState = blockLargeCandidateForContextLimit({ state: current, uncoveredPaths: remaining.flatMap((entry) => entry.changedPaths), uncoveredSections: remaining.map((entry) => entry.id), provider, evidenceCode: sectionResult.reasonCode || "provider_context_limit", deterministicSplitPossible: false });
          return freeze({ ok: false, state: onCheckpoint ? await onCheckpoint(blockedState, { provider, phase: "context_limit", sectionId: section.id }) : blockedState, reasonCode: "provider_context_limit" });
        }
        return freeze({ ok: false, state: current, reasonCode: "review_section_not_passed" });
      }
    }
    if (manifest.requiresFinalIntegration && (result.integration?.manifestDigest !== manifest.manifestDigest || (current.runtimeStructuredRequired && !validPromptBinding(result.integration)))) {
      result = { ...result, integration: await invokeIntegration({ provider, manifest, sections: result.sections }) };
      if (current.runtimeStructuredRequired && !validPromptBinding(result.integration)) return freeze({ ok: false, state: current, reasonCode: "review_integration_prompt_binding_missing" });
      current = { ...current, reviewerResults: [...current.reviewerResults.filter((entry) => entry.provider !== provider), result] };
      if (onCheckpoint) current = await onCheckpoint(current, { provider, phase: "integration" }) || current;
    }
    result = { ...result, verdict: result.sections.every((entry) => entry.status === "pass") && (!manifest.requiresFinalIntegration || result.integration?.status === "pass") ? "pass" : "blocked" };
    current = { ...current, reviewerResults: [...current.reviewerResults.filter((entry) => entry.provider !== provider), result] };
  }
  const completed = validateLargeCandidateReviewEvidence({ manifest, reviewerResults: current.reviewerResults });
  return freeze({ ...completed, state: { ...current, routeState: completed.state, reviewerVerdict: completed.ok ? "pass" : null } });
}

export async function persistCumulativeLargeCandidateReview({ config, taskKey, candidateIdentity, changedFiles, integrationBoundaries = [], externalReview, codexReview, invokeSection = null, invokeIntegration = null } = {}) {
  const built = buildLargeCandidateCoverageManifest({ candidateIdentity, changedFiles, integrationBoundaries });
  if (!built.ok) return built;
  const seed = createLargeCandidateRoutingState({ taskKey, candidateIdentity, changedFiles, classification: { state: "external_review_large_bundle_in_progress" }, coverageManifest: built.manifest, runtimeStructuredRequired: true });
  const loaded = loadLargeCandidateRoutingState(config, seed);
  const state = loaded.ok ? invalidateLargeCandidateEvidence(loaded.state, candidateIdentity) : seed;
  const evidence = { gemini: externalReview, "codex-local": codexReview };
  const limitedProvider = ["gemini", "codex-local"].find((provider) => providerContextLimited(evidence[provider]));
  if (limitedProvider) {
    const blockedState = blockLargeCandidateForContextLimit({ state: { ...state, coverageManifest: built.manifest }, uncoveredPaths: built.manifest.changedFiles, uncoveredSections: built.manifest.sections.map((section) => section.id), provider: limitedProvider, deterministicSplitPossible: false });
    const persisted = writeLargeCandidateRoutingState(config, blockedState);
    return freeze({ ok: false, state: persisted, statePath: largeCandidateRoutingStatePath(config, persisted), reasonCode: "provider_context_limit" });
  }
  const reviewed = await runStructuredLargeCandidateReview({
    state,
    manifest: built.manifest,
    reviewers: ["gemini", "codex-local"],
    invokeSection: invokeSection || (async ({ provider, section, manifest }) => cumulativeSectionEvidence(evidence[provider], provider, section, manifest)),
    invokeIntegration: invokeIntegration || (async ({ provider, manifest }) => cumulativeIntegrationEvidence(evidence[provider], provider, manifest)),
    onCheckpoint: async (checkpoint) => writeLargeCandidateRoutingState(config, checkpoint),
  });
  const persisted = writeLargeCandidateRoutingState(config, reviewed.state || state);
  return freeze({ ...reviewed, state: persisted, statePath: largeCandidateRoutingStatePath(config, persisted) });
}

export function structuredLargeCandidateFindings(reviewResult, provider) {
  const reviewerResults = reviewResult?.state?.reviewerResults || [];
  const result = reviewerResults.find((entry) => entry.provider === provider);
  if (!result) return [];
  return deduplicateFindings([
    ...(result.sections || []).flatMap((section) => section.findings || []),
    ...(result.integration?.findings || []),
  ]);
}

export function persistLargeCandidateSplitDecision({ config, taskKey, candidateIdentity, classification, changedFiles, slices = [] } = {}) {
  const seed = createLargeCandidateRoutingState({ taskKey, candidateIdentity, changedFiles, classification });
  const splitPlan = planLargeCandidateSplit({ classification, changedFiles, slices });
  const persisted = writeLargeCandidateRoutingState(config, { ...seed, routeState: "external_review_split_required", splitPlan, reviewerVerdict: null });
  return freeze({ ...splitPlan, state: persisted, statePath: largeCandidateRoutingStatePath(config, persisted) });
}

function cumulativeSectionEvidence(evidence, provider, section, manifest) {
  const bound = cumulativeEvidenceBound(evidence, manifest.candidateIdentity, manifest);
  const pass = cumulativeEvidencePasses(evidence, provider, manifest.candidateIdentity, manifest);
  return { id: section.id, status: pass ? "pass" : "blocked", manifestDigest: manifest.manifestDigest, findings: bound ? cumulativeFindings(evidence) : [], attestationSource: evidence?.attestationSource, providerPromptBindingDigest: evidence?.providerPromptBindingDigest };
}

function cumulativeIntegrationEvidence(evidence, provider, manifest) {
  const bound = cumulativeEvidenceBound(evidence, manifest.candidateIdentity, manifest);
  const pass = cumulativeEvidencePasses(evidence, provider, manifest.candidateIdentity, manifest);
  return { status: pass ? "pass" : "blocked", manifestDigest: manifest.manifestDigest, findings: bound ? cumulativeFindings(evidence) : [], attestationSource: evidence?.attestationSource, providerPromptBindingDigest: evidence?.providerPromptBindingDigest };
}

function cumulativeEvidencePasses(evidence, provider, identity, manifest) {
  const verdictPass = provider === "gemini" ? evidence?.status === "pass" && evidence?.verdict === "pass" : evidence?.verdict?.verdict === "approve";
  return verdictPass && cumulativeEvidenceBound(evidence, identity, manifest);
}

function cumulativeEvidenceBound(evidence, identity, manifest) {
  return sameCandidateIdentity(evidence?.attestedCandidateIdentity, identity)
    && evidence?.attestationSource === "provider_prompt_binding" && hash(evidence?.providerPromptBindingDigest)
    && digest(normalizeFiles(evidence?.attestedIntegrationBoundaries)) === digest(normalizeFiles(manifest?.declaredIntegrationBoundaries));
}

function cumulativeFindings(evidence) {
  return [
    ...(evidence?.sanitizedResponseSummary?.findings || []),
    ...(evidence?.verdict?.blocking_findings || []),
    ...(evidence?.verdict?.non_blocking_findings || []),
    ...(evidence?.findings || []),
  ];
}
function validPromptBinding(evidence) { return evidence?.attestationSource === "provider_prompt_binding" && Boolean(hash(evidence?.providerPromptBindingDigest)); }
function providerContextLimited(evidence) { return /context|token|truncat|over.?budget/i.test(`${evidence?.reason || ""} ${evidence?.reviewFailureReason || ""}`); }

export function migrateLargeCandidateRoutingState(input = {}) {
  const routeState = historicalStates.get(input.routeState || input.status) || input.routeState || input.status;
  const initial = createLargeCandidateRoutingState({ ...input, classification: { state: largeCandidateRoutingStates.includes(routeState) ? routeState : "external_review_coverage_incomplete" }, coverageManifest: input.coverageManifest, splitPlan: input.splitPlan, updatedAt: input.updatedAt });
  return freeze({ ...initial, reviewerVerdict: input.reviewerVerdict ?? initial.reviewerVerdict, reviewerResults: Array.isArray(input.reviewerResults) ? input.reviewerResults : initial.reviewerResults, uncoveredScope: input.uncoveredScope ?? initial.uncoveredScope, runtimeStructuredRequired: input.runtimeStructuredRequired === true, mutationMarkers: input.mutationMarkers && typeof input.mutationMarkers === "object" ? input.mutationMarkers : initial.mutationMarkers, countersConsumed: input.countersConsumed && typeof input.countersConsumed === "object" ? input.countersConsumed : initial.countersConsumed });
}

export function certifyCompleteCumulativeLargeReview({ candidateIdentity, changedFiles, integrationBoundaries = [], externalReview, codexReview } = {}) {
  const built = buildLargeCandidateCoverageManifest({ candidateIdentity, changedFiles, integrationBoundaries, sectioningRequired: false });
  if (!built.ok) return built;
  const manifest = built.manifest;
  if (!sameCandidateIdentity(externalReview?.attestedCandidateIdentity, manifest.candidateIdentity)
    || !sameCandidateIdentity(codexReview?.attestedCandidateIdentity, manifest.candidateIdentity)) return blocked("reviewer_candidate_attestation_missing_or_mismatched");
  const expectedBoundaries = digest(normalizeFiles(integrationBoundaries));
  if (digest(normalizeFiles(externalReview?.attestedIntegrationBoundaries)) !== expectedBoundaries
    || digest(normalizeFiles(codexReview?.attestedIntegrationBoundaries)) !== expectedBoundaries) return blocked("integration_boundary_attestation_missing");
  const section = manifest.sections[0];
  const externalPass = externalReview?.status === "pass" && (!externalReview.verdict || externalReview.verdict === "pass");
  const codexPass = codexReview?.verdict?.verdict === "approve" || codexReview?.verdict === "pass";
  const results = [
    { provider: "gemini", candidateIdentity: manifest.candidateIdentity, manifestDigest: manifest.manifestDigest, verdict: externalPass ? "pass" : "blocked", sections: [{ id: section.id, status: externalPass ? "pass" : "blocked", manifestDigest: manifest.manifestDigest, findings: externalReview?.findings || [] }], integration: null },
    { provider: "codex-local", candidateIdentity: manifest.candidateIdentity, manifestDigest: manifest.manifestDigest, verdict: codexPass ? "pass" : "blocked", sections: [{ id: section.id, status: codexPass ? "pass" : "blocked", manifestDigest: manifest.manifestDigest, findings: codexReview?.verdict?.findings || codexReview?.findings || [] }], integration: null },
  ];
  return { ...validateLargeCandidateReviewEvidence({ manifest, reviewerResults: results }), manifest, reviewerResults: results };
}

function sameCandidateIdentity(actual, expected) {
  const normalized = normalizeCandidateIdentity(actual);
  return normalized.ok && sameIdentity(normalized.value, expected);
}

export function validateLargeCandidateRoutingState(state = {}) {
  if (state.stateVersion !== largeCandidateRoutingStateVersion) return { ok: false, reasonCode: "routing_state_version_unsupported" };
  if (!largeCandidateRoutingStates.includes(state.routeState)) return { ok: false, reasonCode: "routing_state_invalid" };
  if (state.reviewerVerdict === "pass" && !passingStates.has(state.routeState)) return { ok: false, reasonCode: "routing_state_cannot_count_as_pass" };
  return { ok: true };
}

export function invalidateLargeCandidateEvidence(state, candidateIdentity) {
  if (sameIdentity(state?.candidateIdentity, normalizeCandidateIdentity(candidateIdentity).value)) return state;
  return freeze({ ...state, candidateIdentity: normalizeCandidateIdentity(candidateIdentity).value || null, routeState: "external_review_coverage_incomplete", reviewerVerdict: null, coverageManifest: null, reviewerResults: [], uncoveredScope: [], mutationMarkers: {} });
}

export function blockLargeCandidateForContextLimit({ state, uncoveredPaths = [], uncoveredSections = [], provider = null, evidenceCode = "provider_context_limit", deterministicSplitPossible = false } = {}) {
  return freeze({ ...state, routeState: "external_review_context_limit_blocked", reviewerVerdict: null, uncoveredScope: { paths: normalizeFiles(uncoveredPaths), sections: [...new Set(uncoveredSections)].sort(), provider: bounded(provider), evidenceCode: bounded(evidenceCode), deterministicSplitPossible: Boolean(deterministicSplitPossible), nextAction: deterministicSplitPossible ? "execute_deterministic_split_plan" : "resume_fresh_session_or_request_minimum_scope_decision" } });
}

export function largeCandidateStateIsReviewPass(state) { return Boolean(state?.reviewerVerdict === "pass" && passingStates.has(state.routeState)); }

function blocked(reasonCode) { return freeze({ ok: false, state: "external_review_coverage_incomplete", verdict: "blocked", reasonCode }); }
function manualSplitBlock(classification, files, reasonCode) { return freeze({ ok: false, state: "external_review_split_required", execution: "manual_scope_decision_required", reasonCode, conflictingDomains: classification?.domains || [], conflictingFiles: files, minimumDecision: "Provide exact issue/task ownership and semantics-preserving file/dependency boundaries." }); }
function incompatibleDomainPairs(domains) { const pairs = [["auth-security", "money-settlement"], ["storage-privacy", "deployment-ci"], ["schema-migration", "product-ui"], ["openapi-generated", "product-ui"], ["deployment-ci", "product-ui"]]; return pairs.filter(([a, b]) => domains.includes(a) && domains.includes(b)).map(([a, b]) => `${a}+${b}`); }
function splitGraphHasCycle(slices) { const graph = new Map(slices.map((slice) => [slice.id, slice.dependsOn])); const visiting = new Set(); const visited = new Set(); const visit = (id) => { if (visiting.has(id)) return true; if (visited.has(id)) return false; visiting.add(id); if ((graph.get(id) || []).some(visit)) return true; visiting.delete(id); visited.add(id); return false; }; return slices.some((slice) => visit(slice.id)); }
function classifyPath(changedPath) { for (const [domain, pattern] of domainRules) if (pattern.test(changedPath)) return domain; return "product-runtime"; }
function normalizeFiles(files) { return [...new Set((Array.isArray(files) ? files : []).filter((entry) => typeof entry === "string" && entry && !entry.startsWith("/") && !entry.includes("..") && entry.length <= 400).map((entry) => entry.replaceAll("\\", "/")))].sort(); }
function normalizeCandidateIdentity(identity = {}) { const value = { repository: bounded(identity.repository), baseSha: sha(identity.baseSha), headSha: sha(identity.headSha), treeSha: sha(identity.treeSha), diffDigest: hash(identity.diffDigest), changedFilesDigest: hash(identity.changedFilesDigest) }; return Object.values(value).every(Boolean) ? { ok: true, value } : { ok: false, reasonCode: "candidate_identity_incomplete", value: null }; }
function sameIdentity(a, b) { return Boolean(a && b && digest(a) === digest(b)); }
function deduplicateFindings(findings) { const byFingerprint = new Map(); for (const finding of findings) { const sanitized = { severity: bounded(finding?.severity), path: bounded(finding?.path), summary: bounded(finding?.summary, 500), fingerprint: hash(finding?.fingerprint) || digest({ severity: finding?.severity, path: finding?.path, summary: finding?.summary }) }; if (sanitized.summary) byFingerprint.set(sanitized.fingerprint, sanitized); } return [...byFingerprint.values()].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint)); }
function digest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function hash(value) { return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null; }
function sha(value) { return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : null; }
function bounded(value, max = 240) { return typeof value === "string" ? value.slice(0, max) : null; }
function boundedNumbers(values) { return Array.isArray(values) ? [...new Set(values.filter(Number.isSafeInteger))].slice(0, 20).sort((a, b) => a - b) : []; }
function finiteCount(value) { return Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0; }
function freeze(value) { if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }
