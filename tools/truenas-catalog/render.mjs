import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
  closeSync,
  constants,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { canonicalJson, validateManifest } from '../release/day1-release-identity.mjs';

export const PACKAGE_SCHEMA = 'settleora.truenas-install-plan.v1';
export const OFFICIAL_APPS_COMMIT = '3b61e3ebd9476e54d065dc5b8d3db00dd6f187bb';
export const OFFICIAL_LIBRARY_VERSION = '2.3.11';
export const OFFICIAL_LIBRARY_HASH = '874636814efb275e5276ea9d709b7cd665fed42bb1d50328e853d9253a2e1229';
export const OFFICIAL_LIBRARY_CONTENT_HASH = '6fd56b7d10733a47d7edf87dc78fac5be8ee8e445e6597350319bd5fe4541684';
export const SUPPORTED_PLATFORM = Object.freeze({ os: 'linux', architecture: 'amd64' });

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '../..');
export const packageSource = path.join(repoRoot, 'infra/truenas-catalog/settleora');
const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const REQUIRED_SERVICES = Object.freeze(['api', 'ingress', 'migrate', 'postgres', 'rabbitmq']);
const SAFE_MIGRATION_MODES = new Set(['managed-auto', 'apply-safe', 'manual', 'check-only', 'validate-only']);
const SECRET_MARKERS = Object.freeze([
  'REDACTED_FAKE_POSTGRES_PASSWORD',
  'REDACTED_FAKE_RABBITMQ_PASSWORD',
  'REDACTED_FAKE_PRIVATE_KEY',
]);

const RABBITMQ_IDENTITY_GUARD = `#!/bin/sh
set -eu
expected_nodename="rabbit@$(hostname -s)"
configured_nodename="${'${RABBITMQ_NODENAME:?RABBITMQ_NODENAME is required for persistent RabbitMQ data}'}"
[ "$configured_nodename" = "$expected_nodename" ] || { echo >&2 "RabbitMQ persistence identity refused: configured node name does not match the container hostname."; exit 64; }
mnesia_base="${'${RABBITMQ_MNESIA_BASE:-/var/lib/rabbitmq/mnesia}'}"
if [ -d "$mnesia_base" ]; then
  persisted_nodename=""
  for candidate in "$mnesia_base"/rabbit@*; do
    [ -d "$candidate" ] || continue
    candidate_nodename="${'${candidate##*/}'}"
    case "$candidate_nodename" in
      *-plugins-expand)
        if [ -d "${'${candidate%-plugins-expand}'}" ] && [ ! -e "$candidate/schema.DAT" ] && [ ! -e "$candidate/node-type.txt" ] && [ ! -d "$candidate/msg_stores" ]; then continue; fi
        ;;
    esac
    [ -z "$persisted_nodename" ] || [ "$persisted_nodename" = "$candidate_nodename" ] || { echo >&2 "RabbitMQ persistence identity refused: the data path contains more than one node database."; exit 65; }
    persisted_nodename="$candidate_nodename"
  done
  [ -z "$persisted_nodename" ] || [ "$persisted_nodename" = "$configured_nodename" ] || { echo >&2 "RabbitMQ persistence identity refused: the configured node does not match the persisted node database."; exit 66; }
fi
exec /usr/local/bin/docker-entrypoint.sh "$@"
`.replaceAll('$', () => '$$');

const CADDY_ENTRYPOINT = `#!/bin/sh
set -eu
cp /usr/bin/caddy /tmp/settleora-caddy
chmod 0555 /tmp/settleora-caddy
exec /tmp/settleora-caddy "$@"
`.replaceAll('$', () => '$$');

const MIGRATE_ENTRYPOINT = `#!/bin/sh
set -eu
mode="${'${1:?A migration mode is required}'}"
case "$mode" in
  validate-only)
    dotnet Settleora.Api.dll migrate-database --mode=validate-only
    exec dotnet Settleora.Api.dll migrate-database --mode=check-only
    ;;
  managed-auto|apply-safe|manual|check-only)
    exec dotnet Settleora.Api.dll migrate-database --mode="$mode"
    ;;
  *)
    echo >&2 "Unsupported or destructive migration mode"
    exit 64
    ;;
esac
`.replaceAll('$', () => '$$');

const API_ENTRYPOINT = `#!/bin/sh
set -eu
[ "$(id -u)" = "999" ] && [ "$(id -g)" = "999" ] || { echo >&2 "API startup refused: expected runtime UID/GID 999."; exit 64; }
data_path=/var/lib/settleora/storage
[ -d "$data_path" ] && [ -r "$data_path" ] && [ -w "$data_path" ] && [ -x "$data_path" ] || { echo >&2 "API startup refused: the private storage dataset must grant UID/GID 999 read, write, and traverse access."; exit 65; }
probe="$data_path/.settleora-write-probe-$$"
trap 'rm -f "$probe"' EXIT HUP INT TERM
umask 077
: > "$probe" || { echo >&2 "API startup refused: the private storage dataset is not writable by UID/GID 999."; exit 66; }
rm -f "$probe"
trap - EXIT HUP INT TERM
mkdir -p "$data_path/.settleora-home"
chmod 0700 "$data_path/.settleora-home"
exec dotnet Settleora.Api.dll "$@"
`.replaceAll('$', () => '$$');

