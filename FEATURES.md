# Recruiter Tracking Platform — Feature & Task List

Each line below is a discrete deliverable, written so it can be pasted as a row in an Excel sheet.

## Backend — Foundation & Infrastructure

- Develop a FastAPI-based backend service to power the recruiter tracking platform.
- Implement modular feature-based architecture (auth, jobs, candidates, calls, validation, submissions, mails, etc.) for separation of concerns.
- Design and implement the relational schema for users, jobs, candidates, assessments, validations, submissions, consultant profiles, mails, clients, business heads, notifications, audit logs, and submission timeline.
- Configure SQLAlchemy ORM with connection pooling optimised for pgBouncer transaction-mode pooler.
- Support dual database backends (self-hosted PostgreSQL on AWS RDS and Supabase) switchable via a single environment flag.
- Implement automated DDL migrations that run on application startup, with per-statement commits to avoid concurrent-worker deadlocks on ALTER TABLE.
- Implement seed data bootstrap for first-time installs (admin user, pod lead, delivery lead, recruiter team, sample jobs).
- Build a centralised Pydantic settings layer that reads from `.env` and normalises Postgres URLs containing special characters.
- Implement password hashing using bcrypt and JWT-based authentication with configurable expiry.
- Add CORS middleware to enable secure cross-origin requests from the frontend.

## Backend — Authentication & User Management

- Develop the login API with JWT access token issuance.
- Develop the `/me` endpoint to return the current authenticated user's profile.
- Develop the change-password API with old-password verification.
- Implement a "must change password" flag enforced at first login.
- Develop user CRUD APIs (create, list, update, delete) restricted by role.
- Build admin-only API to reset another user's password.
- Implement role-based access control for four roles: Admin, KAM (Key Account Manager / Pod Lead), Delivery Lead, Recruiter.
- Implement recruiter sub-types (Sourcer, Caller, Both) for fine-grained allocation.
- Build APIs to assign and unassign recruiters to/from a Delivery Lead's pod.
- Build APIs to list all Delivery Leads, KAMs, and team-load summaries.
- Build APIs to fetch a user's full activity log and detail page data.

## Backend — Job / Demand Management

- Develop job creation, listing, detail, update, and deletion APIs.
- Implement job lifecycle statuses (pending review, open, on hold, closed) with workflow transitions.
- Build the "confirm job" API that moves a KAM-uploaded JD from pending-review to open after Delivery Lead approval.
- Capture demand metadata: client job ID, demand source, demand type (new / backfill / replacement), demand exclusivity (exclusive / open).
- Capture role attributes: work mode, work authorisation, headcount, location, salary range, min/max experience, skill stack.
- Allow multi-recruiter assignment via JSON-array columns (sourcer_ids, caller_ids) in addition to single primary owners.
- Implement Business Head selection enforcement at job creation time.
- Allow Delivery Leads to select KAMs when creating a job.
- Track sourcing and calling deadlines per job, separate from the overall job deadline.

## Backend — Candidate Management

- Develop candidate creation, listing, detail, update APIs.
- Implement 14-stage candidate status pipeline (sourced → pool_verified → handed_to_recruiter → call_in_progress → ready_for_validation → validated / needs_rework / on_hold / rejected → submitted_to_client → interview_stage → offer_rolled_out → joined / backed_out).
- Capture candidate attributes: mobile, email, LinkedIn URL, education, city, experience range, current company, skills, Naukri-active flag, immediate-joiner flag, lead source.
- Store the candidate's parsed resume content for downstream reuse.
- Track timestamped milestones per candidate (sourcing date, pool added at, call time, validation done at, submission time, feedback received at).
- Build APIs to assign a candidate to a recruiter and to reject a candidate with reason and rejector identity.

## Backend — Calling Module & Assessment

- Develop call-log API to record outcomes of recruiter calls with the candidate.
- Implement 14 call-outcome categories (under 2 min, 2-3 min, 3-5 min, 5-10 min, over 10 min, not picking, high notice, recently joined, not relevant, no good comm, call back, already processed, not looking, L1 with other client).
- Develop assessment-form API capturing verification basics, deployment target, CTC, scoring (8 weighted rubric dimensions), Stage B–D extras, and verdict.
- Auto-compute tech score, soft-skill score, overall score, and an auto-recommendation (Strong Submit / Consider / Hold) from assessment inputs.
- Implement skill-match grading (Exact / Strong / Partial / Weak / No match) and red-flag capture.
- Track candidate availability and commercial signals (notice negotiability, offers in hand, counter-offer risk).
- Auto-save a consultant profile silently alongside assessment to ensure downstream tables have live data.

