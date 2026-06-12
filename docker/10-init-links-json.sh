#!/bin/sh
set -eu

DATA_DIR="${LOCAL_NAV_DATA_DIR:-/usr/share/nginx/html/data}"
DEFAULT_LINKS="/opt/local-navigation-page/links.json.default"
LINKS_FILE="${DATA_DIR}/links.json"
DEFAULT_LINKS_IN_DATA="${DATA_DIR}/links.json.default"

mkdir -p "${DATA_DIR}"

if [ ! -f "${DEFAULT_LINKS_IN_DATA}" ] && [ -f "${DEFAULT_LINKS}" ]; then
    cp "${DEFAULT_LINKS}" "${DEFAULT_LINKS_IN_DATA}"
fi

if [ ! -f "${LINKS_FILE}" ] && [ -f "${DEFAULT_LINKS}" ]; then
    cp "${DEFAULT_LINKS}" "${LINKS_FILE}"
    echo "Initialized ${LINKS_FILE} from default links.json"
fi
