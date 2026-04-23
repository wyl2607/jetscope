#!/usr/bin/env node

/**
 * Webhook 部署验证脚本 - 可在 coco 本地运行
 * 
 * 使用方法:
 *   node verify-webhook-local.mjs
 *   或
 *   chmod +x verify-webhook-local.mjs && ./verify-webhook-local.mjs
 * 
 * 此脚本验证部署的各个方面，不需要外部工具依赖
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 颜色代码
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// 日志函数
const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.blue}${colors.bright}${msg}${colors.reset}\n`),
};

// 计数器
let passed = 0;
let failed = 0;

// ============================================================================
// 检查函数
// ============================================================================

function checkFileExists(filePath, description) {
  if (fs.existsSync(filePath)) {
    log.success(`${description} 存在: ${filePath}`);
    passed++;
    return true;
  } else {
    log.error(`${description} 不存在: ${filePath}`);
    failed++;
    return false;
  }
}

function checkFileContent(filePath, pattern, description) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(pattern)) {
      log.success(`${description}`);
      passed++;
      return true;
    } else {
      log.error(`${description} - 未找到: ${pattern}`);
      failed++;
      return false;
    }
  } catch (err) {
    log.error(`${description} - 读取失败: ${err.message}`);
    failed++;
    return false;
  }
}

function checkJsonFile(filePath, description) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    JSON.parse(content);
    log.success(`${description} 格式有效`);
    passed++;
    return true;
  } catch (err) {
    log.error(`${description} 格式错误: ${err.message}`);
    failed++;
    return false;
  }
}

function checkDirExists(dirPath, description) {
  if (fs.existsSync(dirPath)) {
    log.success(`${description} 目录存在: ${dirPath}`);
    passed++;
    return true;
  } else {
    log.warn(`${description} 目录不存在: ${dirPath}`);
    // 不计为失败，因为目录可以在运行时创建
    return false;
  }
}

function checkEnvironmentFile(envPath) {
  if (!fs.existsSync(envPath)) {
    log.error(`.env.webhook 不存在: ${envPath}`);
    failed++;
    return false;
  }

  try {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    
    const config = {};
    lines.forEach((line) => {
      const [key, value] = line.split('=');
      if (key && value) {
        config[key.trim()] = value.trim();
      }
    });

    let envValid = true;
    if (config.GITHUB_WEBHOOK_SECRET) {
      log.success(`.env.webhook 包含 GITHUB_WEBHOOK_SECRET`);
      passed++;
    } else {
      log.error(`.env.webhook 缺少 GITHUB_WEBHOOK_SECRET`);
      failed++;
      envValid = false;
    }

    if (config.WEBHOOK_PORT) {
      log.success(`.env.webhook 包含 WEBHOOK_PORT=${config.WEBHOOK_PORT}`);
      passed++;
    } else {
      log.warn(`.env.webhook 缺少 WEBHOOK_PORT，将使用默认值 3001`);
      config.WEBHOOK_PORT = '3001';
    }

    log.info(`配置文件: WEBHOOK_PORT=${config.WEBHOOK_PORT}, NODE_ENV=${config.NODE_ENV || 'production'}`);
    return envValid;
  } catch (err) {
    log.error(`.env.webhook 读取错误: ${err.message}`);
    failed++;
    return false;
  }
}

function makeHttpRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const client = options.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

async function checkHealthEndpoint(port = 3001) {
  try {
    const response = await makeHttpRequest({
      hostname: 'localhost',
      port,
      path: '/health',
      method: 'GET',
      timeout: 5000,
    });

    if (response.status === 200) {
      try {
        const data = JSON.parse(response.body);
        log.success(`健康检查端点响应正常 (HTTP 200)`);
        log.info(`  Status: ${data.status}, Uptime: ${data.uptime?.toFixed(2)}s`);
        passed++;
        return true;
      } catch {
        log.error(`健康检查端点响应格式错误`);
        failed++;
        return false;
      }
    } else {
      log.error(`健康检查端点返回 HTTP ${response.status}`);
      failed++;
      return false;
    }
  } catch (err) {
    log.warn(`健康检查失败 - 服务可能未运行: ${err.message}`);
    return false;
  }
}

// ============================================================================
// 主程序
// ============================================================================

async function main() {
  const projectRoot = process.env.PROJECT_ROOT || path.join(__dirname);
  
  log.header('🔍 Webhook 部署验证');
  console.log(`项目路径: ${projectRoot}\n`);

  // Step 1: 检查项目目录结构
  log.header('Step 1: 检查项目目录结构');
  checkFileExists(path.join(projectRoot, 'package.json'), 'package.json');
  checkFileExists(path.join(projectRoot, '.env.webhook'), '.env.webhook');
  checkFileExists(path.join(projectRoot, 'run-webhook-deployment.sh'), '部署脚本');
  checkFileExists(path.join(projectRoot, 'scripts/webhook-server.js'), 'Webhook 服务器');
  checkFileExists(path.join(projectRoot, 'scripts/auto-sync-cluster.sh'), '集群同步脚本');

  // Step 2: 检查依赖文件
  log.header('Step 2: 检查依赖管理文件');
  checkJsonFile(path.join(projectRoot, 'package.json'), 'package.json');
  
  // Step 3: 检查环境配置
  log.header('Step 3: 检查环境配置');
  checkEnvironmentFile(path.join(projectRoot, '.env.webhook'));

  // Step 4: 检查 node_modules
  log.header('Step 4: 检查依赖安装状态');
  checkDirExists(path.join(projectRoot, 'node_modules'), 'node_modules');
  
  if (!fs.existsSync(path.join(projectRoot, 'node_modules'))) {
    log.warn('node_modules 不存在 - 需要运行: npm install');
  } else {
    checkFileExists(path.join(projectRoot, 'node_modules/express'), '  - express');
    checkFileExists(path.join(projectRoot, 'node_modules/crypto'), '  - crypto 模块');
  }

  // Step 5: 检查日志目录
  log.header('Step 5: 检查日志系统');
  const logDir = path.join(projectRoot, 'webhook-logs');
  checkDirExists(logDir, '日志目录');
  
  if (!fs.existsSync(logDir)) {
    log.info('日志目录会在 Webhook 服务启动时自动创建');
  }

  // Step 6: 检查脚本文件内容
  log.header('Step 6: 验证脚本内容');
  checkFileContent(
    path.join(projectRoot, 'scripts/webhook-server.js'),
    'verifyGitHubSignature',
    'Webhook 服务器包含签名验证'
  );
  checkFileContent(
    path.join(projectRoot, 'scripts/webhook-server.js'),
    '/health',
    'Webhook 服务器包含健康检查端点'
  );
  checkFileContent(
    path.join(projectRoot, 'run-webhook-deployment.sh'),
    'pm2',
    '部署脚本包含 PM2 配置'
  );

  // Step 7: 尝试健康检查
  log.header('Step 7: 服务连接性检查');
  const healthOk = await checkHealthEndpoint(3001);
  if (!healthOk) {
    log.info('(Webhook 服务未运行或不在 3001 端口上)');
  }

  // Step 8: 显示完成报告
  log.header('📊 验证报告');
  console.log(`
验证完成:
  ${colors.green}✓ 通过${colors.reset}: ${passed}
  ${colors.red}✗ 失败${colors.reset}: ${failed}
  ${colors.yellow}⚠ 警告${colors.reset}: 部分检查失败或服务未运行
`);

  if (failed === 0) {
    console.log(`${colors.green}${colors.bright}✓ 所有检查通过！部署已就绪。${colors.reset}\n`);
    console.log('下一步:');
    console.log('  1. 如果 node_modules 不存在，运行: npm install');
    console.log('  2. 运行部署脚本: bash run-webhook-deployment.sh');
    console.log('  3. 验证服务: pm2 list && curl http://localhost:3001/health\n');
  } else {
    console.log(`${colors.red}${colors.bright}✗ 发现 ${failed} 个问题，需要修复。${colors.reset}\n`);
  }
}

// 运行
main().catch((err) => {
  console.error(`${colors.red}验证脚本错误: ${err.message}${colors.reset}`);
  process.exit(1);
});
