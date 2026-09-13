import { readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { canonicalJson } from '../release/day1-release-identity.mjs';
import { PACKAGE_SCHEMA, sha256 } from './render.mjs';

const fail = (message) => { throw new Error(message); };
const [composeArg, planArg] = process.argv.slice(2);
if (!composeArg || !planArg) fail('Usage: validate-official-render.mjs <compose> <install-plan>');
const compose = YAML.parse(readFileSync(path.resolve(composeArg), 'utf8'));
const plan = JSON.parse(readFileSync(path.resolve(planArg), 'utf8'));
if (plan.schema !== PACKAGE_SCHEMA) fail('Install-plan schema mismatch');
const names = Object.keys(compose.services ?? {}).sort();
if (canonicalJson(names) !== canonicalJson(['api', 'ingress', 'migrate', 'postgres', 'rabbitmq'])) fail('Official render service set mismatch');
for (const [name, service] of Object.entries(compose.services)) {
  if (service.platform !== 'linux/amd64') fail(`${name} platform mismatch`);
  if (!service.image?.includes('@sha256:') || /:(?:main|latest)(?:@|$)/u.test(service.image)) fail(`${name} image is not immutable`);
  if (name !== 'ingress' && (service.ports?.length ?? 0) !== 0) fail(`${name} unexpectedly publishes a port`);
}
const port = compose.services.ingress.ports?.[0];
if (compose.services.ingress.ports?.length !== 1 || port.target !== 8443 || port.protocol !== 'tcp' || port.host_ip !== plan.networks.bindAddress || Number(port.published) !== plan.networks.httpsPort) fail('Official ingress publication mismatch');
const octets = String(port.host_ip).split('.').map(Number);
if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  || !(octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168))) fail('Official ingress is not bound to RFC1918');
if (compose.services.api.image !== compose.services.migrate.image) fail('Official API/migrate image mismatch');
if (compose.services.api.depends_on?.migrate?.condition !== 'service_completed_successfully') fail('Official migration-success gate missing');
if (compose.services.migrate.depends_on?.postgres?.condition !== 'service_healthy') fail('Official migration PostgreSQL gate missing');
if (compose.services.api.depends_on?.postgres?.condition !== 'service_healthy' || compose.services.api.depends_on?.rabbitmq?.condition !== 'service_healthy') fail('Official API dependency gate missing');
if (compose.services.rabbitmq.environment?.RABBITMQ_NODENAME !== `rabbit@${compose.services.rabbitmq.hostname}`) fail('Official RabbitMQ identity mismatch');
const rabbitGuard = String(compose.configs?.['settleora-rabbitmq-entrypoint']?.content ?? '').replaceAll('$$', '$');
for (const required of ['expected_nodename="rabbit@$(hostname -s)"', 'RABBITMQ_MNESIA_BASE', 'persisted_nodename', 'exit 64', 'exit 65', 'exit 66']) if (!rabbitGuard.includes(required)) fail('Official RabbitMQ identity guard is incomplete');
const internalNetworks = Object.entries(compose.networks ?? {}).filter(([, network]) => network?.labels?.['tn.network.internal'] === 'true').map(([name]) => name);
if (internalNetworks.length !== 2 || compose.networks.edge?.labels?.['tn.network.internal'] === 'true') fail('Official private network topology mismatch');
const memberships = (service) => Object.keys(service.networks ?? {});
if (!memberships(compose.services.ingress).includes('edge') || memberships(compose.services.ingress).length !== 2) fail('Official ingress network boundary mismatch');
if (memberships(compose.services.api).length !== 2 || memberships(compose.services.postgres).length !== 1 || memberships(compose.services.rabbitmq).length !== 1 || memberships(compose.services.migrate).length !== 1) fail('Official backend network boundary mismatch');
const targets = Object.values(compose.services).flatMap((service) => service.volumes ?? []).map((volume) => volume.target);
for (const target of ['/var/lib/postgresql/data', '/var/lib/rabbitmq', '/var/lib/settleora/storage']) if (!targets.includes(target)) fail('Official dataset mapping missing');
const caddy = String(compose.configs?.['settleora-caddyfile']?.content ?? '');
if (!caddy.includes('auto_https off') || !caddy.includes(`https://${plan.tls.hostname}:8443`) || !caddy.includes('tls /run/settleora-tls/tls.crt /run/settleora-tls/tls.key') || !caddy.includes('reverse_proxy api:8080') || caddy.includes('acme') || caddy.includes('http://')) fail('Official private TLS topology mismatch');
if (compose['x-settleora-release']?.identity_digest !== plan.applicationRelease.identityDigest) fail('Official release mapping mismatch');
process.stdout.write(`${canonicalJson({ schema: 'settleora.truenas-official-render-validation.v1', composeSha256: sha256(canonicalJson(compose)), services: names, publishedPorts: 1, platform: 'linux/amd64', realSecretsIncluded: false, published: false, deployed: false })}`);
