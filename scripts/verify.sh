#!/bin/bash
# verify.sh - Integration smoke test

set -euo pipefail

echo "Running integration verification..."

# Check if services are up
echo "Checking API Health..."
api_health=$(curl -sS http://localhost:8001/health)
echo "$api_health"
echo "$api_health" | grep -q '"healthy"'

echo "Checking Detailed API Health..."
health_detail=$(curl -sS http://localhost:8001/health/detail)
echo "$health_detail"
printf "%s" "$health_detail" | python3 -c '
import json
import sys

payload = json.load(sys.stdin)
deps = payload.get("dependencies", {})
for key in ("db", "elasticsearch"):
    if not deps.get(key, {}).get("healthy", False):
        raise SystemExit(f"{key} dependency is unhealthy: {deps.get(key)}")
print("Required dependencies are healthy.")
'

echo "Checking Elasticsearch Health..."
es_health=$(curl -sS http://localhost:9200/)
echo "$es_health" | grep -q "cluster_name"

echo "Checking Nori Analyzer..."
nori_result=$(curl -sS -X POST http://localhost:9200/_analyze \
    -H 'Content-Type: application/json' \
    -d '{"tokenizer":"nori_tokenizer","text":"안녕하세요 Sync Hub"}')
echo "$nori_result"
printf "%s" "$nori_result" | python3 -c '
import json
import sys

payload = json.load(sys.stdin)
tokens = payload.get("tokens", [])
if not tokens:
    raise SystemExit("Nori analyzer returned no tokens.")
print(f"Nori tokens: {len(tokens)}")
'

echo "All services are operational."
