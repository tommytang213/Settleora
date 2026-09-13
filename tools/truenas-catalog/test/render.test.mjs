import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { canonicalJson } from '../../release/day1-release-identity.mjs';
import {
  OFFICIAL_APPS_COMMIT,
  OFFICIAL_LIBRARY_HASH,
  OFFICIAL_LIBRARY_CONTENT_HASH,
  OFFICIAL_LIBRARY_VERSION,
  SECRET_MARKERS,
  consumeReleaseIdentity,
  directoryContentIdentity,
  materialize,
  packageSource,
  renderCompose,
  safeReadJson,
  sha256,
  validateConfig,
  validateStaticTree,
  validateTopology,
} from '../render.mjs';
import { clone, fixtureConfig, repoRoot, syntheticManifest } from './helpers.mjs';

const temp = () => mkdtempSync(path.join(os.tmpdir(), 'settleora-r04-'));

test('official TrueNAS 25.10 package skeleton uses current Docker Apps layout and bounded metadata', () => {
  for (const file of ['app.yaml', 'item.yaml', 'ix_values.yaml', 'questions.yaml', 'README.md', 'templates/docker-compose.yaml']) {
    assert.ok(readFileSync(path.join(packageSource, file)).length > 0);
  }
  const app = YAML.parse(readFileSync(path.join(packageSource, 'app.yaml'), 'utf8'));
  const values = YAML.parse(readFileSync(path.join(packageSource, 'ix_values.yaml'), 'utf8'));
  const questions = YAML.parse(readFileSync(path.join(packageSource, 'questions.yaml'), 'utf8'));
  const template = readFileSync(path.join(packageSource, 'templates/docker-compose.yaml'), 'utf8');
  assert.equal(app.lib_version, OFFICIAL_LIBRARY_VERSION);
  assert.equal(app.lib_version_hash, OFFICIAL_LIBRARY_HASH);
  assert.equal(app.screenshots.length, 0);
  assert.match(OFFICIAL_APPS_COMMIT, /^[0-9a-f]{40}$/);
  assert.match(OFFICIAL_LIBRARY_CONTENT_HASH, /^[0-9a-f]{64}$/);
  assert.equal(values.resources.limits.memory, 4096);
  assert.equal(template.split('__SETTLEORA_RELEASE_LOCK__').length, 2);
  const bindPattern = questions.questions.find((question) => question.variable === 'network').schema.attrs.find((attr) => attr.variable === 'bind_address').schema.valid_chars;
  assert.equal(new RegExp(bindPattern).test('192.168.50.10'), true);
  assert.equal(new RegExp(bindPattern).test('10.999.999.999'), false);
  const settleoraFields = questions.questions.find((question) => question.variable === 'settleora').schema.attrs;
  for (const variable of ['postgres_database', 'postgres_user', 'postgres_password', 'rabbitmq_user', 'rabbitmq_password', 'rabbitmq_node_hostname']) {
    assert.equal(settleoraFields.find((field) => field.variable === variable).schema.immutable, true, `${variable} must be immutable after initialization`);
  }
  const storageFields = questions.questions.find((question) => question.variable === 'storage').schema.attrs;
  for (const variable of ['postgres_dataset', 'rabbitmq_dataset', 'api_storage_dataset']) {
    assert.equal(storageFields.find((field) => field.variable === variable).schema.immutable, true, `${variable} must be immutable after initialization`);
  }
  assert.match(template, /filesystem\.stat/);
  assert.match(template, /for path_segment in dataset\.split/);
  assert.match(template, /prefix_stat\.realpath != path_prefix\.value/);
  assert.ok(readFileSync(path.join(packageSource, 'templates/library/base_v2_3_11/container.py'), 'utf8').includes('"platform": "linux/amd64"'));
});

