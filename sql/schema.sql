CREATE DATABASE IF NOT EXISTS contract CHARACTER SET utf8mb4;
USE contract;

CREATE TABLE organizations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(120) NOT NULL,
  plan_tier ENUM('starter', 'growth') NOT NULL DEFAULT 'starter',
  max_seats SMALLINT UNSIGNED NOT NULL DEFAULT 3,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE suppliers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  company_name VARCHAR(120) NOT NULL,
  license_no VARCHAR(40) NULL,
  trade_name VARCHAR(120) NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(160) NULL,
  address VARCHAR(200) NULL,
  description VARCHAR(200) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_suppliers_org FOREIGN KEY (org_id) REFERENCES organizations (id),
  INDEX idx_suppliers_license (license_no),
  CONSTRAINT uq_suppliers_org_name UNIQUE (org_id, company_name)
);

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  supplier_id INT UNSIGNED NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  password_hash VARCHAR(200) NOT NULL,
  role ENUM('admin', 'pm', 'inspector', 'executive', 'supplier') NOT NULL DEFAULT 'pm',
  seat_status ENUM('active', 'invited', 'disabled') NOT NULL DEFAULT 'active',
  CONSTRAINT fk_users_org FOREIGN KEY (org_id) REFERENCES organizations (id),
  CONSTRAINT fk_users_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
);

CREATE TABLE categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE master_materials (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  standard_name VARCHAR(200) NOT NULL UNIQUE,
  unit VARCHAR(20) NOT NULL,
  material_code CHAR(8) NULL UNIQUE,
  market_price_avg DECIMAL(12, 2) NULL,
  market_price_stdev DECIMAL(12, 2) NULL,
  market_sample_cnt INT UNSIGNED NULL,
  CONSTRAINT fk_materials_category FOREIGN KEY (category_id) REFERENCES categories (id)
);

CREATE TABLE supplier_notes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT UNSIGNED NOT NULL,
  note VARCHAR(120) NOT NULL,
  CONSTRAINT fk_notes_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE,
  CONSTRAINT uq_notes_pair UNIQUE (supplier_id, note)
);

CREATE TABLE supplier_catalogs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT UNSIGNED NOT NULL,
  material_id INT UNSIGNED NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL CHECK (unit_price >= 0),
  capacity DECIMAL(14, 2) NOT NULL CHECK (capacity >= 0),
  delivery_rate_km DECIMAL(10, 2) NOT NULL CHECK (delivery_rate_km >= 0),
  CONSTRAINT fk_catalogs_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
  CONSTRAINT fk_catalogs_material FOREIGN KEY (material_id) REFERENCES master_materials (id),
  CONSTRAINT uq_catalogs_pair UNIQUE (supplier_id, material_id),
  INDEX idx_catalogs_material_price (material_id, unit_price)
);

CREATE TABLE projects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  created_by_user_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  location VARCHAR(160) NOT NULL,
  tax_rate DECIMAL(5, 4) NOT NULL DEFAULT 0.0500 CHECK (tax_rate >= 0),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_projects_org FOREIGN KEY (org_id) REFERENCES organizations (id),
  CONSTRAINT fk_projects_user FOREIGN KEY (created_by_user_id) REFERENCES users (id)
);

CREATE TABLE project_requirements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  material_id INT UNSIGNED NOT NULL,
  required_quantity DECIMAL(14, 2) NOT NULL CHECK (required_quantity > 0),
  CONSTRAINT fk_requirements_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_requirements_material FOREIGN KEY (material_id) REFERENCES master_materials (id),
  CONSTRAINT uq_requirements_pair UNIQUE (project_id, material_id)
);

CREATE TABLE project_supplier_distances (
  project_id INT UNSIGNED NOT NULL,
  supplier_id INT UNSIGNED NOT NULL,
  distance_km DECIMAL(8, 2) NOT NULL CHECK (distance_km >= 0),
  PRIMARY KEY (project_id, supplier_id),
  CONSTRAINT fk_distances_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_distances_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
);

CREATE TABLE orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  supplier_id INT UNSIGNED NOT NULL,
  catalog_id INT UNSIGNED NOT NULL,
  placed_by_user_id INT UNSIGNED NOT NULL,
  quantity DECIMAL(14, 2) NOT NULL CHECK (quantity > 0),
  total_landed_cost DECIMAL(14, 2) NOT NULL,
  status ENUM('placed', 'delivered') NOT NULL DEFAULT 'placed',
  version_id INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_project FOREIGN KEY (project_id) REFERENCES projects (id),
  CONSTRAINT fk_orders_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
  CONSTRAINT fk_orders_catalog FOREIGN KEY (catalog_id) REFERENCES supplier_catalogs (id),
  CONSTRAINT fk_orders_user FOREIGN KEY (placed_by_user_id) REFERENCES users (id),
  INDEX idx_orders_project (project_id)
);

CREATE TABLE ratings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL UNIQUE,
  created_by_user_id INT UNSIGNED NOT NULL,
  punctuality_score TINYINT UNSIGNED NOT NULL CHECK (punctuality_score BETWEEN 1 AND 5),
  quantity_score TINYINT UNSIGNED NOT NULL CHECK (quantity_score BETWEEN 1 AND 5),
  comment VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ratings_order FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT fk_ratings_user FOREIGN KEY (created_by_user_id) REFERENCES users (id)
);

CREATE TABLE price_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT UNSIGNED NOT NULL,
  material_id INT UNSIGNED NOT NULL,
  quantity DECIMAL(14, 2) NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(12, 2) NOT NULL CHECK (unit_price >= 0),
  discount_pct DECIMAL(5, 2) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  total_price DECIMAL(16, 2) NOT NULL,
  transacted_on DATE NOT NULL,
  note VARCHAR(200) NULL,
  CONSTRAINT fk_history_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
  CONSTRAINT fk_history_material FOREIGN KEY (material_id) REFERENCES master_materials (id),
  INDEX idx_history_material_date (material_id, transacted_on)
);

CREATE VIEW v_supplier_ratings AS
SELECT
  o.supplier_id,
  COUNT(r.id) AS rating_cnt,
  AVG((r.punctuality_score + r.quantity_score) / 2) AS avg_score
FROM orders o
JOIN ratings r ON r.order_id = o.id
GROUP BY o.supplier_id;

CREATE VIEW v_supplier_rankings AS
SELECT
  c.id AS catalog_id,
  c.supplier_id,
  s.org_id,
  s.company_name,
  c.material_id,
  c.unit_price,
  c.capacity,
  c.delivery_rate_km,
  sr.avg_score,
  COALESCE(sr.rating_cnt, 0) AS rating_cnt
FROM supplier_catalogs c
JOIN suppliers s ON s.id = c.supplier_id AND s.status = 'active'
LEFT JOIN v_supplier_ratings sr ON sr.supplier_id = c.supplier_id;
