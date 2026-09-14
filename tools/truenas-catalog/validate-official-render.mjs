import { readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { canonicalJson } from '../release/day1-release-identity.mjs';
import { directoryContentIdentity, PACKAGE_SCHEMA, sha256 } from './render.mjs';

const fail = (message) => { throw new Error(message); };
const preflight = process.argv.length === 3 && process.argv[2] === '--preflight';
if (preflight) {
  const plan = JSON.parse(readFileSync(4, 'utf8'));
  if (plan.schema !== PACKAGE_SCHEMA) fail('Install-plan schema mismatch');
  if (canonicalJson(directoryContentIdentity('package')) !== canonicalJson(plan.materializedPackage)) fail('Materialized package identity mismatch');
  process.stdout.write(`${canonicalJson({ schema: 'settleora.truenas-materialized-package-validation.v1', packageSha256: plan.materializedPackage.sha256 })}`);
} else {
if (process.argv.length !== 2) fail('Official-render validation accepts input only on fixed file descriptors');
const compose = YAML.parse(readFileSync(3, 'utf8'));
const plan = JSON.parse(readFileSync(4, 'utf8'));
const privateValues = YAML.parse(readFileSync(5, 'utf8'));
const privateRenderIdentity = JSON.parse(readFileSync(6, 'utf8'));
const directRenderedCompose = readFileSync(7);
const directCompose = YAML.parse(directRenderedCompose.toString('utf8'));
if (plan.schema !== PACKAGE_SCHEMA) fail('Install-plan schema mismatch');
if (privateRenderIdentity.schema !== 'settleora.truenas-private-render-identity.v1' || privateRenderIdentity.renderedComposeSha256 !== sha256(directRenderedCompose)) fail('Private rendered Compose identity mismatch');
const names = Object.keys(compose.services ?? {}).sort();
if (canonicalJson(names) !== canonicalJson(['api', 'ingress', 'migrate', 'postgres', 'rabbitmq'])) fail('Official render service set mismatch');
const expectedTopLevelKeys = ['configs', 'networks', 'services', 'volumes', 'x-action-required', 'x-notes', 'x-portals', 'x-settleora-release'];
if (canonicalJson(Object.keys(compose).sort()) !== canonicalJson(expectedTopLevelKeys)) fail('Official render top-level contract mismatch');
const expectedServiceKeys = {
  api: ['cap_drop', 'configs', 'depends_on', 'deploy', 'entrypoint', 'environment', 'expose', 'group_add', 'healthcheck', 'image', 'networks', 'platform', 'privileged', 'restart', 'security_opt', 'stdin_open', 'tty', 'volumes'],
  ingress: ['cap_drop', 'command', 'configs', 'depends_on', 'deploy', 'entrypoint', 'environment', 'group_add', 'healthcheck', 'image', 'networks', 'platform', 'ports', 'privileged', 'read_only', 'restart', 'security_opt', 'stdin_open', 'tmpfs', 'tty', 'user', 'volumes'],
  migrate: ['cap_drop', 'command', 'configs', 'depends_on', 'deploy', 'entrypoint', 'environment', 'group_add', 'healthcheck', 'image', 'networks', 'platform', 'privileged', 'restart', 'security_opt', 'stdin_open', 'tty'],
  postgres: ['deploy', 'environment', 'group_add', 'healthcheck', 'image', 'networks', 'platform', 'privileged', 'restart', 'security_opt', 'stdin_open', 'tty', 'volumes'],
  rabbitmq: ['command', 'configs', 'deploy', 'entrypoint', 'environment', 'group_add', 'healthcheck', 'hostname', 'image', 'networks', 'platform', 'privileged', 'restart', 'security_opt', 'stdin_open', 'tty', 'volumes'],
};
for (const [name, service] of Object.entries(compose.services)) {
  if (canonicalJson(Object.keys(service).sort()) !== canonicalJson(expectedServiceKeys[name])) fail(`${name} service field contract mismatch`);
  if (service.platform !== 'linux/amd64') fail(`${name} platform mismatch`);
  if (!service.image?.includes('@sha256:') || /:(?:main|latest)(?:@|$)/u.test(service.image)) fail(`${name} image is not immutable`);
  if (name !== 'ingress' && (service.ports?.length ?? 0) !== 0) fail(`${name} unexpectedly publishes a port`);
  if (canonicalJson(service.deploy) !== canonicalJson({ resources: { limits: { cpus: '4', memory: '4096M' } } })) fail(`${name} resource limit contract mismatch`);
  if (canonicalJson(service.group_add) !== canonicalJson([568]) || service.stdin_open !== false || service.tty !== false) fail(`${name} official runtime defaults mismatch`);
  if (service.restart !== directCompose.services?.[name]?.restart) fail(`${name} restart policy mismatch`);
}
const securityContext = (service) => Object.fromEntries(['user', 'read_only', 'cap_add', 'cap_drop', 'security_opt', 'privileged', 'pid', 'ipc'].filter((key) => service[key] !== undefined).map((key) => [key, service[key]]));
const expectedSecurityContexts = {
  api: { cap_drop: ['ALL'], security_opt: ['no-new-privileges=true'], privileged: false },
  ingress: { user: '1000:1000', read_only: true, cap_drop: ['ALL'], security_opt: ['no-new-privileges=true'], privileged: false },
  migrate: { cap_drop: ['ALL'], security_opt: ['no-new-privileges=true'], privileged: false },
  postgres: { security_opt: ['no-new-privileges=true'], privileged: false },
  rabbitmq: { security_opt: ['no-new-privileges=true'], privileged: false },
};
for (const [name, expected] of Object.entries(expectedSecurityContexts)) {
  if (canonicalJson(securityContext(compose.services[name])) !== canonicalJson(expected)) fail(`${name} security context mismatch`);
}
const expectedImages = { api: plan.runtime?.images?.api, ingress: plan.runtime?.images?.caddy, migrate: plan.runtime?.images?.api, postgres: plan.runtime?.images?.postgres, rabbitmq: plan.runtime?.images?.rabbitmq };
for (const [name, expectedImage] of Object.entries(expectedImages)) {
  if (typeof expectedImage !== 'string' || compose.services[name].image !== expectedImage) fail(`${name} image does not match the R03-selected runtime identity`);
}
const serviceInvocation = (service) => ({ entrypoint: service.entrypoint ?? null, command: service.command ?? null });
for (const name of names) {
  if (canonicalJson(serviceInvocation(compose.services[name])) !== canonicalJson(serviceInvocation(directCompose.services?.[name] ?? {}))) fail(`Official ${name} invocation does not match the trusted direct render`);
  if (canonicalJson(compose.services[name].depends_on ?? null) !== canonicalJson(directCompose.services?.[name]?.depends_on ?? null)) fail(`Official ${name} dependency contract does not match the trusted direct render`);
}
if (compose.services.api.environment?.HOME !== '/var/lib/settleora/storage/.settleora-home') fail('Official API data-protection key home is not persistent within the existing storage layout');
const privateHostname = privateValues.network?.hostname;
const privateHttpsPort = privateValues.network?.https_port;
const passkeyOrigin = privateHttpsPort === 443 ? `https://${privateHostname}` : `https://${privateHostname}:${privateHttpsPort}`;
if (compose.services.api.environment?.Auth__Passkeys__RelyingPartyId !== privateHostname || compose.services.api.environment?.Auth__Passkeys__AllowedOrigins__0 !== passkeyOrigin) fail('Official passkey relying-party identity mismatch');
const privateSettleora = privateValues.settleora ?? {};
const connection = `Host=postgres;Port=5432;Database=${privateSettleora.postgres_database};Username=${privateSettleora.postgres_user};Password=${privateSettleora.postgres_password}`;
const withOfficialStartInterval = (healthcheck) => ({ ...healthcheck, start_interval: '2s' });
const expectedHealthchecks = {
  api: withOfficialStartInterval(directCompose.services?.api?.healthcheck ?? {}),
  ingress: withOfficialStartInterval(directCompose.services?.ingress?.healthcheck ?? {}),
  migrate: { disable: true },
  postgres: {
    interval: '30s', retries: 5, start_interval: '2s', start_period: '15s', timeout: '5s',
    test: ['CMD', 'pg_isready', '-h', '127.0.0.1', '-p', '5432', '-U', privateSettleora.postgres_user, '-d', privateSettleora.postgres_database],
  },
  rabbitmq: withOfficialStartInterval(directCompose.services?.rabbitmq?.healthcheck ?? {}),
};
for (const [service, expected] of Object.entries(expectedHealthchecks)) {
  if (canonicalJson(compose.services[service].healthcheck ?? {}) !== canonicalJson(expected)) fail(`Official ${service} healthcheck does not match the trusted render contract`);
}
const commonEnvironment = { NVIDIA_VISIBLE_DEVICES: 'void', TZ: 'Etc/UTC', UMASK: '002', UMASK_SET: '002' };
const expectedEnvironment = {
  api: {
    ...commonEnvironment,
    ASPNETCORE_ENVIRONMENT: 'Production', ASPNETCORE_URLS: 'http://+:8080', HOME: '/var/lib/settleora/storage/.settleora-home', Settleora__Database__ConnectionString: connection,
    Auth__Passkeys__RelyingPartyId: privateHostname, Auth__Passkeys__AllowedOrigins__0: passkeyOrigin,
    Settleora__RabbitMq__HostName: 'rabbitmq', Settleora__RabbitMq__Port: '5672', Settleora__RabbitMq__UserName: privateSettleora.rabbitmq_user,
    Settleora__RabbitMq__Password: privateSettleora.rabbitmq_password, Settleora__RabbitMq__VirtualHost: '/', Settleora__Storage__Provider: 'Local', Settleora__Storage__RootPath: '/var/lib/settleora/storage',
  },
  ingress: { ...commonEnvironment },
  migrate: { ...commonEnvironment, ASPNETCORE_ENVIRONMENT: 'Production', Settleora__Database__ConnectionString: connection, SETTLEORA_DATABASE_MIGRATION_MODE: privateSettleora.migration_mode },
  postgres: { ...commonEnvironment, POSTGRES_DB: privateSettleora.postgres_database, POSTGRES_USER: privateSettleora.postgres_user, POSTGRES_PASSWORD: privateSettleora.postgres_password },
  rabbitmq: { ...commonEnvironment, RABBITMQ_DEFAULT_USER: privateSettleora.rabbitmq_user, RABBITMQ_DEFAULT_PASS: privateSettleora.rabbitmq_password, RABBITMQ_NODENAME: `rabbit@${privateSettleora.rabbitmq_node_hostname}` },
};
for (const [service, expected] of Object.entries(expectedEnvironment)) {
  if (canonicalJson(compose.services[service].environment ?? {}) !== canonicalJson(expected)) fail(`Official ${service} dependency environment mismatch`);
}
const normalizedConfigContent = (document, name) => {
  const content = document.configs?.[name]?.content;
  if (typeof content !== 'string') fail(`Rendered ${name} config content is missing`);
  return content.replaceAll('$$', '$');
};
for (const name of ['settleora-api-entrypoint', 'settleora-caddy-entrypoint', 'settleora-caddyfile', 'settleora-migrate-entrypoint', 'settleora-rabbitmq-entrypoint']) {
  if (normalizedConfigContent(compose, name) !== normalizedConfigContent(directCompose, name)) fail(`Official ${name} config content does not match the trusted direct render`);
}
if (compose.services.ingress.depends_on?.api?.condition !== 'service_healthy') fail('Official ingress API-readiness gate missing');
if (canonicalJson(compose.services.api.entrypoint) !== canonicalJson(['/bin/sh', '/usr/local/bin/settleora-api-entrypoint.sh'])) fail('Official API storage preflight entrypoint is missing');
const apiEntrypoint = normalizedConfigContent(compose, 'settleora-api-entrypoint');
for (const required of ['data_path=/var/lib/settleora/storage', 'id -u', 'id -g', '[ -r "$data_path" ]', '[ -w "$data_path" ]', '[ -x "$data_path" ]', 'mktemp -d "$data_path/.settleora-write-probe.XXXXXXXXXX"', '[ ! -L "$home_path" ]', 'readlink -f -- "$data_path"', '[ "$home_real" = "$data_real/.settleora-home" ]', '[ ! -L "$aspnet_path" ]', '[ "$aspnet_real" = "$home_real/.aspnet" ]', '[ ! -L "$keys_path" ]', '[ "$keys_real" = "$aspnet_real/DataProtection-Keys" ]', 'unsafe stale data-protection write probe', 'stat -c %u -- "$stale_probe"', 'every restored data-protection key entry must be a readable regular non-link file', 'trap cleanup_keys_probe EXIT HUP INT TERM', 'mktemp "$keys_path/.settleora-write-probe.XXXXXXXXXX"', 'exec dotnet Settleora.Api.dll']) if (!apiEntrypoint.includes(required)) fail('Official API UID/GID 999 storage preflight is incomplete');
if (canonicalJson(compose.services.ingress.entrypoint) !== canonicalJson(['/bin/sh', '/usr/local/bin/settleora-caddy-entrypoint.sh']) || compose.services.ingress.healthcheck?.test?.[1] !== '/tmp/settleora-caddy') fail('Official ingress does not preserve capability-free Caddy startup');
const caddyEntrypoint = normalizedConfigContent(compose, 'settleora-caddy-entrypoint');
for (const required of ['[ ! -L /tmp/settleora-caddy ]', 'stat -c %u -- /tmp/settleora-caddy', 'rm -f -- /tmp/settleora-caddy', 'cp /usr/bin/caddy /tmp/settleora-caddy', 'chmod 0555 /tmp/settleora-caddy', 'exec /tmp/settleora-caddy "$@"']) if (!caddyEntrypoint.includes(required)) fail('Official capability-free Caddy entrypoint is incomplete');
const port = compose.services.ingress.ports?.[0];
const expectedIngressPort = { host_ip: privateValues.network?.bind_address, mode: 'ingress', protocol: 'tcp', published: Number(privateHttpsPort), target: 8443 };
if (compose.services.ingress.ports?.length !== 1 || canonicalJson(port) !== canonicalJson(expectedIngressPort)) fail('Official ingress publication mismatch');
const octets = String(port.host_ip).split('.').map(Number);
if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  || !(octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168))) fail('Official ingress is not bound to RFC1918');
if (compose.services.api.image !== compose.services.migrate.image) fail('Official API/migrate image mismatch');
if (compose.services.api.depends_on?.migrate?.condition !== 'service_completed_successfully') fail('Official migration-success gate missing');
const migrateEntrypoint = normalizedConfigContent(compose, 'settleora-migrate-entrypoint');
for (const required of ['validate-only)', '--mode=validate-only', '--mode=check-only', 'managed-auto|apply-safe|manual|check-only)']) if (!migrateEntrypoint.includes(required)) fail('Official migration startup gate is incomplete');
if (compose.services.migrate.depends_on?.postgres?.condition !== 'service_healthy') fail('Official migration PostgreSQL gate missing');
if (compose.services.api.depends_on?.postgres?.condition !== 'service_healthy' || compose.services.api.depends_on?.rabbitmq?.condition !== 'service_healthy') fail('Official API dependency gate missing');
if (compose.services.rabbitmq.environment?.RABBITMQ_NODENAME !== `rabbit@${compose.services.rabbitmq.hostname}`) fail('Official RabbitMQ identity mismatch');
const rabbitGuard = normalizedConfigContent(compose, 'settleora-rabbitmq-entrypoint');
for (const required of ['expected_nodename="rabbit@$(hostname -s)"', 'RABBITMQ_MNESIA_BASE', '[ ! -L "$mnesia_base" ]', 'readlink -f -- "$mnesia_base"', '[ ! -L "$candidate" ]', 'persisted_nodename', 'exit 64', 'exit 65', 'exit 66', 'exit 67']) if (!rabbitGuard.includes(required)) fail('Official RabbitMQ identity guard is incomplete');
const internalNetworks = Object.entries(compose.networks ?? {}).filter(([, network]) => network?.internal === true && network?.labels?.['tn.network.internal'] === 'true').map(([name]) => name);
const ingressNetwork = internalNetworks.filter((name) => name === 'ingress' || name.endsWith('-ingress'));
const backendNetwork = internalNetworks.filter((name) => name === 'backend' || name.endsWith('-backend'));
if (internalNetworks.length !== 2 || ingressNetwork.length !== 1 || backendNetwork.length !== 1 || ingressNetwork[0] === backendNetwork[0]
  || !compose.networks.edge || compose.networks.edge?.internal === true || compose.networks.edge?.labels?.['tn.network.internal'] === 'true') fail('Official private network topology mismatch');
