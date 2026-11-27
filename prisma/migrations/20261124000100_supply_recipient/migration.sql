ALTER TABLE supply_transactions ADD COLUMN recipient_staff_id integer
  REFERENCES staff(staff_id) ON DELETE RESTRICT ON UPDATE CASCADE;
