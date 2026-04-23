# GitHub Webhook Automation - Quick Reference Card

## 🚀 Quick Start (3 minutes)

```bash
# 1. Generate secret
openssl rand -hex 32

# 2. Configure environment
cp .env.webhook.example .env.webhook
# Edit .env.webhook and paste the secret

# 3. Start webhook server
export $(cat .env.webhook | xargs)
./scripts/start-webhook.sh

# 4. Test health
curl http://localhost:3001/health
```

## 📋 Files Created

| File | Purpose | Size |
|------|---------|------|
| `scripts/webhook-server.js` | Main Express webhook server | 7.4 KB |
| `scripts/auto-sync-cluster.sh` | Cluster sync script (SSH) | 8.6 KB |
| `scripts/start-webhook.sh` | Server startup helper | 5.6 KB |
| `ecosystem.config.js` | PM2 process manager config | 1.5 KB |
| `.env.webhook.example` | Environment variables template | 900 B |
| `docs/GITHUB_WEBHOOK_SETUP.md` | Complete setup guide | 10.7 KB |
| `test/webhook-server.test.js` | Test suite | 7.9 KB |
| `verify-webhook-setup.sh` | Verification script | 5.8 KB |

## 🔧 Configuration

```bash
# Copy and edit environment variables
cp .env.webhook.example .env.webhook

# Required:
GITHUB_WEBHOOK_SECRET=<your_secret>

# Optional:
WEBHOOK_PORT=3001
SYNC_TIMEOUT=60
SYNC_RETRIES=3
BUILD_WEB=false
ADMIN_EMAIL=admin@example.com
```

## 🌐 GitHub Webhook Setup

**Payload URL**: `https://your-domain.com/webhook/push`
**Content type**: `application/json`
**Secret**: (paste your generated secret)
**Events**: Push events (master branch only)

## 📝 Common Commands

```bash
# Start webhook (development)
./scripts/start-webhook.sh

# Start webhook (production with PM2)
./scripts/start-webhook.sh --pm2

# Check health
curl http://localhost:3001/health

# View recent webhook events
curl http://localhost:3001/webhook/status?limit=20

# View sync logs
tail -f webhook-logs/sync-*.log

# Test with manual push
git push origin master

# Verify setup
./verify-webhook-setup.sh
```

## 📊 Cluster Nodes

| Node | SSH Address | Path |
|------|-------------|------|
| mac-mini | user@192.168.1.100 | /opt/safvsoil |
| coco | user@coco.local | /opt/safvsoil |
| france-vps | user@88.218.77.162 | /opt/safvsoil |
| us-vps | user@192.227.130.69 | /opt/safvsoil |

## 🐛 Troubleshooting

**Webhook not triggered**: Check GitHub → Settings → Webhooks → Recent Deliveries

**403 Forbidden**: Invalid secret - verify `GITHUB_WEBHOOK_SECRET` matches

**SSH fails**: Test manually: `ssh user@hostname "git -v"`

**Timeout**: Increase `SYNC_TIMEOUT` environment variable

## 🔐 Security

1. Generate strong secret: `openssl rand -hex 32`
2. Never commit `.env.webhook` to git
3. Use HTTPS for public webhook URL
4. Use SSH key-based auth (no passwords)
5. Review logs regularly for anomalies

## 📈 Workflow

```
Push to master
    ↓
GitHub sends webhook to /webhook/push
    ↓
Server verifies HMAC-SHA256 signature
    ↓
Server returns 202 Accepted (immediately)
    ↓
(Async) SSH to each node: mac-mini, coco, france-vps, us-vps
    ↓
(Each node) git fetch origin && git checkout <SHA>
    ↓
(Each node) Verify: git rev-parse HEAD == SHA
    ↓
(Optional) npm run web:build
    ↓
Log results + send Slack/email on failure
```

## 🧪 Testing

```bash
# Unit tests
node --test test/webhook-server.test.js

# Manual webhook test (GitHub)
1. Go to Settings → Webhooks → Recent Deliveries
2. Click "Redeliver" on a test payload
3. Check for 202 Accepted response

# Local sync test
./scripts/auto-sync-cluster.sh abc123def... refs/heads/master
```

## 📱 PM2 Management

```bash
# Start with PM2
./scripts/start-webhook.sh --pm2

# View logs
pm2 logs webhook

# Check status
pm2 status webhook

# Restart
pm2 restart webhook

# Stop
pm2 stop webhook

# Auto-start on reboot
pm2 startup
pm2 save
```

## 🔗 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/webhook/push` | GitHub webhook receiver |
| GET | `/health` | Health check |
| GET | `/webhook/status?limit=N` | Recent events |

## 📚 Documentation

- **Full Setup Guide**: `docs/GITHUB_WEBHOOK_SETUP.md`
- **Deployment Checklist**: `WEBHOOK_DEPLOYMENT_CHECKLIST.md`
- **This Quick Reference**: `WEBHOOK_QUICK_REFERENCE.md`

## ✅ Pre-Deployment Checklist

- [ ] Generate webhook secret
- [ ] Configure .env.webhook
- [ ] Install dependencies: `npm install express`
- [ ] Start webhook server locally
- [ ] Test health endpoint
- [ ] Verify all cluster nodes SSH access
- [ ] Expose webhook publicly (ngrok/VPS/domain)
- [ ] Configure GitHub webhook
- [ ] Test with manual push
- [ ] Deploy with PM2
- [ ] Monitor logs
- [ ] Set up log rotation

## 🚨 Alerts & Notifications

**Slack**: Set `SLACK_WEBHOOK_URL` in .env.webhook
**Email**: Set `ADMIN_EMAIL` in .env.webhook
**Both**: Triggered automatically on sync failure

## 💾 Log Files

- `webhook-logs/webhook-YYYY-MM-DD.log` - Webhook events
- `webhook-logs/sync-YYYYMMDD_HHMMSS.log` - Sync operations
- `webhook-logs/pm2-error.log` - PM2 errors
- `webhook-logs/pm2-out.log` - PM2 output

## 🔍 Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| GITHUB_WEBHOOK_SECRET | ❌ required | Webhook signing secret |
| WEBHOOK_PORT | 3001 | Server port |
| LOG_DIR | ./webhook-logs | Log directory |
| SYNC_TIMEOUT | 60 | Timeout per node (s) |
| SYNC_RETRIES | 3 | Retry attempts |
| BUILD_WEB | false | npm run web:build |
| ADMIN_EMAIL | optional | Email on failure |
| SLACK_WEBHOOK_URL | optional | Slack on failure |
| NODE_ENV | production | Node env |

---

**Version**: 1.0 | **Status**: Ready for Deployment | **Created**: Dec 20, 2024