test('official-render validators accept only fixed descriptor and package-relative input', () => {
  const source = readFileSync(path.join(repoRoot, 'tools/truenas-catalog/validate-official-render.mjs'), 'utf8');
  assert.match(source, /readFileSync\(3, 'utf8'\)/u);
  assert.match(source, /readFileSync\(4, 'utf8'\)/u);
  assert.doesNotMatch(source, /readFileSync\([^34]/u);
  assert.doesNotMatch(source, /process\.argv\.slice/u);
  assert.match(source, /directoryContentIdentity\('package'\)/u);
});

test('pinned official TrueNAS library content fails closed on byte drift', () => {
  const root = path.join(temp(), 'package');
  cpSync(packageSource, root, { recursive: true });
  const target = path.join(root, 'templates/library/base_v2_3_11/container.py');
  writeFileSync(target, `${readFileSync(target, 'utf8')}\n# drift\n`);
  assert.throws(() => validateStaticTree(root), /library content mismatch/);
});

test('semantic R03 consumer creates immutable selected-platform runtime references', () => {
  const manifest = syntheticManifest();
  const identity = consumeReleaseIdentity(manifest, manifest.identityDigest);
  assert.match(identity.images.api, new RegExp(`:${manifest.apiImage.configuredTag}@${manifest.apiImage.platformDigest}$`));
  for (const image of Object.values(identity.images)) {
    assert.match(image, /@sha256:[0-9a-f]{64}$/);
    assert.doesNotMatch(image, /:(?:main|latest)(?:@|$)/);
  }
});

test('deterministic materialization repeats byte-identical package and compose identities', () => {
  const root = temp();
  const manifest = syntheticManifest();
  const first = materialize({ manifest, expectedIdentityDigest: manifest.identityDigest, config: clone(fixtureConfig), output: path.join(root, 'one') });
  const second = materialize({ manifest, expectedIdentityDigest: manifest.identityDigest, config: clone(fixtureConfig), output: path.join(root, 'two') });
  assert.equal(first.packetSha256, second.packetSha256);
  assert.equal(first.plan.renderedComposeSha256, second.plan.renderedComposeSha256);
  assert.equal(readFileSync(path.join(first.output, 'install-plan.json'), 'utf8'), readFileSync(path.join(second.output, 'install-plan.json'), 'utf8'));
  assert.equal(readFileSync(path.join(first.output, 'rendered/docker-compose.yaml'), 'utf8'), readFileSync(path.join(second.output, 'rendered/docker-compose.yaml'), 'utf8'));
  assert.deepEqual(first.plan.materializedPackage, second.plan.materializedPackage);
  assert.doesNotMatch(readFileSync(path.join(first.packageRoot, 'templates/docker-compose.yaml'), 'utf8'), /__SETTLEORA_RELEASE_LOCK__/u);
  assert.equal(first.plan.actions.published, false);
  assert.equal(first.plan.actions.deployed, false);
  assert.equal(first.plan.applicationRelease.commit, syntheticManifest().source.commit);
  assert.match(first.plan.packageSource.repositoryCommit, /^[0-9a-f]{40}$/);
  assert.match(first.plan.packageSource.repositoryTree, /^[0-9a-f]{40}$/);
  assert.match(first.plan.packageSource.contentSha256, /^[0-9a-f]{64}$/);
  assert.equal(first.plan.packageSource.trackedAtCommit, true);
  const tampered = path.join(root, 'tampered-package');
  cpSync(first.packageRoot, tampered, { recursive: true });
  writeFileSync(path.join(tampered, 'README.md'), `${readFileSync(path.join(tampered, 'README.md'), 'utf8')}drift\n`);
  assert.notEqual(directoryContentIdentity(tampered).sha256, first.plan.materializedPackage.sha256);
});

test('rendered topology preserves R11, R12, private services, datasets, and migration failure gating', () => {
  const manifest = syntheticManifest();
  const identity = consumeReleaseIdentity(manifest, manifest.identityDigest);
  const compose = renderCompose(identity, fixtureConfig);
  assert.deepEqual(Object.keys(compose.services).sort(), ['api', 'ingress', 'migrate', 'postgres', 'rabbitmq']);
  assert.equal(compose.services.ingress.ports.length, 1);
  for (const service of ['api', 'migrate', 'postgres', 'rabbitmq']) assert.equal(compose.services[service].ports, undefined);
  assert.equal(compose.services.api.depends_on.migrate.condition, 'service_completed_successfully');
  assert.equal(compose.services.migrate.depends_on.postgres.condition, 'service_healthy');
  assert.equal(compose.services.api.healthcheck.test[0], 'CMD-SHELL');
  assert.match(compose.services.api.healthcheck.test[1], /\/health\/ready/);
  assert.doesNotMatch(compose.services.api.healthcheck.test[1], /curl/);
  assert.equal(compose.services.ingress.depends_on.api.condition, 'service_healthy');
  assert.equal(compose.services.api.environment.Auth__Passkeys__RelyingPartyId, fixtureConfig.hostname);
  assert.equal(compose.services.api.environment.Auth__Passkeys__AllowedOrigins__0, `https://${fixtureConfig.hostname}:${fixtureConfig.httpsPort}`);
  assert.deepEqual(compose.services.api.entrypoint, ['/bin/sh', '/usr/local/bin/settleora-api-entrypoint.sh']);
  assert.match(compose.configs['settleora-api-entrypoint'].content, /\.settleora-write-probe/);
  assert.equal(compose.services.api.environment.HOME, '/var/lib/settleora/storage/.settleora-home');
  assert.equal(compose.services.api.volumes[0].target, '/var/lib/settleora/storage');
  assert.deepEqual(compose.services.ingress.entrypoint, ['/bin/sh', '/usr/local/bin/settleora-caddy-entrypoint.sh']);
  assert.match(compose.configs['settleora-caddy-entrypoint'].content, /cp \/usr\/bin\/caddy \/tmp\/settleora-caddy/);
  assert.match(compose.configs['settleora-migrate-entrypoint'].content, /validate-only\)[\s\S]*--mode=validate-only[\s\S]*--mode=check-only/);
  assert.equal(compose.services.rabbitmq.hostname, fixtureConfig.rabbitmq.nodeHostname);
  assert.equal(compose.services.rabbitmq.environment.RABBITMQ_NODENAME, `rabbit@${fixtureConfig.rabbitmq.nodeHostname}`);
  assert.match(compose.configs['settleora-rabbitmq-entrypoint'].content, /persisted_nodename/);
  assert.equal(compose.networks.ingress.internal, true);
  assert.equal(compose.networks.backend.internal, true);
  assert.equal(compose.networks.edge.internal, undefined);
  assert.match(compose.configs['settleora-caddyfile'].content, /auto_https off/);
});

