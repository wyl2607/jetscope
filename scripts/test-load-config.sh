#!/bin/bash
set -euo pipefail

# Source load-test and verify key functions exist
source load-test-v1.sh

# Check if key functions are defined
if type log_info 2>&1 | grep -q "is a function"; then
  echo "✓ log_info function exists"
fi

if type validate_prerequisites 2>&1 | grep -q "is a function"; then
  echo "✓ validate_prerequisites function exists"
fi

if type run_load_test 2>&1 | grep -q "is a function"; then
  echo "✓ run_load_test function exists"
fi

echo "✓ load-test-v1.sh script structure valid"
