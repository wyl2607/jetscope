# SAFvsOil 3-Node Cluster Auto-Sync Setup Guide

**Status**: Configuration Complete ✅  
**Date**: 2026-04-22  
**Nodes**: coco | mac-mini | us-vps (3 active)  
**Removed**: france-vps (deprecated)

---

## Summary of Changes

### 1. Updated auto-sync-cluster.sh
- **File**: `scripts/auto-sync-cluster.sh`
- **Changes**:
  - Updated node configuration from 4 nodes to 3 nodes
  - Removed: `france-vps@88.218.77.162`
  - Kept: `coco`, `mac-mini`, `us-vps`
  - Updated header documentation to reflect 3-node setup
  - Simplified node address format (using SSH config aliases)

### 2. Updated GitHub Webhook Documentation
- **File**: `docs/GITHUB_WEBHOOK_SETUP.md`
- **Changes**:
  - Prerequisites updated to list 3 nodes only
  - Cluster Nodes Configuration table updated (3 nodes, roles clarified)
  - Removed france-vps references

---

## Verification Checklist

### Step 1: SSH Configuration
Ensure `~/.ssh/config` has entries for all 3 nodes:

```bash
# Expected SSH config entries:

Host coco
  HostName coco.local
  User [your-user]
  IdentityFile ~/.ssh/id_rsa
  StrictHostKeyChecking no

Host mac-mini
  HostName 192.168.1.100
  User [your-user]
  IdentityFile ~/.ssh/id_rsa
  StrictHostKeyChecking no

Host us-vps
  HostName 192.227.130.69
  User root
  IdentityFile ~/.ssh/id_rsa
  StrictHostKeyChecking no
```

**Test SSH connectivity** (all 3 should succeed without password):
```bash
ssh coco "echo 'coco OK' && pwd"
ssh mac-mini "echo 'mac-mini OK' && pwd"
ssh us-vps "echo 'us-vps OK' && pwd"
```

### Step 2: Repository Initialization on All Nodes
Verify `/opt/safvsoil` is initialized on each node:

```bash
# Test each node
for node in coco mac-mini us-vps; do
  echo "=== Testing $node ==="
  ssh $node "cd /opt/safvsoil && git status 2>&1 | head -3"
done

# Expected output (similar on all nodes):
# On branch master
# Your branch is up to date with 'origin/master'.
# nothing to commit, working tree clean
```

### Step 3: Verify Script Configuration
Check that the auto-sync script has the correct node list:

```bash
grep -A 5 "declare -a NODES=" /Users/yumei/SAFvsOil/scripts/auto-sync-cluster.sh
```

Expected output:
```
declare -a NODES=(
  "coco"
  "mac-mini"
  "us-vps"
)
```

### Step 4: Test Auto-Sync Script
Run the sync script with a known commit SHA:

```bash
# Get current commit SHA
cd /Users/yumei/SAFvsOil
COMMIT_SHA=$(git rev-parse HEAD)
echo "Testing sync with SHA: $COMMIT_SHA"

# Run sync script
bash scripts/auto-sync-cluster.sh "$COMMIT_SHA"

# Expected output:
# 🔄 Syncing coco to $COMMIT_SHA ... ✅
# 🔄 Syncing mac-mini to $COMMIT_SHA ... ✅
# 🔄 Syncing us-vps to $COMMIT_SHA ... ✅
# ✅ All 3 nodes synchronized successfully
```

### Step 5: Verify Code Consistency
After sync, verify all nodes have the same commit:

```bash
# Central repo
echo "=== Central ==="
cd /Users/yumei/SAFvsOil && git log -1 --oneline

# coco
echo "=== coco ==="
ssh coco "cd /opt/safvsoil && git log -1 --oneline"

# mac-mini
echo "=== mac-mini ==="
ssh mac-mini "cd /opt/safvsoil && git log -1 --oneline"

# us-vps
echo "=== us-vps ==="
ssh us-vps "cd /opt/safvsoil && git log -1 --oneline"

# All should display the SAME commit SHA and message
```

### Step 6: Webhook Configuration (Optional)

#### Generate Webhook Secret
```bash
openssl rand -hex 32
# Output example: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

#### Configure Environment
```bash
# Copy template
cp /Users/yumei/SAFvsOil/.env.webhook.example /Users/yumei/SAFvsOil/.env.webhook

