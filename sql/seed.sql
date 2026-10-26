USE contract;

INSERT INTO categories (name) VALUES
  ('Concrete'), ('Steel'), ('Timber'), ('Aggregate'), ('Masonry');

INSERT INTO master_materials (category_id, standard_name, unit)
SELECT c.id, m.standard_name, m.unit
FROM (
  SELECT 'Concrete' AS category, 'Ready-mix concrete C30' AS standard_name, 'm3' AS unit
  UNION ALL SELECT 'Concrete', 'Ready-mix concrete C40', 'm3'
  UNION ALL SELECT 'Steel', 'Rebar 12mm', 'ton'
  UNION ALL SELECT 'Steel', 'Structural steel H-beam', 'ton'
  UNION ALL SELECT 'Timber', 'Formwork plywood 18mm', 'sheet'
  UNION ALL SELECT 'Aggregate', 'Crushed stone 20mm', 'ton'
  UNION ALL SELECT 'Aggregate', 'River sand', 'm3'
  UNION ALL SELECT 'Masonry', 'Red clay brick', 'piece'
) AS m
JOIN categories c ON c.name = m.category;