test('default HTTPS port uses the canonical passkey origin without an explicit port', () => {
  const manifest = syntheticManifest();
  const identity = consumeReleaseIdentity(manifest, manifest.identityDigest);
  const config = clone(fixtureConfig);
  config.httpsPort = 443;
  const compose = renderCompose(identity, config);
  assert.equal(compose.services.api.environment.Auth__Passkeys__RelyingPartyId, config.hostname);
  assert.equal(compose.services.api.environment.Auth__Passkeys__AllowedOrigins__0, `https://${config.hostname}`);
});

test('bounded form/config negative matrix fails closed', () => {
  const cases = [
    ['public mode', (c) => { c.deploymentMode = 'public'; }],
    ['wildcard ingress', (c) => { c.bindAddress = '0.0.0.0'; }],
    ['loopback ingress', (c) => { c.bindAddress = '127.0.0.1'; }],
    ['public ingress', (c) => { c.bindAddress = '203.0.113.10'; }],
    ['missing hostname', (c) => { c.hostname = ''; }],
    ['invalid hostname label edge', (c) => { c.hostname = 'api.-private.home.arpa'; }],
    ['oversized hostname label', (c) => { c.hostname = `${'a'.repeat(64)}.home.arpa`; }],
    ['documentation hostname', (c) => { c.hostname = 'settleora.example.com'; }],
    ['missing certificate', (c) => { c.certificateRef = ''; }],
    ['missing postgres secret', (c) => { c.postgres.password = ''; }],
    ['missing rabbit secret', (c) => { c.rabbitmq.password = ''; }],
    ['non-fixture postgres secret', (c) => { c.postgres.password = 'ActualOperatorSecret123'; }],
    ['non-fixture rabbit secret', (c) => { c.rabbitmq.password = 'ActualOperatorSecret123'; }],
    ['missing postgres dataset', (c) => { c.storage.postgresDataset = ''; }],
    ['missing rabbit dataset', (c) => { c.storage.rabbitmqDataset = ''; }],
    ['missing storage dataset', (c) => { c.storage.apiDataset = ''; }],
    ['dataset traversal', (c) => { c.storage.apiDataset = '/mnt/pool/../escape'; }],
    ['dataset dot alias', (c) => { c.storage.apiDataset = `${c.storage.postgresDataset}/.`; }],
    ['dataset repeated-slash alias', (c) => { c.storage.apiDataset = c.storage.postgresDataset.replace('/settleora/', '/settleora//'); }],
    ['duplicate datasets', (c) => { c.storage.apiDataset = c.storage.postgresDataset; }],
    ['nested datasets', (c) => { c.storage.apiDataset = `${c.storage.postgresDataset}/api`; }],
    ['missing rabbit identity', (c) => { c.rabbitmq.nodeHostname = ''; }],
    ['destructive migration', (c) => { c.migrationMode = 'force-allow-destructive'; }],
    ['missing LAN acknowledgement', (c) => { c.acknowledgements.lanOnly = false; }],
    ['missing backup acknowledgement', (c) => { c.acknowledgements.backupBeforeUpgrade = false; }],
    ['missing rollback acknowledgement', (c) => { c.acknowledgements.rollbackLimit = false; }],
    ['unsupported injection', (c) => { c.webAdmin = true; }],
  ];
  for (const [name, mutate] of cases) {
    const config = clone(fixtureConfig);
    mutate(config);
    assert.throws(() => validateConfig(config), undefined, name);
  }
});

