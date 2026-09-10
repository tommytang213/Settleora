#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

expected_node="rabbit@settleora-rabbitmq"
marker_queue="settleora.issue1189.persistence-marker"
marker_payload="issue-1189-marker-v1"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $1" >&2
    exit 1
  }
}

require_command docker
require_command openssl

docker info >/dev/null

wait_for_health() {
  local container_id="$1"
  local health=""
  local attempt
  for attempt in $(seq 1 90); do
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
    if [[ "$health" == "healthy" ]]; then
      return 0
    fi
    if [[ "$health" == "exited" || "$health" == "dead" ]]; then
      echo "RabbitMQ exited before becoming healthy." >&2
      return 1
    fi
    sleep 1
  done
  echo "RabbitMQ did not become healthy; last state: $health" >&2
  return 1
}

node_name() {
  docker exec "$1" rabbitmqctl eval 'node().' 2>/dev/null | tr -d "'\r"
}

legacy_node_name_without_identity_config() {
  env -u SETTLEORA_RABBITMQ_NODE_HOSTNAME docker exec "$1" \
    rabbitmqctl eval 'node().' 2>/dev/null | tr -d "'\r"
}

declare_marker() {
  docker exec "$1" sh -ec \
    'rabbitmqadmin --username "$RABBITMQ_DEFAULT_USER" --password "$RABBITMQ_DEFAULT_PASS" declare queue name="$1" durable=true >/dev/null
     rabbitmqadmin --username "$RABBITMQ_DEFAULT_USER" --password "$RABBITMQ_DEFAULT_PASS" publish exchange=amq.default routing_key="$1" payload="$2" properties="{\"delivery_mode\":2}" >/dev/null' \
    sh "$marker_queue" "$marker_payload"
}

assert_marker() {
  local container_id="$1"
  local marker_state
  marker_state="$(docker exec "$container_id" rabbitmqctl list_queues -q name durable messages_ready | awk -v queue="$marker_queue" '$1 == queue { print $2 ":" $3 }')"
  [[ "$marker_state" == "true:1" ]] || {
    echo "Durable marker state was not retained; observed: ${marker_state:-absent}" >&2
    return 1
  }
  docker exec "$container_id" sh -ec \
    'rabbitmqadmin --username "$RABBITMQ_DEFAULT_USER" --password "$RABBITMQ_DEFAULT_PASS" get queue="$1" ackmode=ack_requeue_true count=1 2>/dev/null | grep -Fq "$2"' \
    sh "$marker_queue" "$marker_payload"
}

assert_identity() {
  local container_id="$1"
  local wanted_node="$2"
  local observed_hostname observed_node
  observed_hostname="$(docker exec "$container_id" hostname -s)"
  observed_node="$(node_name "$container_id")"
  [[ "$observed_node" == "$wanted_node" ]] || {
    echo "RabbitMQ node identity mismatch: expected $wanted_node, observed $observed_node" >&2
    return 1
  }
  [[ "rabbit@$observed_hostname" == "$wanted_node" ]] || {
    echo "RabbitMQ hostname and node identity diverged." >&2
    return 1
  }
  docker exec "$container_id" test -d "/var/lib/rabbitmq/mnesia/$wanted_node"
}

set_test_environment() {
  local test_root="$1"
  export POSTGRES_DB=settleora_test
  export POSTGRES_USER=settleora_test
  export POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  export RABBITMQ_DEFAULT_USER=settleora_test
  export RABBITMQ_DEFAULT_PASS="$(openssl rand -hex 24)"
  export SETTLEORA_POSTGRES_HOST_PATH="$test_root/postgres"
  export SETTLEORA_RABBITMQ_HOST_PATH="$test_root/rabbitmq"
  export SETTLEORA_API_STORAGE_HOST_PATH="$test_root/storage"
  export SETTLEORA_API_IMAGE=ghcr.io/tommytang213/settleora-api:main
  mkdir -p "$SETTLEORA_POSTGRES_HOST_PATH" "$SETTLEORA_RABBITMQ_HOST_PATH" "$SETTLEORA_API_STORAGE_HOST_PATH"
}

cleanup_case() {
  local project="$1"
  local compose_file="$2"
  local test_root="$3"
  export SETTLEORA_RABBITMQ_NODE_HOSTNAME="${SETTLEORA_RABBITMQ_NODE_HOSTNAME:-settleora-rabbitmq}"
  docker compose -p "$project" -f "$compose_file" down --remove-orphans >/dev/null 2>&1 || true

  case "$project" in
    s1189*) ;;
    *) echo "Cleanup ownership mismatch for Compose project: $project" >&2; return 1 ;;
  esac
  case "$test_root" in
    /tmp/settleora-issue-1189-*|/workspace/logs/settleora-issue-1189-*) ;;
    *) echo "Cleanup ownership mismatch for temporary root: $test_root" >&2; return 1 ;;
  esac

  docker run --rm --name "${project}-cleanup" -v "$test_root:/cleanup" alpine:3.20 \
    sh -c 'find /cleanup -mindepth 1 -delete' >/dev/null
  rmdir "$test_root"
}