function fail(message) {
  throw new Error(message);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const keys = Object.keys(value);
  const extra = keys.filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !keys.includes(key));
  if (extra.length || missing.length) fail(`${label} keys are invalid`);
}

function boundedString(value, label, pattern, max = 255) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || !pattern.test(value)) {
    fail(`${label} is invalid`);
  }
  return value;
}

function canonicalDataset(value) {
  boundedString(value, 'dataset', /^\/mnt\/[A-Za-z0-9._/-]+$/u, 1024);
  if (path.posix.normalize(value) !== value || value.includes('..') || value.endsWith('/') || value === '/mnt') fail('dataset path is ambiguous');
  let cursor = '/';
  for (const segment of value.split('/').filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try {
      if (lstatSync(cursor).isSymbolicLink()) fail('dataset path contains a symbolic-link component');
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
  }
  try {
    return realpathSync(value);
  } catch (error) {
    if (error?.code === 'ENOENT') return value;
    throw error;
  }
}

export function validateConfig(config) {
  exactKeys(config, ['deploymentMode', 'bindAddress', 'httpsPort', 'hostname', 'certificateRef', 'postgres', 'rabbitmq', 'storage', 'migrationMode', 'acknowledgements'], 'config');
  if (config.deploymentMode !== 'lan-private') fail('Only lan-private deployment mode is supported');
  const ipv4 = boundedString(config.bindAddress, 'bindAddress', /^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$/u, 15);
  const octets = ipv4.split('.').map(Number);
  if (octets.some((part) => part > 255)
    || !(octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168))) {
    fail('bindAddress must be one canonical RFC1918 IPv4 address');
  }
  if (!Number.isSafeInteger(config.httpsPort) || config.httpsPort < 1 || config.httpsPort > 65535) fail('httpsPort is invalid');
  const hostname = boundedString(config.hostname, 'hostname', /^(?!.*\.\.)(?!.*(?:^|\.)localhost$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/u, 253);
  if (!hostname.includes('.') || /(?:^|\.)(?:example|example\.(?:com|net|org)|invalid|test)$/iu.test(hostname)) fail('hostname must be an exact non-documentation private FQDN');
  if (hostname.split('.').some((label) => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u.test(label))) fail('hostname contains an invalid DNS label');
  boundedString(String(config.certificateRef), 'certificateRef', /^[1-9][0-9]*$/u, 20);
  exactKeys(config.postgres, ['database', 'user', 'password'], 'config.postgres');
  exactKeys(config.rabbitmq, ['user', 'password', 'nodeHostname'], 'config.rabbitmq');
  exactKeys(config.storage, ['postgresDataset', 'rabbitmqDataset', 'apiDataset'], 'config.storage');
  exactKeys(config.acknowledgements, ['lanOnly', 'backupBeforeUpgrade', 'rollbackLimit'], 'config.acknowledgements');
  boundedString(config.postgres.database, 'postgres.database', /^[A-Za-z_][A-Za-z0-9_]{0,62}$/u, 63);
  boundedString(config.postgres.user, 'postgres.user', /^[A-Za-z_][A-Za-z0-9_]{0,62}$/u, 63);
  boundedString(config.rabbitmq.user, 'rabbitmq.user', /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,62}$/u, 63);
  boundedString(config.rabbitmq.nodeHostname, 'rabbitmq.nodeHostname', /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u, 63);
  for (const [label, secret] of [['postgres.password', config.postgres.password], ['rabbitmq.password', config.rabbitmq.password]]) {
    boundedString(secret, label, /^[^\s\r\n\u0000]{16,256}$/u, 256);
  }
  if (config.postgres.password !== SECRET_MARKERS[0] || config.rabbitmq.password !== SECRET_MARKERS[1]) {
    fail('Offline evidence rendering accepts only the documented redacted secret fixtures');
  }
  const datasets = Object.values(config.storage).map(canonicalDataset);
  if (new Set(datasets).size !== datasets.length) fail('datasets must resolve to distinct paths');
  if (datasets.some((dataset, index) => datasets.some((other, otherIndex) => index !== otherIndex && dataset.startsWith(`${other}/`)))) fail('datasets must not be nested');
  if (!SAFE_MIGRATION_MODES.has(config.migrationMode)) fail('Unsupported or destructive migration mode');
  if (Object.values(config.acknowledgements).some((value) => value !== true)) fail('All safety acknowledgements are required');
  return config;
}

