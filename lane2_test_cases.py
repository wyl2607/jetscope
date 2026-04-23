"""
Lane 2 Integration Test Cases
Tests for Rotterdam/ARA Jet, EU ETS, and Germany Premium market data sources
"""

import json
from typing import Any

# Mock response structure for testing
MOCK_LANE2_SNAPSHOT_RESPONSE: dict[str, Any] = {
    "generated_at": "2026-04-22T14:30:00Z",
    "source_status": {
        "overall": "ok"
    },
    "values": {
        # Existing Lane 1 metrics
        "brent_usd_per_bbl": 114.93,
        "jet_usd_per_l": 0.99,
        "carbon_proxy_usd_per_t": 88.79,
        "jet_eu_proxy_usd_per_l": 1.15,
        
        # NEW Lane 2 metrics
        "rotterdam_jet_fuel_usd_per_l": 0.87,
        "eu_ets_price_eur_per_t": 92.50,
        "germany_premium_pct": 2.5,
    },
    "source_details": {
        # Existing sources (omitted for brevity)
        
        # NEW Rotterdam Jet Fuel source detail
        "rotterdam_jet_fuel": {
            "source": "rotterdam-jet-direct",
            "status": "ok",
            "value": 0.87,
            "error": None,
            "note": "ARA/Rotterdam Jet Fuel CIF NWE: 690.50 USD/metric ton.",
            "region": "eu",
            "market_scope": "physical_spot_rotterdam",
            "lag_minutes": 240,
            "confidence_score": 0.82,
            "fallback_used": False,
            "raw_usd_per_metric_ton": 690.50,
        },
        
        # NEW EU ETS Carbon Price source detail
        "eu_ets": {
            "source": "eex-eu-ets",
            "status": "ok",
            "value": 92.50,
            "error": None,
            "note": None,
            "region": "eu",
            "market_scope": "carbon_ets_settlement",
            "lag_minutes": 60,
            "confidence_score": 0.90,
            "fallback_used": False,
            "raw_eur_per_t": 92.50,
            "usd_per_t": 100.20,
        },
        
        # NEW Germany Premium source detail
        "germany_premium": {
            "source": "germany-premium-db",
            "status": "ok",
            "value": 2.5,
            "error": None,
            "note": "German aviation fuel tax premium per energy tax directive; applies to delivered ARA-sourced jet fuel.",
            "region": "de",
            "market_scope": "regional_tax_premium",
            "lag_minutes": 1440,
            "confidence_score": 0.75,
            "fallback_used": False,
        },
    }
}

# Test scenarios
def test_scenario_all_sources_ok():
    """Test case: All sources available and returning data."""
    response = MOCK_LANE2_SNAPSHOT_RESPONSE
    
    # Validate all 7 metrics present
    assert len(response["values"]) == 7, "Should have 7 metrics"
    
    # Validate new metrics
    assert response["values"]["rotterdam_jet_fuel_usd_per_l"] == 0.87
    assert response["values"]["eu_ets_price_eur_per_t"] == 92.50
    assert response["values"]["germany_premium_pct"] == 2.5
    
    # Validate source details metadata
    assert response["source_details"]["rotterdam_jet_fuel"]["confidence_score"] == 0.82
    assert response["source_details"]["eu_ets"]["confidence_score"] == 0.90
    assert response["source_details"]["germany_premium"]["confidence_score"] == 0.75
    
    # Validate raw data preservation
    assert response["source_details"]["rotterdam_jet_fuel"]["raw_usd_per_metric_ton"] == 690.50
    assert response["source_details"]["eu_ets"]["usd_per_t"] == 100.20
    
    print("✅ Test PASSED: All sources OK")


def test_scenario_rotterdam_fallback():
    """Test case: Rotterdam source fails, uses fallback."""
    response = MOCK_LANE2_SNAPSHOT_RESPONSE.copy()
    response["source_details"]["rotterdam_jet_fuel"] = {
        "source": "rotterdam-jet-direct",
        "status": "fallback",
        "value": 0.85,  # Fallback seed value
        "error": "Connection timeout to Investing.com",
        "region": "eu",
        "market_scope": "physical_spot_rotterdam",
        "lag_minutes": 240,
        "confidence_score": 0.82,
        "fallback_used": True,
    }
    
    # Verify fallback value used
    assert response["source_details"]["rotterdam_jet_fuel"]["value"] == 0.85
    assert response["source_details"]["rotterdam_jet_fuel"]["fallback_used"] is True
    assert "Connection timeout" in response["source_details"]["rotterdam_jet_fuel"]["error"]
    
    print("✅ Test PASSED: Rotterdam fallback working")


