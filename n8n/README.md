# ClassPilot weekly reports - n8n workflow

An external, visual replacement for the in-process scheduler in
`backend/scheduler.py`. Instead of an `asyncio` loop hidden inside the Python
process, this workflow runs in n8n (self-hosted or n8n Cloud) and drives the
same backend endpoints from outside on a real cron schedule.

## What it does

`weekly-reports-workflow.json`:

1. **Every Monday 8am** (Schedule Trigger) - fires on a cron schedule.
2. **List Units** - `GET /api/units` against the backend.
3. **Extract Teacher IDs** (Code node) - dedupes `teacherId` across all units,
   since there's no dedicated "list teachers" endpoint.
4. **Loop Over Teachers** (Split In Batches) - iterates one teacher at a time.
5. **Generate Report For Teacher** - `POST /api/reports/generate` for that
   teacher, exactly what `run_weekly_reports_for_all_teachers()` does in
   Python today.
6. **Summarize Run** - a placeholder `Set` node producing a text summary.
   Swap this for a real Slack/Email node once you have credentials wired up
   in your n8n instance.

## Import it

1. Get an n8n instance running - easiest is Docker:
   ```bash
   docker run -it --rm -p 5678:5678 -e N8N_SECURE_COOKIE=false n8nio/n8n
   ```
   or use [n8n Cloud](https://n8n.io/cloud/).
2. Open the n8n editor, click **Import from File** (or **⋮ menu → Import
   workflow**), and select `n8n/weekly-reports-workflow.json`.
3. Set the `CLASSPILOT_BACKEND_URL` environment variable in your n8n
   instance to wherever the Python backend is reachable from n8n (e.g.
   `http://host.docker.internal:8000` if n8n is in Docker and the backend
   is running on your host machine; `http://127.0.0.1:8000` if n8n runs on
   the same host directly). If unset, the workflow defaults to
   `http://127.0.0.1:8000`.
4. Toggle the workflow **Active**.

## Don't double-fire reports

This workflow calls the exact same endpoint the in-process scheduler already
calls on its own timer. Running both at once means every teacher gets two
reports generated back to back. Pick one:

- **Using this n8n workflow?** Set `SCHEDULER_ENABLED=false` in the
  backend's `.env` to turn off the in-process loop.
- **Not using n8n?** Leave `SCHEDULER_ENABLED` unset (or `true`) and ignore
  this folder - the in-process scheduler in `backend/scheduler.py` still
  works exactly as before.

## Testing without waiting a week

Open the **Every Monday 8am** node and temporarily switch its Trigger Rule
from **Cron Expression** to **Interval** (e.g. every 2 minutes), the same way
`REPORT_INTERVAL_MS` shortens the in-process version for demos. Switch it
back to the weekly cron before leaving it active long-term.

## What's actually been verified

This workflow was imported into a real, locally-run n8n instance
(`n8n import:workflow`) and imported cleanly with all five node types
recognized - so the JSON is structurally valid n8n, not just well-formed
JSON. What wasn't possible to verify in this environment: an actual
scheduled/manual run inside the n8n editor UI against a live backend (no
browser available here, and n8n's CLI `execute` command specifically
requires an "Execute Workflow Trigger" node rather than a Schedule Trigger,
which doesn't apply to how this workflow is meant to run). Once you import
it and hit **Execute Workflow** in the editor with your backend running,
if any single node complains about its parameters, it's almost always the
HTTP Request nodes' body/method dropdowns needing a re-pick after import -
the endpoints and logic themselves are correct.