export function safeReadJson(file, label) {
  const absolute = path.resolve(file);
  let stat;
  try {
    stat = lstatSync(absolute);
  } catch {
    fail(`${label} is unavailable`);
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > MAX_INPUT_BYTES) fail(`${label} must be a bounded regular file`);
  let descriptor;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    fail(`${label} could not be opened safely`);
  }
  try {
    const current = lstatSync(absolute);
    if (current.dev !== stat.dev || current.ino !== stat.ino || current.size !== stat.size) fail(`${label} changed while opening`);
    try {
      return JSON.parse(readFileSync(descriptor, 'utf8'));
    } catch {
      fail(`${label} is not valid JSON`);
    }
  } finally {
    closeSync(descriptor);
  }
}

function dependency(manifest, name) {
  const found = manifest.dependencyImages.find((image) => image.name === name);
  if (!found) fail(`R03 manifest is missing ${name}`);
  return found;
}

function configuredTagOnly(image) {
  const marker = `${image.name}:`;
  if (!image.configuredTag.startsWith(marker)) fail(`${image.name} configured tag is not canonical`);
  return image.configuredTag.slice(marker.length);
}

function immutableImage(image, tag) {
  if (!/^sha256:[0-9a-f]{64}$/u.test(image.platformDigest)) fail('Selected-platform digest is invalid');
  return `${image.repository}:${tag}@${image.platformDigest}`;
}

export function consumeReleaseIdentity(input, expectedIdentityDigest, sourceRepo = repoRoot) {
  if (!/^[0-9a-f]{64}$/u.test(expectedIdentityDigest ?? '')) fail('A detached expected R03 identity digest is required');
  const manifest = validateManifest(input, sourceRepo);
  if (manifest.identityDigest !== expectedIdentityDigest) fail('R03 identity does not match the detached expected digest');
  if (manifest.apiImage.os !== SUPPORTED_PLATFORM.os || manifest.apiImage.architecture !== SUPPORTED_PLATFORM.architecture) {
    fail('R03 platform is not supported by the current TrueNAS renderer');
  }
  for (const image of manifest.dependencyImages) {
    if (image.os !== SUPPORTED_PLATFORM.os || image.architecture !== SUPPORTED_PLATFORM.architecture) fail('R03 dependency platform mismatch');
  }
  const caddy = dependency(manifest, 'caddy');
  const postgres = dependency(manifest, 'postgres');
  const rabbitmq = dependency(manifest, 'rabbitmq');
  return {
    manifest,
    images: {
      api: immutableImage(manifest.apiImage, manifest.apiImage.configuredTag),
      caddy: immutableImage(caddy, configuredTagOnly(caddy)),
      postgres: immutableImage(postgres, configuredTagOnly(postgres)),
      rabbitmq: immutableImage(rabbitmq, configuredTagOnly(rabbitmq)),
    },
  };
}

function imageValues(identity) {
  const result = {};
  for (const [key, reference] of Object.entries(identity.images)) {
    const at = reference.lastIndexOf('@');
    const colon = reference.lastIndexOf(':', at);
    result[`${key}_image`] = { repository: reference.slice(0, colon), tag: reference.slice(colon + 1) };
  }
  return result;
}

export function officialValues(identity, config) {
  const certificateKey = String(config.certificateRef);
  return {
    release_identity: {
      schema: identity.manifest.schema,
      candidate_id: identity.manifest.source.candidateId,
      application_source_commit: identity.manifest.source.commit,
      application_source_tree: identity.manifest.source.tree,
      identity_digest: identity.manifest.identityDigest,
      platform: 'linux/amd64',
      api_index_digest: identity.manifest.apiImage.indexDigest,
      runtime_digest_authority: 'selected-platform-manifest',
    },
    settleora: {
      deployment_mode: config.deploymentMode,
      postgres_database: config.postgres.database,
      postgres_user: config.postgres.user,
      postgres_password: config.postgres.password,
      rabbitmq_user: config.rabbitmq.user,
      rabbitmq_password: config.rabbitmq.password,
      rabbitmq_node_hostname: config.rabbitmq.nodeHostname,
      migration_mode: config.migrationMode,
    },
    network: {
      bind_address: config.bindAddress,
      https_port: config.httpsPort,
      hostname: config.hostname,
      certificate_id: certificateKey,
    },
    storage: {
      postgres_dataset: config.storage.postgresDataset,
      rabbitmq_dataset: config.storage.rabbitmqDataset,
      api_storage_dataset: config.storage.apiDataset,
    },
    acknowledgements: {
      lan_only: config.acknowledgements.lanOnly,
      backup_before_upgrade: config.acknowledgements.backupBeforeUpgrade,
      rollback_limit: config.acknowledgements.rollbackLimit,
    },
    ix_certificates: {
      [certificateKey]: {
        certificate: '-----BEGIN CERTIFICATE-----\nREDACTED_FAKE_CERTIFICATE_CHAIN\n-----END CERTIFICATE-----\n',
        privatekey: '-----BEGIN PRIVATE KEY-----\nREDACTED_FAKE_PRIVATE_KEY\n-----END PRIVATE KEY-----\n',
      },
    },
  };
}

function baseService(image, networks, restart = 'unless-stopped') {
  return { image, platform: 'linux/amd64', restart, networks };
}

