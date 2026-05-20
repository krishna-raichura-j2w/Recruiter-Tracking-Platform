-- ============================================================
-- SEED: hrbp_consultants
-- 94 GEHC consultants
-- Cohort breakdown:
--   rescue         =  9
--   star           =  8
--   watch_exit     =  3
--   watch_rate_rev =  2
--   watch_general  =  5
--   high_performer = 28
--   rising         = 13
--   bedrock        = 10
--   new_joiner     = 16
-- Total = 94
-- Prerequisite: run 006_seed_hrbp_clients.sql first
-- ============================================================

DO $$
DECLARE
    v_client_id UUID;
    v_hrbp_id   UUID;
BEGIN
    SELECT id INTO v_client_id
    FROM hrbp_clients WHERE name = 'GE Healthcare' LIMIT 1;

    SELECT id INTO v_hrbp_id
    FROM users WHERE email = 'sara.thomas@joulestowatts.com' LIMIT 1;

    INSERT INTO hrbp_consultants (
        emp_id, name, client_id, hrbp_id,
        manager_name, modality, skill,
        cohort, perf_tier,
        monthly_po, monthly_ctc,
        po_end_date, join_date,
        bh_feedback, nps_score,
        last_hike_pct, l_d_status, is_active
    ) VALUES

    -- =============================================
    -- RESCUE COHORT — 9 consultants
    -- =============================================
    ('O36250096','Gaurav Khandelwal',      v_client_id,v_hrbp_id,'Shanthalakshmi',     'PCS',    'Automation Testing','rescue','bottom_20', 437000,328000,'2026-08-05','2025-05-01','bad',  NULL,0, 'not_started',true),
    ('C36242615','Pratik Ghosh',           v_client_id,v_hrbp_id,'Prasad Kevin',        'Design Studio','UI Developer',   'rescue','bottom_20', 386000,290000,'2026-12-31','2025-03-01','bad',  NULL,0, 'not_started',true),
    ('C36241753','Sushma V B',             v_client_id,v_hrbp_id,'Lokesh Shanbhag',     'PCS',    'SDET',              'rescue','bottom_20', 336000,252000,'2026-12-31','2024-12-01','bad',  NULL,0, 'not_started',true),
    ('C36237186','G R Mamatha',            v_client_id,v_hrbp_id,'Prasad Kevin',        'Design Studio','QA',            'rescue','bottom_20', 336000,252000,NULL,        '2023-01-01','bad',  NULL,3, 'not_started',true),
    ('C36244444','Gouri Vivek Patil',      v_client_id,v_hrbp_id,'Prakash Borah',       'Imaging','Java',               'rescue','bottom_20', 311000,233000,NULL,        '2025-05-01','bad',  NULL,0, 'not_started',true),
    ('C36243721','Mohan Kumar M N',        v_client_id,v_hrbp_id,'Sumit Sinha',         'Imaging','Embedded C++',       'rescue','bottom_20', 263000,197000,'2026-12-31','2024-12-01','bad',  NULL,0, 'not_started',true),
    ('C36242001','Hariom Singh',           v_client_id,v_hrbp_id,'Shravan Boppanna',    'Imaging','Java',               'rescue','bottom_20', 235000,176000,'2027-04-01','2024-04-01','bad',  NULL,0, 'not_started',true),
    ('C36236799','Vaishnavi R',            v_client_id,v_hrbp_id,'Sumit Sinha',         'Imaging','Java',               'rescue','bottom_20', 202000,151000,'2026-06-15','2022-06-01','bad',  NULL,2, 'not_started',true),
    ('C36245001','K Hari Prasad',          v_client_id,v_hrbp_id,'Sumit Sinha',         'Imaging','Linux',              'rescue','bottom_20', 100000,75000, NULL,        '2025-05-01','bad',  NULL,0, 'not_started',true),

    -- =============================================
    -- STAR COHORT — 8 consultants
    -- =============================================
    ('C36243501','Neeraj Mehra',           v_client_id,v_hrbp_id,'Maximus Mary',        'PCS',    'Core Java',         'star',  'top_20',    454000,295000,'2026-08-05','2024-08-01','great',9,   0,  'enrolled',   true),
    ('C36242301','Dev Drone Bhowmik',      v_client_id,v_hrbp_id,'Keerthi',             'Imaging','ASP.NET',           'star',  'top_20',    428000,278000,'2026-12-15','2024-05-01','great',8,   0,  'enrolled',   true),
    ('C36241901','Kaushik Ganeshbhai Vas', v_client_id,v_hrbp_id,'Kranthi A',           'Imaging','C++',               'star',  'top_20',    386000,251000,'2026-08-01','2023-08-01','great',9,   0,  'enrolled',   true),
    ('C36239501','Subashchandrabose M',    v_client_id,v_hrbp_id,'Aashish Desai',       'SEI',    'Java',              'star',  'top_20',    311000,202000,'2026-12-31','2022-12-01','great',8,   32, 'enrolled',   true),
    ('C36236501','Afridi Ismail Attar',    v_client_id,v_hrbp_id,'Rajnish Singhal',     'PCS',    'Java Dev',          'star',  'top_20',    294000,191000,'2027-05-01','2022-05-01','great',9,   6,  'enrolled',   true),
    ('C36243801','Keval Mahendra Dholaki', v_client_id,v_hrbp_id,'Manoj Daniel',        'Imaging','C++',               'star',  'top_20',    286000,186000,'2026-12-31','2024-11-01','great',8,   0,  'enrolled',   true),
    ('C36244001','Mohammad Anas',          v_client_id,v_hrbp_id,'Rashmi Prakash',      'PCS',    'Java',              'star',  'top_20',    286000,186000,'2026-12-31','2024-12-01','great',9,   0,  'enrolled',   true),
    ('C36240501','Srinitha S',             v_client_id,v_hrbp_id,'Rajnish Singhal',     'PCS',    'Embedded',          'star',  'top_20',    294000,191000,'2026-08-12','2024-02-01','great',7,   10, 'enrolled',   true),

    -- =============================================
    -- WATCH_EXIT COHORT — 3 consultants
    -- =============================================
    ('C36242801','Bhabani Sankar Panigrahi',v_client_id,v_hrbp_id,'Maximus Mary',       'PCS',    'Python',            'watch_exit','mid_60', 412000,309000,'2026-06-05','2024-07-01','not_given',NULL,0, 'pending',    true),
    ('C36239801','Badavath Prathap',       v_client_id,v_hrbp_id,'Rohith Karanavor',    'PCS',    'Application Dev',   'watch_exit','mid_60', 403000,302000,'2026-06-18','2022-06-01','not_given',NULL,0, 'pending',    true),
    ('C36239601','Prem Kumar M',           v_client_id,v_hrbp_id,'Rohith Karanavor',    'PCS',    'Application Dev',   'watch_exit','mid_60', 395000,296000,'2026-06-19','2022-06-01','not_given',NULL,0, 'pending',    true),

    -- =============================================
    -- WATCH_RATE_REV COHORT — 2 consultants
    -- =============================================
    ('C36240201','Swati',                  v_client_id,v_hrbp_id,'Rajni Mishra',        'PCS',    'QA',                'watch_rate_rev','mid_60', 370000,277000,'2026-09-06','2022-09-01','not_given',5, 4,  'pending',    true),
    ('C36241201','Chirapureddy Vijaya Bh', v_client_id,v_hrbp_id,'Maximus Mary',        'PCS',    'Python',            'watch_rate_rev','mid_60', 361000,270000,'2027-01-01','2023-01-01','good',     6, 0,  'pending',    true),

    -- =============================================
    -- WATCH_GENERAL COHORT — 5 consultants
    -- =============================================
    ('C36242101','Sunil Kumar Saini',      v_client_id,v_hrbp_id,'Lokesh Shanbhag',     'PCS',    'QA Manual',         'watch_general','mid_60', 311000,233000,'2026-12-31','2024-05-01','mediocre',6, 0,  'pending',    true),
    ('C36241401','Farheen Banu B',         v_client_id,v_hrbp_id,'Shanthalakshmi',      'PCS',    'QA',                'watch_general','mid_60', 286000,214000,'2026-12-31','2023-11-01','mediocre',6, 0,  'pending',    true),
    ('C36240801','Akhil R',                v_client_id,v_hrbp_id,'Prakash Borah',       'Imaging','Java',              'watch_general','mid_60', 252000,189000,'2026-12-31','2023-09-01','mediocre',6, 0,  'pending',    true),
    ('C36243101','Chandrasekhar Reddy',    v_client_id,v_hrbp_id,'Shravan Boppanna',    'Imaging','C++',               'watch_general','mid_60', 235000,176000,'2026-12-31','2024-09-01','mediocre',6, 0,  'pending',    true),
    ('C36241601','Chittibomma Mahesh',     v_client_id,v_hrbp_id,'Sumit Sinha',         'Imaging','Embedded',          'watch_general','mid_60', 219000,164000,'2026-12-31','2023-09-01','mediocre',6, 0,  'pending',    true),

    -- =============================================
    -- HIGH PERFORMER COHORT — 28 consultants
    -- =============================================
    ('C36238001','Ankit Kapadia',          v_client_id,v_hrbp_id,'Rajnish Singhal',     'PCS',    'Java',              'high_performer','mid_60', 336000,218000,'2026-12-31','2025-01-01','good',8,   0,  'enrolled',   true),
    ('C36237501','Deepika Sharma',         v_client_id,v_hrbp_id,'Maximus Mary',        'PCS',    'Business Analyst',  'high_performer','mid_60', 320000,208000,'2026-12-31','2024-11-01','good',7,   5,  'enrolled',   true),
    ('C36238201','Rahul Verma',            v_client_id,v_hrbp_id,'Aashish Desai',       'SEI',    'Python',            'high_performer','mid_60', 311000,202000,'2026-12-31','2024-06-01','good',8,   0,  'enrolled',   true),
    ('C36238401','Priya Nair',             v_client_id,v_hrbp_id,'Keerthi',             'Imaging','ML Engineer',       'high_performer','mid_60', 303000,197000,'2026-12-31','2024-08-01','good',8,   0,  'enrolled',   true),
    ('C36238601','Arun Kumar',             v_client_id,v_hrbp_id,'Prakash Borah',       'Imaging','Java',              'high_performer','mid_60', 294000,191000,'2026-12-31','2024-03-01','good',7,   8,  'enrolled',   true),
    ('C36238801','Sneha Patil',            v_client_id,v_hrbp_id,'Kranthi A',           'Imaging','C++',               'high_performer','mid_60', 286000,186000,'2026-12-31','2024-05-01','good',8,   0,  'enrolled',   true),
    ('C36239001','Vikram Singh',           v_client_id,v_hrbp_id,'Shravan Boppanna',    'Imaging','Embedded C',        'high_performer','mid_60', 278000,181000,'2026-12-31','2024-01-01','good',7,   5,  'enrolled',   true),
    ('C36239201','Meera Krishnan',         v_client_id,v_hrbp_id,'Rajni Mishra',        'PCS',    'Scrum Master',      'high_performer','mid_60', 270000,175000,'2026-12-31','2024-02-01','good',8,   0,  'enrolled',   true),
    ('C36239401','Rohit Joshi',            v_client_id,v_hrbp_id,'Sumit Sinha',         'Imaging','DevOps',            'high_performer','mid_60', 261000,170000,'2026-12-31','2023-10-01','good',7,   7,  'enrolled',   true),
    ('C36240001','Kavitha R',              v_client_id,v_hrbp_id,'Maximus Mary',        'PCS',    'QA Automation',     'high_performer','mid_60', 252000,164000,'2026-12-31','2023-07-01','good',8,   5,  'enrolled',   true),
    ('C36240401','Sanjay Gupta',           v_client_id,v_hrbp_id,'Lokesh Shanbhag',     'PCS',    'Java',              'high_performer','mid_60', 244000,159000,'2026-12-31','2023-08-01','good',7,   0,  'enrolled',   true),
    ('C36240601','Divya Menon',            v_client_id,v_hrbp_id,'Rajnish Singhal',     'PCS',    'Product Owner',     'high_performer','mid_60', 336000,218000,'2026-12-31','2023-05-01','good',8,   12, 'enrolled',   true),
    ('C36240701','Amit Sharma',            v_client_id,v_hrbp_id,'Aashish Desai',       'SEI',    'Salesforce',        'high_performer','mid_60', 320000,208000,'2026-12-31','2023-06-01','good',7,   8,  'enrolled',   true),
    ('C36241001','Pooja Iyer',             v_client_id,v_hrbp_id,'Prakash Borah',       'Imaging','Data Engineer',     'high_performer','mid_60', 303000,197000,'2026-12-31','2023-08-01','good',8,   0,  'enrolled',   true),
    ('C36241101','Karthik S',              v_client_id,v_hrbp_id,'Kranthi A',           'Imaging','C++',               'high_performer','mid_60', 294000,191000,'2026-12-31','2023-09-01','good',7,   10, 'enrolled',   true),
    ('C36241301','Neha Kapoor',            v_client_id,v_hrbp_id,'Keerthi',             'Imaging','ASP.NET',           'high_performer','mid_60', 278000,181000,'2026-12-31','2023-11-01','good',8,   0,  'enrolled',   true),
    ('C36241501','Suresh Babu',            v_client_id,v_hrbp_id,'Shravan Boppanna',    'Imaging','Linux Kernel',      'high_performer','mid_60', 270000,175000,'2026-12-31','2023-09-01','good',7,   6,  'enrolled',   true),
    ('C36241701','Ravi Teja',              v_client_id,v_hrbp_id,'Manoj Daniel',        'Imaging','Firmware',          'high_performer','mid_60', 261000,170000,'2026-12-31','2023-08-01','good',8,   0,  'enrolled',   true),
    ('C36241801','Lakshmi Prasad',         v_client_id,v_hrbp_id,'Rajni Mishra',        'PCS',    'BA',                'high_performer','mid_60', 252000,164000,'2026-12-31','2023-07-01','good',7,   8,  'enrolled',   true),
    ('C36242201','Santosh Kumar',          v_client_id,v_hrbp_id,'Maximus Mary',        'PCS',    'Java',              'high_performer','mid_60', 244000,159000,'2026-12-31','2024-04-01','good',8,   0,  'enrolled',   true),
    ('C36242401','Bhavana S',              v_client_id,v_hrbp_id,'Sumit Sinha',         'Imaging','Embedded',          'high_performer','mid_60', 235000,153000,'2026-12-31','2024-04-01','good',7,   0,  'enrolled',   true),
    ('C36242501','Manohar K',              v_client_id,v_hrbp_id,'Lokesh Shanbhag',     'PCS',    'QA',                'high_performer','mid_60', 227000,148000,'2026-12-31','2024-06-01','good',8,   0,  'enrolled',   true),
    ('C36242701','Pavithra M',             v_client_id,v_hrbp_id,'Rajnish Singhal',     'PCS',    'Python',            'high_performer','mid_60', 219000,143000,'2026-12-31','2024-07-01','good',7,   0,  'enrolled',   true),
    ('C36242901','Harish Babu',            v_client_id,v_hrbp_id,'Aashish Desai',       'SEI',    'Java',              'high_performer','mid_60', 210000,137000,'2026-12-31','2024-08-01','good',8,   0,  'enrolled',   true),
    ('C36243001','Shruti Verma',           v_client_id,v_hrbp_id,'Kranthi A',           'Imaging','C++',               'high_performer','mid_60', 202000,131000,'2026-12-31','2024-09-01','good',7,   0,  'enrolled',   true),
    ('C36243201','Prashanth G',            v_client_id,v_hrbp_id,'Prakash Borah',       'Imaging','Java',              'high_performer','mid_60', 194000,126000,'2026-12-31','2024-10-01','good',8,   0,  'enrolled',   true),
    ('C36243301','Vinitha R',              v_client_id,v_hrbp_id,'Shravan Boppanna',    'Imaging','Embedded',          'high_performer','mid_60', 185000,120000,'2026-12-31','2024-11-01','good',7,   0,  'enrolled',   true),
    ('C36243401','Kishore Kumar',          v_client_id,v_hrbp_id,'Manoj Daniel',        'Imaging','Firmware',          'high_performer','mid_60', 177000,115000,'2026-12-31','2024-12-01','good',8,   0,  'enrolled',   true),

    -- =============================================
    -- RISING COHORT — 13 consultants
    -- =============================================
    ('C36244101','Aishwarya K',            v_client_id,v_hrbp_id,'Rajnish Singhal',     'PCS',    'Java',              'rising','mid_60', 252000,164000,'2026-12-31','2025-01-01','good',8,   0,  'enrolled',   true),
    ('C36244201','Tushar Mehta',           v_client_id,v_hrbp_id,'Maximus Mary',        'PCS',    'Python',            'rising','mid_60', 235000,153000,'2026-12-31','2025-02-01','good',7,   0,  'enrolled',   true),
    ('C36244301','Keerthana S',            v_client_id,v_hrbp_id,'Lokesh Shanbhag',     'PCS',    'QA',                'rising','mid_60', 219000,142000,'2026-12-31','2025-02-01','good',8,   0,  'enrolled',   true),
    ('C36244501','Ranjith Kumar',          v_client_id,v_hrbp_id,'Sumit Sinha',         'Imaging','Embedded C++',      'rising','mid_60', 210000,137000,'2026-12-31','2025-03-01','good',7,   0,  'enrolled',   true),
    ('C36244601','Soumya Ghosh',           v_client_id,v_hrbp_id,'Kranthi A',           'Imaging','C++',               'rising','mid_60', 202000,131000,'2026-12-31','2025-03-01','good',8,   0,  'enrolled',   true),
    ('C36244701','Ajay Reddy',             v_client_id,v_hrbp_id,'Prakash Borah',       'Imaging','Java',              'rising','mid_60', 194000,126000,'2026-12-31','2025-04-01','good',7,   0,  'enrolled',   true),
    ('C36244801','Preethi Nair',           v_client_id,v_hrbp_id,'Rajni Mishra',        'PCS',    'Scrum',             'rising','mid_60', 185000,120000,'2026-12-31','2025-04-01','good',8,   0,  'enrolled',   true),
    ('C36244901','Ramesh S',               v_client_id,v_hrbp_id,'Aashish Desai',       'SEI',    'Salesforce',        'rising','mid_60', 177000,115000,'2026-12-31','2025-04-01','good',7,   0,  'enrolled',   true),
    ('C36245101','Sunita Kumari',          v_client_id,v_hrbp_id,'Keerthi',             'Imaging','DevOps',            'rising','mid_60', 168000,109000,'2026-12-31','2025-05-01','good',8,   0,  'enrolled',   true),
    ('C36245201','Arjun Pillai',           v_client_id,v_hrbp_id,'Shravan Boppanna',    'Imaging','Linux',             'rising','mid_60', 160000,104000,'2026-12-31','2025-05-01','good',7,   0,  'enrolled',   true),
    ('C36245301','Vidya Lakshmi',          v_client_id,v_hrbp_id,'Manoj Daniel',        'Imaging','Firmware',          'rising','mid_60', 152000,99000, '2026-12-31','2025-05-01','good',8,   0,  'enrolled',   true),
    ('C36245401','Naveen Raj',             v_client_id,v_hrbp_id,'Rajnish Singhal',     'PCS',    'Java',              'rising','mid_60', 143000,93000, '2026-12-31','2025-05-01','good',7,   0,  'enrolled',   true),
    ('C36245501','Pallavi Singh',          v_client_id,v_hrbp_id,'Sumit Sinha',         'Imaging','Embedded',          'rising','mid_60', 135000,88000, '2026-12-31','2025-05-01','good',8,   0,  'enrolled',   true),

    -- =============================================
    -- BEDROCK COHORT — 10 consultants
    -- =============================================
    ('C36235001','V Sudhakar',             v_client_id,v_hrbp_id,'Aashish Desai',       'SEI',    'Java',              'bedrock','mid_60', 311000,202000,'2026-12-31','2021-06-01','good',7,   15, 'completed',  true),
    ('C36235201','Mahesh R',               v_client_id,v_hrbp_id,'Rajnish Singhal',     'PCS',    'Python',            'bedrock','mid_60', 294000,191000,'2026-12-31','2021-08-01','good',7,   12, 'completed',  true),
    ('C36235401','Ramya S',                v_client_id,v_hrbp_id,'Maximus Mary',        'PCS',    'QA',                'bedrock','mid_60', 278000,181000,'2026-12-31','2021-10-01','good',8,   10, 'completed',  true),
    ('C36235601','Ganesh Kumar',           v_client_id,v_hrbp_id,'Prakash Borah',       'Imaging','C++',               'bedrock','mid_60', 261000,170000,'2026-12-31','2021-12-01','good',7,   8,  'completed',  true),
    ('C36235801','Jayanthi K',             v_client_id,v_hrbp_id,'Kranthi A',           'Imaging','Embedded',          'bedrock','mid_60', 244000,159000,'2026-12-31','2022-01-01','good',8,   8,  'completed',  true),
    ('C36236001','Muthukumar P',           v_client_id,v_hrbp_id,'Shravan Boppanna',    'Imaging','Java',              'bedrock','mid_60', 227000,148000,'2026-12-31','2022-02-01','good',7,   6,  'completed',  true),
    ('C36236201','Saravanan R',            v_client_id,v_hrbp_id,'Manoj Daniel',        'Imaging','Linux',             'bedrock','mid_60', 210000,137000,'2026-12-31','2022-03-01','good',8,   6,  'completed',  true),
    ('C36236401','Usha Rani',              v_client_id,v_hrbp_id,'Lokesh Shanbhag',     'PCS',    'QA Manual',         'bedrock','mid_60', 194000,126000,'2026-12-31','2022-04-01','good',7,   5,  'completed',  true),
    ('C36236601','Venkatesh N',            v_client_id,v_hrbp_id,'Rajni Mishra',        'PCS',    'BA',                'bedrock','mid_60', 177000,115000,'2026-12-31','2022-05-01','good',8,   5,  'completed',  true),
    ('C36236801','Yogesh P',               v_client_id,v_hrbp_id,'Sumit Sinha',         'Imaging','Firmware',          'bedrock','mid_60', 168000,109000,'2026-12-31','2022-06-01','good',7,   4,  'completed',  true),

    -- =============================================
    -- NEW JOINER COHORT — 16 consultants
    -- =============================================
    ('C36246001','Aarav Mehta',            v_client_id,v_hrbp_id,'Rajnish Singhal',     'PCS',    'Java',              'new_joiner','unrated', 252000,164000,'2026-12-31','2025-04-01', 'not_given',NULL,0,'not_started',true),
    ('C36246101','Priyanka Das',           v_client_id,v_hrbp_id,'Maximus Mary',        'PCS',    'Python',            'new_joiner','unrated', 235000,153000,'2026-12-31','2025-04-01', 'not_given',NULL,0,'not_started',true),
    ('C36246201','Vivek Anand',            v_client_id,v_hrbp_id,'Aashish Desai',       'SEI',    'Salesforce',        'new_joiner','unrated', 219000,142000,'2026-12-31','2025-04-15','not_given',NULL,0,'not_started',true),
    ('C36246301','Shreya Jain',            v_client_id,v_hrbp_id,'Keerthi',             'Imaging','ML Engineer',       'new_joiner','unrated', 303000,197000,'2026-12-31','2025-04-15','not_given',NULL,0,'not_started',true),
    ('C36246401','Rohan Pillai',           v_client_id,v_hrbp_id,'Prakash Borah',       'Imaging','Java',              'new_joiner','unrated', 202000,131000,'2026-12-31','2025-04-20','not_given',NULL,0,'not_started',true),
    ('C36246501','Ananya Rao',             v_client_id,v_hrbp_id,'Kranthi A',           'Imaging','C++',               'new_joiner','unrated', 185000,120000,'2026-12-31','2025-04-20','not_given',NULL,0,'not_started',true),
    ('C36246601','Kiran Kumar B',          v_client_id,v_hrbp_id,'Shravan Boppanna',    'Imaging','Embedded',          'new_joiner','unrated', 168000,109000,'2026-12-31','2025-05-01', 'not_given',NULL,0,'not_started',true),
    ('C36246701','Divyanshu Tiwari',       v_client_id,v_hrbp_id,'Rajni Mishra',        'PCS',    'QA',                'new_joiner','unrated', 160000,104000,'2026-12-31','2025-05-01', 'not_given',NULL,0,'not_started',true),
    ('C36246801','Nandini Bose',           v_client_id,v_hrbp_id,'Lokesh Shanbhag',     'PCS',    'BA',                'new_joiner','unrated', 244000,159000,'2026-12-31','2025-05-05','not_given',NULL,0,'not_started',true),
    ('C36246901','Abhishek Sinha',         v_client_id,v_hrbp_id,'Sumit Sinha',         'Imaging','DevOps',            'new_joiner','unrated', 227000,148000,'2026-12-31','2025-05-05','not_given',NULL,0,'not_started',true),
    ('C36247001','Tanvi Shah',             v_client_id,v_hrbp_id,'Manoj Daniel',        'Imaging','Firmware',          'new_joiner','unrated', 210000,137000,'2026-12-31','2025-05-08','not_given',NULL,0,'not_started',true),
    ('C36247101','Harshit Goel',           v_client_id,v_hrbp_id,'Rajnish Singhal',     'PCS',    'Java',              'new_joiner','unrated', 194000,126000,'2026-12-31','2025-05-08','not_given',NULL,0,'not_started',true),
    ('C36247201','Swapna Reddy',           v_client_id,v_hrbp_id,'Maximus Mary',        'PCS',    'Python',            'new_joiner','unrated', 177000,115000,'2026-12-31','2025-05-10','not_given',NULL,0,'not_started',true),
    ('C36247301','Bharat Patel',           v_client_id,v_hrbp_id,'Prakash Borah',       'Imaging','C++',               'new_joiner','unrated', 160000,104000,'2026-12-31','2025-05-10','not_given',NULL,0,'not_started',true),
    ('C36247401','Ishaan Chandra',         v_client_id,v_hrbp_id,'Aashish Desai',       'SEI',    'Salesforce',        'new_joiner','unrated', 252000,164000,'2026-12-31','2025-05-12','not_given',NULL,0,'not_started',true),
    ('C36247501','Lavanya M',              v_client_id,v_hrbp_id,'Keerthi',             'Imaging','ML Engineer',       'new_joiner','unrated', 286000,186000,'2026-12-31','2025-05-12','not_given',NULL,0,'not_started',true)

    ON CONFLICT (emp_id) DO NOTHING;

END $$;

-- Verify counts by cohort
SELECT cohort, COUNT(*) AS total
FROM hrbp_consultants
GROUP BY cohort
ORDER BY cohort;
