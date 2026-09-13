import { readFileSync } from 'node:fs';
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
if (plan.schema !== PACKAGE_SCHEMA) fail('Install-plan schema mismatch');
const names = Object.keys(compose.services ?? {}).sort();
if (canonicalJson(names) !== canonicalJson(['api', 'ingress', 'migrate', 'postgres', 'rabbitmq'])) fail('Official render service set mismatch');
for (const [name, service] of Object.entries(compose.services)) {
  if (service.platform !== 'linux/amd64') fail(`${name} platform mismatch`);
  if (!service.image?.includes('@sha256:') || /:(?:main|latest)(?:@|$)/u.test(service.image)) fail(`${name} image is not immutable`);
  if (name !== 'ingress' && (service.ports?.length ?? 0) !== 0) fail(`${name} unexpectedly publishes a port`);
  if (service.deploy?.resources?.limits?.memory !== '4096M') fail(`${name} memory limit mismatch`);
}
const expectedImages = { api: plan.runtime?.images?.api, ingress: plan.runtime?.images?.caddy, migrate: plan.runtime?.images?.api, postgres: plan.runtime?.images?.postgres, rabbitmq: plan.runtime?.images?.rabbitmq };
for (const [name, expectedImage] of Object.entries(expectedImages)) {
  if (typeof expectedImage !== 'string' || compose.services[name].image !== expectedImage) fail(`${name} image does not match the R03-selected runtime identity`);
}
const apiHealth = compose.services.api.healthcheck?.test;
if (!Array.isArray(apiHealth) || apiHealth[0] !== 'CMD-SHELL' || !apiHealth[1]?.includes('/bin/bash') || !apiHealth[1]?.includes('/health/ready') || apiHealth[1]?.includes('curl')) fail('Official API dependency-aware readiness healthcheck is missing');
if (compose.services.api.environment?.HOME !== '/var/lib/settleora/storage/.settleora-home') fail('Official API data-protection key home is not persistent within the existing storage layout');
const passkeyOrigin = plan.networks.httpsPort === 443 ? `https://${plan.tls.hostname}` : `https://${plan.tls.hostname}:${plan.networks.httpsPort}`;
if (compose.services.api.environment?.Auth__Passkeys__RelyingPartyId !== plan.tls.hostname || compose.services.api.environment?.Auth__Passkeys__AllowedOrigins__0 !== passkeyOrigin) fail('Official passkey relying-party identity mismatch');
if (compose.services.ingress.depends_on?.api?.condition !== 'service_healthy') fail('Official ingress API-readiness gate missing');
if (canonicalJson(compose.services.api.entrypoint) !== canonicalJson(['/bin/sh', '/usr/local/bin/settleora-api-entrypoint.sh'])) fail('Official API storage preflight entrypoint is missing');
const apiEntrypoint = String(compose.configs?.['settleora-api-entrypoint']?.content ?? '').replaceAll('$$', '$');
for (const required of ['data_path=/var/lib/settleora/storage', 'id -u', 'id -g', '[ -r "$data_path" ]', '[ -w "$data_path" ]', '[ -x "$data_path" ]', 'mktemp -d "$data_path/.settleora-write-probe.XXXXXXXXXX"', '[ ! -L "$home_path" ]', 'readlink -f -- "$data_path"', '[ "$home_real" = "$data_real/.settleora-home" ]', '[ ! -L "$aspnet_path" ]', '[ "$aspnet_real" = "$home_real/.aspnet" ]', '[ ! -L "$keys_path" ]', '[ "$keys_real" = "$aspnet_real/DataProtection-Keys" ]', 'mktemp -d "$keys_path/.settleora-write-probe.XXXXXXXXXX"', 'chmod 0700 -- "$home_path"', 'exec dotnet Settleora.Api.dll']) if (!apiEntrypoint.includes(required)) fail('Official API UID/GID 999 storage preflight is incomplete');
if (canonicalJson(compose.services.ingress.entrypoint) !== canonicalJson(['/bin/sh', '/usr/local/bin/settleora-caddy-entrypoint.sh']) || compose.services.ingress.healthcheck?.test?.[1] !== '/tmp/settleora-caddy') fail('Official ingress does not preserve capability-free Caddy startup');
const caddyEntrypoint = String(compose.configs?.['settleora-caddy-entrypoint']?.content ?? '').replaceAll('$$', '$');
for (const required of ['cp /usr/bin/caddy /tmp/settleora-caddy', 'chmod 0555 /tmp/settleora-caddy', 'exec /tmp/settleora-caddy "$@"']) if (!caddyEntrypoint.includes(required)) fail('Official capability-free Caddy entrypoint is incomplete');
const port = compose.services.ingress.ports?.[0];
if (compose.services.ingress.ports?.length !== 1 || port.target !== 8443 || port.protocol !== 'tcp' || port.host_ip !== plan.networks.bindAddress || Number(port.published) !== plan.networks.httpsPort) fail('Official ingress publication mismatch');
const octets = String(port.host_ip).split('.').map(Number);
if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  || !(octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168))) fail('Official ingress is not bound to RFC1918');
if (compose.services.api.image !== compose.services.migrate.image) fail('Official API/migrate image mismatch');
if (compose.services.api.depends_on?.migrate?.condition !== 'service_completed_successfully') fail('Official migration-success gate missing');
const migrateEntrypoint = String(compose.configs?.['settleora-migrate-entrypoint']?.content ?? '').replaceAll('$$', '$');
for (const required of ['validate-only)', '--mode=validate-only', '--mode=check-only', 'managed-auto|apply-safe|manual|check-only)']) if (!migrateEntrypoint.includes(required)) fail('Official migration startup gate is incomplete');
if (compose.services.migrate.depends_on?.postgres?.condition !== 'service_healthy') fail('Official migration PostgreSQL gate missing');
if (compose.services.api.depends_on?.postgres?.condition !== 'service_healthy' || compose.services.api.depends_on?.rabbitmq?.condition !== 'service_healthy') fail('Official API dependency gate missing');
if (compose.services.rabbitmq.environment?.RABBITMQ_NODENAME !== `rabbit@${compose.services.rabbitmq.hostname}`) fail('Official RabbitMQ identity mismatch');
const rabbitGuard = String(compose.configs?.['settleora-rabbitmq-entrypoint']?.content ?? '').replaceAll('$$', '$');
for (const required of ['expected_nodename="rabbit@$(hostname -s)"', 'RABBITMQ_MNESIA_BASE', 'persisted_nodename', 'exit 64', 'exit 65', 'exit 66']) if (!rabbitGuard.includes(required)) fail('Official RabbitMQ identity guard is incomplete');
const internalNetworks = Object.entries(compose.networks ?? {}).filter(([, network]) => network?.internal === true && network?.labels?.['tn.network.internal'] === 'true').map(([name]) => name);
if (internalNetworks.length !== 2 || compose.networks.edge?.internal === true || compose.networks.edge?.labels?.['tn.network.internal'] === 'true') fail('Official private network topology mismatch');
const memberships = (service) => Object.keys(service.networks ?? {});
if (!memberships(compose.services.ingress).includes('edge') || memberships(compose.services.ingress).length !== 2) fail('Official ingress network boundary mismatch');
if (memberships(compose.services.api).length !== 2 || memberships(compose.services.postgres).length !== 1 || memberships(compose.services.rabbitmq).length !== 1 || memberships(compose.services.migrate).length !== 1) fail('Official backend network boundary mismatch');
const targets = Object.values(compose.services).flatMap((service) => service.volumes ?? []).map((volume) => volume.target);
for (const target of ['/var/lib/postgresql/data', '/var/lib/rabbitmq', '/var/lib/settleora/storage']) if (!targets.includes(target)) fail('Official dataset mapping missing');
const caddy = String(compose.configs?.['settleora-caddyfile']?.content ?? '');
if (!caddy.includes('auto_https off') || !caddy.includes(`https://${plan.tls.hostname}:8443`) || !caddy.includes('tls /run/settleora-tls/tls.crt /run/settleora-tls/tls.key') || !caddy.includes('reverse_proxy api:8080') || caddy.includes('acme') || caddy.includes('http://')) fail('Official private TLS topology mismatch');
if (compose['x-settleora-release']?.identity_digest !== plan.applicationRelease.identityDigest) fail('Official release mapping mismatch');
process.stdout.write(`${canonicalJson({ schema: 'settleora.truenas-official-render-validation.v1', composeSha256: sha256(canonicalJson(compose)), services: names, publishedPorts: 1, platform: 'linux/amd64', realSecretsIncluded: false, published: false, deployed: false })}`);
}
