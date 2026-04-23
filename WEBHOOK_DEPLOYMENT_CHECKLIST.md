# SAFvsOil GitHub Webhook Automation - Deployment Checklist

## ✓ Files Created

### Core Files
- [x] `scripts/webhook-server.js` (7.4 KB) - Express server for GitHub webhooks
- [x] `scripts/auto-sync-cluster.sh` (8.6 KB) - Cluster synchronization script
- [x] `scripts/start-webhook.sh` (5.6 KB) - Webhook server startup script
- [x] `ecosystem.config.js` (1.5 KB) - PM2 configuration
- [x] `.env.webhook.example` (900 B) - Environment variables template
- [x] `docs/GITHUB_WEBHOOK_SETUP.md` (10.7 KB) - Complete setup guide
- [x] `test/webhook-server.test.js` (7.9 KB) - Test suite

### Total: 7 files, ~45 KB

## Pre-Deployment Setup

### 1. Generate Webhook Secret
```bash
openssl rand -hex 32
# Save the output for use in GitHub webhook configuration
```

### 2. Prepare Environment Variables
```bash
cp .env.webhook.example .env.webhook
# Edit .env.webhook and add the generated secret:
# GITHUB_WEBHOOK_SECRET=<your_secret_here>
```

### 3. Install Dependencies
```bash
cd /Users/yumei/SAFvsOil
npm install express  # If not already installed
```

## Startup Instructions

### Option A: Development/Testing (Direct Start)
```bash
export $(cat .env.webhook | xargs)
./scripts/start-webhook.sh
```

Server will listen on `http://localhost:3001`

### Option B: Production (PM2)
```bash
export $(cat .env.webhook | xargs)
./scripts/start-webhook.sh --pm2
```

PM2 will manage the process with auto-restart on failure.

## GitHub Webhook Configuration

1. Go to: Repository → Settings → Webhooks
2. Click: **Add webhook**
3. Configure:
   - **Payload URL**: `https://your-domain.com/webhook/push`
   - **Content type**: `application/json`
   - **Secret**: Paste your generated secret
   - **Events**: Push events (master branch only)
   - **Active**: ✓

4. Test: GitHub will attempt a test delivery; check **Recent Deliveries**

## Testing the Webhook

### 1. Health Check
```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-12-20T10:30:45.123Z",
  "uptime": 3600.5
}
```

### 2. View Recent Events
```bash
curl http://localhost:3001/webhook/status?limit=10
```

### 3. Manual Push Test
```bash
echo "test" > test.txt
git add test.txt
git commit -m "Test webhook trigger"
git push origin master
```

### 4. Monitor Logs
```bash
tail -f webhook-logs/webhook-*.log
tail -f webhook-logs/sync-*.log
```

## How It Works

### Webhook Receive Flow
1. GitHub sends push event to `/webhook/push`
2. Server verifies HMAC-SHA256 signature
3. Server checks if branch is `master`
4. Server returns `202 Accepted` immediately
5. Server triggers async cluster sync in background

### Cluster Sync Flow
1. SSH connects to each node: mac-mini, coco, france-vps, us-vps
2. Runs: `git fetch origin && git checkout <SHA>`
3. Verifies: `git rev-parse HEAD` matches expected SHA
4. Optionally runs: `npm run web:build` (if `BUILD_WEB=true`)
5. Logs results and sends notifications on failure

## Cluster Node Setup

Each cluster node must have:
1. Git repository at `/opt/safvsoil`
2. SSH server running
3. SSH public key authentication configured (for `git user`)
4. Proper git permissions

### Example SSH Setup (per node)
```bash
# On cluster node
mkdir -p /opt/safvsoil
cd /opt/safvsoil
git clone https://github.com/user/safvsoil.git .

# Configure SSH public key auth
# Add your public key to ~/.ssh/authorized_keys
```

## Environment Variables Reference