test('R03 source, identity, mutable reference, and platform mismatches fail closed', () => {
  const cases = [
    (m) => { m.identityDigest = '0'.repeat(64); },
    (m) => { m.source.tree = '0'.repeat(40); },
    (m) => { m.apiImage.configuredTag = 'main'; },
    (m) => { m.apiImage.platformDigest = 'sha256:' + '0'.repeat(64); },
    (m) => { m.apiImage.architecture = 'arm64'; },
    (m) => { m.dependencyImages[0].architecture = 'arm64'; },
  ];
  for (const mutate of cases) {
    const manifest = syntheticManifest();
    const expectedIdentityDigest = manifest.identityDigest;
    mutate(manifest);
    assert.throws(() => consumeReleaseIdentity(manifest, expectedIdentityDigest));
  }
  const forged = syntheticManifest();
  const trustedDigest = forged.identityDigest;
  forged.apiImage.indexDigest = `sha256:${'1'.repeat(64)}`;
  forged.apiImage.platformDigest = `sha256:${'2'.repeat(64)}`;
  const digestInput = clone(forged);
  delete digestInput.generatedAt;
  delete digestInput.identityDigest;
  forged.identityDigest = sha256(canonicalJson(digestInput));
  assert.throws(() => consumeReleaseIdentity(forged, trustedDigest), /detached expected digest/);
});

test('topology negative matrix rejects exposure, unsupported services, identity drift, and start-order drift', () => {
  const manifest = syntheticManifest();
  const identity = consumeReleaseIdentity(manifest, manifest.identityDigest);
  const base = renderCompose(identity, fixtureConfig);
  const cases = [
    (c) => { c.services.api.ports = [{ published: '8080', target: 8080 }]; },
    (c) => { c.services.postgres.ports = [{ published: '5432', target: 5432 }]; },
    (c) => { c.services.rabbitmq.ports = [{ published: '15672', target: 15672 }]; },
    (c) => { c.services.migrate.ports = [{ published: '9999', target: 9999 }]; },
    (c) => { c.services['web-admin'] = clone(c.services.api); },
    (c) => { c.services.api.image = identity.images.caddy; },
    (c) => { c.services.ingress.image = identity.images.postgres; },
    (c) => { c.services.postgres.image = identity.images.rabbitmq; },
    (c) => { c.services.rabbitmq.image = identity.images.caddy; },
    (c) => { c.services.api.healthcheck = { test: ['CMD', 'curl'] }; },
    (c) => { c.services.api.healthcheck.test[1] = c.services.api.healthcheck.test[1].replace('/health/ready', '/health'); },
    (c) => { c.services.ingress.depends_on.api.condition = 'service_started'; },
    (c) => { delete c.services.api.environment.Auth__Passkeys__RelyingPartyId; },
    (c) => { c.services.api.environment.Auth__Passkeys__AllowedOrigins__0 = 'https://localhost'; },
    (c) => { delete c.services.api.entrypoint; },
    (c) => { c.configs['settleora-api-entrypoint'].content = 'exec dotnet Settleora.Api.dll'; },
    (c) => { delete c.services.ingress.entrypoint; },
    (c) => { c.configs['settleora-caddy-entrypoint'].content = 'exec /usr/bin/caddy'; },
    (c) => { c.configs['settleora-migrate-entrypoint'].content = 'exit 0'; },
    (c) => { delete c.services.api.environment.HOME; },
    (c) => { c.services.api.volumes[0].target = '/var/lib/settleora'; },
    (c) => { delete c.services.api.depends_on.migrate; },
    (c) => { c.services.api.depends_on.migrate.condition = 'service_started'; },
    (c) => { delete c.services.migrate.depends_on.postgres; },
    (c) => { c.services.rabbitmq.environment.RABBITMQ_NODENAME = 'rabbit@other'; },
    (c) => { c.networks.backend.internal = false; },
    (c) => { c.services.ingress.ports[0].host_ip = '0.0.0.0'; },
    (c) => { c.configs['settleora-caddyfile'].content = 'http://api:8080'; },
    (c) => { c.services.api.volumes = []; },
  ];
  for (const mutate of cases) {
    const compose = clone(base);
    mutate(compose);
    assert.throws(() => validateTopology(compose, identity, fixtureConfig));
  }
});