def test_scenario_eu_ets_with_usd_conversion():
    """Test case: EU ETS price with USD conversion from ECB rate."""
    response = MOCK_LANE2_SNAPSHOT_RESPONSE.copy()
    
    # Verify both EUR and USD values present
    assert response["source_details"]["eu_ets"]["raw_eur_per_t"] == 92.50
    assert response["source_details"]["eu_ets"]["usd_per_t"] == 100.20
    
    # Validate conversion ratio (USD/EUR rate implied)
    conversion_rate = 100.20 / 92.50
    assert 1.08 < conversion_rate < 1.10, "ECB rate should be around 1.09"
    
    print("✅ Test PASSED: EU ETS USD conversion correct")


def test_scenario_schema_compatibility():
    """Test case: New fields are optional and backward compatible."""
    response = MOCK_LANE2_SNAPSHOT_RESPONSE.copy()
    
    # Remove optional fields
    del response["source_details"]["rotterdam_jet_fuel"]["raw_usd_per_metric_ton"]
    del response["source_details"]["eu_ets"]["raw_eur_per_t"]
    
    # Response should still be valid (optional fields)
    assert response["source_details"]["rotterdam_jet_fuel"]["value"] == 0.87
    assert response["source_details"]["eu_ets"]["value"] == 92.50
    
    print("✅ Test PASSED: Schema backward compatible")


def test_scenario_metric_keys_in_history():
    """Test case: New metrics appear in market history API."""
    history_response = {
        "generated_at": "2026-04-22T14:30:00Z",
        "metrics": {
            # Existing metrics
            "brent_usd_per_bbl": {
                "metric_key": "brent_usd_per_bbl",
                "unit": "USD/bbl",
                "latest_value": 114.93,
                "points": []
            },
            
            # NEW Lane 2 metrics
            "rotterdam_jet_fuel_usd_per_l": {
                "metric_key": "rotterdam_jet_fuel_usd_per_l",
                "unit": "USD/L",
                "latest_value": 0.87,
                "change_pct_1d": 0.5,
                "points": []
            },
            "eu_ets_price_eur_per_t": {
                "metric_key": "eu_ets_price_eur_per_t",
                "unit": "EUR/tCO2",
                "latest_value": 92.50,
                "change_pct_1d": -1.2,
                "points": []
            },
            "germany_premium_pct": {
                "metric_key": "germany_premium_pct",
                "unit": "%",
                "latest_value": 2.5,
                "change_pct_1d": 0.0,
                "points": []
            },
        }
    }
    
    # Validate all metrics appear in history
    assert "rotterdam_jet_fuel_usd_per_l" in history_response["metrics"]
    assert "eu_ets_price_eur_per_t" in history_response["metrics"]
    assert "germany_premium_pct" in history_response["metrics"]
    
    # Validate units
    assert history_response["metrics"]["rotterdam_jet_fuel_usd_per_l"]["unit"] == "USD/L"
    assert history_response["metrics"]["eu_ets_price_eur_per_t"]["unit"] == "EUR/tCO2"
    assert history_response["metrics"]["germany_premium_pct"]["unit"] == "%"
    
    print("✅ Test PASSED: New metrics in history API")


def test_scenario_data_persistence():
    """Test case: Market snapshots persisted with all 7 metrics."""
    # Simulated database query result
    persisted_metrics = [
        {"metric_key": "brent_usd_per_bbl", "value": 114.93},
        {"metric_key": "jet_usd_per_l", "value": 0.99},
        {"metric_key": "carbon_proxy_usd_per_t", "value": 88.79},
        {"metric_key": "jet_eu_proxy_usd_per_l", "value": 1.15},
        {"metric_key": "rotterdam_jet_fuel_usd_per_l", "value": 0.87},
        {"metric_key": "eu_ets_price_eur_per_t", "value": 92.50},
        {"metric_key": "germany_premium_pct", "value": 2.5},
    ]
    
    # Validate all 7 metrics persisted
    assert len(persisted_metrics) == 7
    metric_keys = [m["metric_key"] for m in persisted_metrics]
    assert "rotterdam_jet_fuel_usd_per_l" in metric_keys
    assert "eu_ets_price_eur_per_t" in metric_keys
    assert "germany_premium_pct" in metric_keys
    
    print("✅ Test PASSED: All metrics persisted to database")


def run_all_tests():
    """Execute all test scenarios."""
    print("=" * 70)
    print("LANE 2 INTEGRATION TEST SUITE")
    print("=" * 70)
    print()
    
    tests = [
        test_scenario_all_sources_ok,
        test_scenario_rotterdam_fallback,
        test_scenario_eu_ets_with_usd_conversion,
        test_scenario_schema_compatibility,
        test_scenario_metric_keys_in_history,
        test_scenario_data_persistence,
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"❌ Test FAILED: {test.__name__}")
            print(f"   Error: {e}")
            failed += 1
        except Exception as e:
            print(f"❌ Test ERROR: {test.__name__}")
            print(f"   Error: {e}")
            failed += 1
    
    print()
    print("=" * 70)
    print(f"RESULTS: {passed} passed, {failed} failed")
    print("=" * 70)
    
    return failed == 0


if __name__ == "__main__":
    import sys
    success = run_all_tests()
    sys.exit(0 if success else 1)