export function renderCompose(identity, config) {
  validateConfig(config);
  const connection = `Host=postgres;Port=5432;Database=${config.postgres.database};Username=${config.postgres.user};Password=${config.postgres.password}`;
  const passkeyOrigin = config.httpsPort === 443 ? `https://${config.hostname}` : `https://${config.hostname}:${config.httpsPort}`;
  const compose = {
    services: {
      ingress: {
        ...baseService(identity.images.caddy, ['edge', 'ingress'], 'no'),
        user: '1000:1000',
        cap_drop: ['ALL'],
        read_only: true,
        security_opt: ['no-new-privileges=true'],
        entrypoint: ['/bin/sh', '/usr/local/bin/settleora-caddy-entrypoint.sh'],
        command: ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'],
        depends_on: { api: { condition: 'service_healthy' } },
        ports: [{ target: 8443, published: String(config.httpsPort), protocol: 'tcp', mode: 'ingress', host_ip: config.bindAddress }],
        configs: [
          { source: 'settleora-caddyfile', target: '/etc/caddy/Caddyfile', mode: 292 },
          { source: 'settleora-caddy-entrypoint', target: '/usr/local/bin/settleora-caddy-entrypoint.sh', mode: 365 },
          { source: 'settleora-tls-certificate', target: '/run/settleora-tls/tls.crt', mode: 292 },
          { source: 'settleora-tls-private-key', target: '/run/settleora-tls/tls.key', mode: 256 },
        ],
        tmpfs: ['/config:mode=0700,uid=1000,gid=1000', '/data:mode=0700,uid=1000,gid=1000', '/tmp:mode=0700,uid=1000,gid=1000'],
        healthcheck: { test: ['CMD', '/tmp/settleora-caddy', 'validate', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'], interval: '30s', timeout: '5s', retries: 5, start_period: '15s' },
      },
      migrate: {
        ...baseService(identity.images.api, ['backend'], 'no'),
        entrypoint: ['/bin/sh', '/usr/local/bin/settleora-migrate-entrypoint.sh'],
        command: [config.migrationMode],
        environment: { ASPNETCORE_ENVIRONMENT: 'Production', Settleora__Database__ConnectionString: connection, SETTLEORA_DATABASE_MIGRATION_MODE: config.migrationMode },
        depends_on: { postgres: { condition: 'service_healthy' } },
        configs: [{ source: 'settleora-migrate-entrypoint', target: '/usr/local/bin/settleora-migrate-entrypoint.sh', mode: 365 }],
      },
      api: {
        ...baseService(identity.images.api, ['ingress', 'backend']),
        cap_drop: ['ALL'],
        entrypoint: ['/bin/sh', '/usr/local/bin/settleora-api-entrypoint.sh'],
        expose: ['8080/tcp'],
        environment: {
          ASPNETCORE_ENVIRONMENT: 'Production', ASPNETCORE_URLS: 'http://+:8080', HOME: '/var/lib/settleora/storage/.settleora-home', Settleora__Database__ConnectionString: connection,
          Auth__Passkeys__RelyingPartyId: config.hostname, Auth__Passkeys__AllowedOrigins__0: passkeyOrigin,
          Settleora__RabbitMq__HostName: 'rabbitmq', Settleora__RabbitMq__Port: '5672', Settleora__RabbitMq__UserName: config.rabbitmq.user,
          Settleora__RabbitMq__Password: config.rabbitmq.password, Settleora__RabbitMq__VirtualHost: '/', Settleora__Storage__Provider: 'Local', Settleora__Storage__RootPath: '/var/lib/settleora/storage',
        },
        depends_on: { migrate: { condition: 'service_completed_successfully' }, postgres: { condition: 'service_healthy' }, rabbitmq: { condition: 'service_healthy' } },
        configs: [{ source: 'settleora-api-entrypoint', target: '/usr/local/bin/settleora-api-entrypoint.sh', mode: 365 }],
        volumes: [{ type: 'bind', source: config.storage.apiDataset, target: '/var/lib/settleora/storage', read_only: false, bind: { create_host_path: false, propagation: 'rprivate' } }],
        healthcheck: { test: ['CMD-SHELL', "/bin/bash -c '{ printf \"GET /health/ready HTTP/1.1\\r\\nHost: 127.0.0.1\\r\\nConnection: close\\r\\n\\r\\n\" >&0; grep \"HTTP\" | grep -q \"200\"; } 0<>/dev/tcp/127.0.0.1/8080'"], interval: '30s', timeout: '5s', retries: 5, start_period: '15s' },
      },
      postgres: {
        ...baseService(identity.images.postgres, ['backend']),
        environment: { POSTGRES_DB: config.postgres.database, POSTGRES_USER: config.postgres.user, POSTGRES_PASSWORD: config.postgres.password },
        volumes: [{ type: 'bind', source: config.storage.postgresDataset, target: '/var/lib/postgresql/data', read_only: false, bind: { create_host_path: false, propagation: 'rprivate' } }],
        healthcheck: { test: ['CMD-SHELL', `pg_isready -U '${config.postgres.user}' -d '${config.postgres.database}' -h 127.0.0.1 -p 5432`], interval: '30s', timeout: '5s', retries: 5, start_period: '15s' },
      },
      rabbitmq: {
        ...baseService(identity.images.rabbitmq, ['backend']),
        hostname: config.rabbitmq.nodeHostname,
        entrypoint: ['/bin/sh', '/usr/local/bin/settleora-rabbitmq-entrypoint.sh'],
        command: ['rabbitmq-server'],
        environment: { RABBITMQ_DEFAULT_USER: config.rabbitmq.user, RABBITMQ_DEFAULT_PASS: config.rabbitmq.password, RABBITMQ_NODENAME: `rabbit@${config.rabbitmq.nodeHostname}` },
        configs: [{ source: 'settleora-rabbitmq-entrypoint', target: '/usr/local/bin/settleora-rabbitmq-entrypoint.sh', mode: 365 }],
        volumes: [{ type: 'bind', source: config.storage.rabbitmqDataset, target: '/var/lib/rabbitmq', read_only: false, bind: { create_host_path: false, propagation: 'rprivate' } }],
        healthcheck: { test: ['CMD', 'rabbitmq-diagnostics', 'ping'], interval: '30s', timeout: '5s', retries: 5, start_period: '15s' },
      },
    },
    networks: { edge: {}, ingress: { internal: true }, backend: { internal: true } },
    configs: {
      'settleora-caddyfile': { content: `{\n  admin off\n  auto_https off\n  log default {\n    level ERROR\n    format filter {\n      wrap json\n      fields { request delete }\n    }\n  }\n}\nhttps://${config.hostname}:8443 {\n  tls /run/settleora-tls/tls.crt /run/settleora-tls/tls.key\n  reverse_proxy api:8080\n}\n` },
      'settleora-caddy-entrypoint': { content: CADDY_ENTRYPOINT },
      'settleora-tls-certificate': { content: '-----BEGIN CERTIFICATE-----\nREDACTED_FAKE_CERTIFICATE_CHAIN\n-----END CERTIFICATE-----\n' },
      'settleora-tls-private-key': { content: '-----BEGIN PRIVATE KEY-----\nREDACTED_FAKE_PRIVATE_KEY\n-----END PRIVATE KEY-----\n' },
      'settleora-migrate-entrypoint': { content: MIGRATE_ENTRYPOINT },
      'settleora-api-entrypoint': { content: API_ENTRYPOINT },
      'settleora-rabbitmq-entrypoint': { content: RABBITMQ_IDENTITY_GUARD },
    },
    'x-settleora-release': officialValues(identity, config).release_identity,
  };
  validateTopology(compose, identity, config);
  return compose;
}

function publishedPorts(service) {
  return Array.isArray(service.ports) ? service.ports : [];
}

export function validateTopology(compose, identity, config) {
  const names = Object.keys(compose?.services ?? {}).sort();
  if (canonicalJson(names) !== canonicalJson(REQUIRED_SERVICES)) fail('Rendered service set is unsupported');
  for (const [name, service] of Object.entries(compose.services)) {
    if (name !== 'ingress' && publishedPorts(service).length) fail(`${name} must not publish host ports`);
    if (service.platform !== 'linux/amd64') fail(`${name} uses the wrong runtime platform`);
    if (!service.image.includes('@sha256:') || /:(?:main|latest)(?:@|$)/u.test(service.image)) fail(`${name} image is mutable-only`);
  }
  const expectedImages = { api: identity.images.api, ingress: identity.images.caddy, migrate: identity.images.api, postgres: identity.images.postgres, rabbitmq: identity.images.rabbitmq };
  for (const [name, expectedImage] of Object.entries(expectedImages)) {
    if (compose.services[name].image !== expectedImage) fail(`${name} image does not match the R03-selected runtime identity`);
  }
  const ingressPorts = publishedPorts(compose.services.ingress);
  if (ingressPorts.length !== 1 || ingressPorts[0].host_ip !== config.bindAddress || ingressPorts[0].target !== 8443 || ingressPorts[0].protocol !== 'tcp') fail('Ingress publication is unsafe');
  if (compose.services.api.image !== compose.services.migrate.image) fail('API and migrate image identity mismatch');
  const apiHealth = compose.services.api.healthcheck?.test;
  if (!Array.isArray(apiHealth) || apiHealth[0] !== 'CMD-SHELL' || !apiHealth[1]?.includes('/bin/bash') || !apiHealth[1]?.includes('/health/ready') || apiHealth[1]?.includes('curl')) fail('API dependency-aware readiness healthcheck is missing');
  if (compose.services.api.environment?.HOME !== '/var/lib/settleora/storage/.settleora-home') fail('API data-protection key home is not persistent within the existing storage layout');
  const passkeyOrigin = config.httpsPort === 443 ? `https://${config.hostname}` : `https://${config.hostname}:${config.httpsPort}`;
  if (compose.services.api.environment?.Auth__Passkeys__RelyingPartyId !== config.hostname || compose.services.api.environment?.Auth__Passkeys__AllowedOrigins__0 !== passkeyOrigin) fail('Passkey relying-party identity is not bound to the private HTTPS origin');
  if (compose.services.ingress.depends_on?.api?.condition !== 'service_healthy') fail('Ingress API-readiness gate is missing');
  if (canonicalJson(compose.services.api.entrypoint) !== canonicalJson(['/bin/sh', '/usr/local/bin/settleora-api-entrypoint.sh'])) fail('API storage preflight entrypoint is missing');
  const apiEntrypoint = String(compose.configs?.['settleora-api-entrypoint']?.content ?? '').replaceAll('$$', '$');
  for (const required of ['data_path=/var/lib/settleora/storage', 'id -u', 'id -g', '[ -r "$data_path" ]', '[ -w "$data_path" ]', '[ -x "$data_path" ]', '.settleora-write-probe-$', 'mkdir -p "$data_path/.settleora-home"', 'chmod 0700 "$data_path/.settleora-home"', 'exec dotnet Settleora.Api.dll']) if (!apiEntrypoint.includes(required)) fail('API UID/GID 999 storage preflight is incomplete');
  if (canonicalJson(compose.services.ingress.entrypoint) !== canonicalJson(['/bin/sh', '/usr/local/bin/settleora-caddy-entrypoint.sh']) || compose.services.ingress.healthcheck?.test?.[1] !== '/tmp/settleora-caddy') fail('Ingress does not preserve capability-free Caddy startup');
  const caddyEntrypoint = String(compose.configs?.['settleora-caddy-entrypoint']?.content ?? '').replaceAll('$$', '$');
  for (const required of ['cp /usr/bin/caddy /tmp/settleora-caddy', 'chmod 0555 /tmp/settleora-caddy', 'exec /tmp/settleora-caddy "$@"']) if (!caddyEntrypoint.includes(required)) fail('Capability-free Caddy entrypoint is incomplete');
  if (compose.services.api.depends_on?.migrate?.condition !== 'service_completed_successfully') fail('API migration-success gate is missing');
  const migrateEntrypoint = String(compose.configs?.['settleora-migrate-entrypoint']?.content ?? '').replaceAll('$$', '$');
  for (const required of ['validate-only)', '--mode=validate-only', '--mode=check-only', 'managed-auto|apply-safe|manual|check-only)']) if (!migrateEntrypoint.includes(required)) fail('Migration startup gate is incomplete');
  if (compose.services.migrate.depends_on?.postgres?.condition !== 'service_healthy') fail('Migration PostgreSQL-readiness gate is missing');
  if (compose.services.api.depends_on?.postgres?.condition !== 'service_healthy' || compose.services.api.depends_on?.rabbitmq?.condition !== 'service_healthy') fail('API dependency-readiness gate is missing');
  if (compose.services.rabbitmq.hostname !== config.rabbitmq.nodeHostname || compose.services.rabbitmq.environment?.RABBITMQ_NODENAME !== `rabbit@${config.rabbitmq.nodeHostname}`) fail('RabbitMQ persistence identity is contradictory');
  const rabbitGuard = String(compose.configs?.['settleora-rabbitmq-entrypoint']?.content ?? '').replaceAll('$$', '$');
  for (const required of ['expected_nodename="rabbit@$(hostname -s)"', 'RABBITMQ_MNESIA_BASE', 'persisted_nodename', 'exit 64', 'exit 65', 'exit 66']) {
    if (!rabbitGuard.includes(required)) fail('RabbitMQ persistence identity guard is incomplete');
  }
  if (!compose.networks?.ingress?.internal || !compose.networks?.backend?.internal) fail('Backend networks must be internal');
  if (compose.networks?.edge?.internal) fail('Ingress edge network cannot be internal');
  if (publishedPorts(compose.services.api).length || publishedPorts(compose.services.postgres).length || publishedPorts(compose.services.rabbitmq).length || publishedPorts(compose.services.migrate).length) fail('Private service exposure detected');
  const caddy = String(compose.configs?.['settleora-caddyfile']?.content ?? '');
  if (!caddy.includes(`https://${config.hostname}:8443`) || !caddy.includes('auto_https off') || !caddy.includes('tls /run/settleora-tls/tls.crt /run/settleora-tls/tls.key') || !caddy.includes('reverse_proxy api:8080')) fail('Private HTTPS topology is incomplete');
  if (caddy.includes('acme') || caddy.includes('http://')) fail('Automatic or HTTP-only ingress is unsupported');
  const volumeTargets = Object.values(compose.services).flatMap((service) => service.volumes ?? []).map((volume) => volume.target);
  for (const required of ['/var/lib/postgresql/data', '/var/lib/rabbitmq', '/var/lib/settleora/storage']) if (!volumeTargets.includes(required)) fail('Required persistent dataset mapping is missing');
  return compose;
}

function treeRecords(root) {
  const records = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const current = path.join(directory, entry.name);
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) fail('Package source contains a symlink or special file');
      if (entry.isDirectory()) walk(current);
      else records.push({ path: path.relative(root, current), sha256: sha256(readFileSync(current)), size: lstatSync(current).size });
    }
  };
  walk(root);
  return records;
}

