ALTER TABLE menu_items ADD COLUMN price REAL;
UPDATE menu_items SET price = price_vnd / 1000.0;