## Backend — Validation Queue (Delivery Lead Workflow)

- Develop the validation-queue API listing candidates pending DL review.
- Develop the validation-action API to validate, request rework, hold, or reject a candidate.
- Capture DL comments, submission-to-client status, and submission date on validation.
- Develop consultant-profile capture/edit APIs (resignation acceptance, replacement KT, payroll, work timings, notice negotiability, dependencies, availability windows, etc.).

## Backend — Submission Tracking

- Develop submission creation, listing, update APIs.
- Track full interview pipeline through 20+ interview stages (submitted, TA review, HM review, shortlisted, L1/L2/Final scheduled-pending-cleared-rejected, offer rolled out / accepted / declined, joined, no-show).
- Capture TA feedback, HM feedback, TAT windows, briefing-done flags per round.
- Capture offer details (offered CTC, offer date, joining date confirmed/actual).
- Track other-offers count and counter-offer risk on every submission for negotiation awareness.
- Develop the submission-timeline API that returns an audit trail of every stage change with feedback, note, and the user who updated it.
- Build "submissions ready" API listing candidates validated but not yet submitted.

## Backend — AI-Powered Resume Extraction

- Develop backend service to process and understand resume data from multiple input formats.
- Implement multimodal resume parsing for text, PDF, image, and DOCX inputs.
- Integrate Azure OpenAI (gpt-4o-mini) for structured field extraction with cost tracking per call.
- Auto-fill consultant profile fields (sourcing date, full name, contact, experience options, education options) from extracted resume content.
- Track per-call token usage and compute USD cost using configurable model rate tables.

## Backend — AI-Powered JD Extraction

- Develop the JD-extract API that converts raw JD text or uploaded JD files into a structured ParsedJD JSON.
- Parse job title, company, skills, work mode, experience range, salary, location, headcount from free-form JDs.
- Store both the parsed JSON and the original raw text on the Job record.
- Track per-call cost for JD-extract operations.

## Backend — Mail Tracker (Consultant Exit-Mail Workflow)

- Develop the consultant-mail creation, listing, and update APIs.
- Capture exit date, exit proof (uploaded document), acknowledgement received flag, and DL-verification flag per mail.
- Enrich mail records with linked candidate, job, client, assessment, and consultant-profile context in a single response.
- Implement guard logic so a verification action never rewinds a candidate's status past `validated`.

## Backend — Clients & Business Heads (Account Managers)

- Develop client CRUD APIs with name, short name, website URL, logo (base64), description, last-updated-by tracking.
- Develop business-head (account manager) CRUD APIs with name, email, phone.
- Track `updated_at` and `last_updated_by` on every client edit.

## Backend — Dashboard & Pipeline Analytics

- Develop the dashboard API returning role-aware KPIs (total candidates, open jobs, submitted-this-month, joined-this-month).
- Develop the pipeline-counts API that returns headcount per stage for visualisation.
- Filter dashboard data by Recruiter (own candidates only) vs Delivery Lead (own pod) vs Admin (all).
- Develop the dashboard notifications API (paginated list + mark-as-read).
- Build the demand-status API summarising open demand vs filled positions.

## Backend — Follow-Up & Activity Tracking

- Develop the follow-up jobs API that returns a per-candidate "story" view: who sourced, who first called, when assessed, when emailed, current status, rejection reason and rejector.
- Surface every candidate-level event in a single timeline for Delivery Lead follow-up calls.

## Backend — Export

- Develop the candidate-export API returning a flat tabular dataset with all candidate, job, client, assessment, sourcing, and CTC fields.
- Make the export endpoint filter-aware so the frontend can download exactly what is shown on screen.

## Backend — Notifications & Real-Time

- Develop the notifications SSE/stream endpoint for real-time push to the frontend.
- Implement notification types: callback due, validation done, ready to submit, interview scheduled, feedback overdue, stale candidate, JD created/assigned, candidate sourced, ready-for-validation, candidate validated, stage updated.
- Develop mark-as-read APIs (single and bulk).
- Build a helper to broadcast a notification to all users of a given role.

## Backend — Background Scheduler

