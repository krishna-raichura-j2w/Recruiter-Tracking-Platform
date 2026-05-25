# Offer Letter MySQL Database Schema Reference

> **Database:** `offerletter` on Amazon RDS (`j2wofferletter-prod`)
> **Access:** Read-only via `mis_operations` user
> **Connection:** `server/src/db/offer-letter-db.ts` — use `olQuery()` / `olQueryLimited()` helpers
> **Total tables:** 187 (most are relevant; ~30 are empty or deprecated)

This document maps the important tables in the J2W Offer Letter production MySQL database. Tables are grouped by domain. Irrelevant/empty tables are listed at the end for exclusion.

---

## Table of Contents

1. [Users & Roles](#1-users--roles)
2. [Candidate Profiles & Details](#2-candidate-profiles--details)
3. [Clients (Companies)](#3-clients-companies)
4. [Job Postings & Requirements](#4-job-postings--requirements)
5. [Recruitment Pipeline (applied_jobs + workflow)](#5-recruitment-pipeline)
6. [Offer Letters & Salary](#6-offer-letters--salary)
7. [Onboarding & Induction](#7-onboarding--induction)
8. [Employee Lifecycle & Exit](#8-employee-lifecycle--exit)
9. [Timesheets & Attendance](#9-timesheets--attendance)
10. [Skills & Taxonomy](#10-skills--taxonomy)
11. [Teams & Assignments](#11-teams--assignments)
12. [CRM (Internal Sales CRM)](#12-crm-internal-sales-crm)
13. [Views (Pre-built Queries)](#13-views-pre-built-queries)
14. [Reference / Lookup Tables](#14-reference--lookup-tables)
15. [Supporting Tables](#15-supporting-tables)
16. [Excluded / Irrelevant Tables](#16-excluded--irrelevant-tables)
17. [Key Relationships Diagram](#17-key-relationships)
18. [Enum / Status Value Mappings](#18-enum--status-value-mappings)

---

## 1. Users & Roles

### `users` (~1.3M rows)
Central user table for the entire platform. Uses STI (Single Table Inheritance) — the `type` column discriminates user types.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int PK | User ID — used as FK across most tables |
| `email` | varchar(255) UNIQUE | Login email |
| `encrypted_password` | varchar(255) | Bcrypt hash |
| `first_name` | varchar(255) | First name |
| `middle_name` | varchar(255) | Middle name |
| `last_name` | varchar(255) | Last name |
| `type` | varchar(255) | **STI discriminator** — see distribution below |
| `role_id` | int FK → roles | Legacy role reference |
| `location_id` | int | Location FK |
| `reporting_to` | int | Self-FK — manager's user ID |
| `admin_u` | tinyint(1) | Admin flag |
| `locked` | tinyint(1) | Account locked |
| `sign_in_count` | int | Total sign-ins |
| `current_sign_in_at` | datetime | Last sign-in timestamp |
| `last_sign_in_at` | datetime | Previous sign-in |
| `confirmed_at` | datetime | Email confirmation date |
| `created_at` | datetime | Account creation |
| `official_mail_id` | varchar(255) | J2W official email |
| `hirewand_person_id` | text | External ATS integration ID |
| `internal_hr` | tinyint(1) | Internal HR flag |
| `created_by_id` | int | Who created this user |

**User type distribution:**

| Type | Count | Description |
|------|-------|-------------|
| `UserCandidate` | ~1.39M | Job candidates (vast majority) |
| `UserRecruiter` | ~2,558 | J2W recruiters |
| `UserClient` | ~1,063 | Client company users |
| `UserLead` | ~316 | Team leads |
| `UserAccountManager` | ~297 | Account managers |
| `UserBusinessHead` | ~53 | Business heads (BHs) — key for recruitment scorecards |
| `UserManagement` | ~12 | Senior management |
| `UserHr` / `UserHrExecutive` / `UserHrConsultant` | ~21 | HR staff |
| `UserBde` / `UserCrmBdeSale` / `UserSale` | ~33 | Sales/BDE |
| `UserPayroll` / `UserFinance` | ~5 | Finance team |
| `UserHelpdesk` | ~17 | Helpdesk agents |
| `UserInduction` | ~6 | Induction managers |
| `UserSuperAdmin` / `UserAdmin` | ~6 | System admins |

**Use cases:** User lookup, recruiter performance, BH hierarchy, login analytics, reporting chains.

### `roles` (24 rows)
Role lookup table. Maps `role_id` on users.

| ID | Name | Description |
|----|------|-------------|
| 1 | admin | Platform admin |
| 2 | client | Client users |
| 3 | recruiter | Recruiters |
| 4 | candidate | Candidates |
| 5 | account_manager | Account managers |
| 6 | lead | Team leads |
| 7 | system_admin | System admin |
| 8 | super_admin | Super admin |
| 9 | hr | HR |
| 10 | management | Management |
| 11 | report | Reporting access |
| 12 | hr_consultant | HR consultants |
| 13 | compliance | Compliance |
| 14 | payroll | Payroll |
| 15 | consultantmanagement | Consultant management |
| 16 | induction | Induction |
| 17 | helpdesk | Helpdesk |
| 18 | finance | Finance |
| 19 | you_matter | Employee engagement |
| 20 | time_sheet | Timesheet access |

### `role_permissions` (~279 rows)
Permission assignments per role. Maps roles to specific platform features.

### `role_categories` (~181 rows)
Job role categories (e.g., "Engineering", "HR", "Finance"). Used in job postings.

---

## 2. Candidate Profiles & Details

### `candidate_profiles` (~1.6M rows)
Extended profile for candidates. One per candidate user.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int PK | Profile ID |
| `user_id` | int FK → users | Candidate user |
| `total_experience` | decimal(10,2) | Years of experience |
| `total_experience_in` | int | Unit (months/years) |
| `current_ctc` | decimal(10,2) | Current compensation |
| `current_ctc_in` | int | CTC unit |
| `expected_ctc` | decimal(10,2) | Expected compensation |
| `expected_ctc_in` | int | CTC unit |
| `notice_period` | decimal(10,2) | Notice period value |
| `notice_period_in` | int | Notice period unit |
| `employer` | varchar(10000) | Current employer |
| `designation` | varchar(100) | Current designation |
| `resume` | varchar(255) | Resume file path |
| `summary` | text | Profile summary |
| `latest_roles` | text | Recent roles |
| `functions` | text | Functional areas |
| `industries` | text | Industry experience |
| `job_type` | varchar(255) | Preferred job type |
| `employement_type` | varchar(255) | Employment type preference |
| `industry_id` | int FK → industries | Industry category |
| `functional_area_id` | int FK → functional_areas | Functional area |
| `mode_of_working` | int | Remote/onsite preference |

**Use cases:** Candidate search, experience analytics, CTC analysis, skill matching.

### `api_candidates` (~550K rows)
Candidates imported via external API (HireWand integration). Separate from the main `users` table.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int PK | |
| `hirewand_person_id` | varchar(255) | External ATS ID |
| `email` | varchar(255) UNIQUE | |
| `phone` | varchar(255) | |
| `first_name` / `last_name` | varchar(255) | |
| `total_experience` | double | Years |
| `latest_roles` | text | |
| `latest_companies` | text | |
| `summary` | text | Profile summary |
| `city` / `country` | varchar(255) | Location |
| `resume` | varchar(255) | Resume path |

**Use cases:** External candidate pool, cross-referencing with internal candidates.

### `api_candidates_skills` (~30M rows) ⚠️ LARGEST TABLE
Skills linked to API candidates. Very large — always use LIMIT.

| Column | Type | Notes |
|--------|------|-------|
| `api_candidate_id` | int FK | |
| `skill_name` | varchar(255) | |

### `api_candidates_educations` (~736K rows)
Education records for API candidates.

### `api_candidates_projects` (~1.8M rows)
Project history for API candidates.

### `candidate_additional_details` (~416K rows)
Extra candidate info for recruitment decisions.

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | int FK → users | |
| `offl_notice_period` | varchar(255) | Official notice period |
| `Negotiable` | tinyint(1) | Notice period negotiable? |
| `ready_to_join` | tinyint(1) | Immediately available? |
| `location_constraints` | text | Location preferences |
| `any_offer` | tinyint(1) | Has other offers? |
| `current_offer` | text | Current offer details |
| `ok_for_c2h` | tinyint(1) | Open to contract-to-hire? |
| `profile_by` | text | Sourced by |

### `candidate_experiences` (~21K rows)
Work history entries per candidate.

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | int FK → users | |
| `designation` | varchar(255) | Job title |
| `company` | varchar(255) | Company name |
| `job_location` | varchar(255) | Work location |
| `doj` | date | Date of joining |
| `lwd` | date | Last working day |

### `candidate_qualifications` (~834K rows)
Education records per candidate.

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | int FK → users | |
| `qualification` | varchar(255) | Degree name |
| `education_type` | int | Type code |
| `university` | varchar(255) | University |
| `specialization` | varchar(255) | Major/specialization |
| `college_name` | text | College |
| `score` | double | Grade/percentage |
| `degree` | varchar(255) | Degree type |
| `tier` | varchar(255) | College tier |

### `candidate_documents` (~505K rows)
Uploaded documents per candidate (ID proofs, offer letters, etc.).

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | int FK → users | |
| `document_type` | varchar(255) | Type (Aadhar, PAN, etc.) |
| `document_path` | varchar(255) | Storage path |
| `approved` | varchar(255) | Approval status |

### `candidate_skills` (~13.4M rows) ⚠️ VERY LARGE
Skills mapped to candidates. Always use LIMIT.

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | int FK → users | |
| `skill_id` | int FK → skills | |

### `candidate_prefered_locations` (~640K rows)
Preferred work locations per candidate.

### `user_details` (~2.2M rows)
Extended personal details per user. Linked to `users` via `user_id`.

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | int FK → users | |
| `gender` | int | Gender code (0=not specified) |
| `date_of_birth` | date | DOB |
| `nationality` | varchar(255) | |
| `permanent_address` | text | |
| `contact_address` | text | |
| `contact_phone` | varchar(15) | Phone number |
| `date_of_joining` | date | Joining date |
| `status` | int | Status code |
| `designation` | varchar(100) | Job title |
| `bench` | varchar(255) | Bench status (0 = active) |
| `available_date` | date | Available from date |
| `blood_group` | varchar(255) | |

### `candidate_social_media` (~5.4K rows)
Social media links per candidate (LinkedIn, etc.).

### `candidate_ratings` (~1.8K rows)
Recruiter ratings of candidates.

| Column | Type | Description |
|--------|------|-------------|
| `candidate_id` | int FK | |
| `rated_by` | int FK → users | Recruiter |
| `overall_rating` | int | 1-5 |
| `communication_rating` | int | |
| `technical_rating` | int | |
| `feedback` | text | Written feedback |

### `my_details` (~19K rows)
Self-service employee details (bank, PF, ESIC, medical).

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | int FK → users | |
| `pan_no` | varchar(255) | PAN card |
| `uan_no` | varchar(255) | UAN for PF |
| `bank_name` / `acc_no` / `ifsc_code` | varchar(255) | Bank details |
| `pf_status` | enum('new','existing') | PF account status |
| `esic_status` | enum('new','existing') | ESIC status |
| `mediclaim_status` | enum('new','existing') | Insurance status |
| `aadhar_no` | varchar(255) | Aadhar number |

---

## 3. Clients (Companies)

### `clients` (~1,019 rows)
Client companies that J2W provides staffing services to.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int PK | Client ID |
| `user_id` | int FK → users | Client admin user |
| `company_name` | varchar(100) | **Client company name** |
| `location_id` | int FK → locations | HQ location |
| `category` | int | Client category |
| `number_of_employees` | int | Company size |
| `domain` | varchar(255) | Industry domain |
| `revenue` | varchar(255) | Revenue range |
| `yearly_hirings` | int | Annual hiring volume |
| `contact_person_name` | varchar(100) | Primary contact |
| `contact_person_designation` | varchar(100) | Contact title |
| `contact_phone` | varchar(20) | Contact phone |
| `website` | varchar(255) | Company website |
| `employee_type` | int | Default employee type for this client |
| `no_of_leaves` | int | Default leave policy |
| `salary_date` | varchar(255) | Salary payment date |
| `min_margin_percentage` | float | Minimum margin threshold |
| `target_margin` | varchar(255) | Target margin |
| `master_client` | int | Parent client ID (for sub-clients) |
| `master_check` | tinyint(1) | Is master client? |
| `primary_spoc_name` / `primary_spoc_email` / `primary_spoc_contact` | varchar(255) | Primary SPOC |
| `secondary_spoc_name` / `secondary_spoc_email` / `secondary_spoc_contact` | varchar(255) | Secondary SPOC |
| `crm_lead_id` | int FK → crm_leads | Link to CRM |

**Top clients by offer count:** Infosys ADM (4,669), Medline Industries (1,945), SocGen COE (1,698), Johnson Electric (1,076), Infinx Champ (353).

**Use cases:** Client analytics, revenue analysis, margin tracking, staffing metrics per client.

### `company_profiles` (~48 rows)
Detailed client company profiles for recruiter reference.

| Column | Type | Description |
|--------|------|-------------|
| `client_id` | int FK → clients | |
| `contract_id` | int FK → contracts | |
| `about` | text | Company description |
| `headquarter` | varchar(255) | HQ city |
| `year_founded` | int | |
| `company_size` | int | |
| `specialization` | text | Core competencies |
| `interview_process` | text | Interview steps |
| `interview_locations` | text | Interview locations |
| `client_pitch_point` | text | Selling points for candidates |
| `roles` / `skills` / `domains` | text | Required roles/skills |

### `contracts` (~222 rows)
Staffing contracts between J2W and clients.

| Column | Type | Description |
|--------|------|-------------|
| `client_id` | int FK → clients | |
| `agreement_type` | varchar(255) | Contract type |
| `type_of_staffing` | varchar(255) | Staffing model |
| `active_status` | tinyint(1) | Active? |
| `start_date` / `end_date` | date | Contract period |
| `rate_of_payment` | text | Payment terms |
| `payment_term` | text | Payment schedule |
| `notice` | text | Notice period terms |
| `penalties` | text | Penalty clauses |
| `standard_work_hours` | int | Daily work hours |

### `contract_revisions` (3 rows)
Contract amendment history.

---

## 4. Job Postings & Requirements

### `job_postings` (~95K rows)
Job requirements/demands posted by clients or internal teams.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int PK | Job posting ID |
| `client_id` | int FK → clients | Client company |
| `user_id` | int FK → users | Created by (recruiter/AM) |
| `title` | varchar(255) | Job title |
| `designation` | varchar(255) | Role designation |
| `experience` | varchar(255) | Min experience |
| `experienceto` | varchar(255) | Max experience |
| `salary_from` / `salary_to` | decimal(10,2) | Salary range |
| `description` | text | Job description |
| `responsibilities` | text | Role responsibilities |
| `status` | int | **0**=draft, **1**=active, **2**=closed, **3**=on-hold |
| `no_of_opening` | int | Number of openings |
| `location` | varchar(100) | Work location |
| `industry_id` | int FK → industries | |
| `functional_area_id` | int FK → functional_areas | |
| `role_category_id` | int FK → role_categories | |
| `job_role_id` | int FK → job_roles | |
| `job_types` | int | Job type code |
| `job_requirement_type` | varchar(255) | Requirement type |
| `client_job_id` | varchar(255) | Client's internal job ID |
| `maximum_submission` | int | Max candidate submissions |
| `requested_by` | varchar(255) | Requestor name |
| `requested_date` | date | When requirement came in |
| `expected_client_closure` | date | Expected closure date |
| `group` / `sub_group` | varchar(255) | Client organizational group |
| `po_opportunity_mrr` | varchar(255) | PO opportunity value |
| `potential_gm` | varchar(255) | Potential gross margin |
| `is_vip` | varchar(255) | VIP/priority flag |
| `created_at` | datetime | |

**Status distribution:** Active=60K, Draft=45K, Closed=3.2K.

**Use cases:** Demand tracking, requirement analytics, client requirement pipeline, recruiter workload.

### `job_skills` (~170K rows)
Required skills per job posting.

| Column | Type |
|--------|------|
| `job_posting_id` | int FK → job_postings |
| `skill_id` | int FK → skills |

### `job_locations` (~78K rows)
Multiple locations per job posting.

### `job_mandatory_checks` (~60K rows)
Mandatory compliance checks required per job (e.g., BGV, drug test).

### `job_assignments` (~433K rows)
Recruiter-to-job assignments. Shows which recruiters work on which requirements.

| Column | Type | Description |
|--------|------|-------------|
| `job_posting_id` | int FK → job_postings | |
| `user_id` | int FK → users | Assigned recruiter |

### `probing_details` (~23K rows)
Deep-dive details gathered about job requirements.

| Column | Type | Description |
|--------|------|-------------|
| `job_id` | int FK → job_postings | |
| `reporting_manager_location` | text | Manager location |
| `project_size` / `project_count` | text | Team/project scale |
| `work_mode` | text | Remote/hybrid/onsite |
| `candidate_role` | text | Detailed role clarity |
| `feedback_eta` | text | Interview feedback ETA |
| `interview_type` | text | Interview format |
| `notice_period` | text | Acceptable notice period |
| `urgency_eta` | text | Urgency level |

### `job_notifiers` (~251 rows)
Email notification preferences per job posting.

---

## 5. Recruitment Pipeline

### `applied_jobs` (~1.4M rows) ⭐ CORE TABLE
**The central recruitment pipeline table.** Each row = one candidate's application to one job, with workflow tracking via `current_step`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int PK | Application ID |
| `user_id` | int FK → users | Candidate |
| `job_posting_id` | int FK → job_postings | Job requirement |
| `status` | int | Overall status (0=active) |
| `current_step` | varchar(255) | **Current workflow step ID** — maps to `candidate_work_flows.step_id` |
| `prev_step` | varchar(255) | Previous step |
| `applied_by_id` | int | Who applied (recruiter or self) |
| `self_applied` | tinyint(1) | Self-applied? |
| `note` | text | Application notes |
| `created_at` | datetime | Application date |

**Top current_step distribution:**

| Step ID | Workflow Step | Count |
|---------|-------------|-------|
| 8 | Client Screen Reject | 293K |
| 7 | Client Submit | 229K |
| 83 | No Feedback | 163K |
| 12 | L1 Reject | 163K |
| 49 | Duplicate Profile | 159K |
| 76 | Client Submit – Position On Hold | 108K |
| 1 | Applied | 66K |
| 84 | Client Submit - Position Closed | 51K |
| 85 | Client Submit - Position Closed by Client | 37K |
| 9 | Schedule L1 Interview | 30K |
| 46 | Exit Formalities Complete | 26K |
| 44 | Onboarded | 7.6K |

**Use cases:** This is the single most important table for recruitment analytics — submission counts, interview tracking, selection rates, onboarding metrics, funnel conversion analysis.

### `candidate_work_flows` (102 rows) ⭐ WORKFLOW DEFINITION
Defines the entire recruitment pipeline workflow as a state machine. `step_id` in `applied_jobs.current_step` maps here.

**Complete workflow stages:**

#### Submission Stage (steps 1-7, 49, 76, 83-85)
| Step | Name | Terminal? |
|------|------|-----------|
| 1 | Applied | No |
| 2 | Validate | No |
| 3 | Validation Reject | Yes |
| 4 | Internal Submit | No |
| 5 | Lead/Manager Validation | No |
| 6 | Internal Reject | Yes |
| 7 | Client Submit | No |
| 49 | Duplicate Profile | Yes |
| 76 | Client Submit – Position On Hold | Yes |
| 83 | No Feedback | Yes |
| 84 | Client Submit - Position Closed | Yes |
| 85 | Client Submit - Position Closed by Client | Yes |
| 98 | Internal Panel Reject | Yes |
| 99 | Internal Panel Submit | No |

#### Interview Stage (steps 8-25, 47, 56, 58-72, 75, 77-81, 86-97, 109-113)
Supports up to **L6 interviews** (6 rounds). Each level has: Schedule → Reschedule → No Show / Reject / Select / Position On Hold / Position Closed / Panel Unavailable.

| Key Steps | Name |
|-----------|------|
| 8 | Client Screen Reject |
| 9/10 | Schedule/Reschedule L1 |
| 11/12/13 | L1 No Show / Reject / Select |
| 14-18 | L2 cycle |
| 19-23 | L3 cycle |
| 58-62 | L4 cycle |
| 63-67 | L5 cycle |
| 68-72 | L6 cycle |
| 24 | Position On Hold |
| 25 | Resource meet: F2F/Skype |
| 47 | Confirm Final Select |
| 56 | Reopen |

#### Offer Stage (steps 26-39, 41-42, 73-74, 100-108)
| Step | Name |
|------|------|
| 26 | View Candidate Documents |
| 27 | Create Offer |
| 28 | Create Perm Offer |
| 29 | Pending Manager Approval |
| 30 | Manager Approved |
| 31 | Manager Rejected |
| 33 | Offer Accepted |
| 34 | Offer Rejected |
| 35 | Re-create Offer |
| 37 | Initiate BGV |
| 38 | BGV Complete |
| 39 | BGV Failure |
| 41 | Confirm Onboarding |
| 42 | Candidate No Show |
| 73 | Create On-demand Offer |
| 74 | Offer No Show |
| 100-104 | DOJ Postponed / Negotiation / Declined / Withdrawn |
| 105-107 | BGV Pending / Failed / Cleared |
| 108 | Joining Formalities Pending |

#### Onboarding Stage (steps 43-46)
| Step | Name |
|------|------|
| 43 | Set Contract End Date |
| 44 | Onboarded |
| 45 | Initiate Exit Formalities |
| 46 | Exit Formalities Complete |

#### Induction Stage (steps 53-55, 57, 82)
| Step | Name |
|------|------|
| 53 | Initiate Induction |
| 54 | Induction Completed |
| 55 | No Show (Induction) |
| 57 | Reschedule Induction |
| 82 | Onboarding No Show |

### `candidate_work_flow_statuses` (~222K rows)
Status change history for candidates in the pipeline. Audit trail of step transitions.

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | int | Candidate |
| `status` | text | Status description |
| `current_step` | int | Step ID at time of change |
| `status_change_by` | int | Who made the change |
| `created_at` | datetime | When the change happened |

### `validation_screens` (~226K rows)
Interview scheduling details per candidate-job combination.

| Column | Type | Description |
|--------|------|-------------|
| `applied_candidate_id` | int FK | Candidate user ID |
| `applied_candidate_for_job_id` | int FK | Job posting ID |
| `candidate_work_flow_step` | int | Workflow step at time of interview |
| `interview_mode` | int | Mode (in-person/video/phone) |
| `interview_date` | date | Scheduled date |
| `interview_time` | varchar(255) | Scheduled time |
| `contact_person` | varchar(255) | Interviewer name |
| `venue` | text | Interview venue |

### `selected_candidates` (~28.5K rows)
Records when a candidate is selected. Links to `applied_jobs`.

| Column | Type | Description |
|--------|------|-------------|
| `applied_jobs_id` | int FK → applied_jobs | Application record |
| `po` | varchar(255) | Purchase order value |
| `margin` | varchar(255) | Margin percentage |
| `tentative_doj` | date | Tentative date of joining |
| `current_ctc` | varchar(255) | CTC at selection |
| `offered_ctc` | varchar(255) | CTC offered |

### `reasons` (~325K rows)
Reason codes for pipeline step transitions (rejections, holds, etc.).

| Column | Type | Description |
|--------|------|-------------|
| `step_id` | int | Workflow step |
| `reason` | text | Reason text |
| `candidate_id` | int | Candidate |
| `applied_job_id` | int FK → applied_jobs | Application |

### `candidate_mandatory_checks` (~17.5K rows)
Compliance check results per candidate-job pair.

| Column | Type | Description |
|--------|------|-------------|
| `job_id` | int FK | Job posting |
| `candidate_id` | int FK | Candidate |
| `mandatory_checks` | int | Check type |
| `feedback` | text | Result/feedback |
| `check_type` | varchar(255) | Check category |
| `checked_by` | int FK | Who performed |

### `referred_candidates` (~9.5K rows)
Employee referral records.

| Column | Type | Description |
|--------|------|-------------|
| `name` / `email` / `p_no` | varchar | Referred person details |
| `referred_by_id` | varchar(255) | Referrer user ID |
| `job_posting_id` | varchar(255) | Job they were referred for |
| `status` | varchar(255) | Referral status |
| `referee_rating` | int | Rating of the referral |

---

## 6. Offer Letters & Salary

### `offer_letters` (~34.5K rows) ⭐ CORE TABLE
Formal offer letter records. Central to the platform's primary function.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int PK | Offer letter ID |
| `candidate_id` | int FK → users | Candidate |
| `client_id` | int FK → clients | Client company |
| `created_by_id` | int FK → users | Recruiter who created |
| `job_posting_id` | int FK → job_postings | Source requirement |
| `approved_by_id` | int FK → users | Approver |
| `status` | int | **Status code** — see mapping below |
| `full_name` | varchar(255) | Candidate name |
| `designation` | varchar(255) | Job title |
| `joining_date` | date | Date of joining |
| `ctc` | varchar(255) | Annual CTC (string, in INR) |
| `total_ctc` | varchar(255) | Total CTC with variable |
| `variable_comp` | varchar(255) | Variable component |
| `employee_type` | int | **Employment type** — see mapping below |
| `p_o_value` | decimal(10,2) | Purchase order value |
| `p_o_value_type` | int | PO value type |
| `margin` | decimal(10,2) | Margin percentage |
| `po_end_date` | date | PO expiry date |
| `candidate_address1` / `candidate_address2` / `candidate_city` / `candidate_zip_code` / `candidate_country` | | Candidate address |
| `client_address1` / `client_address2` / `client_zip_code` / `client_country` | | Client address |
| `joining_location_id` | int FK → locations | Work location |
| `candidate_location_id` | int FK → locations | Candidate location |
| `father_name` | varchar(255) | Father's name (for Indian docs) |
| `dob_date` | date | Date of birth |
| `pan_number` | varchar(255) | PAN card |
| `aadhar_number` | varchar(255) | Aadhar card |
| `married_status` | varchar(255) | Marital status |
| `notice_period_from_company` / `notice_period_from_employee` | varchar(255) | Notice periods |
| `no_of_leaves` | int | Annual leaves |
| `salary_date` | varchar(255) | Salary day |
| `frequency` | int | Payment frequency |
| `ceo_approval` | tinyint(1) | CEO approval flag |
| `revision_date` | date | Last revision date |
| `hrbp_id` | int FK | Assigned HRBP |
| `verified` | tinyint(1) | Verified flag |
| `is_rejected` | tinyint(1) | Rejected flag |
| `po_margin_approval` | tinyint(1) | PO margin approved? |
| `offer_released_by_id` | int | Who released the offer |
| `social_title` | varchar(255) | Mr/Ms/Mrs |
| `grade` | varchar(255) | Employee grade |

**Status distribution:**

| Status | Count | Meaning |
|--------|-------|---------|
| 0 | 610 | Draft / Pending |
| 1 | 1,212 | Created / Pending Approval |
| 2 | 8 | Approved |
| 3 | 2,066 | Offer Released |
| 4 | 928 | Offer Accepted |
| 5 | 3,648 | Onboarding Complete |
| 6 | 27,578 | Active / Current Employee |
| 7 | 1,353 | Exited |
| 8 | 11 | Terminated |

**Employee type distribution:**

| Type | Count | Meaning |
|------|-------|---------|
| 0 | 4,683 | Standard Contract |
| 1 | 6,956 | Fixed Term |
| 2 | 20,195 | Third-party Payroll |
| 3 | 138 | Permanent |
| 4 | 3,701 | Consultant |
| 5 | 27 | Intern |
| 6 | 1,511 | On-Demand |
| 7 | 242 | Other |

**Use cases:** Offer tracking, onboarding analytics, CTC analysis, client billing (PO/margin), employee lifecycle management.

### `salary_breakups` (~34K rows)
Detailed salary breakdowns per offer letter.

| Column | Type | Description |
|--------|------|-------------|
| `offer_letter_id` | int FK → offer_letters | |
| `basic` | decimal(10,2) | Basic salary |
| `hra` | decimal(10,2) | House Rent Allowance |
| `stat` | decimal(10,2) | Statutory component |
| `conveyence` | decimal(10,2) | Conveyance allowance |
| `medical` | decimal(10,2) | Medical allowance |
| `telephone` | decimal(10,2) | Telephone allowance |
| `lta` | decimal(10,2) | Leave Travel Allowance |
| `special_allowance` | decimal(10,2) | Special allowance |
| `gross_earning` | decimal(10,2) | Total gross |
| `pf` | decimal(10,2) | Provident Fund |
| `esic_employer` | decimal(10,2) | ESIC employer contribution |
| `gratuity` | decimal(10,2) | Gratuity |
| `leave_encashment` | decimal(10,2) | Leave encashment |
| `non_salary_component` | decimal(10,2) | Non-salary benefits |
| `total` | decimal(10,2) | Total CTC |
| `da_val` | decimal(10,0) | Dearness Allowance |
| `pt` | decimal(8,2) | Professional Tax |

**Use cases:** Salary analytics, component-level CTC analysis, compliance reporting.

### `perm_offer_letters` (~2.2K rows)
Permanent/on-demand offer letters (different format from contract offer letters).

| Column | Type | Description |
|--------|------|-------------|
| `client_id` | int FK | Client |
| `created_by_id` | int FK | Creator |
| `job_posting_id` | int FK | Job |
| `user_id` | int FK → users | Candidate |
| `full_name` | varchar(255) | |
| `joining_date` | date | |
| `ctc` | varchar(255) | CTC |
| `p_o_value` | decimal(10,0) | PO value |
| `status` | int | Status |
| `employee_type` | int | |
| `offerletter_doc` | varchar(255) | Document file |

### `verified_offers` (~12.5K rows)
CTC and PO/margin verification records.

| Column | Type | Description |
|--------|------|-------------|
| `offer_letter_id` | int FK | |
| `CTC_verified` | tinyint(1) | CTC approved? |
| `po_margin_verified` | tinyint(1) | PO/margin approved? |
| `po_verified_by_id` / `ctc_verified_by_id` | int FK | Verifier |
| `po_and_margin_verified_on` / `CTC_verified_on` | date | Verification dates |

### `po_histories` (~2.9K rows)
Purchase order revision history.

| Column | Type | Description |
|--------|------|-------------|
| `offer_letter_id` | int FK | |
| `old_PO_value` | decimal(10,0) | Previous PO value |
| `old_PO_end_date` | date | Previous end date |
| `old_margin` | decimal(10,0) | Previous margin |
| `revoke_reason` | text | Reason for change |
| `updated_by` | int FK → users | Who changed it |
| `po_approval_mail` | varchar(255) | Approval email attachment |

### `po_end_date_events` (~607 rows)
PO end date tracking events for contract management.

---

## 7. Onboarding & Induction

### `inductions` (~25.5K rows)
Induction/onboarding scheduling per candidate.

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | int FK → users | Candidate |
| `applied_job_id` | int FK → applied_jobs | Application |
| `induction_date` | date | Scheduled date |
| `induction_time` | varchar(255) | Scheduled time |
| `induction_mode` | int | Mode (in-person/virtual) |
| `contact_person` | varchar(255) | POC |
| `venue` | varchar(255) | Location |
| `requirement_type` | varchar(255) | Type |

### `induction_statuses` (~29.3K rows)
Post-induction status tracking and document collection per offer letter.

| Column | Type | Description |
|--------|------|-------------|
| `offer_letter_id` | int FK → offer_letters | |
| `introduction` | tinyint(1) | Introduction complete? |
| `company_overview` | tinyint(1) | Overview complete? |
| `document_collected` | tinyint(1) | Docs collected? |
| `leave_policy` | tinyint(1) | Leave policy acknowledged? |
| `esic_form_filled` | tinyint(1) | ESIC form done? |
| `timesheet` | tinyint(1) | Timesheet setup? |
| `offer_hard_copy` | tinyint(1) | Hard copy issued? |
| `joining_form` | tinyint(1) | Joining form signed? |
| `un_no` / `bank_name` / `acc_no` / `ifsc_code` | varchar(255) | Bank details |
| `pf_status` / `pf_no` | varchar(255) | PF status |
| `mediclaim_status` / `mediclaim_no` / `mediclaim_for` | varchar(255) | Medical insurance |
| `esic_status` / `esic_no` | varchar(255) | ESIC |

### `induction_progresses` (~14.7K rows)
Induction completion percentage tracker.

| Column | Type | Description |
|--------|------|-------------|
| `candidate_id` | int FK | |
| `offer_letter_id` | int FK | |
| `induction_progress_percent` | int | 0-100 |

### `employee_details` (~24.4K rows)
Core employee record created after onboarding.

| Column | Type | Description |
|--------|------|-------------|
| `offer_letter_id` | int FK → offer_letters | Link to offer |
| `employee_id` | varchar(255) UNIQUE | **J2W Employee ID** (e.g., "J2W-12345") |
| `bank_ac` / `bank_ifsc` | varchar(255) | Bank details |
| `spouse_name` | varchar(255) | |
| `gender` | varchar(255) | |
| `work_end_date` | date | Contract end date |
| `attendance_required` | tinyint(1) | Needs attendance tracking? |

### `candidate_pf_details` (~18.5K rows)
Provident Fund details per employee.

| Column | Type | Description |
|--------|------|-------------|
| `offer_letter_id` | int FK | |
| `pf_type` | varchar(255) | New/existing |
| `uan` | varchar(255) | Universal Account Number |
| `pf_no` | varchar(255) | PF account number |
| `eps_eligibility` | tinyint(1) | EPS eligible? |
| `first_epf_enrolled_date` | date | First EPF enrollment |

### `esic_bank_account_details` (~11.7K rows)
ESIC and bank account details per offer letter.

### `emergency_contacts` (~36K rows)
Emergency contact information per user.

### `family_details` (~108K rows)
Family member details per user (for insurance/emergency).

---

## 8. Employee Lifecycle & Exit

### `exited_candidates` (~23.4K rows) ⭐ KEY TABLE
Employee exit records. Each row = one employee exit event.

| Column | Type | Description |
|--------|------|-------------|
| `offer_letter_id` | int FK → offer_letters | |
| `user_id` | int FK → users | Employee |
| `exit_type` | varchar(255) | **Exit category** — see distribution below |
| `exit_reason` | text | Detailed reason |
| `last_work_day` | date | Actual last working day |
| `tentative_exit_date` | date | Initially planned exit date |
| `resignation_date` | date | Resignation submission date |
| `exit_status` | int | Status code |
| `conversion_type` | varchar(255) | If converted to different role |
| `billable_clause` | varchar(255) | Billing clause |
| `reliving_letter_sent` | varchar(255) | Relieving letter status |
| `resignation_acceptance_status` | tinyint(1) | Resignation accepted? |
| `unable_rtn_reason` | text | Why retention failed |
| `reployed_to_where` | text | Redeployment destination |
| `approved` | tinyint(1) | Exit approved? |
| `asset_status` / `f_f_status` | varchar(255) | Asset return / F&F status |
| `np_amount` | decimal(10,2) | Notice period recovery amount |
| `np_amount_status` / `np_amount_reason` | text | NP recovery details |
| `created_by` / `final_created_by` | int FK | Who initiated/finalized |

**Exit type distribution:**

| Exit Type | Count |
|-----------|-------|
| Resignation | 7,673 |
| Conversion | 4,464 |
| Project Roll Off | 4,188 |
| Absconded | 3,380 |
| Contract Closure | 2,470 |
| Termination | 1,525 |
| Others | 645 |
| Resign With Notice | 511 |
| No Show | 495 |
| BGV Failure | 283 |
| Exited and Redeployed | 257 |
| Resign Without Notice | 114 |
| Agreement Closure | 93 |

**Use cases:** Attrition analysis, exit trend tracking, reason analysis, retention metrics, BH-level exit rates.

### `exit_checklist_forms` (~9.3K rows)
Exit checklist completion per employee.

| Column | Type | Description |
|--------|------|-------------|
| `user_id` / `offer_letter_id` | int FK | Employee |
| `employee_name` | varchar(255) | |
| `j2w_employee_id` / `client_employee_id` | text | IDs |
| `date_of_resignation` / `date_of_relieving` / `doj` | date | Key dates |
| `asset_id_card` / `asset_laptop` / `asset_lock_and_keys` | varchar(255) | Asset return status |
| `asset_delivered_to_name` / `asset_delivery_date` | varchar(255)/date | Asset handover |

### `exit_interview_forms` (~7.9K rows)
Exit interview responses (20 questions).

| Column | Type | Description |
|--------|------|-------------|
| `user_id` / `offer_letter_id` | int FK | Employee |
| `question_1` through `question_10` | longtext | Responses |
| `name_of_interviewer` | text | |
| `date_of_exit_interview` | date | |

### `retained_employees` (~1.8K rows)
Records of employees who were retained after resignation.

| Column | Type | Description |
|--------|------|-------------|
| `user_id` / `offer_letter_id` | int FK | Employee |
| `reason` | varchar(255) | Retention reason |
| `retention_details` | varchar(255) | What was offered |
| `retain_by_id` | int FK | Who retained them |

### `candidate_resignations` (~25 rows)
Formal resignation letter records.

### `candidate_resignation_flows` (~18 rows)
Resignation approval workflow steps.

### `redeployments` (~26 rows)
Internal redeployment from one client to another.

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | int FK | Employee |
| `from_client_id` / `to_cient_id` | int FK | Source → destination client |
| `offer_letter_id` | int FK | |
| `comment` | longtext | |

---

## 9. Timesheets & Attendance

### `timesheets` (~4.5M rows) ⚠️ LARGE TABLE
Daily timesheet entries per employee.

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | int FK → users | Employee |
| `date` | date | Work date |
| `hours` | varchar(255) | Hours worked |
| `task_code` | text | Task/project code |

**Use cases:** Attendance analytics, utilization rates, billing reconciliation.

### `timesheet_docs` (~183K rows)
Monthly consolidated timesheet documents submitted for approval.

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | int FK → users | Employee |
| `client_id` | int FK | Client |
| `month` / `year` | int | Period |
| `status` | int | Approval status |
| `timesheet` | varchar(255) | Document file |
| `email_of_manager` / `name_of_manager` | varchar(255) | Approver |
| `worked_hours` | varchar(255) | Total hours |
| `worked_days` / `working_days` | varchar(255) | Days worked vs expected |
| `leaves_taken` | varchar(255) | Leave count |
| `FDL` / `HDL` | int | Full day / half day leaves |
| `LOB` | varchar(255) | Loss of business days |
| `LOP` | decimal(10,2) | Loss of pay days |
| `OT` | varchar(255) | Overtime hours |
| `incentives` | text | |

**Use cases:** Monthly billing, leave tracking, utilization analysis, payroll processing.

### `attendances` (~3.2K rows)
Daily attendance records.

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | int FK | Employee |
| `date` | date | |

### `daily_coupons` (~85K rows)
Food court coupon usage tracking.

---

## 10. Skills & Taxonomy

### `skills` (~30K rows)
Master skill catalog.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int PK | Skill ID |
| `name` | varchar(255) | Skill name |
| `skill_category_id` | int FK | Category |
| `admin_created` | tinyint(1) | System vs user-created |

### `skill_groups` (~21 rows)
Skill groupings (e.g., "Frontend", "Backend", "DevOps").

### `skillgroup_skills` (~106 rows)
Skills mapped to groups.

### `functional_areas` (~89 rows)
Functional area taxonomy (IT, Finance, HR, etc.).

### `industries` (~80 rows)
Industry taxonomy (Banking, Healthcare, Manufacturing, etc.).

### `job_roles` (~889 rows)
Job role taxonomy.

### `locations` (~3.2K rows)
Geographic location master with city and state.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int PK | |
| `name` | varchar(255) | City name |
| `state` | varchar(255) | State |
| `admin_created` | tinyint(1) | System-created? |

---

## 11. Teams & Assignments

### `teams` (~16 rows)
Recruiter teams with performance targets.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int PK | |
| `team_name` | varchar(255) | e.g., "Falcons", "Challengers", "Voyagers" |
| `status` | varchar(255) | active/inactive |
| `submission_tgt` | int | Daily submission target |
| `interview_tgt` | int | Daily interview target |
| `selection_tgt` | int | Daily selection target |
| `onboarding_tgt` | int | Daily onboarding target |
| `p_o_tgt` / `margin_tgt` | decimal(10,2) | Revenue targets |

**Active teams:** Falcons, Challengers, Perm, Voyagers, International_clients.

### `team_recruiters` (~235 rows)
Recruiter-to-team assignments.

| Column | Type | Description |
|--------|------|-------------|
| `team_id` | int FK → teams | |
| `recruiter_id` | int FK → users | |

### `team_clients` (~215 rows)
Client-to-team assignments.

| Column | Type | Description |
|--------|------|-------------|
| `team_id` | int FK → teams | |
| `client_id` | int FK → clients | |

### `client_recruiters` (~20.4K rows)
Individual recruiter-to-client assignments.

| Column | Type | Description |
|--------|------|-------------|
| `client_id` | int FK → clients | |
| `recruiter_id` | int FK → users | |
| `status` | int | Active/inactive |

### `recruiter_assignments` (~23 rows)
Recruiter workload limits.

| Column | Type | Description |
|--------|------|-------------|
| `recruiter_id` | int FK | |
| `count` | int | Current assignment count |
| `max_count` | int | Maximum allowed |

### `recruiter_plans` (~339 rows)
Recruiter performance plans/goals.

---

## 12. CRM (Internal Sales CRM)

The database includes a lightweight internal CRM for J2W's business development. This is separate from the Zoho CRM integration in the Cognition Engine.

### `crm_leads` (~2.6K rows)
Sales leads/prospects.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int PK | |
| `owner` | text | BDE owner |
| `company_name` | text | Prospect company |
| `industry` | text | Industry |
| `phone` / `email` / `website` | text | Contact info |
| `stage` | int FK → crm_stages | Sales stage |
| `source` | text | Lead source |
| `status` | int | Active/inactive |

### `crm_contacts` (~4.3K rows)
Contacts linked to CRM leads.

| Column | Type | Description |
|--------|------|-------------|
| `crm_lead_id` | int FK → crm_leads | |
| `full_name` | text | |
| `designation` | text | Title |
| `contact_type` | varchar(12) | Type |
| `decision_maker` | varchar(14) | Decision-maker flag |
| `linkedin_link` | varchar(255) | |

### `crm_meetings` (~178 rows)
Sales meeting records.

| Column | Type | Description |
|--------|------|-------------|
| `crm_contact_id` / `crm_lead_id` | int FK | |
| `owner` | int FK → users | Meeting owner |
| `meeting_type` | varchar(16) | |
| `meeting_date` / `meeting_time` | varchar(16) | |
| `subject` | varchar(255) | |
| `notes` | varchar(16) | |

### `crm_histories` (~202 rows)
Activity log per CRM lead.

### `crm_stages` (10 rows)
Sales pipeline stages.

| Stage ID | Name |
|----------|------|
| 1 | New Lead |
| 2 | Qualify |
| 3 | Qualification Failed |
| 4 | Connect Later |
| 5 | Prospect |
| 6 | Meeting |
| 7 | Requirement |
| 8 | RFI |
| 9 | MSA |
| 10 | Onboarded |

---

## 13. Views (Pre-built Queries)

These are MySQL **views** (not tables). They join multiple tables for common reporting needs. Row counts are dynamic.

| View | Purpose | Key Joins |
|------|---------|-----------|
| `Employee` | Basic employee info with client name | offer_letters + users + clients + employee_details + locations |
| `Employee_Information` | Comprehensive employee view with exit/PF/insurance data | offer_letters + users + clients + employee_details + exited_candidates + induction_statuses |
| `Employee_Information1` | Similar to Employee_Information, different column set | Same joins, different output columns |
| `OnBoarded_Employee_Information` | Onboarded employees with exit data | offer_letters (status=6) + exit data |
| `Pending_Employee_Information` | Pending onboarding employees | offer_letters (status<6) |
| `Hr_consultant` | HR consultant employees | Limited columns, consultant type filter |
| `Perm_Ondemand_Information` | Perm/on-demand offer letter view | perm_offer_letters + users + clients |
| `DailySubmissions` | Submissions count per client per day | clients + job_postings + applied_jobs |
| `JobPostings` | Job posting count per client | clients + job_postings |
| `UsageData` | User login/usage data | users table subset |

**Use cases:** These views are optimized for common dashboard queries. Use them when the needed data matches their output structure — they handle the joins efficiently.

---

## 14. Reference / Lookup Tables

| Table | Rows | Description |
|-------|------|-------------|
| `locations` | ~3.2K | City/state lookup |
| `industries` | ~80 | Industry names |
| `functional_areas` | ~89 | Functional area names |
| `job_roles` | ~889 | Job role names |
| `role_categories` | ~181 | Role category names |
| `skills` | ~30K | Skill master list |
| `skill_groups` | ~21 | Skill group names |
| `constants` | 6 | System constants |

---

## 15. Supporting Tables

These tables have real data but serve secondary functions.

| Table | Rows | Description |
|-------|------|-------------|
| `account_creation_reports` | ~33K | Bulk user creation logs |
| `existing_profile_uploads` | ~231K | Bulk resume upload records |
| `parsed_resumes` | ~826K | Resume parsing job records |
| `histories` | ~7.3M | General audit/change history (very large) |
| `audits` | ~3.1M | System audit log (very large) |
| `app_notifications` | ~5.6M | In-app notification records (very large) |
| `recruiter_notifications` | ~15.8K | Recruiter-specific notifications |
| `helpdesk_tickets` | ~19.4K | Internal helpdesk tickets |
| `helpdesk_comments` | ~22.2K | Comments on helpdesk tickets |
| `employee_connects` | ~1K | Employee engagement surveys (25 questions) |
| `emp_kpis` | ~457 | Employee KPI assignments |
| `kpi_templates` / `kpi_template_values` / `kpi_parameters` | ~90 | KPI framework definitions |
| `quest_answers` | ~9.6K | Quiz/questionnaire responses |
| `questions` | ~2.5K | Quiz questions |
| `reimbursements` | ~1.4K | Expense reimbursement claims |
| `official_references` | ~22.9K | BGV reference checks |
| `search_histories` | ~18.6K | Candidate search logs |
| `matching_job_mails` | ~666K | Automated job match email logs |
| `mailer_campaign_histories` | ~524K | Email campaign delivery logs |
| `sessions` | ~134K | User login sessions |
| `identities` | ~849 | OAuth identities |
| `users_policies` | ~305 | Policy acknowledgments |
| `hrpb_converstions` | ~5.4K | HRBP conversation records |

---

## 16. Excluded / Irrelevant Tables

These tables are empty (0 rows), deprecated, or belong to unrelated applications:

**Empty tables:** `asset_infos`, `bgv_statuses`, `candidate_exit_checklists`, `client_emails`, `client_notifications`, `contest_user_profiles`, `contests`, `crm_campaign_templates`, `crm_meeting_notes`, `failed_mass_emails`, `friendly_id_slugs`, `helpdesk_faq_translations`, `helpdesk_faqs`, `helpdesk_subscribers`, `hrbp_exit_checklists`, `kpi_settings`, `mass_mailers`, `mass_mails`, `other_job_families`, `prizes`, `recruiter_kpi_templates`, `recruiter_profiles`, `skill_categories`, `user_redeployments`

**Minimal/legacy:** `bgvs` (3), `candidate_bgvs` (1), `blog_users` (16), `contract_revisions` (3), `client_submission_mails` (2), `crm_campaigns` (2), `resignation_documents` (8), `resume_images` (6)

**Client-specific / external project tables:**
- `accenture_exit_checklist_forms` (~2.6K) — Accenture-specific exit checklists
- `lenovo_candidates` (~2.5K) / `lenovo_candidate_mediclaims` (~686) — Lenovo-specific mediclaim data

**Infrastructure/framework:**
- `schema_migrations` (287) — Rails migration records
- `sidekiq_jobs` (~39K) — Background job queue
- `versions` (~161K) — PaperTrail audit log (Rails gem)
- `friendly_id_slugs` — URL slug cache
- `temporary_pans` (~108) — Temporary PAN card placeholders

---

## 17. Key Relationships

```
users (1.3M)
├── candidate_profiles (1:1)
├── user_details (1:1)
├── candidate_skills (1:N) → skills
├── candidate_qualifications (1:N)
├── candidate_experiences (1:N)
├── candidate_documents (1:N)
├── candidate_additional_details (1:1)
├── my_details (1:1)
├── emergency_contacts (1:N)
├── family_details (1:N)
├── applied_jobs (1:N) → job_postings → clients
│   ├── candidate_work_flow_statuses (audit trail)
│   ├── validation_screens (interview scheduling)
│   ├── selected_candidates
│   ├── reasons (step change reasons)
│   └── inductions
├── offer_letters (1:N) → clients, job_postings
│   ├── salary_breakups (1:1)
│   ├── employee_details (1:1)
│   ├── induction_statuses (1:1)
│   ├── candidate_pf_details (1:1)
│   ├── verified_offers (1:1)
│   ├── po_histories (1:N)
│   ├── exited_candidates (1:1)
│   ├── exit_checklist_forms (1:1)
│   └── exit_interview_forms (1:1)
└── timesheets (1:N)
    └── timesheet_docs (monthly aggregates)

clients (1K)
├── job_postings (1:N)
│   ├── job_skills (1:N) → skills
│   ├── job_locations (1:N)
│   ├── job_assignments (1:N) → users (recruiters)
│   └── probing_details (1:1)
├── contracts (1:N)
│   └── company_profiles (1:1)
├── team_clients (N:M) → teams
└── client_recruiters (N:M) → users

teams
├── team_recruiters (N:M) → users
└── team_clients (N:M) → clients

crm_leads → crm_contacts → crm_meetings
         → crm_histories
```

---

## 18. Enum / Status Value Mappings

### `offer_letters.status`
| Value | Meaning |
|-------|---------|
| 0 | Draft / Pending |
| 1 | Created / Pending Approval |
| 2 | Approved |
| 3 | Offer Released |
| 4 | Offer Accepted |
| 5 | Onboarding Complete |
| 6 | Active Employee |
| 7 | Exited |
| 8 | Terminated |

### `offer_letters.employee_type`
| Value | Meaning |
|-------|---------|
| 0 | Standard Contract |
| 1 | Fixed Term |
| 2 | Third-party Payroll |
| 3 | Permanent |
| 4 | Consultant |
| 5 | Intern |
| 6 | On-Demand |
| 7 | Other |

### `job_postings.status`
| Value | Meaning |
|-------|---------|
| 0 | Draft |
| 1 | Active |
| 2 | Closed |
| 3 | On Hold |

### `applied_jobs.current_step` → see [Section 5](#5-recruitment-pipeline) for full workflow mapping

### `exited_candidates.exit_type` → see [Section 8](#8-employee-lifecycle--exit) for distribution

### `users.type` → see [Section 1](#1-users--roles) for STI type distribution

---

## Common Query Patterns

### Recruitment funnel for a date range
```sql
SELECT
  cwf.stage,
  cwf.workflow_step,
  COUNT(*) as cnt
FROM applied_jobs aj
JOIN candidate_work_flows cwf ON cwf.step_id = aj.current_step
WHERE aj.created_at BETWEEN '2026-01-01' AND '2026-03-31'
GROUP BY cwf.stage, cwf.workflow_step
ORDER BY cnt DESC
```

### Active employees by client
```sql
SELECT c.company_name, COUNT(*) as active_count
FROM offer_letters ol
JOIN clients c ON ol.client_id = c.id
WHERE ol.status = 6
GROUP BY c.company_name
ORDER BY active_count DESC
```

### Monthly onboarding trend
```sql
SELECT
  DATE_FORMAT(joining_date, '%Y-%m') as month,
  COUNT(*) as onboarded
FROM offer_letters
WHERE status IN (5, 6, 7) AND joining_date IS NOT NULL
GROUP BY month
ORDER BY month DESC
LIMIT 24
```

### Exit analysis by type and month
```sql
SELECT
  DATE_FORMAT(last_work_day, '%Y-%m') as month,
  exit_type,
  COUNT(*) as cnt
FROM exited_candidates
WHERE last_work_day IS NOT NULL
GROUP BY month, exit_type
ORDER BY month DESC, cnt DESC
```

### Recruiter performance (submissions this month)
```sql
SELECT
  u.first_name, u.last_name,
  COUNT(aj.id) as submissions
FROM applied_jobs aj
JOIN users u ON aj.applied_by_id = u.id
WHERE aj.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
  AND aj.current_step >= 7
GROUP BY u.id, u.first_name, u.last_name
ORDER BY submissions DESC
LIMIT 50
```

### Business head roster
```sql
SELECT id, first_name, last_name, email
FROM users
WHERE type = 'UserBusinessHead'
ORDER BY first_name
```

---

## Performance Notes

- **Always use LIMIT** on large tables (`api_candidates_skills` 30M, `candidate_skills` 13M, `histories` 7M, `app_notifications` 5.6M, `timesheets` 4.5M, `audits` 3M)
- The `olQueryLimited()` helper auto-appends `LIMIT 1000` if not specified
- Connection pool is limited to 3 concurrent connections — avoid long-running queries
- This is a **shared production database** — expensive queries affect the live application
- Prefer indexed columns in WHERE clauses: `user_id`, `client_id`, `job_posting_id`, `offer_letter_id`, `created_at`
- Use the pre-built views (`Employee_Information`, `OnBoarded_Employee_Information`, etc.) when their schema matches your needs — they handle complex joins efficiently
