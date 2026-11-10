# File cleanup

Run `npm run files:cleanup` from the repository root with `DATABASE_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in the environment (or `.env`). This is a privileged maintenance command, not an HTTP endpoint.

Schedule hourly using the deployment scheduler, or cron (replace the path and ensure Node/npm are on PATH):

```cron
0 * * * * cd /absolute/path/to/Arunika-ERP && npm run files:cleanup >> /var/log/arunika-file-cleanup.log 2>&1
```

- Soft-delete PENDING assets created strictly more than one hour ago; completed uploads are untouched.
- For tombstones strictly older than 30 days, permanently delete the Cloudinary asset (including unfinished uploads using the original signed path), then remove its FileAsset row. Public and authenticated delivery types are handled separately.
- Process at most 100 tombstones per invocation. Run more frequently when backlog exceeds 100/hour. Do not overlap scheduled runs.
- Cloudinary failures are logged per asset, remain retryable, and do not stop other deletions. `not found` counts as success. Partial failures produce exit code 1; database-wide failures also produce exit code 1. Monitor logs/exit status and resolve persistent errors to prevent backlog starvation.

No scheduler is installed by this change. Configure one in the deployment environment. Deletion after the 30-day retention period is permanent.
