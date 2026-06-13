#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

DEFAULT_SCHEMA_DIR="${REPO_ROOT}/generated/prompt_template_chain_context_schemas/json"
DEFAULT_HTML_DIR="${REPO_ROOT}/generated/prompt_template_chain_context_schemas/html"
DOCS_STATIC_DIR="${REPO_ROOT}/docs/static/prompt_docs/template_chain_context_schemas"

SCHEMA_DIR="${1:-${DEFAULT_SCHEMA_DIR}}"
HTML_DIR="${2:-${DEFAULT_HTML_DIR}}"

if command -v node.exe >/dev/null 2>&1; then
  NODE_BIN="node.exe"
else
  NODE_BIN="node"
fi

if [[ "${OS:-}" == "Windows_NT" ]]; then
  VENV_ACTIVATE="${REPO_ROOT}/venv/Scripts/activate"
else
  VENV_ACTIVATE="${REPO_ROOT}/venv/bin/activate"
fi

if [[ ! -f "${VENV_ACTIVATE}" ]]; then
  echo "Creating Python venv at ${REPO_ROOT}/venv..."
  python -m venv "${REPO_ROOT}/venv"
  # shellcheck disable=SC1090
  source "${VENV_ACTIVATE}"
  pip install json-schema-for-humans
fi

"${NODE_BIN}" --import tsx "${REPO_ROOT}/scripts/export-prompt-template-context-schemas.ts" "${SCHEMA_DIR}"

# shellcheck disable=SC1090
source "${VENV_ACTIVATE}"

rm -rf "${HTML_DIR}"
mkdir -p "${HTML_DIR}"
generate-schema-doc "${SCHEMA_DIR}" "${HTML_DIR}"

mkdir -p "${DOCS_STATIC_DIR}"
rm -f \
  "${DOCS_STATIC_DIR}"/*.html \
  "${DOCS_STATIC_DIR}/schema_doc.css" \
  "${DOCS_STATIC_DIR}/schema_doc.min.js" \
  "${DOCS_STATIC_DIR}/manifest.json"
cp -f "${HTML_DIR}"/*.html "${DOCS_STATIC_DIR}/"
cp -f "${HTML_DIR}/schema_doc.css" "${DOCS_STATIC_DIR}/"
cp -f "${HTML_DIR}/schema_doc.min.js" "${DOCS_STATIC_DIR}/"

echo "Copied schema docs to ${DOCS_STATIC_DIR}"

"${NODE_BIN}" --import tsx "${REPO_ROOT}/scripts/update-template-system-docs.ts" "${SCHEMA_DIR}"