# Edit .env.webhook with your secret:
# GITHUB_WEBHOOK_SECRET=your_generated_secret_here
```

#### Start Webhook Server
```bash
cd /Users/yumei/SAFvsOil

# Load environment and start server
export $(cat .env.webhook | xargs)
bash scripts/start-webhook.sh

# For production (PM2):
bash scripts/start-webhook.sh --pm2
```

#### GitHub Webhook Configuration
1. Go to: https://github.com/[owner]/[repo]/settings/hooks
2. Click "Add webhook"
3. Fill in:
   - **Payload URL**: `https://coco.local:3001/webhook/push` (or your public domain)
   - **Content type**: `application/json`
   - **Secret**: (paste your generated secret)
   - **Events**: Select "Push events" only
   - **Branch**: Filter to `master` only
4. Click "Add webhook"

#### Test GitHub Webhook
1. In webhook settings, find "Recent Deliveries"
2. Look for test delivery with green checkmark ✅
3. Check webhook logs:
   ```bash
   tail -f /Users/yumei/SAFvsOil/webhook-logs/webhook-*.log
   ```

---

## Deployment Steps (Summary)

1. ✅ **Configuration Updated**
   - 3-node list in `auto-sync-cluster.sh`
   - Documentation updated in `GITHUB_WEBHOOK_SETUP.md`

2. **Pre-Deployment Checks**
   - Verify SSH connectivity to all 3 nodes
   - Verify `/opt/safvsoil` exists on all nodes
   - Test script with a known SHA

3. **Webhook Setup** (if auto-sync desired)
   - Generate webhook secret
   - Configure `.env.webhook`
   - Start webhook server
   - Add GitHub webhook

4. **Verification**
   - Push test commit to verify auto-sync triggers
   - Monitor webhook logs for sync status
   - Verify all nodes reach the same commit

---

## Troubleshooting

### SSH Connection Issues
```bash
# Test SSH with verbose output
ssh -vvv coco "pwd"

# Check SSH keys
ls -la ~/.ssh/

# Verify SSH config syntax
ssh -G coco | head -10
```

### Repository Not Initialized
```bash
# Initialize on a node (if needed)
ssh coco "mkdir -p /opt/safvsoil && cd /opt/safvsoil && git clone [REPO_URL] ."
```

### Sync Script Failures
```bash
# Check recent sync logs
ls -lrt /Users/yumei/SAFvsOil/webhook-logs/sync-*.log | tail -5
tail -50 /Users/yumei/SAFvsOil/webhook-logs/sync-*.log

# Run script manually with debug output
bash -x /Users/yumei/SAFvsOil/scripts/auto-sync-cluster.sh [SHA]
```

### Webhook Server Won't Start
```bash
# Check Node.js version
node --version  # Should be v20+

# Check port availability
lsof -i :3001

# Check dependencies
cd /Users/yumei/SAFvsOil && npm install

# View webhook server logs
cat /Users/yumei/SAFvsOil/webhook-logs/*.log
```

---

## Key Files Modified

| File | Changes | Status |
|------|---------|--------|
| `scripts/auto-sync-cluster.sh` | Updated NODES array (4→3) | ✅ Updated |
| `docs/GITHUB_WEBHOOK_SETUP.md` | Updated Prerequisites & Cluster table | ✅ Updated |
| `.env.webhook.example` | No changes needed | - |
| `scripts/start-webhook.sh` | No changes needed | - |

---

## Testing Checklist

- [ ] SSH connectivity verified (all 3 nodes)
- [ ] `/opt/safvsoil` initialized on all nodes
- [ ] Auto-sync script tested with known SHA
- [ ] All nodes synchronized to same commit
- [ ] Webhook environment configured (if enabled)
- [ ] Webhook server started successfully
- [ ] GitHub webhook configured and tested
- [ ] Test push to master triggered sync
- [ ] All nodes reached expected commit

---

## Support Commands

```bash
# Quick status check
cd /Users/yumei/SAFvsOil
echo "Central:" && git log -1 --oneline
for node in coco mac-mini us-vps; do
  echo "$node:" && ssh $node "cd /opt/safvsoil && git log -1 --oneline"
done

# View webhook status
curl http://localhost:3001/webhook/status

# View sync logs
tail -f webhook-logs/sync-*.log

# Check PM2 status (if running)
pm2 status webhook
pm2 logs webhook
```

---

**Last Updated**: 2026-04-22  
**Next Review**: After first webhook trigger verification
