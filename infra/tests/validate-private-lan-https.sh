#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
validator="$repo_root/infra/caddy/validate-private-lan-https.sh"
example_env="$repo_root/infra/env/.env.truenas-lan.example"
source_compose="$repo_root/infra/docker-compose.truenas-lan.yml"
image_compose="$repo_root/infra/docker-compose.truenas-lan.image.yml"
android_manifest="$repo_root/apps/mobile/android/app/src/main/AndroidManifest.xml"
ios_info_plist="$repo_root/apps/mobile/ios/Runner/Info.plist"
tmp_dir=$(mktemp -d)
test_id=$(basename "$tmp_dir" | tr -cd 'A-Za-z0-9')
run_label="com.settleora.r12-run=$test_id"
network="settleora-r12-$test_id"
mock_container="settleora-r12-api-$test_id"
ingress_container="settleora-r12-ingress-$test_id"
network_created=false
mock_created=false
ingress_created=false

cleanup() {
  if [ "$ingress_created" = true ] &&
    [ "$(docker inspect -f '{{ index .Config.Labels "com.settleora.r12-run" }}' "$ingress_container" 2>/dev/null || true)" = "$test_id" ]; then
    docker rm -f "$ingress_container" >/dev/null 2>&1 || true
  fi
  if [ "$mock_created" = true ] &&
    [ "$(docker inspect -f '{{ index .Config.Labels "com.settleora.r12-run" }}' "$mock_container" 2>/dev/null || true)" = "$test_id" ]; then
    docker rm -f "$mock_container" >/dev/null 2>&1 || true
  fi
  if [ "$network_created" = true ] &&
    [ "$(docker network inspect -f '{{ index .Labels "com.settleora.r12-run" }}' "$network" 2>/dev/null || true)" = "$test_id" ]; then
    docker network rm "$network" >/dev/null 2>&1 || true
  fi
  rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

printf '%s\n' 'synthetic certificate fixture' >"$tmp_dir/tls.crt"
printf '%s\n' 'synthetic private key fixture' >"$tmp_dir/tls.key"

run_preflight() {
  SETTLEORA_API_BIND_ADDRESS=$1 \
  SETTLEORA_HTTPS_HOSTNAME=$2 \
  SETTLEORA_API_HTTPS_PORT=$3 \
  SETTLEORA_TLS_CERTIFICATE_FILE=${4:-"$tmp_dir/tls.crt"} \
  SETTLEORA_TLS_PRIVATE_KEY_FILE=${5:-"$tmp_dir/tls.key"} \
    sh "$validator"
}

expect_failure() {
  description=$1
  shift
  if "$@" >"$tmp_dir/failure.out" 2>&1; then
    printf '%s\n' "Expected failure: $description" >&2
    exit 1
  fi
}

run_preflight 10.20.30.40 settleora.home.arpa 8443 >/dev/null
run_preflight 172.16.4.20 service.one.home.arpa 443 >/dev/null
run_preflight 192.168.50.10 settleora.private.home.arpa 65535 >/dev/null

expect_failure "missing bind" run_preflight '' settleora.home.arpa 8443
expect_failure "IPv4 wildcard" run_preflight 0.0.0.0 settleora.home.arpa 8443
expect_failure "IPv6 wildcard" run_preflight :: settleora.home.arpa 8443
expect_failure "loopback" run_preflight 127.0.0.1 settleora.home.arpa 8443
expect_failure "link local" run_preflight 169.254.2.3 settleora.home.arpa 8443
expect_failure "public address" run_preflight 203.0.113.10 settleora.home.arpa 8443
expect_failure "ambiguous octet" run_preflight 192.168.050.10 settleora.home.arpa 8443
expect_failure "malformed address" run_preflight 192.168.1 settleora.home.arpa 8443
expect_failure "glob-shaped address" run_preflight '192.168.*.1' settleora.home.arpa 8443
expect_failure "missing hostname" run_preflight 192.168.50.10 '' 8443
expect_failure "single-label hostname" run_preflight 192.168.50.10 settleora 8443
expect_failure "localhost hostname" run_preflight 192.168.50.10 api.localhost 8443
expect_failure "documentation-only hostname" run_preflight 192.168.50.10 settleora.example.com 8443
expect_failure "reserved hostname suffix" run_preflight 192.168.50.10 settleora.example 8443
expect_failure "malformed hostname" run_preflight 192.168.50.10 _settleora.home.arpa 8443
expect_failure "invalid port" run_preflight 192.168.50.10 settleora.home.arpa 0
expect_failure "missing certificate" run_preflight 192.168.50.10 settleora.home.arpa 8443 "$tmp_dir/missing.crt"
expect_failure "missing private key" run_preflight 192.168.50.10 settleora.home.arpa 8443 "$tmp_dir/tls.crt" "$tmp_dir/missing.key"

[ "$(grep -c 'android.permission.INTERNET' "$android_manifest")" -eq 1 ] || {
  printf '%s\n' 'Android release manifest must declare INTERNET exactly once.' >&2
  exit 1
}
[ "$(grep -c '<key>NSLocalNetworkUsageDescription</key>' "$ios_info_plist")" -eq 1 ] || {
  printf '%s\n' 'iOS must declare its private-server local-network purpose exactly once.' >&2
  exit 1
}

docker compose --env-file "$example_env" -f "$source_compose" config --format json >"$tmp_dir/source.json"
docker compose --env-file "$example_env" -f "$image_compose" config --format json >"$tmp_dir/image.json"

for rendered in "$tmp_dir/source.json" "$tmp_dir/image.json"; do
  jq -e '
    .services.ingress.ports == [{"mode":"ingress","host_ip":"192.168.50.10","target":8443,"published":"8443","protocol":"tcp"}] and
    (.services.api.ports == null) and
    (.services.api.expose == ["8080"]) and
    (.services.ingress.cap_drop == ["ALL"]) and
    (.services.ingress.cap_add == null) and
    (.services.ingress.user == "1000:1000") and
    (.services.ingress.read_only == true) and
    (.services.ingress.security_opt == ["no-new-privileges:true"]) and
    (.services.ingress.networks == {"ingress":null}) and
    (.services.api.networks == {"backend":null,"ingress":null}) and
    (.services.migrate.networks == {"backend":null}) and
    (.services.postgres.networks == {"backend":null}) and
    (.services.rabbitmq.networks == {"backend":null}) and
    (.networks.ingress.internal == true) and
    (.networks.backend.internal == true) and
    (.services.postgres.ports == null) and
    (.services.rabbitmq.ports == null) and
    (.services.migrate.ports == null) and
    (.services.ingress.depends_on.api.condition == "service_started") and
    (.services.api.depends_on.migrate.condition == "service_completed_successfully") and
    (.services.api.depends_on.postgres.condition == "service_healthy") and
    (.services.api.depends_on.rabbitmq.condition == "service_healthy") and
    (.services.migrate.depends_on.postgres.condition == "service_healthy")
  ' "$rendered" >/dev/null
done

jq -S '{ingress: .services.ingress}' \
  "$tmp_dir/source.json" >"$tmp_dir/source-ingress.json"
jq -S '{ingress: .services.ingress}' \
  "$tmp_dir/image.json" >"$tmp_dir/image-ingress.json"
cmp "$tmp_dir/source-ingress.json" "$tmp_dir/image-ingress.json"

grep -v '^SETTLEORA_API_BIND_ADDRESS=' "$example_env" >"$tmp_dir/missing-bind.env"
expect_failure "Compose render without bind" \
  env -u SETTLEORA_API_BIND_ADDRESS docker compose --env-file "$tmp_dir/missing-bind.env" -f "$source_compose" config

openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -subj '/CN=settleora.home.arpa' \
  -addext 'subjectAltName=DNS:settleora.home.arpa' \
  -keyout "$tmp_dir/smoke.key" -out "$tmp_dir/smoke.crt" >/dev/null 2>&1
# These are disposable synthetic files. World-readable fixture permissions let
# the capability-dropped container read them without granting DAC_OVERRIDE;
# operators must instead use a narrowly owned/mode-readable external key.
chmod 0644 "$tmp_dir/smoke.crt" "$tmp_dir/smoke.key"

docker run --rm \
  -e SETTLEORA_HTTPS_HOSTNAME=settleora.home.arpa \
  -v "$repo_root/infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v "$tmp_dir/smoke.crt:/run/settleora-tls/tls.crt:ro" \
  -v "$tmp_dir/smoke.key:/run/settleora-tls/tls.key:ro" \
  caddy:2.11.4-alpine caddy validate --config /etc/caddy/Caddyfile >/dev/null

docker run --rm \
  -e SETTLEORA_HTTPS_HOSTNAME=settleora.home.arpa \
  -v "$repo_root/infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2.11.4-alpine caddy adapt --config /etc/caddy/Caddyfile \
  >"$tmp_dir/caddy.json"
jq -e '
  .admin.disabled == true and
  .apps.http.servers.srv0.automatic_https.disable == true and
  (.apps.http.servers.srv0.trusted_proxies == null) and
  .apps.http.servers.srv0.listen == [":8443"] and
  .apps.http.servers.srv0.routes[0].match[0].host == ["settleora.home.arpa"] and
  .apps.http.servers.srv0.routes[0].handle[0].routes[0].handle[0].upstreams == [{"dial":"api:8080"}]
' "$tmp_dir/caddy.json" >/dev/null

docker network create --label "$run_label" "$network" >/dev/null
network_created=true
docker run -d --name "$mock_container" --label "$run_label" --network "$network" --network-alias api \
  busybox:1.36.1 sh -c \
  "mkdir -p /www/health/ready; printf '%s' ready >/www/health/ready/index.html; exec httpd -f -p 8080 -h /www" >/dev/null
mock_created=true
docker run -d --name "$ingress_container" --label "$run_label" --network "$network" \
  --entrypoint /bin/sh \
  --user 1000:1000 \
  --cap-drop ALL --read-only --security-opt no-new-privileges \
  --tmpfs /config --tmpfs /data --tmpfs /tmp:exec \
  -e SETTLEORA_API_BIND_ADDRESS=192.168.50.10 \
  -e SETTLEORA_API_HTTPS_PORT=8443 \
  -e SETTLEORA_HTTPS_HOSTNAME=settleora.home.arpa \
  -e SETTLEORA_START_CADDY=1 \
  -p 127.0.0.1::8443 \
  -v "$repo_root/infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v "$repo_root/infra/caddy/validate-private-lan-https.sh:/usr/local/bin/validate-private-lan-https.sh:ro" \
  -v "$tmp_dir/smoke.crt:/run/settleora-tls/tls.crt:ro" \
  -v "$tmp_dir/smoke.key:/run/settleora-tls/tls.key:ro" \
  caddy:2.11.4-alpine /usr/local/bin/validate-private-lan-https.sh >/dev/null
ingress_created=true

host_port=$(docker port "$ingress_container" 8443/tcp | sed -n 's/.*://p')
[ -n "$host_port" ] || {
  printf '%s\n' 'Could not resolve disposable HTTPS host port.' >&2
  docker inspect "$ingress_container" --format '{{json .State}}' >&2 || true
  docker logs "$ingress_container" >&2 || true
  exit 1
}

attempt=0
while :; do
  if response=$(curl --silent --show-error --fail \
    --cacert "$tmp_dir/smoke.crt" \
    --resolve "settleora.home.arpa:$host_port:127.0.0.1" \
    "https://settleora.home.arpa:$host_port/health/ready/"); then
    break
  fi
  attempt=$((attempt + 1))
  [ "$attempt" -lt 20 ] || {
    docker logs "$ingress_container" >&2
    exit 1
  }
  sleep 1
done

[ "$response" = ready ] || {
  printf '%s\n' 'Disposable HTTPS readiness response was unexpected.' >&2
  exit 1
}

printf '%s\n' 'Private LAN bind and HTTPS transport validation passed.'