compose_up_rabbitmq() {
  local project="$1"
  local compose_file="$2"
  docker compose -p "$project" -f "$compose_file" up -d --no-deps rabbitmq >/dev/null
  docker compose -p "$project" -f "$compose_file" ps -q rabbitmq
}

recreate_rabbitmq() {
  local project="$1"
  local compose_file="$2"
  docker compose -p "$project" -f "$compose_file" rm -sf rabbitmq >/dev/null
  compose_up_rabbitmq "$project" "$compose_file"
}

test_clean_recreate() (
  local variant="$1"
  local compose_file="$2"
  local project="s1189clean${variant//[^a-z0-9]/}$(date +%s)${BASHPID}"
  local test_root
  test_root="$(mktemp -d "/tmp/settleora-issue-1189-clean-${variant}-XXXXXX")"
  trap 'cleanup_case "$project" "$compose_file" "$test_root"' EXIT
  set_test_environment "$test_root"
  export SETTLEORA_RABBITMQ_NODE_HOSTNAME=settleora-rabbitmq

  local first_id second_id third_id
  first_id="$(compose_up_rabbitmq "$project" "$compose_file")"
  wait_for_health "$first_id"
  assert_identity "$first_id" "$expected_node"
  declare_marker "$first_id"
  assert_marker "$first_id"

  second_id="$(recreate_rabbitmq "$project" "$compose_file")"
  wait_for_health "$second_id"
  [[ "$second_id" != "$first_id" ]]
  assert_identity "$second_id" "$expected_node"
  assert_marker "$second_id"

  third_id="$(recreate_rabbitmq "$project" "$compose_file")"
  wait_for_health "$third_id"
  [[ "$third_id" != "$second_id" ]]
  assert_identity "$third_id" "$expected_node"
  assert_marker "$third_id"

  printf 'PASS clean/recreate variant=%s node=%s cycles=2 marker=durable:true,messages_ready:1,payload:verified health=healthy cleanup=task-owned\n' \
    "$variant" "$expected_node"
)

write_prechange_compose() {
  local target="$1"
  # This reproduces the RabbitMQ service semantics shared by both LAN Compose
  # files at base 2c8b3c7d3d0dcd6c223484735e55b7f532723782:
  # no hostname, no RABBITMQ_NODENAME, and the same image, bind mount, and healthcheck.
  {
    printf '%s\n' \
      'services:' \
      '  rabbitmq:' \
      '    image: rabbitmq:3.13-management-alpine' \
      '    environment:' \
      '      RABBITMQ_DEFAULT_USER: ${RABBITMQ_DEFAULT_USER}' \
      '      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_DEFAULT_PASS}' \
      '    volumes:' \
      '      - type: bind' \
      '        source: ${SETTLEORA_RABBITMQ_HOST_PATH}' \
      '        target: /var/lib/rabbitmq' \
      '    healthcheck:' \
      '      test:' \
      '        - CMD' \
      '        - rabbitmq-diagnostics' \
      '        - ping' \
      '      interval: 10s' \
      '      timeout: 5s' \
      '      retries: 12' \
      '      start_period: 20s'
  } >"$target"
}

persisted_node_name() {
  local data_path="$1"
  docker run --rm --entrypoint sh -v "$data_path:/data:ro" alpine:3.20 -ec '
    found=""
    for path in /data/mnesia/rabbit@*; do
      [ -d "$path" ] || continue
      name="${path##*/}"
      case "$name" in
        *-plugins-expand) [ -d "${path%-plugins-expand}" ] && continue ;;
      esac
      [ -z "$found" ] || { echo "multiple persisted node databases" >&2; exit 1; }
      found="$name"
    done
    [ -n "$found" ] || { echo "persisted node database not found" >&2; exit 1; }
    printf "%s\n" "$found"
  '
}

