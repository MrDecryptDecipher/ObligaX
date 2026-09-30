-- ObligaX PostgreSQL Database Initialization
-- Authoritative schema for Projections, Idempotency, Outbox, and Cryptographic Audit

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenant and Principal Isolation
CREATE TABLE IF NOT EXISTS tenants (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tenants (id, name) VALUES ('OBLIGAX', 'ObligaX Institutional Network') ON CONFLICT DO NOTHING;
INSERT INTO tenants (id, name) VALUES ('TENANT_BANKA', 'Bank A Global Markets') ON CONFLICT DO NOTHING;
INSERT INTO tenants (id, name) VALUES ('TENANT_BANKB', 'Bank B Treasury Operations') ON CONFLICT DO NOTHING;
INSERT INTO tenants (id, name) VALUES ('TENANT_BANKC', 'Bank C Institutional Custody') ON CONFLICT DO NOTHING;

-- Exact-Once Durable Idempotency
CREATE TABLE IF NOT EXISTS idempotency_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'OBLIGAX',
    key VARCHAR(255) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(16) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    status_code INTEGER,
    response_headers JSONB,
    response_body JSONB,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    trace_id VARCHAR(64),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_idempotency_key_endpoint UNIQUE (tenant_id, key, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_key ON idempotency_records(key);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_records(expires_at);

-- Tamper-Evident Chained Audit Trail
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sequence_number BIGSERIAL,
    event_id VARCHAR(64) NOT NULL UNIQUE,
    previous_hash VARCHAR(64) NOT NULL,
    current_hash VARCHAR(64) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    schema_version INTEGER DEFAULT 1,
    trace_id VARCHAR(64) NOT NULL,
    actor VARCHAR(255) NOT NULL,
    party_id VARCHAR(255),
    tenant_id VARCHAR(64) DEFAULT 'OBLIGAX',
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(255) NOT NULL,
    contract_id VARCHAR(255),
    transaction_id VARCHAR(255),
    canonical_payload JSONB,
    payload_before JSONB,
    payload_after JSONB,
    classification VARCHAR(32) DEFAULT 'CONFIDENTIAL',
    ip_address VARCHAR(45),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_events(resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_trace ON audit_events(trace_id);
CREATE INDEX IF NOT EXISTS idx_audit_seq ON audit_events(sequence_number);

-- Transactional Outbox
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'OBLIGAX',
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    topic VARCHAR(128) NOT NULL,
    partition_key VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL,
    trace_id VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status) WHERE status = 'PENDING';

-- Canton Ledger Offset Tracking
CREATE TABLE IF NOT EXISTS canton_offset_checkpoints (
    subscriber_id VARCHAR(64) PRIMARY KEY,
    last_offset VARCHAR(128) NOT NULL,
    last_transaction_id VARCHAR(128),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Participant Daily Exposure Limits
CREATE TABLE IF NOT EXISTS daily_exposures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    party_id VARCHAR(255) NOT NULL,
    exposure_date DATE NOT NULL,
    daily_gross_volume NUMERIC(28, 10) DEFAULT 0,
    daily_net_exposure NUMERIC(28, 10) DEFAULT 0,
    daily_settlement_volume NUMERIC(28, 10) DEFAULT 0,
    maximum_daily_gross_volume NUMERIC(28, 10) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_party_daily_exposure UNIQUE (party_id, exposure_date)
);
