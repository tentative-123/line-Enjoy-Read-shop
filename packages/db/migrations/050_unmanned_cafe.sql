-- Migration 050: Enjoy Read unmanned cafe (additive; UTC timestamps are supplied by Worker)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS venues (
 id TEXT PRIMARY KEY, line_account_id TEXT NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
 description TEXT, address TEXT, timezone TEXT NOT NULL DEFAULT 'Asia/Taipei', is_active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(line_account_id) REFERENCES line_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_venues_account_active ON venues(line_account_id,is_active);

CREATE TABLE IF NOT EXISTS spaces (
 id TEXT PRIMARY KEY, venue_id TEXT NOT NULL, name TEXT NOT NULL, code TEXT NOT NULL, description TEXT,
 booking_mode TEXT NOT NULL CHECK(booking_mode IN ('capacity_pool','assigned_unit')), capacity_total INTEGER NOT NULL CHECK(capacity_total>0),
 slot_interval_minutes INTEGER NOT NULL DEFAULT 30, minimum_duration_minutes INTEGER NOT NULL DEFAULT 60,
 maximum_duration_minutes INTEGER NOT NULL DEFAULT 480, buffer_before_minutes INTEGER NOT NULL DEFAULT 0,
 buffer_after_minutes INTEGER NOT NULL DEFAULT 0, advance_booking_minutes INTEGER NOT NULL DEFAULT 60,
 max_advance_days INTEGER NOT NULL DEFAULT 30, cancel_before_minutes INTEGER NOT NULL DEFAULT 2880,
 early_entry_minutes INTEGER NOT NULL DEFAULT 5, late_exit_minutes INTEGER NOT NULL DEFAULT 5,
 qr_display_before_minutes INTEGER NOT NULL DEFAULT 30, base_price INTEGER NOT NULL DEFAULT 0,
 currency TEXT NOT NULL DEFAULT 'TWD', sort_order INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(venue_id,code), FOREIGN KEY(venue_id) REFERENCES venues(id)
);
CREATE INDEX IF NOT EXISTS idx_spaces_venue_active ON spaces(venue_id,is_active,sort_order);

CREATE TABLE IF NOT EXISTS space_units (
 id TEXT PRIMARY KEY, space_id TEXT NOT NULL, code TEXT NOT NULL, display_name TEXT NOT NULL,
 is_selectable INTEGER NOT NULL DEFAULT 1, capacity INTEGER NOT NULL DEFAULT 1,
 sort_order INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(space_id,code), FOREIGN KEY(space_id) REFERENCES spaces(id)
);
CREATE TABLE IF NOT EXISTS space_opening_hours (
 id TEXT PRIMARY KEY, space_id TEXT NOT NULL, day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
 start_time TEXT NOT NULL, end_time TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1,
 UNIQUE(space_id,day_of_week,start_time), FOREIGN KEY(space_id) REFERENCES spaces(id)
);
CREATE TABLE IF NOT EXISTS space_blackouts (
 id TEXT PRIMARY KEY, space_id TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 reason TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL, FOREIGN KEY(space_id) REFERENCES spaces(id)
);
CREATE INDEX IF NOT EXISTS idx_blackouts_overlap ON space_blackouts(space_id,starts_at,ends_at);

CREATE TABLE IF NOT EXISTS cafe_bookings (
 id TEXT PRIMARY KEY, booking_code TEXT NOT NULL UNIQUE, line_account_id TEXT NOT NULL, friend_id TEXT NOT NULL,
 venue_id TEXT NOT NULL, space_id TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity>0), status TEXT NOT NULL CHECK(status IN ('holding','pending_payment','confirmed','cancelled','expired','checked_in','completed','no_show','rejected')),
 hold_expires_at TEXT, payment_status TEXT NOT NULL CHECK(payment_status IN ('not_required','pending','paid','failed','refunded','partially_refunded')),
 payment_provider TEXT, payment_transaction_id TEXT, price_at_booking INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'TWD',
 customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, customer_note TEXT, internal_note TEXT,
 terms_version TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'liff', confirmed_at TEXT, cancelled_at TEXT,
 checked_in_at TEXT, checked_out_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(line_account_id) REFERENCES line_accounts(id), FOREIGN KEY(friend_id) REFERENCES friends(id),
 FOREIGN KEY(venue_id) REFERENCES venues(id), FOREIGN KEY(space_id) REFERENCES spaces(id)
);
CREATE INDEX IF NOT EXISTS idx_cafe_bookings_space_time ON cafe_bookings(space_id,starts_at,ends_at,status);
CREATE INDEX IF NOT EXISTS idx_cafe_bookings_owner ON cafe_bookings(friend_id,starts_at DESC);