test_prechange_adoption() (
  local variant="$1"
  local candidate_compose="$2"
  local project="s1189adopt${variant//[^a-z0-9]/}$(date +%s)${BASHPID}"
  local test_root baseline_compose
  test_root="$(mktemp -d "/tmp/settleora-issue-1189-adopt-${variant}-XXXXXX")"
  baseline_compose="$test_root/prechange.yml"
  write_prechange_compose "$baseline_compose"
  trap 'cleanup_case "$project" "$candidate_compose" "$test_root"' EXIT
  set_test_environment "$test_root"

  local baseline_id old_node adopted_hostname wrong_id adopted_id
  baseline_id="$(compose_up_rabbitmq "$project" "$baseline_compose")"
  wait_for_health "$baseline_id"
  old_node="$(legacy_node_name_without_identity_config "$baseline_id")"
  declare_marker "$baseline_id"
  assert_marker "$baseline_id"
  docker compose -p "$project" -f "$baseline_compose" rm -sf rabbitmq >/dev/null

  [[ "$(persisted_node_name "$SETTLEORA_RABBITMQ_HOST_PATH")" == "$old_node" ]]
  adopted_hostname="${old_node#rabbit@}"

  export SETTLEORA_RABBITMQ_NODE_HOSTNAME=wrong-rabbitmq-identity
  wrong_id="$(compose_up_rabbitmq "$project" "$candidate_compose")"
  for _ in $(seq 1 30); do
    [[ "$(docker inspect --format '{{.State.Status}}' "$wrong_id")" == "exited" ]] && break
    sleep 1
  done
  [[ "$(docker inspect --format '{{.State.Status}}' "$wrong_id")" == "exited" ]]
  [[ "$(docker inspect --format '{{.State.ExitCode}}' "$wrong_id")" == "66" ]]
  docker logs "$wrong_id" 2>&1 | grep -Fq 'configured node does not match the persisted node database'
  ! docker run --rm --entrypoint sh -v "$SETTLEORA_RABBITMQ_HOST_PATH:/data:ro" alpine:3.20 \
    -ec 'test -d /data/mnesia/rabbit@wrong-rabbitmq-identity'
  docker compose -p "$project" -f "$candidate_compose" rm -sf rabbitmq >/dev/null

  export SETTLEORA_RABBITMQ_NODE_HOSTNAME="$adopted_hostname"
  adopted_id="$(compose_up_rabbitmq "$project" "$candidate_compose")"
  wait_for_health "$adopted_id"
  assert_identity "$adopted_id" "$old_node"
  assert_marker "$adopted_id"

  printf 'PASS prechange-adoption variant=%s old_node=%s discovery=direct-exec-without-new-env wrong_identity=refused:66 adopted_node=%s marker=durable:true,messages_ready:1,payload:verified health=healthy cleanup=task-owned\n' \
    "$variant" "$old_node" "$old_node"
)

test_suffix_collision_refusal() (
  local variant="$1"
  local compose_file="$2"
  local project="s1189suffix${variant//[^a-z0-9]/}$(date +%s)${BASHPID}"
  local test_root wrong_id
  test_root="$(mktemp -d "/tmp/settleora-issue-1189-suffix-${variant}-XXXXXX")"
  trap 'cleanup_case "$project" "$compose_file" "$test_root"' EXIT
  set_test_environment "$test_root"

  # A persisted nodename may itself end in RabbitMQ's conventional
  # -plugins-expand suffix. With no sibling primary database, this directory
  # must be treated as the primary and must block a different identity.
  mkdir -p "$SETTLEORA_RABBITMQ_HOST_PATH/mnesia/rabbit@queue-plugins-expand"
  export SETTLEORA_RABBITMQ_NODE_HOSTNAME=wrong-rabbitmq-identity
  wrong_id="$(compose_up_rabbitmq "$project" "$compose_file")"
  for _ in $(seq 1 30); do
    [[ "$(docker inspect --format '{{.State.Status}}' "$wrong_id")" == "exited" ]] && break
    sleep 1
  done
  [[ "$(docker inspect --format '{{.State.Status}}' "$wrong_id")" == "exited" ]]
  [[ "$(docker inspect --format '{{.State.ExitCode}}' "$wrong_id")" == "66" ]]
  docker logs "$wrong_id" 2>&1 | grep -Fq 'configured node does not match the persisted node database'
  [[ -d "$SETTLEORA_RABBITMQ_HOST_PATH/mnesia/rabbit@queue-plugins-expand" ]]
  [[ ! -d "$SETTLEORA_RABBITMQ_HOST_PATH/mnesia/rabbit@wrong-rabbitmq-identity" ]]

  printf 'PASS suffix-collision variant=%s persisted_node=rabbit@queue-plugins-expand wrong_identity=refused:66 new_database=absent cleanup=task-owned\n' \
    "$variant"
)

test_missing_identity() {
  local variant="$1"
  local compose_file="$2"
  local output
  if output="$(env -u SETTLEORA_RABBITMQ_NODE_HOSTNAME docker compose --env-file /dev/null -f "$compose_file" config 2>&1)"; then
    echo "Missing identity unexpectedly passed Compose interpolation for $variant." >&2
    return 1
  fi
  grep -Fq 'SETTLEORA_RABBITMQ_NODE_HOSTNAME' <<<"$output"
  printf 'PASS missing-identity variant=%s result=compose-refused-before-start\n' "$variant"
}

variants=(
  "source:infra/docker-compose.truenas-lan.yml"
  "image:infra/docker-compose.truenas-lan.image.yml"
)

for item in "${variants[@]}"; do
  variant="${item%%:*}"
  compose_file="${item#*:}"
  test_missing_identity "$variant" "$compose_file"
  test_clean_recreate "$variant" "$compose_file"
  test_prechange_adoption "$variant" "$compose_file"
  test_suffix_collision_refusal "$variant" "$compose_file"
done

echo "RabbitMQ persistence continuity validation passed for both LAN Compose variants."
