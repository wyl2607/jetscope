# GitHub Webhook Setup Guide for SAFvsOil

This guide walks you through setting up automatic cluster synchronization for SAFvsOil using GitHub webhooks.

## Overview

When you push code to the `master` branch, GitHub will automatically notify the webhook server, which then:
1. Verifies the webhook signature for security
2. Triggers automatic synchronization across all cluster nodes
3. Logs all events and provides status reporting

## Prerequisites

- GitHub repository access with webhook configuration permissions
- Webhook server running (see [Starting the Webhook Server](#starting-the-webhook-server))
- SSH access to all cluster nodes (coco, mac-mini, us-vps)
- A strong webhook secret (for security)

## Step 1: Generate Webhook Secret

Generate a cryptographically secure secret that GitHub will use to sign webhook payloads:

```bash
# Generate a random 32-byte hex string
openssl rand -hex 32
```

Save the output. You'll need it in the next steps.

Example output (DO NOT USE):
```
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Step 2: Configure Environment Variables

1. Copy the environment template:
   ```bash
   cp .env.webhook.example .env.webhook
   ```

2. Edit `.env.webhook` and add your webhook secret:
   ```bash
   GITHUB_WEBHOOK_SECRET=your_generated_secret_here
   ```

3. (Optional) Configure other settings:
   ```bash
   WEBHOOK_PORT=3001              # Default: 3001
   SYNC_TIMEOUT=60                # Timeout per node (seconds)
   SYNC_RETRIES=3                 # Retry attempts per node
   BUILD_WEB=false                # Run npm run web:build after sync
   ADMIN_EMAIL=admin@example.com  # For failure notifications
   ```

4. Load environment variables before starting the webhook:
   ```bash
   export $(cat .env.webhook | xargs)
   ```

## Step 3: Start the Webhook Server

### Option A: Direct Start (for development/testing)

```bash
export $(cat .env.webhook | xargs)
./scripts/start-webhook.sh
```

The server will log to the console and `webhook-logs/` directory.

### Option B: PM2 (for production)

```bash
export $(cat .env.webhook | xargs)
./scripts/start-webhook.sh --pm2
```

Useful PM2 commands:
```bash
pm2 logs webhook                 # View real-time logs
pm2 status webhook               # Check status
pm2 stop webhook                 # Stop webhook
pm2 restart webhook              # Restart webhook
pm2 delete webhook               # Remove webhook
pm2 startup                      # Auto-start on reboot (macOS/Linux)
pm2 save                         # Save PM2 configuration
```

## Step 4: Expose Webhook Server to Internet

The webhook server must be accessible from GitHub (on the internet). Choose one approach:

### Option A: Public Domain with HTTPS (Recommended)

1. Set up a public domain (e.g., `webhook.example.com`)
2. Configure your firewall/router to forward HTTPS traffic to port 3001 on the webhook server
3. Install SSL certificate (self-signed or from Let's Encrypt)

Example nginx reverse proxy config:
```nginx
upstream webhook {
    server localhost:3001;
}

server {
    listen 443 ssl;
    server_name webhook.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://webhook;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Option B: Ngrok Tunnel (for testing)

```bash
# Install ngrok from https://ngrok.com
ngrok http 3001
```

Ngrok will generate a temporary public URL like `https://abc123.ngrok.io`.

### Option C: VPS with Public IP

If your webhook server is already on a VPS with a public IP:
```
https://your-vps-domain.com:3001/webhook/push
```

## Step 5: Configure GitHub Webhook

1. Go to your GitHub repository → **Settings** → **Webhooks**
2. Click **Add webhook**
3. Fill in the webhook form:

   **Payload URL**: `https://your-domain.com/webhook/push`
   
   **Content type**: `application/json`
   
   **Secret**: Paste your generated secret from Step 1
   
   **Which events would you like to trigger this webhook?**
   - Select "Let me select individual events"
   - Uncheck "Push" (default all events)
   - Check only **Push events**
   
   **Active**: ✓ (Checked)

4. Click **Add webhook**

## Step 6: Test the Webhook

GitHub provides a **Recent Deliveries** section to test your webhook:

1. Go to your webhook settings
2. Scroll to **Recent Deliveries**
3. Look for a test push delivery
4. Click the delivery to view:
   - Request headers
   - Request body
   - Response status
   - Response headers

If you see a `202 Accepted` response, the webhook is working!

### Manual Test

Push a test commit to master:
```bash
echo "test" > test.txt
git add test.txt
git commit -m "Test webhook trigger"
git push origin master
```

Check the webhook logs:
```bash
tail -f webhook-logs/webhook-*.log
```

You should see:
```json
{
  "timestamp": "2024-12-20T10:30:45.123Z",
  "level": "info",
  "message": "Processing master branch push",
  "repository": "user/safvsoil",
  "sha": "abc123def..."
}
```

## Step 7: Monitor Cluster Synchronization

Monitor the sync status with:

```bash
# View recent webhook events
curl http://localhost:3001/webhook/status

# View detailed sync logs
tail -f webhook-logs/sync-*.log

# Check PM2 logs (if using PM2)
pm2 logs webhook
```

## Webhook Request Format

When GitHub sends a webhook to your server:

```json
{
  "ref": "refs/heads/master",
  "before": "0000000000000000000000000000000000000000",
  "after": "abc123def456789...",
  "created": false,
  "deleted": false,
  "forced": false,
  "compare": "https://github.com/user/repo/compare/abc...def",
  "commits": [
    {
      "id": "abc123def456789...",
      "message": "Update SAFvsOil cluster sync",
      "timestamp": "2024-12-20T10:30:00Z",
      "author": {
        "name": "Developer",
        "email": "dev@example.com"
      }
    }
  ],
  "repository": {
    "id": 123456789,
    "name": "safvsoil",
    "full_name": "user/safvsoil"
  }
}
```

The server validates the `X-Hub-Signature-256` header using your secret.

## Cluster Sync Process

When a valid webhook is received:

1. **Verification**: Signature validated against `GITHUB_WEBHOOK_SECRET`
2. **Branch Check**: Only `refs/heads/master` is processed
3. **Async Sync**: Server returns `202 Accepted` immediately
4. **Parallel Execution**: 
   - Connects to each node via SSH
   - Runs: `git fetch origin && git checkout <SHA>`
   - Verifies: `git rev-parse HEAD` matches expected SHA
   - Optionally runs: `npm run web:build` (if `BUILD_WEB=true`)
5. **Retry Logic**: Retries up to `SYNC_RETRIES` times if sync fails
6. **Notifications**: Sends Slack/email if any node fails

## Troubleshooting

### Webhook not being triggered

1. Check GitHub webhook settings → **Recent Deliveries**
2. Look for failed deliveries (red ❌)
3. Inspect the response:
   - `403 Forbidden`: Invalid signature (check `GITHUB_WEBHOOK_SECRET`)
   - `202 Accepted`: Success (async processing)
   - `404 Not Found`: Wrong webhook URL

### Sync failures

Check the sync logs:
```bash
ls -la webhook-logs/sync-*.log
tail -100 webhook-logs/sync-*.log
```

Common issues:
- **SSH connection failed**: Check SSH keys and host connectivity
- **Timeout**: Increase `SYNC_TIMEOUT` environment variable
- **Permission denied**: Verify git repository permissions on nodes
- **Disk space**: Check available disk space on cluster nodes

### Server won't start

1. Check Node.js version (need 20+):
   ```bash
   node --version
   ```

2. Verify dependencies are installed:
   ```bash
   npm install
   ```

3. Check port availability:
   ```bash
   lsof -i :3001
   ```

4. View error logs:
   ```bash
   cat webhook-logs/*.log
   ```

## Security Considerations

- **Secret Protection**: Never commit `.env.webhook` to git
- **HTTPS Only**: Always use HTTPS for webhook URLs in production
- **IP Whitelisting**: Consider restricting webhook IPs to GitHub's IP ranges
- **SSH Keys**: Ensure passwordless SSH is configured for cluster nodes
- **Audit Logs**: Regularly review `webhook-logs/` for suspicious activity

## API Endpoints

### Health Check

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-12-20T10:30:45.123Z",
  "uptime": 3600.5
}
```

### Recent Webhook Events

```bash
curl "http://localhost:3001/webhook/status?limit=20"
```

Response:
```json
{
  "events": [
    {
      "timestamp": "2024-12-20T10:30:45.123Z",
      "level": "info",
      "message": "Valid webhook received",
      "ip": "140.82.112.1",
      "ref": "refs/heads/master"
    }
  ],
  "total": 1
}
```

## Cluster Nodes Configuration

The sync script connects to these 3 nodes (SSH hosts):

| Node       | SSH Address/Host    | Path          | Role                  |
|------------|---------------------|---------------|-----------------------|
| coco       | coco                | /opt/safvsoil | Local development     |
| mac-mini   | mac-mini            | /opt/safvsoil | Local test/staging    |
| us-vps     | us-vps              | /opt/safvsoil | Production (192.227.130.69) |

Ensure:
1. All nodes have the repository at `/opt/safvsoil`
2. SSH passwordless authentication is configured (via ~/.ssh/config aliases or direct IP)
3. The deploying user has git permissions on all nodes
4. SSH aliases should resolve correctly (or use direct IPs as fallback)

## Advanced: Custom Notifications

### Slack Integration

Set `SLACK_WEBHOOK_URL` in `.env.webhook`:
```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

The sync script will notify your Slack channel on sync failures.

### Email Notifications

Set `ADMIN_EMAIL` in `.env.webhook`:
```bash
ADMIN_EMAIL=admin@example.com
```

Requires `mail` command to be available on the server.

## Performance Notes

- **Sync timeout**: Default 60 seconds per node (adjustable)
- **Concurrent syncs**: All nodes sync in parallel
- **Webhook response**: Returns immediately (202 Accepted) before sync completes
- **Disk space**: Logs accumulate over time, implement log rotation

Example log rotation (crontab):
```bash
# Rotate logs weekly, keep 4 weeks
0 0 * * 0 find /opt/safvsoil/webhook-logs -name "*.log" -mtime +28 -delete
```

## Next Steps

1. ✓ Generate webhook secret
2. ✓ Configure environment variables
3. ✓ Start webhook server (PM2 recommended)
4. ✓ Expose server publicly (ngrok/VPS/reverse proxy)
5. ✓ Configure GitHub webhook
6. ✓ Test with a manual push
7. ✓ Monitor logs and verify sync

## Support

For issues or questions:
1. Check webhook-logs for error messages
2. Review GitHub's webhook documentation: https://docs.github.com/webhooks
3. Test connectivity to cluster nodes: `ssh user@hostname "cd /opt/safvsoil && git status"`

---

**Last Updated**: December 2024  
**Version**: 1.0  
**Project**: SAFvsOil Cluster Synchronization
