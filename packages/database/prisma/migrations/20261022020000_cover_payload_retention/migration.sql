-- Metadata remains durable when an image payload is explicitly removed or expires.
ALTER TABLE cover_generation_items ADD COLUMN payload_expired_at TIMESTAMP(3);
ALTER TABLE novel_cover_versions ADD COLUMN payload_expired_at TIMESTAMP(3);
