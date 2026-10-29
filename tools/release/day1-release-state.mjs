import { SCHEMA as R03_SCHEMA, canonicalJson, containsSensitiveMaterial } from './day1-release-identity.mjs';

export const SCHEMA = 'settleora.day1-release-state.v1';
export const STATES = Object.freeze(['DEVELOPMENT', 'ELIGIBLE_FOR_RC', 'RC_CUT', 'QUALIFYING',
  'READY_FOR_SIGNED_BUILD', 'RC_BUILT', 'UAT_DEPLOYED', 'UAT_REJECTED', 'UAT_APPROVED',
  'READY_FOR_PROD_APPROVAL', 'PROD_APPROVED', 'PROMOTING', 'RELEASED', 'SUPERSEDED', 'BLOCKED']);
export const EVIDENCE_KINDS = Object.freeze(['source_acceptance', 'qualification', 'r03_identity',
  'uat', 'human_production_approval', 'provider_reconciliation']);
const ARTIFACTS = ['api-image', 'user-web', 'android-apk', 'android-aab', 'ios-build'];
const SHA40 = /^[a-f0-9]{40}$/u;
const HEX64 = /^[a-f0-9]{64}$/u;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const TAG = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-rc\.[1-9]\d*$/u;
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const GRAPH = Object.freeze({
  DEVELOPMENT: ['ELIGIBLE_FOR_RC'], ELIGIBLE_FOR_RC: ['RC_CUT'], RC_CUT: ['QUALIFYING'],
  QUALIFYING: ['READY_FOR_SIGNED_BUILD'], READY_FOR_SIGNED_BUILD: ['RC_BUILT'],
  RC_BUILT: ['UAT_DEPLOYED'], UAT_DEPLOYED: ['UAT_APPROVED', 'UAT_REJECTED'],
  UAT_REJECTED: ['SUPERSEDED'], UAT_APPROVED: ['READY_FOR_PROD_APPROVAL'],
  READY_FOR_PROD_APPROVAL: ['PROD_APPROVED'], PROD_APPROVED: ['PROMOTING'],
  PROMOTING: ['RELEASED'], RELEASED: [], SUPERSEDED: [], BLOCKED: [],
});

export class ReleaseStateError extends Error {
  constructor(code) { super(code); this.name = 'ReleaseStateError'; this.code = code; }
}
const fail = (code) => { throw new ReleaseStateError(code); };
function object(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('object_required');
  if (required.some((key) => !Object.hasOwn(value, key))
    || Object.keys(value).some((key) => ![...required, ...optional].includes(key))) fail('unexpected_or_missing_field');
}
function source(value) {
  object(value, ['commit', 'tree']);
  if (typeof value.commit !== 'string' || !SHA40.test(value.commit)
    || typeof value.tree !== 'string' || !SHA40.test(value.tree)) fail('invalid_source');
}
function artifacts(value) {
  object(value, [], ARTIFACTS);
  for (const [kind, identity] of Object.entries(value)) {
    if (typeof identity !== 'string' || (kind === 'ios-build'
      ? !/^provider-build:[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(identity)
      : !/^sha256:[a-f0-9]{64}$/u.test(identity))) fail('invalid_artifact_identity');
  }
}

/** Structural consistency only. Neither a state name nor an evidence record grants authority. */
export function validateReleaseState(input) {
  object(input, ['schema', 'revision', 'state', 'source', 'rc', 'artifacts', 'evidence']);
  if (input.schema !== SCHEMA) fail('unsupported_schema');
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) fail('invalid_revision');
  if (!STATES.includes(input.state)) fail('invalid_state');
  source(input.source);
  if (input.rc !== null) {
    object(input.rc, ['version', 'ordinal', 'tag']);
    if (typeof input.rc.version !== 'string' || input.rc.version.length > 48 || !VERSION.test(input.rc.version)
      || !Number.isSafeInteger(input.rc.ordinal) || input.rc.ordinal < 1
      || input.rc.tag !== `v${input.rc.version}-rc.${input.rc.ordinal}`) fail('invalid_rc_identity');
  }
  artifacts(input.artifacts);
  if (!Array.isArray(input.evidence) || input.evidence.length > EVIDENCE_KINDS.length) fail('invalid_evidence_inventory');
  const seen = new Set();
  for (const record of input.evidence) {
    object(record, ['kind', 'source', 'rcTag', 'artifacts', 'reference'], ['identity']);
    if (!EVIDENCE_KINDS.includes(record.kind) || seen.has(record.kind)) fail('ambiguous_evidence_kind');
    seen.add(record.kind); source(record.source); artifacts(record.artifacts);
    if (record.rcTag !== null && (typeof record.rcTag !== 'string' || record.rcTag.length > 80 || !TAG.test(record.rcTag))) fail('invalid_evidence_rc');
    if (typeof record.reference !== 'string' || !LABEL.test(record.reference)) fail('invalid_evidence_reference');
    if (record.kind === 'r03_identity') {
      object(record.identity, ['schema', 'identityDigest']);
      if (record.identity.schema !== R03_SCHEMA || typeof record.identity.identityDigest !== 'string'
        || !HEX64.test(record.identity.identityDigest)) fail('invalid_r03_reference');
    } else if (Object.hasOwn(record, 'identity')) fail('unexpected_r03_reference');
  }
  // Reuse the existing R03 policy; do not add another secret classifier or identity algorithm.
  if (containsSensitiveMaterial(canonicalJson(input))) fail('sensitive_material_rejected');
  return JSON.parse(canonicalJson(input));
}

