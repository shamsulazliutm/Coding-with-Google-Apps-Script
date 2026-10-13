#!/bin/sh
# Penggunaan: sh scripts/deploy.sh <uji|prod> <push|deploy> [deploymentId]
# Memilih fail .clasp.<env>.json, kemudian menjalankan clasp.
# Untuk 'deploy', beri deploymentId sedia ada supaya URL web app kekal sama.
set -e
cd "$(dirname "$0")/.."
ENV="$1"; ACTION="$2"; DEPLOY_ID="$3"

if [ "$ENV" != "uji" ] && [ "$ENV" != "prod" ]; then
  echo "Persekitaran mesti 'uji' atau 'prod'." >&2; exit 1
fi
CFG=".clasp.$ENV.json"
if [ ! -f "$CFG" ]; then
  echo "Fail $CFG tiada. Salin $CFG.example dan isi scriptId." >&2; exit 1
fi

cp "$CFG" .clasp.json
trap 'rm -f .clasp.json' EXIT

case "$ACTION" in
  push)
    npx --yes @google/clasp push --force
    ;;
  deploy)
    npx --yes @google/clasp push --force
    if [ -n "$DEPLOY_ID" ]; then
      npx --yes @google/clasp deploy --deploymentId "$DEPLOY_ID" --description "UTMPreneur $ENV $(date +%Y-%m-%d_%H:%M)"
    else
      npx --yes @google/clasp deploy --description "UTMPreneur $ENV $(date +%Y-%m-%d_%H:%M)"
      echo "Catat deploymentId di atas dan guna untuk deploy seterusnya supaya URL kekal sama."
    fi
    ;;
  *)
    echo "Tindakan mesti 'push' atau 'deploy'." >&2; exit 1
    ;;
esac
