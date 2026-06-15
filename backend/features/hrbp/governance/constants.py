"""Hard-coded governance category definitions.
Total max score across all categories = 100.
"""

GOVERNANCE_CATEGORIES = [
    {
        "key": "timing",
        "label": "Timing Adherence",
        "max_score": 12,
        "escalation_base": 3,
        "description": "Punctuality and adherence to contracted shift hours",
        "options": [
            {"index": 0, "label": "Always punctual — no issues reported", "score": 12},
            {"index": 1, "label": "Mostly on time, minor lapses with no complaints", "score": 9},
            {"index": 2, "label": "Occasional delays, flagged informally once", "score": 6},
            {"index": 3, "label": "Frequent late arrivals, formally escalated", "score": 3},
            {"index": 4, "label": "Persistent issue despite repeated warnings", "score": 0},
        ],
    },
    {
        "key": "attendance",
        "label": "Attendance",
        "max_score": 12,
        "escalation_base": 3,
        "description": "Overall attendance consistency and reliability",
        "options": [
            {"index": 0, "label": "No absences — fully present", "score": 12},
            {"index": 1, "label": "Rare absences with advance notice", "score": 9},
            {"index": 2, "label": "Occasional absences, partially informed", "score": 6},
            {"index": 3, "label": "Frequent absences, impacting delivery", "score": 3},
            {"index": 4, "label": "Persistent absenteeism — escalated", "score": 0},
        ],
    },
    {
        "key": "leave_management",
        "label": "Leave Management",
        "max_score": 8,
        "escalation_base": 2,
        "description": "Proper application and management of leave requests",
        "options": [
            {"index": 0, "label": "All leaves pre-approved and within policy", "score": 8},
            {"index": 1, "label": "Mostly compliant with minor exceptions", "score": 6},
            {"index": 2, "label": "Occasional uninformed leaves", "score": 4},
            {"index": 3, "label": "Frequent uninformed leaves, flagged", "score": 2},
            {"index": 4, "label": "Repeated non-compliance — escalated", "score": 0},
        ],
    },
    {
        "key": "wfo_wfh",
        "label": "WFO / WFH Adherence",
        "max_score": 10,
        "escalation_base": 3,
        "description": "Compliance with the designated work-from-office or work-from-home policy",
        "options": [
            {"index": 0, "label": "Fully compliant with WFO/WFH policy", "score": 10},
            {"index": 1, "label": "Minor deviations, self-corrected", "score": 8},
            {"index": 2, "label": "Occasional non-compliance, informally flagged", "score": 5},
            {"index": 3, "label": "Repeated non-compliance, formally warned", "score": 2},
            {"index": 4, "label": "Policy flouted — escalated to management", "score": 0},
        ],
    },
    {
        "key": "performance",
        "label": "Performance",
        "max_score": 18,
        "escalation_base": 5,
        "description": "Quality, timeliness, and impact of work delivered to the client",
        "options": [
            {"index": 0, "label": "High quality delivery — client appreciation received", "score": 18},
            {"index": 1, "label": "Good performance, minor improvement areas noted", "score": 14},
            {"index": 2, "label": "Average — noticeable dip, flagged by manager", "score": 9},
            {"index": 3, "label": "Below expectations — formal client feedback issued", "score": 4},
            {"index": 4, "label": "Poor performance — escalation received", "score": 0},
        ],
    },
    {
        "key": "upskilling",
        "label": "Upskilling",
        "max_score": 10,
        "escalation_base": 2,
        "description": "Progress on learning, certifications, and skill development activities",
        "options": [
            {"index": 0, "label": "Actively upskilling — certifications or training completed", "score": 10},
            {"index": 1, "label": "In progress with visible effort", "score": 8},
            {"index": 2, "label": "Enrolled but limited progress", "score": 5},
            {"index": 3, "label": "Not started despite plan", "score": 2},
            {"index": 4, "label": "No activity and non-responsive", "score": 0},
        ],
    },
    {
        "key": "conduct",
        "label": "Conduct",
        "max_score": 12,
        "escalation_base": 4,
        "description": "Professional behavior, attitude, and adherence to code of conduct",
        "options": [
            {"index": 0, "label": "Exemplary conduct — positive team feedback", "score": 12},
            {"index": 1, "label": "Professional conduct with minor observations", "score": 9},
            {"index": 2, "label": "Isolated conduct issue, informally addressed", "score": 6},
            {"index": 3, "label": "Repeated concerns — formal warning issued", "score": 3},
            {"index": 4, "label": "Formal escalation raised — HR intervention required", "score": 0},
        ],
    },
    {
        "key": "reporting",
        "label": "Reporting",
        "max_score": 8,
        "escalation_base": 2,
        "description": "Timeliness and accuracy of timesheets, status reports, and other deliverables",
        "options": [
            {"index": 0, "label": "All reports submitted on time and accurately", "score": 8},
            {"index": 1, "label": "Mostly on time with minor errors corrected", "score": 6},
            {"index": 2, "label": "Occasional delays or inaccuracies, flagged", "score": 4},
            {"index": 3, "label": "Frequent reporting issues, formally warned", "score": 2},
            {"index": 4, "label": "Non-compliance escalated to management", "score": 0},
        ],
    },
    {
        "key": "skill_alignment",
        "label": "Skill Alignment",
        "max_score": 10,
        "escalation_base": 3,
        "description": "Alignment between the consultant's skills and client-assigned project role",
        "options": [
            {"index": 0, "label": "Fully matched — client confirms skill fit", "score": 10},
            {"index": 1, "label": "Good alignment with minor gaps being addressed", "score": 8},
            {"index": 2, "label": "Moderate gaps — performance impacted", "score": 5},
            {"index": 3, "label": "Significant mismatch — client raised concerns", "score": 2},
            {"index": 4, "label": "Severe mismatch — escalated for replacement", "score": 0},
        ],
    },
]

CATEGORY_MAP = {c["key"]: c for c in GOVERNANCE_CATEGORIES}
TOTAL_MAX_SCORE = sum(c["max_score"] for c in GOVERNANCE_CATEGORIES)  # = 100
