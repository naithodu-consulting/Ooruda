#!/usr/bin/env bash
# db-push.sh — safely push migrations to the linked Supabase project.
# Blocks pushes to Ooruda Production unless --production flag is explicitly passed.
#
# Usage:
#   ./scripts/db-push.sh              # push to dev (default, safe)
#   ./scripts/db-push.sh --production # push to production (requires confirmation)

set -euo pipefail

# Resolve paths relative to the repo root (script lives in <root>/scripts/)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PROD_REF="vkxchopjqakvftcnxwie"
DEV_REF="bcdosjrbkkemsqowhigj"
PROJECT_REF_FILE="${REPO_ROOT}/apps/web/supabase/.temp/project-ref"

# Read currently linked project
if [[ ! -f "$PROJECT_REF_FILE" ]]; then
  echo "ERROR: No linked Supabase project found. Run 'supabase link' first."
  exit 1
fi

LINKED_REF=$(cat "$PROJECT_REF_FILE")

if [[ "$LINKED_REF" == "$PROD_REF" ]]; then
  if [[ "${1:-}" != "--production" ]]; then
    echo ""
    echo "  BLOCKED: Currently linked to Ooruda Production (${PROD_REF})."
    echo "  Pushing without an explicit flag is not allowed."
    echo ""
    echo "  To push to production, run:"
    echo "    ./scripts/db-push.sh --production"
    echo ""
    exit 1
  fi

  echo ""
  echo "  WARNING: You are about to push migrations to OORUDA PRODUCTION."
  echo "  Project: ${PROD_REF}"
  echo ""
  read -r -p "  Type 'yes' to confirm: " confirm
  if [[ "$confirm" != "yes" ]]; then
    echo "  Aborted."
    exit 1
  fi
  echo ""

elif [[ "$LINKED_REF" == "$DEV_REF" ]]; then
  if [[ "${1:-}" == "--production" ]]; then
    echo "ERROR: --production flag passed but linked project is Ooruda Development, not Production."
    echo "Re-link to the production project first: cd apps/web && supabase link"
    exit 1
  fi
  echo "Pushing to Ooruda Development (${DEV_REF})..."

else
  echo "ERROR: Linked project '${LINKED_REF}' is neither Dev nor Production."
  echo "Refusing to push to an unrecognised project."
  exit 1
fi

cd "${REPO_ROOT}/apps/web" && supabase db push --linked
