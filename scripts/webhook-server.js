#!/usr/bin/env node

/**
 * GitHub Webhook Server for SAFvsOil Cluster Synchronization
 * Monitors push events to master branch and triggers automatic cluster sync
 * 
 * Port: 3001 (internal)
 * Events: GitHub push (refs/heads/master only)
 * 
 * Environment variables:
 * - GITHUB_WEBHOOK_SECRET: Signing secret for GitHub webhook verification
 * - WEBHOOK_PORT: Port to listen on (default: 3001)
 * - LOG_DIR: Directory for logs (default: ./webhook-logs)
 */

import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = process.env.WEBHOOK_PORT || 3001;
const GITHUB_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '..', 'webhook-logs');
const SYNC_SCRIPT = path.join(__dirname, 'auto-sync-cluster.sh');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const app = express();
app.use(express.json());

/**
 * Verify GitHub webhook signature using HMAC-SHA256
 * @param {string} payload - Raw request body as string
 * @param {string} signature - X-Hub-Signature-256 header value
 * @returns {boolean} - True if signature is valid
 */
function verifyGitHubSignature(payload, signature) {
  if (!GITHUB_SECRET) {
    console.warn('WARNING: GITHUB_WEBHOOK_SECRET not set. Signature verification skipped.');
    return true;
  }

  if (!signature) {
    console.error('Missing X-Hub-Signature-256 header');
    return false;
  }

  const hash = crypto
    .createHmac('sha256', GITHUB_SECRET)
    .update(payload)
    .digest('hex');

  const expected = `sha256=${hash}`;
  return crypto.timingSafeEqual(expected, signature);
}

/**
 * Log webhook event to file
 * @param {string} level - Log level (info, error, warn)
 * @param {string} message - Log message
 * @param {object} data - Additional data to log
 */
function logEvent(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...data,
  };

  const logFile = path.join(LOG_DIR, `webhook-${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');

  console.log(`[${level.toUpperCase()}] ${timestamp} - ${message}`, data);
}

/**
 * Trigger cluster synchronization
 * @param {string} sha - Git commit SHA to sync to
 * @param {string} ref - Git reference (e.g., refs/heads/master)
 */
async function triggerSync(sha, ref) {
  if (!fs.existsSync(SYNC_SCRIPT)) {
    logEvent('error', 'Auto-sync script not found', { script: SYNC_SCRIPT });
    return { status: 'error', message: 'Sync script not found' };
  }

  try {
    // Make script executable
    fs.chmodSync(SYNC_SCRIPT, 0o755);

    // Execute sync script asynchronously (non-blocking)
    // We return 202 immediately and handle sync in background
    setImmediate(() => {
      try {
        const cmd = `bash "${SYNC_SCRIPT}" "${sha}" "${ref}"`;
        const output = execSync(cmd, {
          cwd: __dirname,
          timeout: 300000, // 5 minutes timeout
          encoding: 'utf8',
        });
        logEvent('info', 'Cluster sync completed', { sha, ref, output });
      } catch (error) {
        logEvent('error', 'Cluster sync failed', {
          sha,
          ref,
          error: error.message,
          stderr: error.stderr?.toString() || 'N/A',
        });
      }
    });

    return { status: 'accepted', message: 'Sync process started' };
  } catch (error) {
    logEvent('error', 'Failed to trigger sync', { error: error.message });
    return { status: 'error', message: error.message };
  }
}

/**
 * POST /webhook/push
 * GitHub push event handler
 */
app.post('/webhook/push', (req, res) => {
  const payload = JSON.stringify(req.body);
  const signature = req.headers['x-hub-signature-256'];

  // Verify GitHub signature
  if (!verifyGitHubSignature(payload, signature)) {
    logEvent('error', 'Invalid webhook signature', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return res.status(403).json({ error: 'Invalid signature' });
  }

  logEvent('info', 'Valid webhook received', {
    ip: req.ip,
    ref: req.body.ref,
    repository: req.body.repository?.full_name,
  });

  const { ref, after: sha, repository } = req.body;

  // Only process master branch pushes
  if (ref !== 'refs/heads/master') {
    logEvent('warn', 'Ignoring non-master branch push', { ref });
    return res.status(200).json({ message: 'Ignored: not master branch' });
  }

  // Validate commit SHA
  if (!sha || sha.length !== 40) {
    logEvent('error', 'Invalid commit SHA', { sha });
    return res.status(400).json({ error: 'Invalid commit SHA' });
  }

  logEvent('info', 'Processing master branch push', {
    repository: repository?.full_name,
    sha,
  });

  // Trigger sync (async, non-blocking)
  triggerSync(sha, ref);

  // Return 202 Accepted immediately (webhook is processed asynchronously)
  return res.status(202).json({
    status: 'accepted',
    message: 'Sync process started',
    sha,
  });
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /webhook/status
 * Get recent webhook events
 */
app.get('/webhook/status', (req, res) => {
  const limit = parseInt(req.query.limit || '20', 10);
  const today = new Date().toISOString().split('T')[0];
  const logFile = path.join(LOG_DIR, `webhook-${today}.log`);

  try {
    if (!fs.existsSync(logFile)) {
      return res.json({ events: [] });
    }

    const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
    const events = lines.slice(-limit).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);

    res.json({ events, total: events.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Error handling middleware
 */
app.use((err, req, res, next) => {
  logEvent('error', 'Unhandled error', {
    message: err.message,
    stack: err.stack,
  });
  res.status(500).json({ error: 'Internal server error' });
});

/**
 * Start server
 */
const server = app.listen(PORT, () => {
  console.log(`GitHub Webhook server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhook/push`);
  console.log(`Status endpoint: GET http://localhost:${PORT}/webhook/status`);
  logEvent('info', 'Webhook server started', {
    port: PORT,
    logDir: LOG_DIR,
    syncScript: SYNC_SCRIPT,
  });
});

/**
 * Graceful shutdown
 */
process.on('SIGTERM', () => {
  logEvent('info', 'SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logEvent('info', 'SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