export function directoryContentIdentity(root) {
  const records = treeRecords(root);
  return { sha256: sha256(canonicalJson(records)), fileCount: records.length };
}

export function validateStaticTree(root = packageSource) {
  treeRecords(root);
  const app = YAML.parse(readFileSync(path.join(root, 'app.yaml'), 'utf8'));
  exactKeys(app, ['app_version', 'capabilities', 'categories', 'date_added', 'description', 'home', 'host_mounts', 'icon', 'keywords', 'lib_version', 'lib_version_hash', 'maintainers', 'name', 'run_as_context', 'screenshots', 'sources', 'title', 'train', 'version'], 'app.yaml');
  if (app.name !== 'settleora' || app.title !== 'Settleora' || app.train !== 'community' || app.lib_version !== OFFICIAL_LIBRARY_VERSION || app.lib_version_hash !== OFFICIAL_LIBRARY_HASH || app.screenshots.length !== 0) fail('app.yaml metadata is invalid');
  const questions = YAML.parse(readFileSync(path.join(root, 'questions.yaml'), 'utf8'));
  exactKeys(questions, ['groups', 'questions'], 'questions.yaml');
  const text = readFileSync(path.join(root, 'questions.yaml'), 'utf8');
  for (const forbidden of ['force-allow-destructive', 'public registration', 'worker-ocr', 'web-admin', 'web-user', 'minio', 'oidc', 'passkey', 'mfa', 'additional_envs']) {
    if (text.toLowerCase().includes(forbidden)) fail('questions.yaml exposes unsupported behavior');
  }
  const template = readFileSync(path.join(root, 'templates/docker-compose.yaml'), 'utf8');
  if (template.split('__SETTLEORA_RELEASE_LOCK__').length !== 2) fail('Template release-lock marker must occur exactly once');
  const library = path.join(root, 'templates/library/base_v2_3_11');
  if (!lstatSync(library).isDirectory()) fail('Pinned official TrueNAS library is missing');
  const libraryIdentity = directoryContentIdentity(library);
  if (libraryIdentity.fileCount !== 78 || libraryIdentity.sha256 !== OFFICIAL_LIBRARY_CONTENT_HASH) fail('Pinned official TrueNAS library content mismatch');
}

