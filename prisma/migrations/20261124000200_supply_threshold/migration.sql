ALTER TABLE supply_items ADD COLUMN low_stock_threshold integer
  CHECK (low_stock_threshold >= 0);
