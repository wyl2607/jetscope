#!/bin/bash
# SAFvsOil 部署前检查脚本
# 验证所有依赖和配置是否正确

set -e

PROJECT_ROOT="/Users/yumei/SAFvsOil"
API_DIR="$PROJECT_ROOT/apps/api"
VENV_DIR="$API_DIR/venv"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}========== SAFvsOil 部署前检查 ==========${NC}\n"

# 检查项目结构
echo "1️⃣  检查项目结构..."
[ -d "$PROJECT_ROOT" ] && echo "  ✓ 项目根目录存在" || (echo "  ✗ 项目根目录不存在"; exit 1)
[ -d "$API_DIR" ] && echo "  ✓ API 目录存在" || (echo "  ✗ API 目录不存在"; exit 1)
[ -f "$API_DIR/requirements.txt" ] && echo "  ✓ requirements.txt 存在" || (echo "  ✗ requirements.txt 不存在"; exit 1)
[ -f "$PROJECT_ROOT/scripts/init-sqlite-db.py" ] && echo "  ✓ 初始化脚本存在" || (echo "  ✗ 初始化脚本不存在"; exit 1)

# 检查 Python
echo -e "\n2️⃣  检查 Python 环境..."
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "  Python 版本: $PYTHON_VERSION"
if [[ "$PYTHON_VERSION" > "3.10" ]]; then
    echo "  ✓ Python 版本满足要求"
else
    echo "  ✗ Python 版本不满足要求 (需要 3.11+)"
    exit 1
fi

# 检查/创建虚拟环境
echo -e "\n3️⃣  检查虚拟环境..."
if [ ! -d "$VENV_DIR" ]; then
    echo "  创建虚拟环境..."
    cd "$API_DIR"
    python3 -m venv venv
    echo "  ✓ 虚拟环境已创建"
else
    echo "  ✓ 虚拟环境已存在"
fi

# 激活虚拟环境
source "$VENV_DIR/bin/activate"
echo "  ✓ 虚拟环境已激活"

# 检查依赖
echo -e "\n4️⃣  检查依赖包..."
cd "$API_DIR"

packages=("fastapi" "uvicorn" "sqlalchemy" "aiosqlite" "pydantic")
for pkg in "${packages[@]}"; do
    if python3 -c "import ${pkg}" 2>/dev/null; then
        version=$(pip show "$pkg" 2>/dev/null | grep Version | awk '{print $2}')
        echo "  ✓ $pkg ($version)"
    else
        echo "  ✗ $pkg 未安装，安装中..."
        pip install -q "$pkg" || exit 1
        echo "  ✓ $pkg 已安装"
    fi
done

# 检查 FastAPI app 可以加载
echo -e "\n5️⃣  检查 FastAPI 应用..."
if python3 -c "from app.main import create_app; app = create_app(); print('✓ FastAPI app 已加载')" 2>&1; then
    echo "  ✓ FastAPI 应用可以正常加载"
else
    echo "  ✗ FastAPI 应用加载失败，检查错误上面"
    exit 1
fi

# 检查迁移文件
echo -e "\n6️⃣  检查数据库迁移..."
SCHEMA_FILE="$API_DIR/migrations/001_init_sqlite_schema.sql"
if [ -f "$SCHEMA_FILE" ]; then
    lines=$(wc -l < "$SCHEMA_FILE")
    echo "  ✓ 迁移文件存在 ($lines 行)"
else
    echo "  ✗ 迁移文件不存在"
    exit 1
fi

# 检查初始化脚本
echo -e "\n7️⃣  检查初始化脚本..."
INIT_SCRIPT="$PROJECT_ROOT/scripts/init-sqlite-db.py"
if [ -f "$INIT_SCRIPT" ]; then
    lines=$(wc -l < "$INIT_SCRIPT")
    echo "  ✓ 初始化脚本存在 ($lines 行)"
    
    # 检查脚本是否可执行
    if python3 -c "import sys; sys.path.insert(0, '$PROJECT_ROOT'); exec(open('$INIT_SCRIPT').read())" --help 2>/dev/null; then
        echo "  ✓ 初始化脚本语法正确"
    else
        echo "  ⚠️  初始化脚本未提供 --help，但语法应该是正确的"
    fi
else
    echo "  ✗ 初始化脚本不存在"
    exit 1
fi

echo -e "\n${GREEN}✅ 所有检查通过！可以开始部署${NC}"
echo -e "\n${YELLOW}下一步:${NC}"
echo "  1. SSH 到 mac-mini: ssh user@192.168.1.100"
echo "  2. 运行部署脚本: bash deploy-safvsoil.sh prod"
echo "  3. 验证部署: bash verify-safvsoil-deployment.sh 192.168.1.100"
