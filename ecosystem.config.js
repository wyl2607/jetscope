/**
 * PM2 Ecosystem Configuration
 * 
 * Manages the GitHub Webhook server and other critical processes
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 monitor ecosystem.config.js
 *   pm2 logs
 */

export default {
  apps: [
    {
      name: 'webhook',
      script: './scripts/webhook-server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        WEBHOOK_PORT: 3001,
      },
      env_development: {
        NODE_ENV: 'development',
        WEBHOOK_PORT: 3001,
      },
      // Error and output logs
      error_file: './webhook-logs/pm2-error.log',
      out_file: './webhook-logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Auto-restart configuration
      max_memory_restart: '500M',
      watch: false,
      ignore_watch: ['webhook-logs', 'node_modules'],
      
      // Crash and restart behavior
      max_restarts: 10,
      min_uptime: '30s',
      autorestart: true,
      
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      
      // Environment variables
      env: {
        NODE_ENV: 'production',
        WEBHOOK_PORT: process.env.WEBHOOK_PORT || 3001,
        LOG_DIR: './webhook-logs',
      },
    },
  ],

  // Cluster monitoring (optional)
  monitor: {
    enabled: true,
    refresh_interval: 5000,
  },

  // Other settings
  error_file: './webhook-logs/pm2-global-error.log',
  out_file: './webhook-logs/pm2-global-out.log',
};