test('input and output boundary rejects symlinks, special files, and existing outputs', () => {
  const root = temp();
  const regular = path.join(root, 'input.json');
  writeFileSync(regular, '{}');
  const link = path.join(root, 'link.json');
  symlinkSync(regular, link);
  assert.throws(() => safeReadJson(link, 'config'));
  const fifo = path.join(root, 'fifo');
  execFileSync('mkfifo', [fifo]);
  assert.throws(() => safeReadJson(fifo, 'config'));
  const existing = path.join(root, 'existing');
  writeFileSync(existing, 'occupied');
  const manifest = syntheticManifest();
  assert.throws(() => materialize({ manifest, expectedIdentityDigest: manifest.identityDigest, config: fixtureConfig, output: existing }));
});

test('CLI success and refusal output never discloses secret values or private dataset paths', () => {
  const root = temp();
  const manifestPath = path.join(root, 'manifest.json');
  const configPath = path.join(root, 'config.json');
  writeFileSync(manifestPath, JSON.stringify(syntheticManifest()));
  writeFileSync(configPath, JSON.stringify(fixtureConfig));
  const expectedDigest = syntheticManifest().identityDigest;
  const result = spawnSync(process.execPath, ['tools/truenas-catalog/render.mjs', '--manifest', manifestPath, '--expected-identity-digest', expectedDigest, '--config', configPath, '--output', path.join(root, 'packet')], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const logs = result.stdout + result.stderr;
  for (const marker of SECRET_MARKERS) assert.doesNotMatch(logs, new RegExp(marker));
  assert.doesNotMatch(logs, /\/mnt\//);
  assert.deepEqual(JSON.parse(result.stdout), { schema: 'settleora.truenas-install-plan.v1', packetSha256: JSON.parse(result.stdout).packetSha256, renderedComposeSha256: JSON.parse(result.stdout).renderedComposeSha256, realSecretsIncluded: false, published: false, deployed: false });
  const invalid = clone(fixtureConfig);
  invalid.postgres.password = SECRET_MARKERS[0];
  invalid.bindAddress = '0.0.0.0';
  writeFileSync(configPath, JSON.stringify(invalid));
  const refused = spawnSync(process.execPath, ['tools/truenas-catalog/render.mjs', '--manifest', manifestPath, '--expected-identity-digest', expectedDigest, '--config', configPath, '--output', path.join(root, 'refused')], { cwd: repoRoot, encoding: 'utf8' });
  assert.notEqual(refused.status, 0);
  assert.doesNotMatch(refused.stdout + refused.stderr, new RegExp(SECRET_MARKERS[0]));
  const privateMissing = spawnSync(process.execPath, ['tools/truenas-catalog/render.mjs', '--manifest', '/mnt/PRIVATE_POOL/secret.json', '--expected-identity-digest', expectedDigest, '--config', configPath, '--output', path.join(root, 'missing')], { cwd: repoRoot, encoding: 'utf8' });
  assert.notEqual(privateMissing.status, 0);
  assert.doesNotMatch(privateMissing.stdout + privateMissing.stderr, /PRIVATE_POOL|secret\.json|\/mnt\//);
  const malformedPath = path.join(root, 'malformed.json');
  writeFileSync(malformedPath, '{"password":"SENSITIVE_FRAGMENT"');
  const malformed = spawnSync(process.execPath, ['tools/truenas-catalog/render.mjs', '--manifest', malformedPath, '--expected-identity-digest', expectedDigest, '--config', configPath, '--output', path.join(root, 'malformed')], { cwd: repoRoot, encoding: 'utf8' });
  assert.notEqual(malformed.status, 0);
  assert.doesNotMatch(malformed.stdout + malformed.stderr, /SENSITIVE_FRAGMENT|malformed\.json/);
});

test('offline rendered Compose is accepted structurally by Docker Compose without pulling or starting images', () => {
  const manifest = syntheticManifest();
  const identity = consumeReleaseIdentity(manifest, manifest.identityDigest);
  const compose = renderCompose(identity, fixtureConfig);
  const root = temp();
  const file = path.join(root, 'compose.yaml');
  writeFileSync(file, JSON.stringify(compose));
  execFileSync('docker', ['compose', '-f', file, 'config', '--quiet'], { cwd: repoRoot, stdio: 'pipe' });
  assert.equal(sha256(readFileSync(file)), sha256(JSON.stringify(compose)));
});
