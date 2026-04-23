# Webhook 部署 - 快速启动卡片

## 🎯 目标
在 Mac-mini (coco) 上部署 GitHub Webhook 服务，用于自动同步 ESG Research Toolkit 集群。

## 📌 一句话总结
在 `/Users/yumei/SAFvsOil` 中运行 `bash run-webhook-deployment.sh` 完成一键部署。

---

## 🚀 立即部署

### 步骤 1: 连接到 coco
```bash
ssh coco
# 或
ssh user@coco.local
```

### 步骤 2: 进入项目目录
```bash
cd /Users/yumei/SAFvsOil
```

### 步骤 3: 运行一键部署脚本
```bash
bash run-webhook-deployment.sh
```

**预期**: 脚本完成后，Webhook 服务应该在 port 3001 上运行。

---

## ✅ 验证部署成功

### 快速检查（在 coco 上）
```bash
# 方法 1: 查看 PM2 进程状态
pm2 status

# 方法 2: 健康检查
curl http://localhost:3001/health

# 方法 3: 一步到位验证
bash check-webhook-status.sh
```

### 远程验证（从本地 Mac）
```bash
curl http://coco.local:3001/health | jq .
```

---

## 🔑 关键配置

| 项目 | 值 |
|-----|-----|
| 服务地址 | `http://coco.local:3001` |
| Webhook 端点 | `POST /webhook/push` |
| 健康检查 | `GET /health` |
| 配置文件 | `.env.webhook` |
| 进程管理 | PM2 |
| 日志目录 | `./webhook-logs` |

---

## 📊 部署脚本做了什么？

1. ✅ 验证 Node.js (v20+) 和 npm
2. ✅ 验证 `.env.webhook` 配置
3. ✅ 安装 npm 依赖
4. ✅ 创建日志目录
5. ✅ 安装 PM2（如需）
6. ✅ 启动 Webhook 服务
7. ✅ 验证服务状态
8. ✅ 执行健康检查
9. ✅ 显示完成信息

---

## 🔧 故障排查

### 问题: 脚本执行失败

**原因 1: Node.js 版本过低**
```bash
node --version  # 检查
nvm install 20  # 升级
```

**原因 2: npm 依赖未安装**
```bash
npm install
```

**原因 3: PM2 进程冲突**
```bash
pm2 stop webhook
pm2 delete webhook
bash run-webhook-deployment.sh
```

### 问题: 服务启动失败

```bash
# 查看详细错误
pm2 logs webhook --err

# 手动运行查看错误
node scripts/webhook-server.js
```

### 问题: 健康检查失败

```bash
# 检查端口是否被占用
lsof -i :3001

# 检查服务是否运行
pm2 list

# 查看日志
pm2 logs webhook
```

---

## 📚 相关文档

| 文档 | 说明 |
|-----|------|
| `WEBHOOK_DEPLOYMENT_READY_FOR_EXECUTION.md` | 详细执行总结 |
| `WEBHOOK_DEPLOYMENT_EXECUTION_GUIDE.md` | 完整执行指南 + 故障排查 |
| `check-webhook-status.sh` | 快速状态检查脚本 |
| `verify-webhook-local.mjs` | 本地验证脚本 |

---

## 💬 下一步

### 部署后

1. **验证服务运行**
   ```bash
   curl http://coco.local:3001/health
   ```

2. **配置 GitHub Webhook**
   - URL: `http://coco.local:3001/webhook/push`
   - Secret: (从 `.env.webhook`)
   - Events: Push events

3. **测试部署**
   ```bash
   git push origin master
   ```

4. **查看 Webhook 日志**
   ```bash
   pm2 logs webhook
   ```

---

## ⚙️ 常用命令

```bash
pm2 list              # 查看所有进程
pm2 logs webhook      # 查看实时日志
pm2 restart webhook   # 重启服务
pm2 stop webhook      # 停止服务
pm2 delete webhook    # 删除进程

curl http://localhost:3001/health           # 健康检查
curl http://localhost:3001/webhook/status   # 查看 Webhook 事件
```

---

## 🎯 成功标志

- [x] 所有脚本准备完毕
- [x] 环境配置完成
- [x] 文档已准备
- [ ] 部署脚本在 coco 上执行（待执行）
- [ ] PM2 显示 webhook online（待验证）
- [ ] 健康检查返回 HTTP 200（待验证）
- [ ] GitHub Webhook 已配置（待配置）

---

## 📞 快速帮助

**Q: 脚本在哪？**  
A: `/Users/yumei/SAFvsOil/run-webhook-deployment.sh`

**Q: 如何查看部署日志？**  
A: `pm2 logs webhook`

**Q: 如何重新部署？**  
A: `pm2 delete webhook && bash run-webhook-deployment.sh`

**Q: 服务会自动重启吗？**  
A: 是的，运行 `pm2 save` 后会自动重启。

---

**准备状态**: ✅ 所有准备完成  
**下一步**: SSH 到 coco 并运行 `bash run-webhook-deployment.sh`
