#!/usr/bin/env python3
"""
SQLite Database Initialization and Verification Script for SAFvsOil
Tests database connectivity, creates tables, and verifies schema
"""

import os
import sys
import sqlite3
from pathlib import Path
from datetime import datetime

def setup_db_directory(db_path: str = "/opt/safvsoil/data/market.db") -> bool:
    """Create database directory structure."""
    try:
        db_dir = Path(db_path).parent
        db_dir.mkdir(parents=True, exist_ok=True)
        
        backup_dir = Path("/opt/safvsoil/backups")
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        print(f"✓ Created database directory: {db_dir}")
        print(f"✓ Created backup directory: {backup_dir}")
        return True
    except Exception as e:
        print(f"✗ Failed to create directories: {e}")
        return False


def create_schema(db_path: str = "/opt/safvsoil/data/market.db") -> bool:
    """Create SQLite schema from migration file."""
    schema_file = Path(__file__).parent.parent / "apps" / "api" / "migrations" / "001_init_sqlite_schema.sql"
    
    if not schema_file.exists():
        print(f"✗ Schema file not found: {schema_file}")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Read and execute schema
        with open(schema_file, 'r') as f:
            schema_sql = f.read()
        
        cursor.executescript(schema_sql)
        conn.commit()
        conn.close()
        
        print(f"✓ Schema created successfully")
        return True
    except Exception as e:
        print(f"✗ Failed to create schema: {e}")
        return False


def verify_schema(db_path: str = "/opt/safvsoil/data/market.db") -> bool:
    """Verify all tables exist and have correct structure."""
    required_tables = {
        "market_prices",
        "user_scenarios",
        "market_alerts",
        "price_cache"
    }
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get list of tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        existing_tables = {row[0] for row in cursor.fetchall()}
        
        missing_tables = required_tables - existing_tables
        if missing_tables:
            print(f"✗ Missing tables: {missing_tables}")
            conn.close()
            return False
        
        print("✓ All required tables exist:")
        for table in required_tables:
            cursor.execute(f"PRAGMA table_info({table});")
            columns = cursor.fetchall()
            print(f"  - {table}: {len(columns)} columns")
        
        # Check indexes
        cursor.execute("SELECT name FROM sqlite_master WHERE type='index';")
        indexes = [row[0] for row in cursor.fetchall()]
        print(f"✓ Created {len(indexes)} indexes")
        
        # Test integrity
        cursor.execute("PRAGMA integrity_check;")
        result = cursor.fetchone()
        if result[0] != "ok":
            print(f"✗ Integrity check failed: {result[0]}")
            conn.close()
            return False
        
        print("✓ Database integrity check passed")
        conn.close()
        return True
        
    except Exception as e:
        print(f"✗ Schema verification failed: {e}")
        return False


def test_basic_operations(db_path: str = "/opt/safvsoil/data/market.db") -> bool:
    """Test basic CRUD operations."""
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Test insert
        import uuid
        test_id = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO market_prices 
            (id, timestamp, market_type, price, unit, source) 
            VALUES (?, ?, ?, ?, ?, ?)
        """, (test_id, datetime.utcnow().isoformat(), "ARA", 85.50, "USD/bbl", "test"))
        conn.commit()
        print("✓ INSERT operation successful")
        
        # Test select
        cursor.execute("SELECT COUNT(*) FROM market_prices WHERE market_type = ?", ("ARA",))
        count = cursor.fetchone()[0]
        print(f"✓ SELECT operation successful ({count} records)")
        
        # Test update
        cursor.execute("UPDATE market_prices SET price = ? WHERE id = ?", (86.00, test_id))
        conn.commit()
        print("✓ UPDATE operation successful")
        
        # Test delete
        cursor.execute("DELETE FROM market_prices WHERE id = ?", (test_id,))
        conn.commit()
        print("✓ DELETE operation successful")
        
        conn.close()
        return True
    except Exception as e:
        print(f"✗ CRUD operations test failed: {e}")
        return False


def main():
    """Run initialization sequence."""
    print("=" * 60)
    print("SQLite Database Initialization for SAFvsOil")
    print("=" * 60)
    
    db_path = os.getenv("SAFVSOIL_SQLITE_DB_PATH", "/opt/safvsoil/data/market.db")
    print(f"\nDatabase path: {db_path}\n")
    
    # Step 1: Setup directories
    print("[1/4] Setting up directories...")
    if not setup_db_directory(db_path):
        sys.exit(1)
    print()
    
    # Step 2: Create schema
    print("[2/4] Creating database schema...")
    if not create_schema(db_path):
        sys.exit(1)
    print()
    
    # Step 3: Verify schema
    print("[3/4] Verifying schema...")
    if not verify_schema(db_path):
        sys.exit(1)
    print()
    
    # Step 4: Test operations
    print("[4/4] Testing basic operations...")
    if not test_basic_operations(db_path):
        sys.exit(1)
    print()
    
    print("=" * 60)
    print("✓ SQLite Database Initialization Completed Successfully!")
    print("=" * 60)
    print(f"\nDatabase file: {db_path}")
    print(f"Size: {Path(db_path).stat().st_size / 1024:.2f} KB")
    print("\nNext steps:")
    print("1. Set environment variables if using non-default paths:")
    print(f"   export SAFVSOIL_SQLITE_DB_PATH={db_path}")
    print("2. Start the API server:")
    print("   cd apps/api && uvicorn app.main:app --reload")
    print("3. Test endpoints:")
    print("   curl http://localhost:8000/v1/sqlite/market-prices")
    

if __name__ == "__main__":
    main()