const memberships = (service) => Object.keys(service.networks ?? {}).sort();
const expectedMemberships = {
  ingress: ['edge', ingressNetwork[0]].sort(),
  api: [backendNetwork[0], ingressNetwork[0]].sort(),
  migrate: [backendNetwork[0]],
  postgres: [backendNetwork[0]],
  rabbitmq: [backendNetwork[0]],
};
for (const [service, expected] of Object.entries(expectedMemberships)) {
  if (canonicalJson(memberships(compose.services[service])) !== canonicalJson(expected)) fail(`Official ${service} network boundary mismatch`);
}
const expectedNetworkAttachments = {
  ingress: { edge: { gw_priority: 1 }, [ingressNetwork[0]]: {} },
  api: { [backendNetwork[0]]: {}, [ingressNetwork[0]]: {} },
  migrate: { [backendNetwork[0]]: {} },
  postgres: { [backendNetwork[0]]: {} },
  rabbitmq: { [backendNetwork[0]]: {} },
};
for (const [service, expected] of Object.entries(expectedNetworkAttachments)) {
  if (canonicalJson(compose.services[service].networks) !== canonicalJson(expected)) fail(`Official ${service} network attachment contract mismatch`);
}
if (canonicalJson(Object.keys(compose.networks).sort()) !== canonicalJson(['edge', backendNetwork[0], ingressNetwork[0]].sort())) fail('Official network set mismatch');
const expectedNetworks = {
  edge: {},
  [backendNetwork[0]]: { enable_ipv6: false, external: false, internal: true, labels: { 'tn.network.internal': 'true' }, name: backendNetwork[0] },
  [ingressNetwork[0]]: { enable_ipv6: false, external: false, internal: true, labels: { 'tn.network.internal': 'true' }, name: ingressNetwork[0] },
};
if (canonicalJson(compose.networks) !== canonicalJson(expectedNetworks)) fail('Official network definition contract mismatch');
const expectedTargets = { api: '/var/lib/settleora/storage', postgres: '/var/lib/postgresql/data', rabbitmq: '/var/lib/rabbitmq' };
const expectedSources = { api: privateValues.storage?.api_storage_dataset, postgres: privateValues.storage?.postgres_dataset, rabbitmq: privateValues.storage?.rabbitmq_dataset };
const datasetSources = [];
for (const [service, target] of Object.entries(expectedTargets)) {
  const volumes = compose.services[service].volumes ?? [];
  const volume = volumes[0];
  const expectedVolume = { bind: { create_host_path: false, propagation: 'rprivate' }, read_only: false, source: expectedSources[service], target, type: 'bind' };
  if (volumes.length !== 1 || canonicalJson(volume) !== canonicalJson(expectedVolume)
    || typeof volume?.source !== 'string' || !/^\/mnt\/[A-Za-z0-9._/-]+$/u.test(volume.source) || path.posix.normalize(volume.source) !== volume.source || volume.source.includes('..') || volume.source.endsWith('/')) fail(`Official ${service} dataset mapping mismatch`);
  if (volume.source !== expectedSources[service]) fail(`Official ${service} dataset source does not match its private configured role`);
  datasetSources.push(volume.source);
}
const ingressVolumes = compose.services.ingress.volumes ?? [];
const ingressScratch = ingressVolumes[0];
const expectedIngressScratch = { read_only: false, source: 'settleora-caddy-bin', target: '/tmp', type: 'volume', volume: { nocopy: false } };
if (ingressVolumes.length !== 1 || canonicalJson(ingressScratch) !== canonicalJson(expectedIngressScratch)
  || canonicalJson(compose.volumes?.['settleora-caddy-bin']) !== canonicalJson({}) || (compose.services.migrate.volumes?.length ?? 0) !== 0 || new Set(datasetSources).size !== 3
  || datasetSources.some((source, index) => datasetSources.some((other, otherIndex) => index !== otherIndex && source.startsWith(`${other}/`)))) fail('Official persistent dataset ownership or separation mismatch');