/** Inspect caller declarations without contacting providers, trusting approvals, or writing state. */
export function inspectReleaseState(input) {
  const state = validateReleaseState(input);
  const blockers = new Set(['offline_evidence_not_authenticated']);
  const rcStages = new Set(STATES.filter((name) => !['DEVELOPMENT', 'ELIGIBLE_FOR_RC', 'BLOCKED', 'SUPERSEDED'].includes(name)));
  if (rcStages.has(state.state) && !state.rc) blockers.add('rc_identity_missing');
  if (['DEVELOPMENT', 'ELIGIBLE_FOR_RC'].includes(state.state) && state.rc) blockers.add('rc_declared_before_cut');
  const required = [];
  if (state.state !== 'DEVELOPMENT') required.push('source_acceptance');
  if (['READY_FOR_SIGNED_BUILD', 'RC_BUILT', 'UAT_DEPLOYED', 'UAT_REJECTED', 'UAT_APPROVED', 'READY_FOR_PROD_APPROVAL', 'PROD_APPROVED', 'PROMOTING', 'RELEASED'].includes(state.state)) required.push('qualification');
  if (['RC_BUILT', 'UAT_DEPLOYED', 'UAT_REJECTED', 'UAT_APPROVED', 'READY_FOR_PROD_APPROVAL', 'PROD_APPROVED', 'PROMOTING', 'RELEASED'].includes(state.state)) {
    required.push('r03_identity');
    if (!Object.keys(state.artifacts).length) blockers.add('artifacts_missing');
    blockers.add('platform_artifact_coverage_unverified');
  }
  if (['UAT_REJECTED', 'UAT_APPROVED', 'READY_FOR_PROD_APPROVAL', 'PROD_APPROVED', 'PROMOTING', 'RELEASED'].includes(state.state)) required.push('uat');
  if (['PROMOTING', 'RELEASED'].includes(state.state)) required.push('provider_reconciliation');
  if (['PROD_APPROVED', 'PROMOTING', 'RELEASED'].includes(state.state)) {
    required.push('human_production_approval');
    blockers.add('human_production_approval_unverified');
  }
  for (const kind of required) if (!state.evidence.some((record) => record.kind === kind)) blockers.add(`evidence_missing:${kind}`);
  for (const record of state.evidence) {
    if (canonicalJson(record.source) !== canonicalJson(state.source)) blockers.add(`evidence_source_mismatch:${record.kind}`);
    // Source acceptance precedes the cut; source-only qualification can precede signed artifacts.
    // Later artifact-bound evidence must cover the exact complete current artifact set.
    if (record.rcTag !== (state.rc?.tag ?? null) && !(record.kind === 'source_acceptance' && record.rcTag === null)) blockers.add(`evidence_rc_mismatch:${record.kind}`);
    const exactArtifactSet = ['r03_identity', 'uat', 'human_production_approval', 'provider_reconciliation'].includes(record.kind);
    if ((exactArtifactSet && canonicalJson(record.artifacts) !== canonicalJson(state.artifacts))
      || Object.entries(record.artifacts).some(([kind, identity]) => state.artifacts[kind] !== identity)) blockers.add(`evidence_artifacts_mismatch:${record.kind}`);
    blockers.add(`evidence_unverified:${record.kind}`);
  }
  if (['BLOCKED', 'SUPERSEDED', 'UAT_REJECTED'].includes(state.state)) blockers.add(`declared_terminal_or_blocked:${state.state}`);
  return { mode: 'offline-fixture', schema: SCHEMA, declaredState: state.state, revision: state.revision,
    source: state.source, rc: state.rc, artifacts: state.artifacts, readiness: 'not_authorized',
    blockers: [...blockers].sort(), stateWritten: false, operationAuthorized: false };
}

/** Compare proposals only. This function never applies a transition or allocates an RC. */
export function inspectProposedTransition(previousInput, nextInput) {
  const previous = validateReleaseState(previousInput), next = validateReleaseState(nextInput);
  const noOp = canonicalJson(previous) === canonicalJson(next);
  if (!noOp) {
    if (['RELEASED', 'SUPERSEDED'].includes(previous.state)) fail('terminal_state_conflict');
    if (next.revision !== previous.revision + 1) fail('revision_conflict');
    if (previous.rc !== null && (canonicalJson(previous.rc) !== canonicalJson(next.rc)
      || canonicalJson(previous.source) !== canonicalJson(next.source))) fail('immutable_rc_conflict');
    for (const [kind, identity] of Object.entries(previous.artifacts)) {
      if (next.artifacts[kind] !== identity) fail('immutable_artifact_conflict');
    }
    if (previous.state !== next.state && !GRAPH[previous.state].includes(next.state)
      && !(['BLOCKED', 'SUPERSEDED'].includes(next.state) && !['RELEASED', 'SUPERSEDED'].includes(previous.state))) fail('transition_not_in_first_slice');
  }
  return { ...inspectReleaseState(next), structurallyValidProposal: true, noOp, transitionApplied: false };
}
