-- ETL of the professor's three TSV files into the Contract database (MySQL 8).
-- Files: companies.tsv, materials.tsv, transactions.tsv
-- Run sql/schema.sql and sql/seed.sql first.

-- ===================================================================
-- STEP 0. Copy the files into the MySQL container and open MySQL
-- ===================================================================

-- Purpose: start a throwaway MySQL container for the ETL.
-- docker run --name etl -e MYSQL_ROOT_PASSWORD=contract -d mysql:latest

-- Purpose: MySQL can only read files from /var/lib/mysql-files, so copy the three TSV files there.
-- docker cp companies.tsv etl:/var/lib/mysql-files/
-- docker cp materials.tsv etl:/var/lib/mysql-files/
-- docker cp transactions.tsv etl:/var/lib/mysql-files/

-- Purpose: log in to MySQL.
-- docker exec -it etl mysql -u root -p

-- Purpose: work inside the Contract database.
USE contract;

-- Purpose: make sure Chinese and special symbols such as the cubic meter sign load correctly.
SET NAMES 'utf8mb4';


-- ===================================================================
-- STEP 1. EXTRACT: create staging tables and load the raw files
-- ===================================================================

-- Purpose: staging table that holds companies.tsv exactly as it comes.
CREATE TABLE stg_companies (
  company_id CHAR(8) PRIMARY KEY,
  name VARCHAR(200),
  description VARCHAR(300),
  address VARCHAR(300),
  phone VARCHAR(60),
  email VARCHAR(200),
  comments VARCHAR(500)
) DEFAULT CHARSET utf8mb4;

-- Purpose: staging table that holds materials.tsv exactly as it comes.
CREATE TABLE stg_materials (
  material_id CHAR(8) PRIMARY KEY,
  item VARCHAR(500),
  unit VARCHAR(40),
  price_avg DECIMAL(12, 2),
  price_stdev DECIMAL(12, 2),
  no_samples INT
) DEFAULT CHARSET utf8mb4;

-- Purpose: staging table that holds transactions.tsv exactly as it comes. No foreign keys, so bad rows can still load.
CREATE TABLE stg_transactions (
  transaction_id CHAR(8) PRIMARY KEY,
  company_id CHAR(8),
  material_id CHAR(8),
  quantity INT,
  price_per_unit DECIMAL(12, 2),
  discount_rate DECIMAL(5, 2),
  total_price DECIMAL(16, 2),
  transaction_date DATE,
  notes VARCHAR(300),
  INDEX idx_stg_txn_company (company_id),
  INDEX idx_stg_txn_material (material_id)
) DEFAULT CHARSET utf8mb4;

-- Purpose: load companies.tsv. Fields are separated by a tab and the files use Windows line endings (\r\n).
LOAD DATA INFILE '/var/lib/mysql-files/companies.tsv'
INTO TABLE stg_companies
CHARACTER SET utf8mb4
FIELDS TERMINATED BY '\t'
OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\r\n'
IGNORE 1 ROWS;

-- Purpose: load materials.tsv.
LOAD DATA INFILE '/var/lib/mysql-files/materials.tsv'
INTO TABLE stg_materials
CHARACTER SET utf8mb4
FIELDS TERMINATED BY '\t'
OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\r\n'
IGNORE 1 ROWS;

-- Purpose: load transactions.tsv.
LOAD DATA INFILE '/var/lib/mysql-files/transactions.tsv'
INTO TABLE stg_transactions
CHARACTER SET utf8mb4
FIELDS TERMINATED BY '\t'
OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\r\n'
IGNORE 1 ROWS;

-- Purpose: check that every file loaded in full (expect 500, 458 and 51947 rows).
SELECT
  (SELECT COUNT(*) FROM stg_companies) AS companies,
  (SELECT COUNT(*) FROM stg_materials) AS materials,
  (SELECT COUNT(*) FROM stg_transactions) AS transactions;


-- ===================================================================
-- STEP 2. TRANSFORM: find wrong data and remove or fix it
-- ===================================================================

-- ---- 2.1 Transactions that point to a company that does not exist ----

-- Purpose: find them (LEFT JOIN with IS NULL keeps only transactions with no matching company).
SELECT COUNT(*) AS unknown_company_txns
FROM stg_transactions t
LEFT JOIN stg_companies c ON c.company_id = t.company_id
WHERE c.company_id IS NULL;

-- Purpose: remove them. A purchase from an unknown company cannot be linked to any supplier.
DELETE t
FROM stg_transactions t
LEFT JOIN stg_companies c ON c.company_id = t.company_id
WHERE c.company_id IS NULL;

-- ---- 2.2 Transactions that point to a material that does not exist ----

-- Purpose: find them.
SELECT COUNT(*) AS unknown_material_txns
FROM stg_transactions t
LEFT JOIN stg_materials m ON m.material_id = t.material_id
WHERE m.material_id IS NULL;

-- Purpose: remove them for the same reason.
DELETE t
FROM stg_transactions t
LEFT JOIN stg_materials m ON m.material_id = t.material_id
WHERE m.material_id IS NULL;

-- ---- 2.3 Impossible dates ----

