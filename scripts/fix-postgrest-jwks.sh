#!/usr/bin/env bash
# fix-postgrest-jwks.sh
#
# Supabase CLI v2.106 + PostgREST v14.5 bug: the CLI includes BOTH the GoTrue
# EC key (ES256) AND a raw JWT-secret oct key (no "alg" field) in
# PGRST_JWT_SECRET. PostgREST v14.5's JOSE library returns PGRST303 ("JWT
# issued at future") for ALL ES256 tokens when the oct key is present.
#
# This script recreates the PostgREST container using ONLY the EC key fetched
# from GoTrue's public JWKS endpoint. Call it once after "supabase start".
#
# Usage:
#   ./scripts/fix-postgrest-jwks.sh                  # main project (default)
#   ./scripts/fix-postgrest-jwks.sh villa-booking     # alternate project suffix

set -euo pipefail

PROJECT="${1:-next-supabase-saas-kit-turbo}"
CONTAINER="supabase_rest_${PROJECT}"
NETWORK="supabase_network_${PROJECT}"
DB_HOST="supabase_db_${PROJECT}"

echo "fix-postgrest-jwks: project=${PROJECT}"

# Detect Kong's published host port using python3 to safely parse JSON
KONG_PORT=$(docker inspect "supabase_kong_${PROJECT}" \
  --format '{{json .NetworkSettings.Ports}}' 2>/dev/null \
  | python3 -c "
import json,sys
ports = json.load(sys.stdin)
for bindings in ports.values():
    if bindings:
        print(bindings[0]['HostPort'])
        break
else:
    print('54321')
" 2>/dev/null || echo "54321")

KONG_URL="http://localhost:${KONG_PORT}"

echo "  Fetching EC JWKS from ${KONG_URL}/auth/v1/.well-known/jwks.json ..."
EC_JWKS=$(curl -sf "${KONG_URL}/auth/v1/.well-known/jwks.json") || {
  echo "ERROR: Could not fetch JWKS from GoTrue at ${KONG_URL}. Is Supabase running?" >&2
  exit 1
}

# Sanity check: must contain only EC keys (no "oct")
if echo "$EC_JWKS" | python3 -c "
import json, sys
keys = json.load(sys.stdin)['keys']
oct_keys = [k for k in keys if k.get('kty') == 'oct']
if oct_keys:
    sys.exit(1)
" 2>/dev/null; then
  echo "  JWKS is already EC-only — no oct key found."
else
  echo "  WARNING: GoTrue JWKS contains oct keys; using full JWKS anyway (GoTrue may have changed)."
fi

# Detect the PostgREST image version from the existing container (fall back to v14.5)
PGRST_IMAGE=$(docker inspect "$CONTAINER" --format '{{.Config.Image}}' 2>/dev/null \
  || echo "public.ecr.aws/supabase/postgrest:v14.5")

echo "  Recreating ${CONTAINER} with EC-only JWKS (image: ${PGRST_IMAGE}) ..."
docker rm -f "$CONTAINER" 2>/dev/null || true

docker run -d --name "$CONTAINER" \
  --network "$NETWORK" \
  -e "PGRST_DB_URI=postgresql://authenticator:postgres@${DB_HOST}:5432/postgres" \
  -e "PGRST_DB_SCHEMAS=public,storage,graphql_public" \
  -e "PGRST_DB_EXTRA_SEARCH_PATH=public,extensions" \
  -e "PGRST_DB_MAX_ROWS=1000" \
  -e "PGRST_DB_ANON_ROLE=anon" \
  -e "PGRST_JWT_SECRET=${EC_JWKS}" \
  -e "PGRST_ADMIN_SERVER_PORT=3001" \
  "$PGRST_IMAGE" > /dev/null

echo "  Waiting for PostgREST to be healthy..."
for i in $(seq 1 10); do
  STATUS=$(docker inspect --format '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo "missing")
  if [ "$STATUS" = "running" ]; then
    # PostgREST logs "API server listening" when fully ready
    if docker logs "$CONTAINER" 2>&1 | grep -q "API server listening"; then
      echo "fix-postgrest-jwks: done. PostgREST is healthy."
      exit 0
    fi
  fi
  sleep 1
done

echo "WARNING: PostgREST container started but health check timed out. Check with: docker logs ${CONTAINER}"
