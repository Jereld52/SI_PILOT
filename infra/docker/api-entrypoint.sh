#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
  mkdir -p "${UPLOAD_DIR:-/app/data/uploads}"
  chown -R appuser:appuser "${UPLOAD_DIR:-/app/data/uploads}"
  exec gosu appuser "$@"
fi

exec "$@"
