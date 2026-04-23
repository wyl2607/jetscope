#!/bin/bash

# Test script for SQLite endpoints
# Requires running API server: uvicorn app.main:app --reload

set -e

BASE_URL="http://localhost:8000/v1"
API_URL="${BASE_URL}/sqlite"

echo "=========================================="
echo "SQLite Integration Endpoint Tests"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Test result tracking
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local expected_status=$4
    
    echo -n "Testing $method $endpoint... "
    
    if [ "$method" == "POST" ]; then
        status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    elif [ "$method" == "PUT" ]; then
        status=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$API_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    elif [ "$method" == "GET" ]; then
        status=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL$endpoint")
    elif [ "$method" == "DELETE" ]; then
        status=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL$endpoint")
    fi
    
    if [ "$status" == "$expected_status" ]; then
        echo -e "${GREEN}OK (${status})${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}FAIL (expected ${expected_status}, got ${status})${NC}"
        ((TESTS_FAILED++))
    fi
}

# Test Market Prices
echo ""
echo "--- Market Prices ---"
PRICE_JSON='{"market_type":"ARA","price":85.50,"unit":"USD/bbl","source":"CME"}'
test_endpoint POST "/market-prices" "$PRICE_JSON" "201"
test_endpoint GET "/market-prices" "" "200"
test_endpoint GET "/market-prices/latest/ARA" "" "200"

# Get a price ID for other tests
PRICE_ID=$(curl -s -X POST "$API_URL/market-prices" \
    -H "Content-Type: application/json" \
    -d "$PRICE_JSON" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -n "$PRICE_ID" ]; then
    test_endpoint GET "/market-prices/$PRICE_ID" "" "200"
    test_endpoint PUT "/market-prices/$PRICE_ID" '{"price":86.00}' "200"
    test_endpoint DELETE "/market-prices/$PRICE_ID" "" "204"
fi

# Test User Scenarios
echo ""
echo "--- User Scenarios ---"
SCENARIO_JSON='{"scenario_name":"Base Case","parameters":{"crude_price":80.0,"carbon_cost":25.0}}'
test_endpoint POST "/user-scenarios?user_id=user_123" "$SCENARIO_JSON" "201"
test_endpoint GET "/user-scenarios?user_id=user_123" "" "200"

# Get scenario ID
SCENARIO_ID=$(curl -s -X POST "$API_URL/user-scenarios?user_id=user_123" \
    -H "Content-Type: application/json" \
    -d "$SCENARIO_JSON" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -n "$SCENARIO_ID" ]; then
    test_endpoint GET "/user-scenarios/$SCENARIO_ID" "" "200"
    test_endpoint PUT "/user-scenarios/$SCENARIO_ID" '{"scenario_name":"Updated"}' "200"
    test_endpoint DELETE "/user-scenarios/$SCENARIO_ID" "" "204"
fi

# Test Market Alerts
echo ""
echo "--- Market Alerts ---"
ALERT_JSON='{"market_type":"ARA","threshold_type":"above","threshold_value":100.0}'
test_endpoint POST "/market-alerts" "$ALERT_JSON" "201"
test_endpoint GET "/market-alerts" "" "200"
test_endpoint GET "/market-alerts?market_type=ARA&status=active" "" "200"

# Get alert ID
ALERT_ID=$(curl -s -X POST "$API_URL/market-alerts" \
    -H "Content-Type: application/json" \
    -d "$ALERT_JSON" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -n "$ALERT_ID" ]; then
    test_endpoint GET "/market-alerts/$ALERT_ID" "" "200"
    test_endpoint PUT "/market-alerts/$ALERT_ID" '{"threshold_value":105.0}' "200"
    test_endpoint PUT "/market-alerts/$ALERT_ID/trigger" "" "200"
    test_endpoint DELETE "/market-alerts/$ALERT_ID" "" "204"
fi

# Summary
echo ""
echo "=========================================="
echo "Test Results:"
echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
echo "=========================================="

if [ $TESTS_FAILED -eq 0 ]; then
    exit 0
else
    exit 1
fi
