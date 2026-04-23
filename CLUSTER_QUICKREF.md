# SAFvsOil 3-Node Cluster — Quick Reference Card

## ⚡ At a Glance

| Aspect | Value |
|--------|-------|
| **Nodes** | 3 (coco, mac-mini, us-vps) |
| **Repo Path** | `/opt/safvsoil` on all nodes |
| **Sync Script** | `scripts/auto-sync-cluster.sh <SHA>` |
| **Webhook Server** | Port 3001 (coco) |
| **Config File** | `.env.webhook` |
| **Logs** | `webhook-logs/` directory |
| **Status** | ✅ Configuration Complete |

---

## 🚀 Quick Start

### Test SSH (All 3 nodes should respond)
```bash
ssh coco "echo OK"
ssh mac-mini "echo OK"
ssh us-vps "echo OK"
```

### Test Sync Script
```bash
cd /Users/yumei/SAFvsOil
COMMIT_SHA=$(git rev-parse HEAD)
bash scripts/auto-sync-cluster.sh "$COMMIT_SHA"
```

### Check Sync Status
```bash
# Central commit
git log -1 --oneline

# Each node
ssh coco "cd /opt/safvsoil && git log -1 --oneline"
ssh mac-mini "cd /opt/safvsoil && git log -1 --oneline"
ssh us-vps "cd /opt/safvsoil && git log -1 --oneline"
# All should match ✅
```

---

## 📋 SSH Configuration Template

Add to `~/.ssh/config`:

```
Host coco
  HostName coco.local
  User [YOUR_USER]
  IdentityFile ~/.ssh/id_rsa

Host mac-mini
  HostName 192.168.1.100
  User [YOUR_USER]
  IdentityFile ~/.ssh/id_rsa

Host us-vps
  HostName 192.227.130.69
  User root
  IdentityFile ~/.ssh/id_rsa
```

---

## 🔧 Webhook Setup (Optional)

### 1. Generate Secret
```bash
openssl rand -hex 32
```

### 2. Configure Environment
```bash
cp .env.webhook.example .env.webhook
# Edit .env.webhook with secret
```

### 3. Start Server
```bash
export $(cat .env.webhook | xargs)
bash scripts/start-webhook.sh
```

### 4. GitHub Webhook
- Go to: `https://github.com/[owner]/[repo]/settings/hooks`
- Payload URL: `https://coco.local:3001/webhook/push`
- Secret: (from step 1)
- Events: Push events only
- Branch: master only

---

## 📊 Node Information

| Node | Type | IP/Host | User | Path |
|------|------|---------|------|------|
| coco | Local Dev | coco.local | [user] | /opt/safvsoil |
| mac-mini | Local Test | 192.168.1.100 | [user] | /opt/safvsoil |
| us-vps | Production | 192.227.130.69 | root | /opt/safvsoil |

---

## 🔍 Monitoring Commands

```bash
# Webhook status
curl http://localhost:3001/health

# Recent sync logs
tail -f /Users/yumei/SAFvsOil/webhook-logs/sync-*.log

# PM2 status (if running)
pm2 status webhook
pm2 logs webhook
```

---

## ⚠️ Common Issues

| Problem | Solution |
|---------|----------|
| SSH timeout | Check SSH key, network connectivity, StrictHostKeyChecking |
| Sync fails | Verify `/opt/safvsoil` exists on node, git permissions |
| Webhook won't start | Check Node.js v20+, port 3001 available, dependencies installed |
| Script validation fails | Verify SHA is 40-char hex: `git rev-parse HEAD` |

---

## 📁 Key Files

- **Script**: `scripts/auto-sync-cluster.sh`
- **Webhook Config**: `docs/GITHUB_WEBHOOK_SETUP.md`
- **Setup Guide**: `CLUSTER_3NODE_SETUP.md`
- **Completion Report**: `CLUSTER_CONFIG_COMPLETE.md`
- **Environment**: `.env.webhook` (create from `.env.webhook.example`)

---

## ✅ Verification Checklist

- [ ] SSH to all 3 nodes works
- [ ] `/opt/safvsoil` exists on all nodes
- [ ] `git status` works on all nodes
- [ ] Test sync script completes successfully
- [ ] All nodes have same commit SHA
- [ ] Webhook secret generated
- [ ] `.env.webhook` configured
- [ ] Webhook server starts without errors
- [ ] GitHub webhook configured
- [ ] First test push triggers sync

---

**Status**: ✅ Configuration Complete  
**Last Updated**: 2026-04-22  
**Ready for**: SSH testing → Sync testing → Webhook deployment