if (canonicalJson(Object.keys(compose.volumes ?? {})) !== canonicalJson(['settleora-caddy-bin'])
  || canonicalJson(compose.services.ingress.tmpfs) !== canonicalJson(['/config:gid=1000,mode=0700,uid=1000', '/data:gid=1000,mode=0700,uid=1000'])
  || canonicalJson(compose.services.api.expose) !== canonicalJson(['8080/tcp'])) fail('Official ephemeral storage or internal API exposure contract mismatch');
const caddy = String(compose.configs?.['settleora-caddyfile']?.content ?? '');
if (!caddy.includes('auto_https off') || !caddy.includes(`https://${privateHostname}:8443`) || !caddy.includes('tls /run/settleora-tls/tls.crt /run/settleora-tls/tls.key') || !caddy.includes('reverse_proxy api:8080') || caddy.includes('acme') || caddy.includes('http://')) fail('Official private TLS topology mismatch');
const expectedIngressConfigs = [
  { mode: 365, source: 'settleora-caddy-entrypoint', target: '/usr/local/bin/settleora-caddy-entrypoint.sh' },
  { mode: 292, source: 'settleora-caddyfile', target: '/etc/caddy/Caddyfile' },
  { mode: 292, source: 'settleora-tls-certificate', target: '/run/settleora-tls/tls.crt' },
  { mode: 256, source: 'settleora-tls-private-key', target: '/run/settleora-tls/tls.key' },
];
if (canonicalJson(compose.services.ingress.configs) !== canonicalJson(expectedIngressConfigs)) fail('Official ingress TLS config mounts mismatch');
const expectedServiceConfigs = {
  api: [{ mode: 365, source: 'settleora-api-entrypoint', target: '/usr/local/bin/settleora-api-entrypoint.sh' }],
  ingress: expectedIngressConfigs,
  migrate: [{ mode: 365, source: 'settleora-migrate-entrypoint', target: '/usr/local/bin/settleora-migrate-entrypoint.sh' }],
  postgres: [],
  rabbitmq: [{ mode: 365, source: 'settleora-rabbitmq-entrypoint', target: '/usr/local/bin/settleora-rabbitmq-entrypoint.sh' }],
};
for (const [service, expected] of Object.entries(expectedServiceConfigs)) {
  if (canonicalJson(compose.services[service].configs ?? []) !== canonicalJson(expected)) fail(`Official ${service} config isolation mismatch`);
}
if (canonicalJson(Object.keys(compose.configs ?? {}).sort()) !== canonicalJson(['settleora-api-entrypoint', 'settleora-caddy-entrypoint', 'settleora-caddyfile', 'settleora-migrate-entrypoint', 'settleora-rabbitmq-entrypoint', 'settleora-tls-certificate', 'settleora-tls-private-key'])) fail('Official config set mismatch');
const certificate = privateValues.ix_certificates?.[String(privateValues.network?.certificate_id)];
if (compose.configs?.['settleora-tls-certificate']?.content !== certificate?.certificate || compose.configs?.['settleora-tls-private-key']?.content !== certificate?.privatekey) fail('Official ingress TLS config content mismatch');
const applicationReleaseKeys = ['candidateId', 'commit', 'identityDigest', 'tree'];
const runtimeKeys = ['digestAuthority', 'images', 'indexDigests', 'platform'];
const runtimeRoleKeys = ['api', 'caddy', 'postgres', 'rabbitmq'];
if (canonicalJson(Object.keys(plan.applicationRelease ?? {}).sort()) !== canonicalJson(applicationReleaseKeys)
  || canonicalJson(Object.keys(plan.runtime ?? {}).sort()) !== canonicalJson(runtimeKeys)
  || canonicalJson(Object.keys(plan.runtime?.images ?? {}).sort()) !== canonicalJson(runtimeRoleKeys)
  || canonicalJson(Object.keys(plan.runtime?.indexDigests ?? {}).sort()) !== canonicalJson(runtimeRoleKeys)
  || typeof plan.applicationRelease?.candidateId !== 'string'
  || plan.applicationRelease.candidateId.length > 255
  || !/^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(plan.applicationRelease.candidateId)
  || !/^[0-9a-f]{40}$/u.test(plan.applicationRelease?.commit ?? '') || !/^[0-9a-f]{40}$/u.test(plan.applicationRelease?.tree ?? '')
  || !/^[0-9a-f]{64}$/u.test(plan.applicationRelease?.identityDigest ?? '') || plan.runtime?.platform !== 'linux/amd64'
  || plan.runtime?.digestAuthority !== 'selected-platform-manifest'
  || Object.values(plan.runtime?.indexDigests ?? {}).some((digest) => !/^sha256:[0-9a-f]{64}$/u.test(digest))
  || Object.values(plan.runtime?.images ?? {}).some((reference) => typeof reference !== 'string' || !reference.includes('@sha256:'))) fail('Install-plan release authority is incomplete');
