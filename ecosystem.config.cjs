module.exports = {
  apps: [
    {
      name: "ol-sync-status",
      script: "/home/ubuntu/Recruiter-Tracking-Platform/backend/.venv/bin/python3",
      args: "/home/ubuntu/Recruiter-Tracking-Platform/backend/scripts/ol_sync_status.py --hours 1",
      cwd: "/home/ubuntu/Recruiter-Tracking-Platform/backend",
      cron_restart: "0 * * * *",
      autorestart: false,
      out_file: "/home/ubuntu/Recruiter-Tracking-Platform/logs/ol-sync-status-out.log",
      error_file: "/home/ubuntu/Recruiter-Tracking-Platform/logs/ol-sync-status-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      max_size: "10M",
      retain: "10",
    },
  ],
};