-- Purpose: look at the transactions per year. Real data sits between 2018 and 2025, and a block of rows is dated 1950 to 1980.
SELECT YEAR(transaction_date) AS yr, COUNT(*) AS cnt
FROM stg_transactions
GROUP BY yr
ORDER BY yr;

-- Purpose: remove rows dated before 2018 or in the future. These dates are wrong and the true date is unknown.
DELETE FROM stg_transactions
WHERE transaction_date < '2018-01-01'
   OR transaction_date > CURDATE();

-- ---- 2.4 Wrong total price ----

-- Purpose: find rows where the total is not quantity times price after discount. Valid rows are rounded to the nearest 10, so they are at most 5 away from the exact amount.
SELECT COUNT(*) AS wrong_total_txns
FROM stg_transactions
WHERE ABS(total_price - quantity * price_per_unit * (1 - discount_rate / 100)) > 5;

-- Purpose: show a few of them. In every case the total was copied from the unit price and the quantity was left out.
SELECT transaction_id, quantity, price_per_unit, discount_rate, total_price
FROM stg_transactions
WHERE ABS(total_price - quantity * price_per_unit * (1 - discount_rate / 100)) > 5
LIMIT 5;

-- Purpose: recalculate the total from quantity, price and discount, rounded to the nearest 10 like the valid rows.
UPDATE stg_transactions
SET total_price = ROUND(quantity * price_per_unit * (1 - discount_rate / 100), -1)
WHERE ABS(total_price - quantity * price_per_unit * (1 - discount_rate / 100)) > 5;

-- ---- 2.5 Same unit written in two ways ----

-- Purpose: find units that differ only by upper or lower case (expect Piece and piece, One test and one test).
SELECT LOWER(unit) AS unit_lower, GROUP_CONCAT(DISTINCT unit) AS spellings
FROM stg_materials
GROUP BY unit_lower
HAVING COUNT(DISTINCT unit) > 1;

-- Purpose: use one spelling for pieces.
UPDATE stg_materials SET unit = 'Piece' WHERE LOWER(unit) = 'piece';

-- Purpose: use one spelling for tests.
UPDATE stg_materials SET unit = 'One test' WHERE LOWER(unit) = 'one test';

-- ---- 2.6 The same material listed twice ----

-- Purpose: find materials with the same name and unit but different ids.
SELECT item, unit, GROUP_CONCAT(material_id) AS ids
FROM stg_materials
GROUP BY item, unit
HAVING COUNT(*) > 1;

-- Purpose: build a list that maps each extra id to the id we keep (the smallest).
CREATE TABLE material_merge AS
SELECT m.material_id AS old_id, k.keep_id
FROM stg_materials m
JOIN (
  SELECT item, unit, MIN(material_id) AS keep_id
  FROM stg_materials
  GROUP BY item, unit
  HAVING COUNT(*) > 1
) k ON k.item = m.item AND k.unit = m.unit
WHERE m.material_id <> k.keep_id;

-- Purpose: point the transactions of the extra ids to the id we keep.
UPDATE stg_transactions t
JOIN material_merge x ON x.old_id = t.material_id
SET t.material_id = x.keep_id;

-- Purpose: delete the extra material rows.
DELETE m
FROM stg_materials m
JOIN material_merge x ON x.old_id = m.material_id;

-- Purpose: the merge list is no longer needed.
DROP TABLE material_merge;

-- Purpose: some names still repeat with a different unit. They are different items, so add the unit to the name to keep every name unique.
UPDATE stg_materials m
JOIN (
  SELECT item FROM stg_materials GROUP BY item HAVING COUNT(*) > 1
) d ON d.item = m.item
SET m.item = CONCAT(m.item, ' (', m.unit, ')');

-- ---- 2.7 Company names ----

-- Purpose: keep the trade name that is hidden in the name, for example "Premier Prefabrication (dba Premier Roofing)".
ALTER TABLE stg_companies ADD COLUMN trade_name VARCHAR(120) NULL;

-- Purpose: move the text after "dba" into trade_name and keep only the legal name in name.
UPDATE stg_companies
SET trade_name = TRIM(TRAILING ')' FROM SUBSTRING_INDEX(name, ' (dba ', -1)),
    name = SUBSTRING_INDEX(name, ' (dba ', 1)
WHERE name LIKE '% (dba %)';

-- Purpose: find company names used by more than one company. They have different ids and addresses, so they are different companies.
SELECT name, COUNT(*) AS cnt
FROM stg_companies
GROUP BY name
HAVING COUNT(*) > 1
ORDER BY cnt DESC
LIMIT 5;

-- Purpose: the supplier directory needs a unique name per account, so add the city to repeated names.
UPDATE stg_companies c
JOIN (
  SELECT name FROM stg_companies GROUP BY name HAVING COUNT(*) > 1
) d ON d.name = c.name
SET c.name = CONCAT(c.name, ' - ', TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(c.address, ',', 2), ',', -1)));

-- Purpose: if two companies in the same city still share a name, add the company id as well.
UPDATE stg_companies c
JOIN (
  SELECT name FROM stg_companies GROUP BY name HAVING COUNT(*) > 1
) d ON d.name = c.name
SET c.name = CONCAT(c.name, ' #', c.company_id);