function safeOutputRoot(output) {
  const absolute = path.resolve(output);
  const parent = path.dirname(absolute);
  const parentReal = realpathSync(parent);
  if (absolute === parent || !absolute.startsWith(`${parentReal}${path.sep}`)) fail('Output path is unsafe');
  try {
    lstatSync(absolute);
    fail('Output path already exists');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  mkdirSync(absolute, { mode: 0o700 });
  return absolute;
}

function packageSourceIdentity() {
  const records = treeRecords(packageSource);
  const commit = execFileSync('git', ['--no-replace-objects', 'rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  const tree = execFileSync('git', ['--no-replace-objects', 'rev-parse', 'HEAD^{tree}'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  const tracked = execFileSync('git', ['--no-replace-objects', 'ls-tree', '-r', '--name-only', 'HEAD', '--', 'infra/truenas-catalog/settleora'], { cwd: repoRoot, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const cleanAgainstHead = spawnSync('git', ['--no-replace-objects', 'diff', '--quiet', 'HEAD', '--', 'infra/truenas-catalog/settleora'], { cwd: repoRoot }).status === 0;
  return { path: 'infra/truenas-catalog/settleora', repositoryCommit: commit, repositoryTree: tree, trackedAtCommit: tracked.length === records.length && cleanAgainstHead, contentSha256: sha256(canonicalJson(records)), fileCount: records.length };
}

export function materialize({ manifest, expectedIdentityDigest, config, output, sourceRepo = repoRoot }) {
  validateStaticTree();
  const identity = consumeReleaseIdentity(manifest, expectedIdentityDigest, sourceRepo);
  validateConfig(config);
  const sourceIdentity = packageSourceIdentity();
  if (!sourceIdentity.trackedAtCommit) fail('Package source must exactly match the current repository commit');
  const root = safeOutputRoot(output);
  const packageRoot = path.join(root, 'package');
  cpSync(packageSource, packageRoot, { recursive: true, dereference: false, errorOnExist: true });
  const appPath = path.join(packageRoot, 'app.yaml');
  const app = YAML.parse(readFileSync(appPath, 'utf8'));
  app.app_version = `${identity.manifest.android.semanticVersion}+day1.${identity.manifest.source.commit.slice(0, 12)}`;
  writeFileSync(appPath, canonicalJson(app), { mode: 0o600 });
  const baseValues = YAML.parse(readFileSync(path.join(packageRoot, 'ix_values.yaml'), 'utf8'));
  baseValues.images = imageValues(identity);
  baseValues.release_identity = officialValues(identity, config).release_identity;
  writeFileSync(path.join(packageRoot, 'ix_values.yaml'), canonicalJson(baseValues), { mode: 0o600 });
  const templatePath = path.join(packageRoot, 'templates/docker-compose.yaml');
  const template = readFileSync(templatePath, 'utf8');
  const releaseLock = canonicalJson({
    TZ: baseValues.TZ,
    consts: baseValues.consts,
    images: baseValues.images,
    release_identity: baseValues.release_identity,
    resources: baseValues.resources,
    skip_id_variables: baseValues.skip_id_variables,
  });
  if (template.split('__SETTLEORA_RELEASE_LOCK__').length !== 2) fail('Materialized template release-lock marker is invalid');
  writeFileSync(templatePath, template.replace('__SETTLEORA_RELEASE_LOCK__', releaseLock), { mode: 0o600 });
  const testValues = officialValues(identity, config);
  mkdirSync(path.join(packageRoot, 'templates/test_values'), { recursive: true, mode: 0o700 });
  writeFileSync(path.join(packageRoot, 'templates/test_values/render-values.yaml'), canonicalJson(testValues), { mode: 0o600 });
  const compose = renderCompose(identity, config);
  mkdirSync(path.join(root, 'rendered'), { mode: 0o700 });
  const composeBytes = canonicalJson(compose);
  writeFileSync(path.join(root, 'rendered/docker-compose.yaml'), composeBytes, { mode: 0o600 });
  const configDigest = sha256(canonicalJson({ ...config, postgres: { ...config.postgres, password: '<redacted>' }, rabbitmq: { ...config.rabbitmq, password: '<redacted>' } }));
  const materializedPackage = directoryContentIdentity(packageRoot);
  const plan = {
    schema: PACKAGE_SCHEMA,
    package: { name: 'settleora', version: app.version, appVersion: app.app_version, officialAppsCommit: OFFICIAL_APPS_COMMIT, libraryVersion: OFFICIAL_LIBRARY_VERSION, libraryHash: OFFICIAL_LIBRARY_HASH },
    packageSource: sourceIdentity,
    materializedPackage,
    applicationRelease: { candidateId: identity.manifest.source.candidateId, commit: identity.manifest.source.commit, tree: identity.manifest.source.tree, identityDigest: identity.manifest.identityDigest },
    runtime: { platform: 'linux/amd64', digestAuthority: 'selected-platform-manifest', images: identity.images, indexDigests: { api: identity.manifest.apiImage.indexDigest, caddy: dependency(identity.manifest, 'caddy').indexDigest, postgres: dependency(identity.manifest, 'postgres').indexDigest, rabbitmq: dependency(identity.manifest, 'rabbitmq').indexDigest } },
    sanitizedConfigSha256: configDigest,
    renderedComposeSha256: sha256(composeBytes),
    services: REQUIRED_SERVICES,
    networks: { bindAddress: config.bindAddress, httpsPort: config.httpsPort, edge: 'ingress-publication-only', ingress: 'internal', backend: 'internal' },
    datasets: ['api-storage', 'postgres', 'rabbitmq'],
    migration: { firstClassJob: true, mode: config.migrationMode, postgresReadinessGate: true, apiSuccessGate: true, imageMatchesApi: true },
    tls: { externalCertificateReference: true, hostname: config.hostname, exactHostname: true, automaticCertificateManagement: false, httpOnlyIngress: false },
    secrets: { realSecretsIncluded: false, logValues: false },
    actions: { published: false, deployed: false, hostMutated: false, migrationApplied: false },
  };
  const planBytes = canonicalJson(plan);
  writeFileSync(path.join(root, 'install-plan.json'), planBytes, { mode: 0o600 });
  return { output: root, packageRoot, compose, plan, packetSha256: sha256(planBytes + composeBytes + canonicalJson(materializedPackage)) };
}

function args(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) fail('Arguments must use --name value pairs');
    parsed[key.slice(2)] = value;
  }
  for (const required of ['manifest', 'expected-identity-digest', 'config', 'output']) if (!parsed[required]) fail(`--${required} is required`);
  const extra = Object.keys(parsed).filter((key) => !['manifest', 'expected-identity-digest', 'config', 'output', 'source-repo'].includes(key));
  if (extra.length) fail('Unsupported argument');
  return parsed;
}

export function main(argv = process.argv.slice(2)) {
  const options = args(argv);
  const result = materialize({ manifest: safeReadJson(options.manifest, 'manifest'), expectedIdentityDigest: options['expected-identity-digest'], config: safeReadJson(options.config, 'config'), output: options.output, sourceRepo: options['source-repo'] ? realpathSync(options['source-repo']) : repoRoot });
  process.stdout.write(`${canonicalJson({ schema: PACKAGE_SCHEMA, packetSha256: result.packetSha256, renderedComposeSha256: result.plan.renderedComposeSha256, realSecretsIncluded: false, published: false, deployed: false })}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write('TrueNAS catalog render refused: invalid or unsafe input\n');
    process.exitCode = 1;
  }
}

export { SECRET_MARKERS };
