ALTER TABLE attendance_change_requests
  DROP CONSTRAINT IF EXISTS attendance_change_requests_kind_check;

ALTER TABLE attendance_change_requests
  ADD CONSTRAINT attendance_change_requests_kind_check
  CHECK (kind IN ('create_workday', 'edit_workday', 'modify', 'delete', 'delete_workday'));
