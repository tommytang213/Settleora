#!/bin/sh
set -eu
set -f

packet_root=${1:-}
[ -n "$packet_root" ] || { echo >&2 "Usage: validate-official-render.sh <materialized-packet-root>"; exit 2; }
[ ! -L "$packet_root" ] || { echo >&2 "Materialized packet root must not be a symbolic link"; exit 2; }
[ -d "$packet_root" ] || { echo >&2 "Materialized packet root is missing"; exit 2; }
packet_root=$(realpath -e -- "$packet_root")
[ -d "$packet_root/package" ] || { echo >&2 "Materialized package directory is missing"; exit 2; }
[ -f "$packet_root/install-plan.json" ] || { echo >&2 "Install plan is missing"; exit 2; }
[ ! -L "$packet_root/install-plan.json" ] || { echo >&2 "Install plan must not be a symbolic link"; exit 2; }

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
(cd "$packet_root" && node "$script_dir/validate-official-render.mjs" --preflight 4< install-plan.json)
work_root=$(mktemp -d)
trap 'rm -rf -- "$work_root"' EXIT HUP INT TERM
cp -a -- "$packet_root/package" "$work_root/package"

validator_image='ghcr.io/truenas/apps_validation@sha256:9363207f4456a2522bc1aee7bc8d62378c5594b3781319f3331910662e0c49ae'

docker run --platform linux/amd64 --rm \
  -v "$work_root:/workspace:ro" \
  --entrypoint python3 \
  "$validator_image" \
  -c 'import yaml; from jsonschema import validate; from apps_validation.json_schema_utils import APP_METADATA_JSON_SCHEMA; from apps_validation.validate_questions import validate_questions_yaml; validate(yaml.safe_load(open("/workspace/package/app.yaml")), APP_METADATA_JSON_SCHEMA); validate_questions_yaml("/workspace/package/questions.yaml", "questions")'

docker run --platform linux/amd64 --rm \
  -e FAKE_ENV=1 \
  -v "$work_root:/workspace:rw" \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  "$validator_image" \
  apps_render_app render \
  --path /workspace/package \
  --values /workspace/package/templates/test_values/render-values.yaml

docker run --platform linux/amd64 --rm \
  -v "$work_root:/workspace:rw" \
  --entrypoint /bin/chmod \
  "$validator_image" \
  0644 /workspace/package/templates/rendered/docker-compose.yaml

[ -f "$work_root/package/templates/rendered/docker-compose.yaml" ] || { echo >&2 "Official rendered Compose file is missing"; exit 2; }
[ ! -L "$work_root/package/templates/rendered/docker-compose.yaml" ] || { echo >&2 "Official rendered Compose file must not be a symbolic link"; exit 2; }
docker compose -f "$work_root/package/templates/rendered/docker-compose.yaml" config --quiet
node "$script_dir/validate-official-render.mjs" \
  3< "$work_root/package/templates/rendered/docker-compose.yaml" \
  4< "$packet_root/install-plan.json"
