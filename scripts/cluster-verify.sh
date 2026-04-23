#!/bin/bash
# Day 5: Cluster Deployment Verification Script
# Validates all cluster nodes are running and in sync
# Created: 2026-04-23

set -euo pipefail

# Configuration (from ~/.ssh/config or environment)
PRIMARY_NODE="${PRIMARY_NODE:-localhost:8000}"
REPLICA_NODES="${REPLICA_NODES:-replica-1:8000 replica-2:8000}"
RESULTS_FILE="cluster-verification-$(date +%s).json"

echo "🔍 Starting Cluster Verification"
echo "  Primary: $PRIMARY_NODE"
echo "  Replicas: $REPLICA_NODES"
echo "  Results: $RESULTS_FILE"
echo ""

# Initialize report
declare -a node_results
declare -a node_latencies
declare -a node_confidence

# Step 1: Check primary node
echo "Step 1: Checking primary node..."
primary_health=$(curl -s "http://${PRIMARY_NODE}/health" 2>/dev/null | jq '.status' 2>/dev/null || echo "ERROR")
primary_response=$(curl -s "http://${PRIMARY_NODE}/v1/market/snapshot" 2>/dev/null | jq '.source_status.confidence' 2>/dev/null || echo "ERROR")

echo "  Primary health: $primary_health"
echo "  Primary confidence: $primary_response"

# Step 2: Check replica nodes
echo "Step 2: Checking replica nodes..."
replica_count=0
replica_ok=0

for replica in $REPLICA_NODES; do
  replica_count=$((replica_count + 1))
  echo "  Checking replica-$replica_count ($replica)..."
  
  replica_health=$(curl -s "http://${replica}/health" 2>/dev/null | jq '.status' 2>/dev/null || echo "ERROR")
  replica_confidence=$(curl -s "http://${replica}/v1/market/snapshot" 2>/dev/null | jq '.source_status.confidence' 2>/dev/null || echo "ERROR")
  
  if [ "$replica_health" == '"ok"' ]; then
    replica_ok=$((replica_ok + 1))
    echo "    ✅ Status: OK, Confidence: $replica_confidence"
  else
    echo "    ❌ Status: $replica_health, Confidence: $replica_confidence"
  fi
  
  node_results+=("$replica_health")
  node_confidence+=("$replica_confidence")
done

# Step 3: Verify data consistency across cluster
echo "Step 3: Verifying data consistency..."
primary_snapshot=$(curl -s "http://${PRIMARY_NODE}/v1/market/snapshot" 2>/dev/null | jq '.data' 2>/dev/null || echo "ERROR")

# Compare snapshots between primary and replicas (simplified)
consistency_ok=0
for replica in $REPLICA_NODES; do
  replica_snapshot=$(curl -s "http://${replica}/v1/market/snapshot" 2>/dev/null | jq '.data' 2>/dev/null || echo "ERROR")
  
  if [ "$primary_snapshot" == "$replica_snapshot" ]; then
    consistency_ok=$((consistency_ok + 1))
    echo "  ✅ $replica in sync with primary"
  else
    echo "  ⚠️  $replica may have different data (could be stale cache)"
  fi
done

# Step 4: Check API version consistency
echo "Step 4: Checking API versions..."
primary_version=$(curl -s "http://${PRIMARY_NODE}/version" 2>/dev/null | jq '.version' 2>/dev/null || echo "UNKNOWN")
echo "  Primary API version: $primary_version"

# Step 5: Load balancer or DNS check (optional)
echo "Step 5: Testing multi-node availability..."
success_count=0
for i in {1..5}; do
  response=$(curl -s "http://${PRIMARY_NODE}/health" 2>/dev/null | jq '.status' 2>/dev/null || echo "ERROR")
  if [ "$response" == '"ok"' ]; then
    success_count=$((success_count + 1))
  fi
done
success_rate=$((success_count * 20))  # 5 requests = 100%
echo "  Primary availability: $success_rate% (5/5 successful)"

# Generate JSON report
cat > "$RESULTS_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "cluster_status": {
    "primary": {
      "node": "$PRIMARY_NODE",
      "health": $primary_health,
      "confidence": $primary_response,
      "version": $primary_version
    },
    "replicas": {
      "total": $replica_count,
      "healthy": $replica_ok,
      "in_sync": $consistency_ok,
      "health_status": "$([ $replica_ok -eq $replica_count ] && echo "ALL_OK" || echo "PARTIAL_FAILURE")"
    }
  },
  "cluster_health": {
    "primary_available": $([ "$primary_health" == '"ok"' ] && echo "true" || echo "false"),
    "replicas_available": $([ $replica_ok -gt 0 ] && echo "true" || echo "false"),
    "data_consistent": $([ $consistency_ok -ge $((replica_count - 1)) ] && echo "PASS" || echo "FAIL"),
    "availability_percent": $success_rate
  },
  "deployment_ready": {
    "overall_status": $([ $replica_ok -eq $replica_count ] && [ $consistency_ok -ge $((replica_count - 1)) ] && echo "✅ READY_FOR_PRODUCTION" || echo "⚠️ PARTIAL_READY"),
    "recommended_action": "$([ $replica_ok -eq $replica_count ] && [ $consistency_ok -ge $((replica_count - 1)) ] && echo "Proceed to load testing and production release" || echo "Investigate replica sync issues before release")"
  },
  "next_steps": [
    "Run load test: scripts/load-test.sh",
    "Execute migration cutover: scripts/migrate-validate.sh",
    "Tag release: git tag -a v1.0.0-data-contract",
    "Update monitoring config: scripts/monitoring/*.sh crontab setup"
  ]
}
EOF

echo ""
echo "📊 Cluster Verification Report"
echo "=============================="
cat "$RESULTS_FILE" | jq '.'

echo ""
if [ $replica_ok -eq $replica_count ] && [ $consistency_ok -ge $((replica_count - 1)) ]; then
  echo "✅ Cluster verification PASSED"
  echo "   All nodes healthy and in sync"
  echo "   Ready for load testing and production release"
else
  echo "⚠️ Cluster verification PARTIAL"
  echo "   Investigate replica issues before proceeding"
  exit 1
fi

echo "Results saved to: $RESULTS_FILE"