CREATE TABLE IF NOT EXISTS booking_unit_allocations (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, space_unit_id TEXT NOT NULL, slot_start TEXT NOT NULL, slot_end TEXT NOT NULL,
 allocation_status TEXT NOT NULL CHECK(allocation_status IN ('held','reserved','released','expired')),
 expires_at TEXT, created_at TEXT NOT NULL, FOREIGN KEY(booking_id) REFERENCES cafe_bookings(id), FOREIGN KEY(space_unit_id) REFERENCES space_units(id)
);
-- Active rows retain the key; cancellation/expiry changes status and deletes allocations in one D1 batch.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_unit_slot ON booking_unit_allocations(space_unit_id,slot_start)
 WHERE allocation_status IN ('held','reserved');
CREATE INDEX IF NOT EXISTS idx_alloc_booking ON booking_unit_allocations(booking_id);

CREATE TABLE IF NOT EXISTS booking_events (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, event_type TEXT NOT NULL, actor_type TEXT NOT NULL,
 actor_id TEXT, from_status TEXT, to_status TEXT, metadata TEXT, created_at TEXT NOT NULL,
 FOREIGN KEY(booking_id) REFERENCES cafe_bookings(id)
);
CREATE INDEX IF NOT EXISTS idx_booking_events_booking ON booking_events(booking_id,created_at);
CREATE TABLE IF NOT EXISTS cafe_idempotency_keys (
 key TEXT NOT NULL, friend_id TEXT NOT NULL, request_hash TEXT NOT NULL, response_status INTEGER,
 response_body TEXT, booking_id TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, PRIMARY KEY(key,friend_id)
);

CREATE TABLE IF NOT EXISTS access_credentials (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, credential_type TEXT NOT NULL DEFAULT 'qr', token_hash TEXT NOT NULL,
 jti TEXT NOT NULL UNIQUE, valid_from TEXT NOT NULL, valid_until TEXT NOT NULL, max_uses INTEGER NOT NULL DEFAULT 1,
 used_count INTEGER NOT NULL DEFAULT 0, revoked_at TEXT, created_at TEXT NOT NULL, FOREIGN KEY(booking_id) REFERENCES cafe_bookings(id)
);
CREATE TABLE IF NOT EXISTS gate_devices (
 id TEXT PRIMARY KEY, venue_id TEXT NOT NULL, name TEXT NOT NULL, device_code TEXT NOT NULL UNIQUE,
 device_key_hash TEXT NOT NULL, provider TEXT NOT NULL DEFAULT 'mock', is_active INTEGER NOT NULL DEFAULT 1,
 last_seen_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(venue_id) REFERENCES venues(id)
);
CREATE TABLE IF NOT EXISTS access_events (
 id TEXT PRIMARY KEY, booking_id TEXT, credential_id TEXT, gate_device_id TEXT, result TEXT NOT NULL,
 reason TEXT NOT NULL, ip_address TEXT, metadata TEXT, scanned_at TEXT NOT NULL,
 FOREIGN KEY(booking_id) REFERENCES cafe_bookings(id), FOREIGN KEY(credential_id) REFERENCES access_credentials(id),
 FOREIGN KEY(gate_device_id) REFERENCES gate_devices(id)
);
CREATE INDEX IF NOT EXISTS idx_access_events_device_time ON access_events(gate_device_id,scanned_at DESC);
CREATE TABLE IF NOT EXISTS cafe_notification_jobs (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, kind TEXT NOT NULL, scheduled_at TEXT NOT NULL, sent_at TEXT,
 status TEXT NOT NULL DEFAULT 'pending', retry_count INTEGER NOT NULL DEFAULT 0, last_error TEXT,
 FOREIGN KEY(booking_id) REFERENCES cafe_bookings(id), UNIQUE(booking_id,kind)
);
CREATE INDEX IF NOT EXISTS idx_cafe_notifications_due ON cafe_notification_jobs(status,scheduled_at);
CREATE TABLE IF NOT EXISTS cafe_audit_logs (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, actor_role TEXT NOT NULL, action TEXT NOT NULL,
 resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, before_json TEXT, after_json TEXT,
 ip_address TEXT, request_id TEXT, created_at TEXT NOT NULL
);
