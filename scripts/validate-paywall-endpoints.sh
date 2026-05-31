#!/bin/bash
# ============================================================
# Paywall Endpoint Validation Script
# Tests all 4 tRPC paywall endpoints against seed data
# ============================================================

API="http://127.0.0.1:3000/api/trpc"
PASS=0
FAIL=0

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  
  if echo "$actual" | grep -q "$expected"; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name"
    echo "    Expected to contain: $expected"
    echo "    Got: $actual"
    FAIL=$((FAIL + 1))
  fi
}

check_count() {
  local name="$1"
  local expected_count="$2"
  local json="$3"
  
  # Count array elements in the result.data.json
  local count=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['result']['data']['json']))" 2>/dev/null)
  
  if [ "$count" = "$expected_count" ]; then
    echo "  ✓ $name (count=$count)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected_count, got $count)"
    echo "    Response: $(echo "$json" | head -c 300)"
    FAIL=$((FAIL + 1))
  fi
}

echo "============================================"
echo "Paywall Endpoint Validation"
echo "============================================"
echo ""

# ---- Test 1: getPlacements with he ----
echo "Test 1: paywall.getPlacements (he)"
RESP=$(curl -s "$API/paywall.getPlacements" \
  -H "x-app-key: catering_manager_pro" \
  -H "x-app-language: he")
check_count "Returns 1 active Hebrew placement" "1" "$RESP"
check "Contains export_feature" "export_feature" "$RESP"
check "Does NOT contain premium_analytics (disabled)" "" "$(echo "$RESP" | grep -o 'premium_analytics')"

# Verify premium_analytics is NOT in the response
if echo "$RESP" | grep -q "premium_analytics"; then
  echo "  ✗ premium_analytics should NOT appear (is_enabled=false)"
  FAIL=$((FAIL + 1))
else
  echo "  ✓ premium_analytics correctly hidden (is_enabled=false)"
  PASS=$((PASS + 1))
fi

echo ""

# ---- Test 2: getPlacements with en ----
echo "Test 2: paywall.getPlacements (en)"
RESP=$(curl -s "$API/paywall.getPlacements" \
  -H "x-app-key: catering_manager_pro" \
  -H "x-app-language: en")
check_count "Returns 1 active English placement" "1" "$RESP"
check "Contains export_feature" "export_feature" "$RESP"
check "Contains 'Advanced Export'" "Advanced Export" "$RESP"

echo ""

# ---- Test 3: getFeatureGates with he ----
echo "Test 3: paywall.getFeatureGates (he)"
RESP=$(curl -s "$API/paywall.getFeatureGates" \
  -H "x-app-key: catering_manager_pro" \
  -H "x-app-language: he")
check_count "Returns 1 active Hebrew gate" "1" "$RESP"
check "Contains pdf_export" "pdf_export" "$RESP"

# Verify advanced_analytics is NOT in the response
if echo "$RESP" | grep -q "advanced_analytics"; then
  echo "  ✗ advanced_analytics should NOT appear (is_enabled=false)"
  FAIL=$((FAIL + 1))
else
  echo "  ✓ advanced_analytics correctly hidden (is_enabled=false)"
  PASS=$((PASS + 1))
fi

echo ""

# ---- Test 4: getFeatureGates with en ----
echo "Test 4: paywall.getFeatureGates (en)"
RESP=$(curl -s "$API/paywall.getFeatureGates" \
  -H "x-app-key: catering_manager_pro" \
  -H "x-app-language: en")
check_count "Returns 1 active English gate" "1" "$RESP"
check "Contains pdf_export" "pdf_export" "$RESP"
check "Contains 'PDF Export'" "PDF Export" "$RESP"

echo ""

# ---- Test 5: getRulesForPlacement (he, export_feature) ----
echo "Test 5: paywall.getRulesForPlacement (he, export_feature)"
INPUT='{"json":{"placementKey":"export_feature"}}'
ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$INPUT'))")
RESP=$(curl -s "$API/paywall.getRulesForPlacement?input=$ENCODED" \
  -H "x-app-key: catering_manager_pro" \
  -H "x-app-language: he")
check_count "Returns 1 rule for export_feature" "1" "$RESP"
check "Contains export_rule_1" "export_rule_1" "$RESP"
check "Contains premium_access entitlement" "premium_access" "$RESP"

echo ""

# ---- Test 6: Language isolation - he should NOT see en data ----
echo "Test 6: Language isolation"
RESP_HE=$(curl -s "$API/paywall.getPlacements" \
  -H "x-app-key: catering_manager_pro" \
  -H "x-app-language: he")
if echo "$RESP_HE" | grep -q "Advanced Export"; then
  echo "  ✗ Hebrew response contains English data (language mixing!)"
  FAIL=$((FAIL + 1))
else
  echo "  ✓ Hebrew response does NOT contain English data"
  PASS=$((PASS + 1))
fi

RESP_EN=$(curl -s "$API/paywall.getPlacements" \
  -H "x-app-key: catering_manager_pro" \
  -H "x-app-language: en")
if echo "$RESP_EN" | python3 -c "import sys,json; d=json.load(sys.stdin)['result']['data']['json']; sys.exit(0 if any('ייצוא' in str(x) for x in d) else 1)" 2>/dev/null; then
  echo "  ✗ English response contains Hebrew data (language mixing!)"
  FAIL=$((FAIL + 1))
else
  echo "  ✓ English response does NOT contain Hebrew data"
  PASS=$((PASS + 1))
fi

echo ""

# ---- Test 7: Missing headers → empty response ----
echo "Test 7: Missing headers"
RESP=$(curl -s "$API/paywall.getPlacements")
check_count "No headers → empty array" "0" "$RESP"

RESP=$(curl -s "$API/paywall.getFeatureGates")
check_count "No headers → empty array (gates)" "0" "$RESP"

echo ""

# ---- Test 8: Unknown language → empty response ----
echo "Test 8: Unknown language (fr)"
RESP=$(curl -s "$API/paywall.getPlacements" \
  -H "x-app-key: catering_manager_pro" \
  -H "x-app-language: fr")
check_count "Unknown language → empty array" "0" "$RESP"

echo ""

# ---- Test 9: getUserEntitlements (no data) ----
echo "Test 9: paywall.getUserEntitlements (no cached data)"
INPUT='{"json":{"userId":"test-user-123"}}'
ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$INPUT'))")
RESP=$(curl -s "$API/paywall.getUserEntitlements?input=$ENCODED" \
  -H "x-app-key: catering_manager_pro" \
  -H "x-app-language: he")
check "Returns null for non-existent user" "null" "$RESP"

echo ""
echo "============================================"
echo "Results: $PASS passed, $FAIL failed"
echo "============================================"

if [ $FAIL -gt 0 ]; then
  exit 1
fi
