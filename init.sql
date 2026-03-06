-- create table
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    external_id UUID NOT NULL UNIQUE,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- create index
CREATE INDEX idx_orders_external_id ON orders(external_id);
CREATE INDEX idx_orders_created_at ON orders(created_at);