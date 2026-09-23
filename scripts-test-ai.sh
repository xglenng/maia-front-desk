#!/usr/bin/env bash
set -euo pipefail
curl -sS -X POST http://localhost:3000/api/ai/chat \
  -H 'content-type: application/json' \
  -d '{"organizationId":"REPLACE_ORG_ID","artistId":"REPLACE_ARTIST_ID","clientId":"REPLACE_CLIENT_ID","message":"How much is a tattoo?"}'
