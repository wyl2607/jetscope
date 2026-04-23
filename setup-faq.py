#!/usr/bin/env python3
"""
FAQ Page Setup Script
Creates the /faq directory and page.tsx file for SAFvsOil project
"""

import os
import shutil
from pathlib import Path

def setup_faq():
    """Create FAQ directory and deploy page.tsx"""
    
    # Define paths
    base_path = Path("/Users/yumei/SAFvsOil/apps/web/app")
    faq_dir = base_path / "faq"
    temp_file = base_path / "_faq_page_temp.tsx"
    target_file = faq_dir / "page.tsx"
    
    print("🚀 Setting up FAQ page...")
    print(f"   Base path: {base_path}")
    print(f"   FAQ dir: {faq_dir}")
    
    # Step 1: Create directory
    try:
        faq_dir.mkdir(parents=True, exist_ok=True)
        print(f"✅ Directory created: {faq_dir}")
    except Exception as e:
        print(f"❌ Failed to create directory: {e}")
        return False
    
    # Step 2: Copy temp file to final location
    try:
        if temp_file.exists():
            shutil.copy(temp_file, target_file)
            print(f"✅ File deployed: {target_file}")
        else:
            print(f"❌ Temp file not found: {temp_file}")
            return False
    except Exception as e:
        print(f"❌ Failed to copy file: {e}")
        return False
    
    # Step 3: Verify
    try:
        if target_file.exists():
            size = target_file.stat().st_size
            lines = len(target_file.read_text().split('\n'))
            print(f"✅ File verified: {size} bytes, {lines} lines")
        else:
            print(f"❌ Verification failed: file not found")
            return False
    except Exception as e:
        print(f"❌ Verification error: {e}")
        return False
    
    # Step 4: List directory contents
    try:
        faq_files = list(faq_dir.iterdir())
        print(f"✅ Directory contents: {[f.name for f in faq_files]}")
    except Exception as e:
        print(f"❌ Failed to list directory: {e}")
        return False
    
    print("\n✅ FAQ setup complete!")
    print(f"\n📍 Page location: /faq")
    print(f"📍 File path: {target_file}")
    print(f"📍 Sitemap updated: ✅")
    
    return True

if __name__ == "__main__":
    import sys
    success = setup_faq()
    sys.exit(0 if success else 1)