- Implement APScheduler background job that ticks every minute to evaluate job deadlines.
- Send a 15-minute pre-deadline warning to assigned sourcer / caller.
- Send an overdue alert to the Delivery Lead and the assigned recruiter once a deadline is missed.
- Use Postgres advisory locks (`pg_try_advisory_lock`) so only one uvicorn worker runs the deadline check per tick (prevents duplicate notifications under multi-worker deployments).
- Persist "warned" / "alerted" flags on each job to ensure each alert fires only once.

## Backend — File Upload & S3 Integration

- Develop the upload API that streams files to S3 in folder-scoped namespaces (resumes, exit-proofs, logos, jd-files).
- Enforce per-folder allow-list and 15 MB max upload size.
- Generate fresh presigned URLs for viewing previously uploaded files.
- Offload boto3 sync calls to a thread pool so request throughput is not blocked.

## Backend — Allocation Engine

- Implement round-robin / min-load allocation logic for sourcers, callers, and validators within a Delivery Lead's pod.
- Compute live load per team member (open jobs for sourcers, active candidates for callers, pending validations for validators).
- Break ties by user ID (longest-tenured wins).

## Backend — Dynamic Form Builder (Configurable Forms)

- Develop the form-config CRUD API enabling admins to configure form sections, fields, types, options, visibility, and order without code changes.
- Support field types: text, textarea, number, date, select, score.
- Persist form configurations per form name and support reset-to-default.

## Backend — Audit Logging

- Persist an audit-log entry for security-relevant actions (user, action, entity type, entity ID, detail, timestamp).

## Frontend — Foundation

- Develop the React + TypeScript single-page application using Vite as the build tool.
- Configure TailwindCSS for utility-first styling.
- Build the global Axios API client with JWT injection and 401-aware redirect.
- Implement the auth context with token persistence in localStorage.
- Implement the real-time context that subscribes to backend notification signals and re-renders affected views.
- Build the protected-route wrapper that enforces authentication for non-public pages.
- Build the responsive Layout shell (sidebar + content) used across all pages.
- Develop the role-aware Sidebar with route-level access control.
- Build shared UI primitives: StatusBadge, ScoreBar.

## Frontend — Authentication & Account

- Develop the login page with form validation and error messaging.
- Develop the change-password page enforced at first login.

## Frontend — Dashboard

- Develop the Dashboard page with stat cards (candidates, jobs, submitted, joined-this-month).
- Render the pipeline-stage distribution as a responsive bar chart (Recharts).
- Surface live notifications inline on the dashboard.

## Frontend — Jobs (JD Management)

- Develop the Jobs list page with filter, search, and status-grouped views.
- Develop the Job-creation flow: upload JD file, auto-extract via AI, review parsed fields, assign sourcers/callers, set deadlines.
- Implement Business-Head selection enforcement at job creation.
- Allow Delivery Leads to pick KAMs while creating a job.
- Develop the Job detail / edit drawer.
- Implement the "confirm JD" action that moves pending-review jobs into open status.

## Frontend — Candidates

- Develop the Candidates list page with multi-criteria filtering, search, and pagination.
- Develop the CandidateDetail page showing profile, call history, assessment, validation, submission, mail history.
- Build candidate-creation form with resume upload + AI auto-fill.
- Implement candidate assignment to recruiter.
- Implement candidate rejection with reason and rejector capture.

## Frontend — Pipeline Visualisation

- Develop the Pipeline page rendering each candidate's interview journey across all stages.
- Show submission timeline with stage, date, feedback, note, and updated-by per entry.
- Allow inline stage update with feedback capture.

## Frontend — Validation Queue

- Develop the ValidationQueue page listing candidates awaiting DL review with assessment summary.
- Allow inline validate / rework / hold / reject actions with mandatory comments.

## Frontend — Submissions

- Develop the Submissions page showing all active submissions across the team.
- Capture interview-round outcomes (TA, HM, L1, L2, Final) inline.
- Capture offer details, joining confirmation, and joining-date follow-up.

## Frontend — Mail Tracker

- Develop the MailTracker page showing every consultant mail with status, exit date, acknowledgement, and DL verification.
- Provide upload widget for exit-proof documents (PDF / image) via S3.
- Render the linked candidate, job, assessment, and consultant-profile context alongside each mail.

## Frontend — Follow-Up

- Develop the FollowUp page that visualises each candidate's full lifecycle as an expandable story (sourcing → call → assessment → mail → validation → submission → outcome).
- Allow filtering by recruiter, status, rejection reason.
- Provide one-click Excel export of the follow-up dataset.

## Frontend — Demand Status

- Develop the DemandStatus page summarising open demand vs filled headcount per client / role.

