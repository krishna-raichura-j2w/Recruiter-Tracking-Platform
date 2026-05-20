-- ============================================================
-- SEED: hrbp_clients (GE Healthcare + 3 more) + hrbp_consultants
-- Source: GEHC_HRBP_Tracker_1.xlsx → "Consultant Performance" tab
-- 89 unique consultants, all under GE Healthcare, all tagged to
-- sara.thomas@joulestowatts.com (HRBP).
-- Prerequisite: 005_seed_hrbp_users.sql
-- ============================================================

DO $$
DECLARE
    v_client_id  INTEGER;
    v_hrbp_id    INTEGER;
    v_bh_id      INTEGER;
BEGIN
    SELECT id INTO v_bh_id   FROM users WHERE email = 'bollama@joulestowatts.com'          LIMIT 1;
    SELECT id INTO v_hrbp_id FROM users WHERE email = 'sara.thomas@joulestowatts.com'       LIMIT 1;

    -- ── Clients ──────────────────────────────────────────────
    INSERT INTO hrbp_clients (name, industry, bh_id, hrbp_id, is_active) VALUES
        ('GE Healthcare',    'Medical Devices',   v_bh_id, v_hrbp_id, true),
        ('Lowes',            'Retail / E-Commerce',v_bh_id, v_hrbp_id, true),
        ('Flipkart',         'E-Commerce',        v_bh_id, v_hrbp_id, true),
        ('Bread Financial',  'Financial Services', v_bh_id, v_hrbp_id, true)
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_client_id FROM hrbp_clients WHERE name = 'GE Healthcare' LIMIT 1;

    -- ── Consultants (89 unique from spreadsheet) ─────────────
    INSERT INTO hrbp_consultants (
        emp_id, name, client_id, hrbp_id,
        manager_name, modality, skill,
        cohort, perf_tier,
        monthly_po, monthly_ctc,
        po_end_date, join_date,
        nps_score, last_hike_pct, last_hike_date,
        l_d_status, is_active
    ) VALUES
    -- RESCUE (9)
    ('C362801','Gaurav Khandelwal',         v_client_id,v_hrbp_id,'Shanthalakshmi',         'PCS',          'Automation Testing',     'rescue',          'bottom_20', 436800,318864,'2026-08-06','2025-05-20',NULL,  NULL, NULL,         'not_started',true),
    ('C362802','Pratik Ghosh',              v_client_id,v_hrbp_id,'Prasad / Kevin',          'Design Studio','UI Developer',           'rescue',          'bottom_20', 386400,282072,'2027-01-06','2025-03-20',NULL,  NULL, NULL,         'not_started',true),
    ('C362803','Sushma V B',               v_client_id,v_hrbp_id,'Lokesh Shanbhag',         'PCS',          'SDET',                   'rescue',          'bottom_20', 336000,245280,'2027-01-06','2024-12-20',NULL,  NULL, NULL,         'not_started',true),
    ('C362804','G R Mamatha',              v_client_id,v_hrbp_id,'Prasad / Kevin',          'Design Studio','QA',                     'rescue',          'bottom_20', 336000,245280,NULL,        '2023-05-20',NULL,  3.0,  '2024-11-20', 'not_started',true),
    ('C362805','Gouri Vivek Patil',        v_client_id,v_hrbp_id,'Prakash Borah',           'Imaging',      'Java',                   'rescue',          'bottom_20', 310800,226884,NULL,        '2026-05-01',NULL,  NULL, NULL,         'not_started',true),
    ('C362806','Mohan Kumar M N',          v_client_id,v_hrbp_id,'Sumit Sinha',             'Imaging',      'Embedded C++',           'rescue',          'bottom_20', 263424,192299,'2027-01-06','2025-12-20',NULL,  NULL, NULL,         'not_started',true),
    ('C362807','Hariom Singh',             v_client_id,v_hrbp_id,'Shravan Boppanna',        'Imaging',      'Java',                   'rescue',          'bottom_20', 235200,171696,'2027-04-06','2025-04-20',NULL,  NULL, NULL,         'not_started',true),
    ('C362808','Vaishnavi R',              v_client_id,v_hrbp_id,'Sumit Sinha',             'Imaging',      'Java',                   'rescue',          'bottom_20', 201600,147168,'2026-07-06','2023-06-20',NULL,  2.0,  '2024-12-20', 'not_started',true),
    ('C362809','K Hari Prasad',            v_client_id,v_hrbp_id,'Sumit Sinha',             'Imaging',      'Linux',                  'rescue',          'bottom_20', 100000,73000, NULL,        '2026-05-01',NULL,  NULL, NULL,         'not_started',true),
    -- NEW JOINER (17)
    ('C362810','Ankit Kapadia',            v_client_id,v_hrbp_id,'Ananth V',                'Imaging',      'HL7',                    'new_joiner',      'mid_60',    487200,355656,'2027-04-06','2026-03-20',NULL,  NULL, NULL,         'pending',    true),
    ('C362811','Harisha D M',              v_client_id,v_hrbp_id,'Rithesh Sridhar',         'STO',          'QA Automation',          'new_joiner',      'unrated',   470400,343392,'2027-02-06','2026-04-20',NULL,  NULL, NULL,         'pending',    true),
    ('C362816','Kanak Ranjan',             v_client_id,v_hrbp_id,'Aradhya Sreeshly',        'SEI',          'UI Developer',           'new_joiner',      'mid_60',    428400,312732,'2027-01-06','2026-04-20',NULL,  NULL, NULL,         'pending',    true),
    ('C362827','Vatsalya S',               v_client_id,v_hrbp_id,'Aradhya Sreeshly',        'SEI',          'Technical Writer',       'new_joiner',      'mid_60',    369600,269808,'2027-01-06','2026-03-20',NULL,  NULL, NULL,         'pending',    true),
    ('C362835','Karthik M',               v_client_id,v_hrbp_id,'Rithesh Sridhar',         'STO',          'QA Automation',          'new_joiner',      'unrated',   319200,233016,'2027-02-24','2026-03-20',NULL,  NULL, NULL,         'pending',    true),
    ('C362838','Mula Sreedhar Reddy',      v_client_id,v_hrbp_id,'Prakash Borah',           'Imaging',      'Java',                   'new_joiner',      'mid_60',    310800,226884,NULL,        '2026-05-01',NULL,  NULL, NULL,         'pending',    true),
    ('C362841','Anurag Pandey',            v_client_id,v_hrbp_id,'Rithesh Sridhar',         'STO',          'AI Engineer',            'new_joiner',      'mid_60',    310800,226884,'2027-04-06','2026-04-20',NULL,  NULL, NULL,         'pending',    true),
    ('C362847','Meghana Reddy B',          v_client_id,v_hrbp_id,'Nishant Ranjan',          'Imaging',      'Angular',                'new_joiner',      'mid_60',    268800,196224,'2027-02-06','2026-03-20',NULL,  NULL, NULL,         'pending',    true),
    ('C362848','Tarigonda Sravani',        v_client_id,v_hrbp_id,'Gangavarupu Chandra',     'Imaging',      'C++',                    'new_joiner',      'unrated',   268800,196224,'2027-01-06','2026-03-20',NULL,  NULL, NULL,         'pending',    true),
    ('C362850','Raj Abhishek',             v_client_id,v_hrbp_id,'Soumik',                  'SEI',          'Network Security',       'new_joiner',      'mid_60',    268800,196224,'2027-03-28','2026-04-20',NULL,  NULL, NULL,         'pending',    true),
    ('C362852','Srinivasan Manokaran',     v_client_id,v_hrbp_id,'Maximus Mary',            'PCS',          'Automation Testing',     'new_joiner',      'unrated',   252000,183960,'2027-01-21','2026-04-20',NULL,  NULL, NULL,         'pending',    true),
    ('C362854','Kavya K',                  v_client_id,v_hrbp_id,'Anantha Krishna',         'Imaging',      'AI Engineer',            'new_joiner',      'mid_60',    201600,147168,'2026-07-06','2026-04-20',NULL,  NULL, NULL,         'pending',    true),
    ('C362857','Sharad S Chavan',          v_client_id,v_hrbp_id,'Mahendra Yewale',         'PCS',          'EMI/EMC',                'new_joiner',      'unrated',   NULL,  NULL,  '2026-09-06','2026-04-20',NULL,  NULL, NULL,         'pending',    true),
    ('C362876','Malasani Raykanth Reddy',  v_client_id,v_hrbp_id,'Sumit Sinha',             'Imaging',      'C++',                    'new_joiner',      'mid_60',    235200,171696,'2027-02-10','2026-04-20',NULL,  NULL, NULL,         'pending',    true),
    ('C362888','Arindam Dutta',            v_client_id,v_hrbp_id,'Rithesh Sridhar',         'STO',          'UI Developer',           'new_joiner',      'mid_60',    NULL,  NULL,  '2027-05-06','2026-05-01',NULL,  NULL, NULL,         'pending',    true),
    ('C362889','Varshith Vijaykumar',      v_client_id,v_hrbp_id,'Rithesh Sridhar',         'STO',          'AI Fullstack Dev',       'new_joiner',      'mid_60',    NULL,  NULL,  '2027-04-06','2026-04-20',NULL,  NULL, NULL,         'pending',    true),
    -- STAR (8)
    ('C362812','Neeraj Mehra',             v_client_id,v_hrbp_id,'Maximus Mary',            'PCS',          'Core Java',              'star',            'top_20',    453600,331128,'2026-08-06','2025-08-20',9,     NULL, NULL,         'enrolled',   true),
    ('C362815','Dev Drone Bhowmik',        v_client_id,v_hrbp_id,'Keerthi',                 'Imaging',      'ASP.NET',                'star',            'top_20',    428400,312732,'2027-01-02','2025-05-20',9,     NULL, NULL,         'enrolled',   true),
    ('C362821','Kaushik Ganeshbhai Vasava',v_client_id,v_hrbp_id,'Kranthi A',               'Imaging',      'C++',                    'star',            'top_20',    386400,282072,'2026-07-31','2024-11-20',9,     NULL, NULL,         'enrolled',   true),
    ('C362843','Keval Mahendra Dholakia',  v_client_id,v_hrbp_id,'Manoj Daniel',            'Imaging',      'C++',                    'star',            'top_20',    285600,208488,'2027-01-06','2025-11-20',9,     NULL, NULL,         'enrolled',   true),
    ('C362845','Mohammad Anas',            v_client_id,v_hrbp_id,'Rashmi Prakash',          'PCS',          'Java',                   'star',            'top_20',    285600,208488,'2027-01-06','2025-12-20',9,     NULL, NULL,         'enrolled',   true),
    ('C362856','Srinitha S',               v_client_id,v_hrbp_id,'Rajnish Singhal',         'PCS',          'Embedded',               'star',            'top_20',    294000,214620,'2026-08-27','2024-10-20',9,     10.0, '2025-08-20', 'enrolled',   true),
    ('C362868','Subashchandrabose M',      v_client_id,v_hrbp_id,'Aashish Desai',           'SEI',          'Java',                   'star',            'top_20',    310800,226884,'2027-01-06','2024-04-20',9,     32.0, '2025-05-20', 'enrolled',   true),
    ('C362870','Afridi Ismail Attar',      v_client_id,v_hrbp_id,'Rajnish Singhal',         'PCS',          'Java Development',       'star',            'top_20',    294000,214620,'2027-07-06','2023-06-20',9,     6.0,  '2024-12-20', 'enrolled',   true),
    -- HIGH PERFORMER (24)
    ('C362813','Veeresh Kaladagi',         v_client_id,v_hrbp_id,'Rashmi Prakash',          'PCS',          'Java',                   'high_performer',  'top_20',    441667,322416,'2027-01-06','2025-12-20',8,     NULL, NULL,         'enrolled',   true),
    ('C362814','Anjaly C Gopi',            v_client_id,v_hrbp_id,'Kranthi A',               'Imaging',      'C++',                    'high_performer',  'top_20',    436800,318864,'2026-07-31','2025-10-20',8,     NULL, NULL,         'enrolled',   true),
    ('C362822','Dhananjaya B N',           v_client_id,v_hrbp_id,'Saptorishi Kar',          'PCS',          'Automation (Load)',      'high_performer',  'top_20',    386400,282072,'2027-01-06','2024-07-20',8,     NULL, NULL,         'enrolled',   true),
    ('C362823','Rintu Sahu',               v_client_id,v_hrbp_id,'Vidyashree Urs',          'PCS',          'Network Security',       'high_performer',  'top_20',    386400,282072,'2027-01-06','2024-12-20',8,     NULL, NULL,         'enrolled',   true),
    ('C362831','Siva Prasad Peruri',       v_client_id,v_hrbp_id,'Shivashankar Ganesan',    'SEI',          '.NET',                   'high_performer',  'top_20',    336000,245280,'2027-01-06','2025-09-20',8,     NULL, NULL,         'enrolled',   true),
    ('C362832','Sanjay S',                 v_client_id,v_hrbp_id,'Rohith Karanavor',        'PCS',          'DevOps Engineering',     'high_performer',  'top_20',    336000,245280,'2027-01-06','2023-07-20',8,     NULL, NULL,         'enrolled',   true),
    ('C362839','Akshay Shetty',            v_client_id,v_hrbp_id,'Prakash Borah',           'Imaging',      'Java',                   'high_performer',  'top_20',    310800,226884,'2027-01-06','2025-11-20',8,     NULL, NULL,         'enrolled',   true),
    ('C362853','Pulicherla Somasekhar',    v_client_id,v_hrbp_id,'Sowmik',                  'Imaging',      'Java',                   'high_performer',  'top_20',    230000,167900,'2026-08-06','2024-08-20',8,     21.0, '2025-07-20', 'enrolled',   true),
    ('C362855','Likith Krishna S G',       v_client_id,v_hrbp_id,'Sumit Sinha',             'Imaging',      'C++',                    'high_performer',  'top_20',    125000,91250, '2026-07-06','2025-07-20',8,     NULL, NULL,         'enrolled',   true),
    ('C362861','Ajay Gupta',               v_client_id,v_hrbp_id,'Balaji Sundaresan',       'STO',          'Backend Development',    'high_performer',  'top_20',    386400,282072,'2027-01-06','2023-05-20',8,     8.0,  '2024-11-20', 'enrolled',   true),
    ('C362862','Nalinikanta Sahoo',        v_client_id,v_hrbp_id,'Mahesh Bhuvanagiri',      'Imaging',      'Java',                   'high_performer',  'top_20',    350000,255500,'2027-03-06','2023-12-20',8,     6.0,  '2025-03-20', 'enrolled',   true),
    ('C362864','Srikanth Vejandla',        v_client_id,v_hrbp_id,'Sumit Sinha',             'Imaging',      'Linux',                  'high_performer',  'top_20',    336000,245280,'2027-02-06','2022-09-20',8,     25.0, '2024-07-20', 'enrolled',   true),
    ('C362866','Mahmadmustafa M Kaladagi', v_client_id,v_hrbp_id,'Lokesh Shanbhag',         'PCS',          'Angular',                'high_performer',  'top_20',    336000,245280,'2027-01-06','2024-07-20',8,     5.0,  '2025-06-20', 'enrolled',   true),
    ('C362869','Praveen K',                v_client_id,v_hrbp_id,'Aashish Desai',           'SEI',          'DevOps Engineering',     'high_performer',  'top_20',    302400,220752,NULL,        '2023-05-20',8,     10.0, '2024-11-20', 'enrolled',   true),
    ('C362871','Bhutkuri Jyothi',          v_client_id,v_hrbp_id,'Manoj Daniel',            'Imaging',      'C++',                    'high_performer',  'top_20',    285600,208488,'2027-01-06','2024-05-20',8,     5.0,  '2025-05-20', 'enrolled',   true),
    ('C362872','Shakti Prasad Behura',     v_client_id,v_hrbp_id,'Madhusudan Kanna',        'Imaging',      'Java',                   'high_performer',  'top_20',    252000,183960,'2027-01-06','2024-10-20',8,     4.0,  '2025-08-20', 'enrolled',   true),
    ('C362873','Ragaventhran A',           v_client_id,v_hrbp_id,'Madhusudan Kanna',        'Imaging',      'TypeScript',             'high_performer',  'top_20',    250000,182500,'2027-01-06','2024-12-20',8,     4.0,  '2025-09-20', 'enrolled',   true),
    ('C362880','Akash Kumar Gupta',        v_client_id,v_hrbp_id,'Madhusudan Kanna',        'Imaging',      'Automation Testing',     'high_performer',  'top_20',    201000,146730,'2027-01-06','2025-07-20',8,     NULL, NULL,         'enrolled',   true),
    ('C362881','Syed Shah Faisal',         v_client_id,v_hrbp_id,'Mahesh Bhuvanagiri',      'Imaging',      'Java',                   'high_performer',  'top_20',    201000,146730,'2027-03-06','2025-03-20',8,     NULL, NULL,         'enrolled',   true),
    ('C362883','Anil Kumar Reddy S',       v_client_id,v_hrbp_id,'Srinath Acharya',         'PCS',          'Java',                   'high_performer',  'top_20',    169720,123895,'2027-04-06','2024-12-20',8,     NULL, NULL,         'enrolled',   true),
    ('C362884','Subham Singh',             v_client_id,v_hrbp_id,'Srinath Acharya',         'PCS',          'Python',                 'high_performer',  'top_20',    169720,123895,'2027-04-06','2024-12-20',8,     5.0,  '2025-09-20', 'enrolled',   true),
    ('C362885','Ankit Kumar',              v_client_id,v_hrbp_id,'Mahesh Bhuvanagiri',      'Imaging',      'Java',                   'high_performer',  'top_20',    157600,115048,NULL,        '2024-06-20',8,     33.0, '2025-06-20', 'enrolled',   true),
    ('C362886','Amarendra Tripathi',       v_client_id,v_hrbp_id,'Nirmala',                 'Imaging',      'C++',                    'high_performer',  'top_20',    151200,110376,'2027-01-06','2026-01-20',8,     NULL, NULL,         'enrolled',   true),
    -- WATCH — EXIT RISK (4)
    ('C362819','Bhabani Sankar Panigrahi', v_client_id,v_hrbp_id,'Maximus Mary',            'PCS',          'Python',                 'watch_exit',      'mid_60',    411600,300468,'2026-06-06','2025-07-20',6,     NULL, NULL,         'pending',    true),
    ('C362820','Badavath Prathap',         v_client_id,v_hrbp_id,'Rohith Karanavor',        'PCS',          'Application Dev',        'watch_exit',      'mid_60',    403200,294336,'2026-06-19','2024-09-20',6,     NULL, NULL,         'pending',    true),
    ('C362826','Swati',                    v_client_id,v_hrbp_id,'Rajni Mishra',            'PCS',          'QA',                     'watch_exit',      'mid_60',    370000,270100,'2026-09-06','2024-09-20',6,     4.0,  '2025-07-20', 'pending',    true),
    ('C362828','Prem Kumar M',             v_client_id,v_hrbp_id,'Namrata Mishra',          'Imaging',      'Python',                 'watch_exit',      'unrated',   362208,264411,'2026-06-20','2025-07-20',6,     NULL, NULL,         'pending',    true),
    -- WATCH — RATE REV (3)
    ('C362817','Chirapureddy Vijaya Bhaskar',v_client_id,v_hrbp_id,'Sumit Sinha',           'Imaging',      'C++',                    'watch_rate_rev',  'mid_60',    420000,306600,'2026-12-10','2025-02-20',6,     NULL, NULL,         'pending',    true),
    ('C362830','Vamshi Krishna',           v_client_id,v_hrbp_id,'Madhusudan Kanna',        'Imaging',      'Python',                 'watch_rate_rev',  'mid_60',    336000,245280,'2027-01-06','2022-08-20',6,     NULL, NULL,         'pending',    true),
    ('C362833','Panchani Jaydeep Kishorchandra',v_client_id,v_hrbp_id,'Gopalkrishna',       'PCS',          'AWS',                    'watch_rate_rev',  'mid_60',    336000,245280,'2027-01-06','2025-04-20',6,     NULL, NULL,         'pending',    true),
    -- WATCH — GENERAL (3)
    ('C362818','Veeresh Hiremath',         v_client_id,v_hrbp_id,'Aashish Desai',           'SEI',          'Performance Testing',    'watch_general',   'unrated',   420000,306600,'2027-01-06','2025-05-20',5,     NULL, NULL,         'pending',    true),
    ('C362836','Adarsha S',               v_client_id,v_hrbp_id,'Abul Fazal',              'Cyber',        'Cybersecurity',          'watch_general',   'unrated',   319200,233016,'2027-02-06','2026-02-20',5,     NULL, NULL,         'pending',    true),
    ('C362837','Guru Basavaraj B V',       v_client_id,v_hrbp_id,'Abul Fazal',              'Cyber',        'Cybersecurity',          'watch_general',   'unrated',   319200,233016,'2027-02-06','2026-02-20',5,     NULL, NULL,         'pending',    true),
    -- RISING (12)
    ('C362825','Amit Arun Patil',          v_client_id,v_hrbp_id,'Prasad / Kevin',          'Design Studio','React.js',               'rising',          'mid_60',    386400,282072,'2027-01-06','2025-08-20',7,     NULL, NULL,         'pending',    true),
    ('C362829','Kumar Charan Swain',       v_client_id,v_hrbp_id,'Gangavarupu Chandra',     'Imaging',      'Java',                   'rising',          'mid_60',    341666,249416,'2027-01-06','2025-10-20',7,     NULL, NULL,         'pending',    true),
    ('C362840','Basavaraj Chougala',       v_client_id,v_hrbp_id,'Ravindra Rathi',          'Imaging',      'Angular',                'rising',          'mid_60',    310800,226884,'2027-02-06','2025-10-20',7,     NULL, NULL,         'pending',    true),
    ('C362844','Indirajith S',             v_client_id,v_hrbp_id,'Rithesh Sridhar',         'STO',          'AI Engineer',            'rising',          'mid_60',    285600,208488,'2027-04-06','2025-06-20',7,     NULL, NULL,         'pending',    true),
    ('C362846','K Ashok',                  v_client_id,v_hrbp_id,'Anantha Krishna',         'Imaging',      'Angular',                'rising',          'mid_60',    275000,200750,'2026-10-06','2025-09-20',7,     NULL, NULL,         'pending',    true),
    ('C362851','Aruna L K',                v_client_id,v_hrbp_id,'Shanthalakshmi',          'PCS',          'DevOps Engineering',     'rising',          'mid_60',    263424,192299,'2027-01-06','2025-06-20',7,     NULL, NULL,         'pending',    true),
    ('C362874','Shruthi H R',              v_client_id,v_hrbp_id,'Aravinda H B',            'PCS',          'DevOps Engineering',     'rising',          'mid_60',    250000,182500,'2027-01-06','2026-01-20',7,     NULL, NULL,         'pending',    true),
    ('C362875','Chethan M P',              v_client_id,v_hrbp_id,'Aravinda H B',            'PCS',          'DevOps Engineering',     'rising',          'mid_60',    250000,182500,'2027-01-06','2026-01-20',7,     NULL, NULL,         'pending',    true),
    ('C362877','Praveen Malakapure',       v_client_id,v_hrbp_id,'Manoj Daniel',            'Imaging',      'C++',                    'rising',          'mid_60',    214032,156243,'2027-01-06','2026-02-20',7,     NULL, NULL,         'pending',    true),
    ('C362878','Ekta Sharma',              v_client_id,v_hrbp_id,'Manoj Daniel',            'Imaging',      'C++',                    'rising',          'mid_60',    214032,156243,'2027-01-06','2025-11-20',7,     NULL, NULL,         'pending',    true),
    ('C362879','Kushal Raj',               v_client_id,v_hrbp_id,'Prakash Borah',           'Imaging',      'Java',                   'rising',          'mid_60',    201600,147168,'2027-03-06','2025-07-20',7,     NULL, NULL,         'pending',    true),
    ('C362882','Srikanth P',               v_client_id,v_hrbp_id,'Balamurugan',             'SEI',          'Core Java',              'rising',          'mid_60',    200000,146000,'2027-01-06','2025-08-20',7,     NULL, NULL,         'pending',    true),
    ('C362887','Ritika Putlur Dhanaraj',   v_client_id,v_hrbp_id,'Sumit Sinha',             'Imaging',      'C++',                    'rising',          'mid_60',     60000, 43800,'2027-02-06','2026-02-20',7,     NULL, NULL,         'pending',    true),
    -- BEDROCK (10)
    ('C362824','Anindita Bhattacharyya',   v_client_id,v_hrbp_id,'Prasad / Kevin',          'Design Studio','Product Owner',          'bedrock',         'mid_60',    386400,282072,'2027-01-06','2025-05-20',7,     NULL, NULL,         'pending',    true),
    ('C362834','Kiran Mohan',              v_client_id,v_hrbp_id,'Abul Fazal',              'Cyber',        'Python',                 'bedrock',         'mid_60',    327600,239148,'2026-10-06','2024-09-20',7,     3.0,  '2025-07-20', 'pending',    true),
    ('C362842','Yarrasani Venkatesh Yadav',v_client_id,v_hrbp_id,'Sumit Sinha',             'Imaging',      'Linux',                  'bedrock',         'mid_60',    302400,220752,'2026-11-06','2023-08-20',7,     5.0,  '2025-01-20', 'pending',    true),
    ('C362849','Sajjanapu Sujith',         v_client_id,v_hrbp_id,'Aashish Desai',           'SEI',          'JMeter',                 'bedrock',         'mid_60',    268800,196224,'2027-01-06','2025-05-20',7,     NULL, NULL,         'pending',    true),
    ('C362858','Thejaswi S',               v_client_id,v_hrbp_id,'Ranganath Halegowda',     'Imaging',      'DevOps Engineering',     'bedrock',         'mid_60',    436800,318864,'2027-01-06','2024-12-20',7,     4.0,  '2025-09-20', 'pending',    true),
    ('C362859','Aditya Kumar',             v_client_id,v_hrbp_id,'Ravindra Rathi',          'Imaging',      'Golang',                 'bedrock',         'mid_60',    386400,282072,'2027-03-06','2024-01-20',7,     5.0,  '2025-03-20', 'pending',    true),
    ('C362860','Yasmin Dhal',              v_client_id,v_hrbp_id,'Ravindra Rathi',          'Imaging',      'Golang',                 'bedrock',         'mid_60',    386400,282072,'2027-01-06','2024-02-20',7,     5.0,  '2025-04-20', 'pending',    true),
    ('C362863','V Sudhakar',               v_client_id,v_hrbp_id,'Gangavarupu Chandra',     'Imaging',      'Java',                   'bedrock',         'mid_60',    341666,249416,'2027-01-06','2025-02-20',7,     1.0,  '2025-10-20', 'pending',    true),
    ('C362865','Lohith Kumar R',           v_client_id,v_hrbp_id,'Aashish Desai',           'SEI',          'Angular',                'bedrock',         'mid_60',    336000,245280,'2027-01-06','2022-12-20',7,     16.0, '2024-09-20', 'pending',    true),
    ('C362867','Narashimha Reddy P',       v_client_id,v_hrbp_id,'Prakash Borah',           'Imaging',      'Java',                   'bedrock',         'mid_60',    310800,226884,'2027-01-06','2023-04-20',7,     8.0,  '2024-11-20', 'pending',    true)
    ON CONFLICT (emp_id) DO NOTHING;

END $$;

-- Verify
SELECT cohort, COUNT(*) AS total FROM hrbp_consultants GROUP BY cohort ORDER BY cohort;
SELECT name, industry, is_active FROM hrbp_clients ORDER BY name;