const expectedReleaseMapping = {
  api_index_digest: plan.runtime?.indexDigests?.api,
  application_source_commit: plan.applicationRelease?.commit,
  application_source_tree: plan.applicationRelease?.tree,
  candidate_id: plan.applicationRelease?.candidateId,
  identity_digest: plan.applicationRelease?.identityDigest,
  platform: plan.runtime?.platform,
  runtime_digest_authority: plan.runtime?.digestAuthority,
  schema: 'settleora.day1-release-identity.v1',
};
if (canonicalJson(compose['x-settleora-release']) !== canonicalJson(expectedReleaseMapping)
  || canonicalJson(directCompose['x-settleora-release']) !== canonicalJson(expectedReleaseMapping)) fail('Official release mapping mismatch');
const noteContainer = (name, networks, user = 'unknown', group = 'unknown') => `### Container: [${name}]\n\n#### Joined networks\n\n${networks.map((network) => `- ${network}`).join('\n')}\n\n#### Running user/group(s)\n\n- User: ${user}\n- Group: ${group}\n- Supplementary Groups: apps\n\n---\n\n`;
const appTitle = privateValues.ix_context?.app_metadata?.title || '<app_name>';
const expectedNotes = `# ${appTitle}\n\n## Security\n\n**Read the following security precautions to ensure that you wish to continue using this application.**\n\n---\n\n${noteContainer('api', [ingressNetwork[0], backendNetwork[0]])}${noteContainer('ingress', ['edge', ingressNetwork[0]], '1000', '1000')}${noteContainer('migrate', [backendNetwork[0]])}${noteContainer('postgres', [backendNetwork[0]])}${noteContainer('rabbitmq', [backendNetwork[0]])}## Bug Reports and Feature Requests\n\nIf you find a bug in this app or have an idea for a new feature, please file an issue at\nhttps://github.com/truenas/apps\n`;
if (compose['x-action-required'] !== false || canonicalJson(compose['x-portals']) !== canonicalJson([]) || compose['x-notes'] !== expectedNotes) fail('Official operator metadata contract mismatch');
process.stdout.write(`${canonicalJson({ schema: 'settleora.truenas-official-render-validation.v1', composeSha256: sha256(canonicalJson(compose)), services: names, publishedPorts: 1, platform: 'linux/amd64', realSecretsIncluded: false, published: false, deployed: false })}`);
}