## Frontend — Clients

- Develop the Clients management page (create, edit, delete clients).
- Capture client logo via image upload (base64 or S3).
- Show last-updated-by and last-updated-at metadata.

## Frontend — Users & Team Management

- Develop the Users management page (admin) with create / edit / deactivate / reset-password actions.
- Develop the pod-assignment UI for assigning recruiters to a Delivery Lead.
- Show team-load summaries (live counts of open jobs, active candidates, pending validations per team member).

## Frontend — Form Builder (Configurable Forms)

- Develop the FormBuilder page enabling admins to add/remove/reorder sections and fields without code changes.
- Support drag-handle reordering, inline edit, visibility toggle, and required-flag toggle per field.
- Provide reset-to-default per form.

## Frontend — Export

- Develop the Export page with filter UI (business head, client, status, date range, recruiter).
- Generate Excel files client-side via SheetJS / xlsx with formatted headers.
- Provide refresh-and-download flow with progress indicator.

## Frontend — Realtime Notifications

- Subscribe to the backend SSE stream on app load and re-render affected pages on incoming signals.
- Show a notification badge with unread count and a dropdown panel of recent notifications.
- Provide mark-as-read (single) and mark-all-read actions.

## Database

- Design the production PostgreSQL schema (users, jobs, candidates, assessments, validations, submissions, consultant_profiles, consultant_mails, submission_timeline, account_managers, clients, call_logs, notifications, audit_logs).
- Provision the AWS RDS PostgreSQL instance and configure connection pooling for production.
- Configure Supabase as a secondary backend option with sslmode=require enforced.
- Implement online DDL migrations that run safely under concurrent uvicorn workers.
- Implement data-migration step to back-fill new roles (e.g., legacy "caller"/"sourcing_partner" → "recruiter", legacy "pod_lead" → "kam").
- Add foreign-key relationships across all tenancy entities (users ↔ candidates, jobs ↔ candidates, candidates ↔ assessments / validations / submissions / mails).
- Add indexes on hot-path columns (email, foreign keys, candidate status).

## Deployment & Infrastructure

- Containerise the backend with a Python 3.11-slim image using `uv` for deterministic dependency installation from `uv.lock`.
- Containerise the frontend with a multi-stage Node 20 build that compiles the Vite bundle and serves it via nginx 1.27.
- Configure nginx as the production reverse proxy: terminates HTTPS, serves static frontend assets, proxies `/api/` to the backend service on the Docker network.
- Author the `docker-compose.yml` orchestrating frontend + backend on a private bridge network with healthchecks and restart policies.
- Wire backend secrets at runtime via `--env-file ./backend/.env` so secrets never bake into the image.
- Provision the Let's Encrypt SSL certificate for `mrr-process-tracker.j2wofferletter.com` via Certbot (standalone mode).
- Mount cert volumes (`./certs` → `/etc/letsencrypt`, `./certbot-www` → `/var/www/certbot`) read-only into the nginx container.
- Author the `certbot-setup.sh` one-time SSL bootstrap script.
- Author the `deploy.sh` idempotent deployment script (git pull → cert check → `docker compose up -d --build --remove-orphans`).
- Configure automatic SSL renewal (cron + `certbot renew --webroot`).
- Configure CORS for allowed frontend origins.
- Integrate AWS S3 for resume, JD, exit-proof, and logo storage with presigned URLs.
- Integrate Azure OpenAI (gpt-4o-mini) for resume and JD parsing with token-cost tracking.
- Integrate Gmail SMTP via app passwords for consultant exit-mail dispatch.
- Configure environment-specific build args for the frontend (`VITE_API_BASE_URL=/api` in production so requests stay same-origin).
- Add `.dockerignore` for backend and frontend to keep `.env`, `.venv`, `node_modules`, build artefacts out of images.
- Document the full HTTPS setup workflow (DNS prerequisites, certbot bootstrap, renewal cadence, troubleshooting) in `HTTPS_SETUP.md`.

## Cross-Cutting Quality & Operations

- Implement role-aware authorisation guards on every API route.
- Implement structured JSON error responses with HTTP status codes consistent across modules.
- Implement timezone-aware datetime serialisation (always UTC ISO 8601) to prevent client-side timezone drift.
- Add startup health endpoint (`GET /`) for container healthchecks and external uptime monitors.
- Wire the deadline-scheduler into uvicorn startup with a cluster-wide advisory lock so multi-worker deployments stay safe.
