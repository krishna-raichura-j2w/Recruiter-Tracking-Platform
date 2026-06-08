-- Sales Effort Tracker tables and seed data for Anuradha Murthy (bh_user_id = 1815)

CREATE TABLE IF NOT EXISTS sales_effort_customers (
    id SERIAL PRIMARY KEY,
    customer_name VARCHAR(200) NOT NULL,
    bucket VARCHAR(50),
    bh_user_id INTEGER REFERENCES users(id),
    consolidated_net_po_rl NUMERIC(10,2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_effort_lines (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES sales_effort_customers(id) ON DELETE CASCADE,
    effort_line TEXT,
    leadership_contact TEXT,
    opportunity_type VARCHAR(100),
    track VARCHAR(50),
    target_rl NUMERIC(10,2),
    budget VARCHAR(50),
    bottleneck VARCHAR(100),
    escalation VARCHAR(100),
    current_hc INTEGER,
    six_mo_delta_hc INTEGER,
    six_mo_delta_net_po_rl NUMERIC(10,2),
    stage VARCHAR(100),
    ldr_mtg VARCHAR(50),
    mtg_date VARCHAR(50),
    next_action TEXT,
    due_date VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Not Started',
    comments TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed Anuradha Murthy's data (bh_user_id = 1815)
-- Uses a DO block to avoid duplicate seeding on restart
DO $$
DECLARE
    v_jll        INTEGER;
    v_cme        INTEGER;
    v_koch       INTEGER;
    v_socgen     INTEGER;
    v_lumen      INTEGER;
    v_verifone   INTEGER;
    v_nexteer    INTEGER;
    v_sutherland INTEGER;
    v_tata       INTEGER;
    v_dormant    INTEGER;
    v_swissre    INTEGER;
    v_osbi       INTEGER;
    v_rrd        INTEGER;
    v_dbs        INTEGER;
    v_reckitt    INTEGER;
BEGIN
    -- Only seed if no customers exist for this BH
    IF EXISTS (SELECT 1 FROM sales_effort_customers WHERE bh_user_id = 1815) THEN
        RETURN;
    END IF;

    -- Insert customers
    INSERT INTO sales_effort_customers (customer_name, bucket, bh_user_id, consolidated_net_po_rl)
        VALUES ('JLL', 'Strategic', 1815, 22) RETURNING id INTO v_jll;

    INSERT INTO sales_effort_customers (customer_name, bucket, bh_user_id, consolidated_net_po_rl)
        VALUES ('CME_C2H', 'Strategic', 1815, 6) RETURNING id INTO v_cme;

    INSERT INTO sales_effort_customers (customer_name, bucket, bh_user_id, consolidated_net_po_rl)
        VALUES ('Koch Industries', 'Strategic', 1815, 10) RETURNING id INTO v_koch;

    INSERT INTO sales_effort_customers (customer_name, bucket, bh_user_id, consolidated_net_po_rl)
        VALUES ('Socgen (Consol.)', 'Strategic', 1815, 21) RETURNING id INTO v_socgen;

    INSERT INTO sales_effort_customers (customer_name, bucket, bh_user_id, consolidated_net_po_rl)
        VALUES ('Lumen C2H', 'Growth', 1815, 1.5) RETURNING id INTO v_lumen;

    INSERT INTO sales_effort_customers (customer_name, bucket, bh_user_id, consolidated_net_po_rl)
        VALUES ('Verifone', 'Growth', 1815, 0.5) RETURNING id INTO v_verifone;

    INSERT INTO sales_effort_customers (customer_name, bucket, bh_user_id, consolidated_net_po_rl)
        VALUES ('Nexteer Automotive', 'Growth', 1815, NULL) RETURNING id INTO v_nexteer;

    INSERT INTO sales_effort_customers (customer_name, bucket, bh_user_id, consolidated_net_po_rl)
        VALUES ('Sutherland', 'Growth', 1815, NULL) RETURNING id INTO v_sutherland;

    INSERT INTO sales_effort_customers (customer_name, bucket, bh_user_id, consolidated_net_po_rl)
        VALUES ('Tata Elxsi', 'Growth', 1815, NULL) RETURNING id INTO v_tata;

    INSERT INTO sales_effort_customers (customer_name, bucket, bh_user_id, consolidated_net_po_rl)
        VALUES ('Dormant revival - others', 'Growth', 1815, 5) RETURNING id INTO v_dormant;

    INSERT INTO sales_effort_customers (customer_name, bucket, bh_user_id, consolidated_net_po_rl)
        VALUES ('Swiss Re', 'Growth', 1815, 1) RETURNING id INTO v_swissre;

    INSERT INTO sales_effort_customers (customer_name, bucket, bh_user_id, consolidated_net_po_rl)
        VALUES ('OSBI', 'Growth', 1815, 1.5) RETURNING id INTO v_osbi;

    INSERT INTO sales_effort_customers (customer_name, bucket, bh_user_id, consolidated_net_po_rl)
        VALUES ('RR Donnelley', 'Growth', 1815, 1) RETURNING id INTO v_rrd;

    INSERT INTO sales_effort_customers (customer_name, bucket, bh_user_id, consolidated_net_po_rl)
        VALUES ('DBS', 'New', 1815, NULL) RETURNING id INTO v_dbs;

    INSERT INTO sales_effort_customers (customer_name, bucket, bh_user_id, consolidated_net_po_rl)
        VALUES ('Reckitt', 'New', 1815, NULL) RETURNING id INTO v_reckitt;

    -- JLL effort lines
    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_jll, 'iOS app development – entry point to establish J2W as delivery partner (100-hr effort)', 'Niranjan Satpute — Head Product (UI/UX, Presales)', 'Pod / Managed Services', 'T1 - Demand Gen (extra)', 3, 'Unknown', NULL, NULL, '2nd Meeting', 'Yes - Done', NULL, 'Decision pending', '4-Jun', 'In Progress', 'Effort_Lines + War Room T3 (₹3L MS)');

    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_jll, 'ServiceNow POD for client projects (proj. 7-8 HC)', 'Niranjan Satpute — Head Product (co: Amit Tomer, Daniel Chan)', 'Pod / Managed Services', 'T2 - Large Deals', 15, 'Unknown', NULL, NULL, '2nd Meeting', 'Yes - Done', NULL, 'Advance practice conversation', '4-Jun', 'In Progress', 'War Room T2 (₹15L)');

    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_jll, 'Business Intelligence roles → convertible to POD (proj. 7-8)', 'Simon Beaumont / Shivanna — BI Leaders', 'Pod / Managed Services', 'T3 - Upsell / Managed Svcs', NULL, 'Unknown', NULL, NULL, 'Scope / Oppty ID', NULL, NULL, 'Qualify BI roles for POD conversion', NULL, 'In Progress', NULL);

    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_jll, 'Ops use cases: Contract/Vendor Mgmt · Talk-to-Data demo · Finance AI · Document Intelligence OCR', 'Naveen Mehta — Head of Operations (Client Impact)', 'Managed Services Solutions', 'T4 - Creative / Strategic', NULL, 'Unknown', NULL, NULL, 'Scope / Oppty ID', NULL, NULL, 'Shortlist lead use case; line up live demo', NULL, 'In Progress', NULL);

    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_jll, 'ISE: infra, platform engineering, migration & reporting capabilities', 'Ramsingh Chani — Head of Information Systems Engineering', 'Pod / Managed Services', 'T3 - Upsell / Managed Svcs', NULL, 'Unknown', NULL, NULL, 'Scope / Oppty ID', NULL, NULL, 'Map capability fit', NULL, 'In Progress', NULL);

    -- CME_C2H effort lines
    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_cme, 'POD for SE – test automation, Testmatic AI & accelerators (Automation for SDLC)', 'Kaustav Chatterjee — Head of SE', 'Pod / Managed Services', 'T3 - Upsell / Managed Svcs', 50, 'Unknown', NULL, NULL, 'Proposal Sent', 'Yes - Done', NULL, 'Presentation', '5-Jun', 'In Progress', 'War Room T3 (₹50L MS)');

    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_cme, 'Conversation AI – CME revenue-generating business; Post-Trade use case', 'Gunjan Sharma — Head of Post Trade Services', 'Managed Services Solutions', 'T4 - Creative / Strategic', NULL, 'Unknown', NULL, NULL, 'Scope / Oppty ID', NULL, NULL, 'Build Post-Trade use case', NULL, 'In Progress', NULL);

    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_cme, 'Data Lineage solution', 'Harsha Umanath — Head of SRE', 'Managed Services Solutions', 'T3 - Upsell / Managed Svcs', NULL, 'No', 'Others', NULL, 'Lost', NULL, NULL, 'Declined – hold / re-approach later', NULL, 'Lost', 'Effort_Lines: marked DECLINED');

    -- Koch Industries effort lines
    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_koch, 'QA POD + automation testing use case', 'Sujai — Head of Technology', 'Pod / Managed Services', 'T3 - Upsell / Managed Svcs', NULL, 'Unknown', NULL, NULL, 'Scope / Oppty ID', NULL, NULL, 'CPO / QA automation pitch from our desk', NULL, 'In Progress', NULL);

    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_koch, 'ServiceNow CSDM + AI Ops (+ ServiceNow hiring for MRR)', 'Dinesh — Practice Manager', 'Managed Services Solutions', 'T3 - Upsell / Managed Svcs', 50, 'Unknown', NULL, NULL, 'Negotiation', 'Requested', NULL, 'Decision pending', NULL, 'In Progress', 'War Room T3 (₹50L)');

    -- Socgen effort lines
    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_socgen, 'RBS Transition – 4-5 microservices strategy developer POD (27 roles)', 'Divya Shetty / Dominic Tilak — RBS Transition Lead & RBS Head', 'Pod / Managed Services', 'T2 - Large Deals', NULL, 'Unknown', NULL, NULL, '2nd Meeting', NULL, NULL, 'Convert microservices POD to closure', NULL, 'In Progress', 'Transcript (RPS/RBS 27 roles)');

    -- Lumen C2H effort lines
    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_lumen, 'AEM Modernization – workforce hiring (SOW proposal sent) + tech plug-ins', 'Vijayan Thanmpy — Business Head', 'BAU - MRR', 'T1 - Demand Gen (extra)', 5, 'Unknown', NULL, NULL, 'Proposal Sent', 'Requested', NULL, 'Discussion with HR & Procurement to open FTE roles', '10-Jun', 'In Progress', 'War Room T2 (₹5L)');

    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_lumen, 'AI COE – AI initiatives', 'Phani Kalindi — Head of AI, Platforms', 'Managed Services Solutions', 'T4 - Creative / Strategic', NULL, 'Unknown', NULL, NULL, 'Scope / Oppty ID', NULL, NULL, 'Initiate AI COE conversation', NULL, 'In Progress', NULL);

    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_lumen, 'Data COE', 'Manish Rathi — Head of Data Architecture', 'Managed Services Solutions', 'T4 - Creative / Strategic', NULL, 'Unknown', NULL, NULL, 'Scope / Oppty ID', NULL, NULL, 'Initiate Data COE conversation', NULL, 'In Progress', NULL);

    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_lumen, 'Cloud Migration – WFS + MS capabilities', 'Manish Rathi — Head of Data Architecture', 'Managed Services Solutions', 'T3 - Upsell / Managed Svcs', NULL, 'Unknown', NULL, NULL, 'Scope / Oppty ID', NULL, NULL, 'Position WFS + MS for migration', NULL, 'In Progress', NULL);

    -- Verifone effort lines
    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_verifone, 'Automation Testing', NULL, 'Managed Services Solutions', 'T3 - Upsell / Managed Svcs', 50, 'Unknown', NULL, NULL, '2nd Meeting', 'Scheduled', '11-Jun', 'Second-level meeting', '12-Jun', 'In Progress', 'War Room T3 (₹50L). Contact not provided.');

    -- Nexteer Automotive effort lines
    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_nexteer, 'SOW – WFS', NULL, 'Bulk Deals', 'T2 - Large Deals', 34, 'Unknown', NULL, NULL, 'Proposal Sent', NULL, NULL, 'PR decision pending with international team', NULL, 'Parked', 'War Room T2 (₹34L). Contact not provided.');

    -- Sutherland effort lines
    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_sutherland, 'FTE – Voice & Chat', NULL, 'Bulk Deals', 'T2 - Large Deals', 15, 'Unknown', NULL, NULL, 'Proposal Sent', 'Requested', NULL, 'Inclusion in current MSA', '15-Jun', 'In Progress', 'War Room T2 (₹15L). Contact not provided.');

    -- Tata Elxsi effort lines
    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_tata, 'New Demands – Automotive', NULL, 'Bulk Deals', 'T2 - Large Deals', 6, 'Unknown', NULL, NULL, 'Signed / Won', 'Yes - Done', '4-Jun', 'Use cases to be calibrated', '4-Jun', 'Won', 'War Room T2 (₹6L, Signed).');

    -- DBS effort lines
    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_dbs, 'New Demands', NULL, 'BAU - MRR', 'T2 - Large Deals', 3, 'Unknown', NULL, NULL, 'Scope / Oppty ID', NULL, NULL, 'Follow up for DBS revival', NULL, 'In Progress', 'War Room T2 (₹3L). Contact not provided.');

    -- Reckitt effort lines
    INSERT INTO sales_effort_lines (customer_id, effort_line, leadership_contact, opportunity_type, track, target_rl, budget, bottleneck, escalation, stage, ldr_mtg, mtg_date, next_action, due_date, status, comments)
    VALUES (v_reckitt, 'Net New', NULL, 'BAU - MRR', 'T2 - Large Deals', 2, 'Unknown', NULL, NULL, '1st Meeting', NULL, NULL, 'Net-new pursuit', NULL, 'In Progress', 'War Room T2 (₹2L). Contact not provided.');

    -- Dormant revival, Swiss Re, OSBI, RR Donnelley have no effort lines (scaffolding only)
END $$;
