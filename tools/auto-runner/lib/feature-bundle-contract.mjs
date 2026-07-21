import { createHash } from "node:crypto";
import { classifyIssueLane, getValidationProfile, laneManifest, parseAutoRunnerContract } from "./lane-policy.mjs";

const bundleFields = new Set(["bundleVersion", "strategy", "slices"]);
const sliceFields = new Set(["id", "title", "objective", "allowedPaths", "validationProfile", "requiredReading", "dependsOn", "allowedPathsProven", "semanticOwnDeltaProven", "executionAuthorityProven"]);
const supportedBundleLanes = new Set(["workflow-docs-tooling", "docs-planning", "client-ui-low-risk"]);
const maxTextLength = 500;
const maxReadingLength = 240;
const maxAllowedPathLength = 240;
const maxSlices = 4;
const minSlices = 2;
const stableIdPattern = /^[a-z][a-z0-9-]{1,31}$/;
const unsafeExecutableTextPattern =
  /[`$]|&&|\|\||;|>|<|\b(?:bash|sh|pwsh|powershell|cmd|node|npm|npx|curl|wget|git|docker|kubectl|ssh|scp|rm|sudo|chmod|chown)\b/i;

export function planFeatureBundleIssue(issue) {
  const labels = new Set(issue.labels || []);
  if (!labels.has("auto-bundle")) {
    return rejected("missing_auto_bundle_label", "Feature-bundle execution requires the auto-bundle label.");
  }

  const parsed = parseAutoRunnerContract(issue.body || "");
  if (!parsed.ok) {
    return rejected("invalid_parent_contract", parsed.reason, { parentContract: parsed });
  }

  const laneDecision = classifyIssueLane(issue);
  if (!laneDecision.allowedToImplement) {
    return rejected("parent_contract_not_runnable", laneDecision.reason, { laneDecision });
  }
  const laneId = laneDecision.canonicalLane || laneDecision.lane;
  if (!supportedBundleLanes.has(laneId)) {
    return rejected("bundle_lane_not_supported", `Lane ${laneId} is not eligible for feature-bundle execution.`, {
      laneDecision,
    });
  }
  if (
    laneDecision.manualGate ||
    laneDecision.manualActionRequired ||
    laneDecision.dangerGate ||
    laneDecision.splitRequired ||
    laneDecision.branchStrategy !== "normal"
  ) {
    return rejected("bundle_lane_requires_separate_branch", "Feature bundles require a runnable normal non-manual lane.", {
      laneDecision,
    });
  }

  const contract = parsed.contract;
  const bundle = contract.bundle;
  const shape = validateBundleShape(bundle);
  if (!shape.ok) return rejected(shape.reasonCode, shape.reason, { laneDecision, parentContract: contract });

  const parentManifest = laneManifest[laneId];
  const slicePlans = [];
  const ids = new Set();
  for (const [index, slice] of bundle.slices.entries()) {
    const sliceValidation = validateSlice(slice, {
      index,
      ids,
      contract,
      parentManifest,
      laneDecision,
    });
    if (!sliceValidation.ok) {
      return rejected(sliceValidation.reasonCode, sliceValidation.reason, {
        laneDecision,
        parentContract: contract,
        sliceIndex: index,
      });
    }
    ids.add(slice.id);
    slicePlans.push({
      sequence: index + 1,
      id: slice.id,
      title: slice.title.trim(),
      objective: slice.objective.trim(),
      allowedPaths: [...slice.allowedPaths],
      validationProfile: slice.validationProfile,
      requiredReading: [...(slice.requiredReading || [])],
      dependsOn: [...(slice.dependsOn || [])],
      allowedPathsProven: slice.allowedPathsProven === true,
      semanticOwnDeltaProven: slice.semanticOwnDeltaProven === true,
      executionAuthorityProven: slice.executionAuthorityProven === true,
      state: "pending",
    });
  }

  for (const slice of slicePlans) {
    const dependencies = slice.dependsOn || [];
    const invalid = dependencies.find((id) => !ids.has(id));
    if (invalid) return rejected("bundle_slice_dependency_unknown", `Slice ${slice.id} depends on unknown slice ${invalid}.`);
    const forward = dependencies.find((id) => slicePlans.find((candidate) => candidate.id === id)?.sequence >= slice.sequence);
    if (forward) {
      return rejected("bundle_slice_dependency_not_prior", `Slice ${slice.id} depends on non-prior slice ${forward}.`);
    }
  }

  const normalizedPlan = {
    contractVersion: contract.contractVersion,
    bundleVersion: bundle.bundleVersion,
    strategy: bundle.strategy,
    issue: {
      number: issue.number,
      title: issue.title,
      url: issue.url || null,
    },
    lane: laneDecision.lane,
    canonicalLane: laneId,
    allowedPaths: [...contract.allowedPaths],
    validationProfile: contract.validationProfile,
    manualMergeRequired: Boolean(contract.manualMergeRequired),
    autoMergeEligible: Boolean(contract.autoMergeEligible && laneDecision.autoMergeEligible),
    requiredReading: [...contract.requiredReading],
    slices: slicePlans,
  };
  const planDigest = digestPlan(normalizedPlan);
  return {
    ok: true,
    reasonCode: "bundle_contract_valid",
    contract,
    laneDecision: {
      ...laneDecision,
      reviewerTier: "strong_independent",
      reasonCodes: [...(laneDecision.reasonCodes || []), "feature_bundle_strong_review_required"],
    },
    plan: {
      ...normalizedPlan,
      id: `issue-${issue.number}-bundle-v${bundle.bundleVersion}`,
      sliceCount: slicePlans.length,
      planDigest,
    },
  };
}

export function digestPlan(plan) {
  return createHash("sha256").update(JSON.stringify(canonicalize(plan))).digest("hex");
}

function validateBundleShape(bundle) {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    return { ok: false, reasonCode: "bundle_contract_missing", reason: "Feature-bundle contract requires a bundle object." };
  }
  for (const key of Object.keys(bundle)) {
    if (!bundleFields.has(key)) {
      return { ok: false, reasonCode: "bundle_contract_unknown_field", reason: `Bundle contains unsupported field: ${key}.` };
    }
  }
  if (bundle.bundleVersion !== 1) {
    return { ok: false, reasonCode: "bundle_version_unsupported", reason: `Unsupported bundle version: ${bundle.bundleVersion}.` };
  }
  if (bundle.strategy !== "feature-bundle") {
    return { ok: false, reasonCode: "bundle_strategy_unsupported", reason: `Unsupported bundle strategy: ${bundle.strategy}.` };
  }
  if (!Array.isArray(bundle.slices)) {
    return { ok: false, reasonCode: "bundle_slices_invalid", reason: "Bundle slices must be an array." };
  }
  if (bundle.slices.length < minSlices || bundle.slices.length > maxSlices) {
    return {
      ok: false,
      reasonCode: "bundle_slice_count_out_of_range",
      reason: "Feature bundles require exactly two to four ordered slices.",
    };
  }
  return { ok: true };
}

function validateSlice(slice, { index, ids, contract, parentManifest }) {
  if (!slice || typeof slice !== "object" || Array.isArray(slice)) {
    return { ok: false, reasonCode: "bundle_slice_invalid", reason: `Slice ${index + 1} must be an object.` };
  }
  for (const key of Object.keys(slice)) {
    if (!sliceFields.has(key)) {
      return { ok: false, reasonCode: "bundle_slice_unknown_field", reason: `Slice contains unsupported field: ${key}.` };
    }
  }
  for (const field of ["id", "title", "objective", "allowedPaths", "validationProfile", "requiredReading"]) {
    if (!(field in slice)) {
      return { ok: false, reasonCode: "bundle_slice_missing_field", reason: `Slice is missing required field: ${field}.` };
    }
  }
  if (typeof slice.id !== "string" || !stableIdPattern.test(slice.id)) {
    return { ok: false, reasonCode: "bundle_slice_id_invalid", reason: `Slice id is not a bounded stable id: ${slice.id}.` };
  }
  if (ids.has(slice.id)) {
    return { ok: false, reasonCode: "bundle_slice_id_duplicate", reason: `Duplicate bundle slice id: ${slice.id}.` };
  }
  for (const field of ["title", "objective"]) {
    if (typeof slice[field] !== "string" || slice[field].trim().length === 0 || slice[field].length > maxTextLength) {
      return { ok: false, reasonCode: "bundle_slice_text_invalid", reason: `Slice ${field} must be non-empty and bounded.` };
    }
    if (unsafeExecutableTextPattern.test(slice[field])) {
      return { ok: false, reasonCode: "bundle_slice_executable_text", reason: `Slice ${field} contains executable-looking text.` };
    }
  }
  if (!Array.isArray(slice.allowedPaths) || slice.allowedPaths.length === 0) {
    return { ok: false, reasonCode: "bundle_slice_paths_invalid", reason: "Slice allowedPaths must be non-empty." };
  }
  for (const glob of slice.allowedPaths) {
    if (!isSafeRepoRelativePath(glob, { allowGlob: true, maxLength: maxAllowedPathLength })) {
      return { ok: false, reasonCode: "bundle_slice_path_unsafe", reason: `Unsafe slice allowed path: ${glob}.` };
    }
    if (!contract.allowedPaths.some((parentGlob) => globIsSubsetOf(glob, parentGlob))) {
      return { ok: false, reasonCode: "bundle_slice_path_outside_parent", reason: `Slice path escapes parent contract: ${glob}.` };
    }
    if (!parentManifest.allowedPaths.some((laneGlob) => globIsSubsetOf(glob, laneGlob))) {
      return { ok: false, reasonCode: "bundle_slice_path_outside_lane", reason: `Slice path escapes lane manifest: ${glob}.` };
    }
  }
  if (!getValidationProfile(slice.validationProfile)) {
    return {
      ok: false,
      reasonCode: "bundle_slice_validation_profile_unknown",
      reason: `Unsupported slice validation profile: ${slice.validationProfile}.`,
    };
  }
  if (!parentManifest.supportedValidationProfiles.includes(slice.validationProfile)) {
    return {
      ok: false,
      reasonCode: "bundle_slice_validation_profile_not_allowed",
      reason: `Slice validation profile is not supported by the parent lane: ${slice.validationProfile}.`,
    };
  }
  if (!Array.isArray(slice.requiredReading)) {
    return { ok: false, reasonCode: "bundle_slice_required_reading_invalid", reason: "Slice requiredReading must be an array." };
  }
  for (const reading of slice.requiredReading) {
    if (!isSafeRepoRelativePath(reading, { allowGlob: false, maxLength: maxReadingLength })) {
      return { ok: false, reasonCode: "bundle_slice_required_reading_unsafe", reason: `Unsafe slice required-reading path: ${reading}.` };
    }
    if (unsafeExecutableTextPattern.test(reading)) {
      return { ok: false, reasonCode: "bundle_slice_executable_text", reason: `Slice required-reading path is executable-looking: ${reading}.` };
    }
  }
  if (slice.dependsOn !== undefined) {
    if (!Array.isArray(slice.dependsOn) || !slice.dependsOn.every((id) => typeof id === "string" && stableIdPattern.test(id))) {
      return { ok: false, reasonCode: "bundle_slice_dependency_invalid", reason: "Slice dependsOn must contain bounded stable ids." };
    }
  }
  for (const field of ["allowedPathsProven", "semanticOwnDeltaProven", "executionAuthorityProven"]) {
    if (slice[field] !== undefined && typeof slice[field] !== "boolean") {
      return { ok: false, reasonCode: "bundle_slice_split_proof_invalid", reason: `Slice ${field} must be boolean when provided.` };
    }
  }
  return { ok: true };
}

function rejected(reasonCode, reason, extra = {}) {
  return { ok: false, reasonCode, reason, ...extra };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function globIsSubsetOf(childGlob, parentGlob) {
  if (!isSafeRepoRelativePath(childGlob, { allowGlob: true, maxLength: maxAllowedPathLength })) return false;
  if (!isSafeRepoRelativePath(parentGlob, { allowGlob: true, maxLength: maxAllowedPathLength })) return false;
  if (childGlob === parentGlob) return true;
  if (!childGlob.includes("*")) return globMatchesPath(parentGlob, childGlob);
  if (parentGlob.endsWith("/**")) {
    const parentBase = parentGlob.slice(0, -3);
    return childGlob === parentBase || childGlob.startsWith(`${parentBase}/`);
  }
  return false;
}

function globMatchesPath(glob, filePath) {
  return matchSegments(splitPath(glob), splitPath(filePath));
}

function splitPath(value) {
  return String(value || "").replace(/^\.\//, "").split("/");
}

function matchSegments(patternSegments, pathSegments) {
  let patternIndex = 0;
  let pathIndex = 0;
  let lastGlobstarIndex = -1;
  let lastGlobstarPathIndex = -1;
  while (pathIndex < pathSegments.length) {
    const patternSegment = patternSegments[patternIndex];
    if (patternSegment === "**") {
      lastGlobstarIndex = patternIndex;
      lastGlobstarPathIndex = pathIndex;
      patternIndex += 1;
      continue;
    }
    if (patternSegment !== undefined && segmentMatches(patternSegment, pathSegments[pathIndex])) {
      patternIndex += 1;
      pathIndex += 1;
      continue;
    }
    if (lastGlobstarIndex >= 0) {
      patternIndex = lastGlobstarIndex + 1;
      lastGlobstarPathIndex += 1;
      pathIndex = lastGlobstarPathIndex;
      continue;
    }
    return false;
  }
  while (patternSegments[patternIndex] === "**") patternIndex += 1;
  return patternIndex === patternSegments.length;
}

function segmentMatches(pattern, value) {
  if (pattern.includes("/") || value.includes("/")) return false;
  if (pattern === "*") return true;
  if (!pattern.includes("*")) return pattern === value;

  let patternIndex = 0;
  let valueIndex = 0;
  let starIndex = -1;
  let starValueIndex = 0;

  while (valueIndex < value.length) {
    if (pattern[patternIndex] === value[valueIndex]) {
      patternIndex += 1;
      valueIndex += 1;
      continue;
    }
    if (pattern[patternIndex] === "*") {
      starIndex = patternIndex;
      starValueIndex = valueIndex;
      patternIndex += 1;
      continue;
    }
    if (starIndex !== -1) {
      patternIndex = starIndex + 1;
      starValueIndex += 1;
      valueIndex = starValueIndex;
      continue;
    }
    return false;
  }

  while (pattern[patternIndex] === "*") patternIndex += 1;
  return patternIndex === pattern.length;
}

function isSafeRepoRelativePath(value, { allowGlob, maxLength }) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) return false;
  if (value.startsWith("/") || value.startsWith("./") || value.includes("\\") || value.includes("\0")) return false;
  if (/[\u0000-\u001f\u007f]/u.test(value)) return false;
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) return false;
  if (!allowGlob && value.includes("*")) return false;
  return allowGlob ? segments.every((segment) => segment === "**" || !segment.includes("**")) : true;
}
