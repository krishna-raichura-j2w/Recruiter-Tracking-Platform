-- Extend clients table with all sales-effort companies, then link sales_effort_customers to clients

INSERT INTO clients (name) VALUES ('JLL') ON CONFLICT (name) DO NOTHING;
INSERT INTO clients (name) VALUES ('CME_C2H') ON CONFLICT (name) DO NOTHING;
INSERT INTO clients (name) VALUES ('Koch Industries') ON CONFLICT (name) DO NOTHING;
INSERT INTO clients (name) VALUES ('Socgen (Consol.)') ON CONFLICT (name) DO NOTHING;
INSERT INTO clients (name) VALUES ('Lumen C2H') ON CONFLICT (name) DO NOTHING;
INSERT INTO clients (name) VALUES ('Verifone') ON CONFLICT (name) DO NOTHING;
INSERT INTO clients (name) VALUES ('Nexteer Automotive') ON CONFLICT (name) DO NOTHING;
INSERT INTO clients (name) VALUES ('Sutherland') ON CONFLICT (name) DO NOTHING;
INSERT INTO clients (name) VALUES ('Tata Elxsi') ON CONFLICT (name) DO NOTHING;
INSERT INTO clients (name) VALUES ('Swiss Re') ON CONFLICT (name) DO NOTHING;
INSERT INTO clients (name) VALUES ('OSBI') ON CONFLICT (name) DO NOTHING;
INSERT INTO clients (name) VALUES ('RR Donnelley') ON CONFLICT (name) DO NOTHING;
INSERT INTO clients (name) VALUES ('DBS') ON CONFLICT (name) DO NOTHING;
INSERT INTO clients (name) VALUES ('Reckitt') ON CONFLICT (name) DO NOTHING;
INSERT INTO clients (name) VALUES ('Dormant revival - others') ON CONFLICT (name) DO NOTHING;

ALTER TABLE sales_effort_customers ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);

UPDATE sales_effort_customers sec
SET client_id = c.id
FROM clients c
WHERE c.name = sec.customer_name AND sec.client_id IS NULL