-- Purpose: confirm that no repeated name is left (expect 0).
SELECT COUNT(*) AS repeated_names
FROM (SELECT name FROM stg_companies GROUP BY name HAVING COUNT(*) > 1) r;


-- ===================================================================
-- STEP 3. LOAD: fill the Contract tables
-- ===================================================================

-- Purpose: suppliers belong to an organization, so create one to own the sample suppliers.
INSERT INTO organizations (company_name, plan_tier, max_seats)
VALUES ('Sample Data Contractor', 'growth', 10);

-- Purpose: remember its id for the next statements.
SET @org_id = LAST_INSERT_ID();

-- Purpose: categories for materials. Man is labor, Machine is equipment, Material is products, Method is work items and tests.
INSERT INTO categories (name) VALUES ('Man'), ('Machine'), ('Material'), ('Method');

-- Purpose: load the cleaned materials. The category is guessed from the item text. The original id is kept as material_code so transactions can find their material.
INSERT INTO master_materials
  (category_id, standard_name, unit, material_code, market_price_avg, market_price_stdev, market_sample_cnt)
SELECT c.id, m.item, m.unit, m.material_id, m.price_avg, m.price_stdev, m.no_samples
FROM stg_materials m
JOIN categories c ON c.name = CASE
  WHEN m.item LIKE 'product%' THEN 'Material'
  WHEN m.item REGEXP '^(machine|equipment|crawler|[0-9.]+-ton|[0-9.]+m3|\\(used)' THEN 'Machine'
  WHEN m.item REGEXP '^(ordinary workers|engineer|other technical workers)|technician|plasterer|operator' THEN 'Man'
  ELSE 'Method'
END;

-- Purpose: load the cleaned companies as suppliers. The company id is kept as license_no so transactions can find their supplier.
INSERT INTO suppliers (org_id, company_name, license_no, trade_name, phone, email, address, description)
SELECT @org_id, name, company_id, trade_name, phone, email, address, description
FROM stg_companies;

-- Purpose: the comments column holds up to four notes separated by semicolons. Split them into one row per note (first normal form). DISTINCT drops a note that a company repeats.
INSERT INTO supplier_notes (supplier_id, note)
WITH RECURSIVE seq AS (
  SELECT 1 AS i
  UNION ALL
  SELECT i + 1 FROM seq WHERE i < 10
)
SELECT DISTINCT s.id, TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(c.comments, ';', q.i), ';', -1))
FROM stg_companies c
JOIN suppliers s ON s.license_no = c.company_id AND s.org_id = @org_id
JOIN seq q ON q.i <= 1 + CHAR_LENGTH(c.comments) - CHAR_LENGTH(REPLACE(c.comments, ';', ''))
WHERE c.comments <> '';

-- Purpose: load the cleaned transactions as price history, using the supplier and material ids of the Contract tables.
INSERT INTO price_history
  (supplier_id, material_id, quantity, unit_price, discount_pct, total_price, transacted_on, note)
SELECT s.id, m.id, t.quantity, t.price_per_unit, t.discount_rate, t.total_price,
       t.transaction_date, NULLIF(t.notes, '')
FROM stg_transactions t
JOIN suppliers s ON s.license_no = t.company_id AND s.org_id = @org_id
JOIN master_materials m ON m.material_code = t.material_id;


-- ===================================================================
-- STEP 4. VERIFY
-- ===================================================================

-- Purpose: compare the rows loaded with the rows that were left in staging (each pair must match).
SELECT
  (SELECT COUNT(*) FROM stg_companies) AS stg_companies,
  (SELECT COUNT(*) FROM suppliers WHERE org_id = @org_id) AS suppliers,
  (SELECT COUNT(*) FROM stg_materials) AS stg_materials,
  (SELECT COUNT(*) FROM master_materials WHERE material_code IS NOT NULL) AS materials,
  (SELECT COUNT(*) FROM stg_transactions) AS stg_transactions,
  (SELECT COUNT(*) FROM price_history) AS price_history;

-- Purpose: make sure no price history row lost its supplier or material (expect 0).
SELECT COUNT(*) AS orphan_rows
FROM price_history h
LEFT JOIN suppliers s ON s.id = h.supplier_id
LEFT JOIN master_materials m ON m.id = h.material_id
WHERE s.id IS NULL OR m.id IS NULL;

-- Purpose: make sure no total is wrong any more (expect 0).
SELECT COUNT(*) AS wrong_totals
FROM price_history
WHERE ABS(total_price - quantity * unit_price * (1 - discount_pct / 100)) > 5;

-- Purpose: see how many materials landed in each category.
SELECT c.name, COUNT(*) AS materials
FROM master_materials m
JOIN categories c ON c.id = m.category_id
GROUP BY c.name
ORDER BY materials DESC;


-- ===================================================================
-- STEP 5. CLEAN UP
-- ===================================================================

-- Purpose: the staging tables did their job, so remove them.
DROP TABLE stg_transactions;
DROP TABLE stg_materials;
DROP TABLE stg_companies;
