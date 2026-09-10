#!/bin/sh
set -eu

expected_nodename="rabbit@$(hostname -s)"
configured_nodename="${RABBITMQ_NODENAME:?RABBITMQ_NODENAME is required for persistent RabbitMQ data}"

if [ "$configured_nodename" != "$expected_nodename" ]; then
  echo >&2 "RabbitMQ persistence identity refused: configured node name does not match the container hostname."
  exit 64
fi

mnesia_base="${RABBITMQ_MNESIA_BASE:-/var/lib/rabbitmq/mnesia}"
if [ -d "$mnesia_base" ]; then
  persisted_nodename=""
  for candidate in "$mnesia_base"/rabbit@*; do
    [ -d "$candidate" ] || continue
    candidate_nodename="${candidate##*/}"
    case "$candidate_nodename" in
      *-plugins-expand)
        # RabbitMQ creates <nodename>-plugins-expand beside the primary node
        # database. Treat the suffix as auxiliary only when that sibling
        # exists and this directory has no primary-database markers. A
        # database-shaped suffix directory is an additional identity and must
        # make startup fail closed.
        if [ -d "${candidate%-plugins-expand}" ] \
          && [ ! -e "$candidate/schema.DAT" ] \
          && [ ! -e "$candidate/node-type.txt" ] \
          && [ ! -d "$candidate/msg_stores" ]; then
          continue
        fi
        ;;
    esac

    if [ -n "$persisted_nodename" ] && [ "$persisted_nodename" != "$candidate_nodename" ]; then
      echo >&2 "RabbitMQ persistence identity refused: the data path contains more than one node database."
      exit 65
    fi
    persisted_nodename="$candidate_nodename"
  done

  if [ -n "$persisted_nodename" ] && [ "$persisted_nodename" != "$configured_nodename" ]; then
    echo >&2 "RabbitMQ persistence identity refused: the configured node does not match the persisted node database."
    echo >&2 "Preserve the existing node identity or obtain approval for a separately reviewed migration; the broker was not started."
    exit 66
  fi
fi

exec /usr/local/bin/docker-entrypoint.sh "$@"