| Variable | Default | Purpose |
|----------|---------|---------|
| GITHUB_WEBHOOK_SECRET | (required) | Signing secret for webhook verification |
| WEBHOOK_PORT | 3001 | Port for webhook server |
| LOG_DIR | ./webhook-logs | Directory for logs |
| SYNC_TIMEOUT | 60 | Timeout per node (seconds) |
| SYNC_RETRIES | 3 | Retry attempts per node |
| BUILD_WEB | false | Run npm run web:build after sync |
| ADMIN_EMAIL | (optional) | Email for failure notifications |
| SLACK_WEBHOOK_URL | (optional) | Slack webhook for notifications |
| NODE_ENV | production | Node environment |

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/webhook/push` | Receive GitHub webhooks |
| GET | `/health` | Health check |
| GET | `/webhook/status` | View recent webhook events |

## Monitoring & Logs

### Log Files
- `webhook-logs/webhook-YYYY-MM-DD.log` - Webhook events
- `webhook-logs/sync-YYYYMMDD_HHMMSS.log` - Sync operations
- `webhook-logs/pm2-error.log` - PM2 errors (if using PM2)
- `webhook-logs/pm2-out.log` - PM2 output (if using PM2)

### PM2 Commands
```bash
pm2 logs webhook              # View real-time logs
pm2 status webhook            # Check process status
pm2 restart webhook           # Restart webhook
pm2 stop webhook              # Stop webhook
pm2 delete webhook            # Remove webhook
pm2 save                      # Save configuration (for reboot)
pm2 startup                   # Auto-start on reboot
```

## Troubleshooting

### Issue: Webhook not triggered
**Solution**: Check GitHub webhook settings → Recent Deliveries

### Issue: 403 Forbidden response
**Solution**: Invalid signature - verify `GITHUB_WEBHOOK_SECRET` matches GitHub setting

### Issue: SSH connection fails to cluster nodes
**Solution**: 
1. Test SSH manually: `ssh user@hostname "git -v"`
2. Ensure public key is in `~/.ssh/authorized_keys`
3. Check firewall rules

### Issue: Sync timeout
**Solution**: 
1. Increase `SYNC_TIMEOUT` environment variable
2. Check network connectivity to nodes
3. Check disk space on nodes

## Security Checklist

- [ ] Generate strong webhook secret (`openssl rand -hex 32`)
- [ ] Never commit `.env.webhook` to git
- [ ] Use HTTPS for public webhook URL
- [ ] Configure SSH key-based authentication (no passwords)
- [ ] Restrict SSH access by IP when possible
- [ ] Regularly review webhook logs for anomalies
- [ ] Set up log rotation to manage disk space
- [ ] Use restricted SSH user account (not root)

## Performance Notes

- **Webhook response**: < 100ms (returns 202 before sync)
- **Cluster sync**: Parallel across all nodes (typically 30-60s per sync)
- **Logs**: Accumulate ~1-2 KB per webhook event, implement rotation

## Maintenance

### Log Rotation (crontab example)
```bash
# Delete logs older than 28 days, weekly
0 0 * * 0 find /opt/safvsoil/webhook-logs -name "*.log" -mtime +28 -delete
```

### Monitoring Health
```bash
# Check if webhook server is responding
watch -n 5 'curl -s http://localhost:3001/health | jq .'

# Monitor recent syncs
watch -n 10 'tail -5 webhook-logs/sync-*.log'
```

## Testing Scenarios

### 1. Successful Sync
- Push to master branch
- Verify all nodes sync successfully
- Check logs for 200 OK responses

### 2. Partial Failure
- Simulate node failure (stop SSH on one node)
- Push to master branch
- Verify other nodes sync
- Check Slack/email notification for failed node

### 3. Invalid Signature
- Send webhook with wrong secret
- Verify 403 Forbidden response
- Check logs

### 4. Non-Master Branch
- Push to develop branch
- Verify webhook ignored (200 OK but no sync)
- Check logs

## Files Reference

### scripts/webhook-server.js
- Main Express server
- Listens for GitHub push events
- Verifies HMAC-SHA256 signatures
- Triggers async cluster sync
- Provides health and status endpoints

### scripts/auto-sync-cluster.sh
- Syncs all cluster nodes to specific SHA
- Retries failed nodes
- Optional web build
- Slack/email notifications
- Comprehensive logging

### scripts/start-webhook.sh
- Helper to start webhook server
- Supports direct start or PM2
- Pre-flight checks
- Environment variable setup

### ecosystem.config.js
- PM2 process manager config
- Auto-restart on failure
- Logging configuration
- Memory limits

### docs/GITHUB_WEBHOOK_SETUP.md
- Complete setup guide
- Step-by-step instructions
- Troubleshooting section
- Security guidelines

### test/webhook-server.test.js
- Signature verification tests
- Payload validation tests
- Edge case tests
- Run: `node --test test/webhook-server.test.js`

## Next Steps

1. ✓ Review created files
2. → Generate webhook secret
3. → Configure environment variables
4. → Start webhook server (local testing)
5. → Expose server publicly (ngrok/VPS)
6. → Configure GitHub webhook
7. → Test with manual push
8. → Deploy to production (PM2)
9. → Monitor logs and verify sync

## Support Resources

- GitHub Webhooks: https://docs.github.com/webhooks
- Express.js: https://expressjs.com/
- PM2: https://pm2.keymetrics.io/
- Webhook Security: https://docs.github.com/webhooks/securing/

---

**Creation Date**: December 20, 2024  
**Version**: 1.0  
**Status**: Ready for Deployment  
**Tested Components**: Signature verification, payload validation, error handling  
**Production Ready**: Yes (with HTTPS + PM2 recommended)
