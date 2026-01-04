CREATE TABLE IF NOT EXISTS pipelines (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    start_time TIMESTAMP,
    end_time TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pipeline_steps (
    id SERIAL PRIMARY KEY,
    pipeline_id UUID REFERENCES pipelines(id) DEFERRABLE INITIALLY DEFERRED,
    step_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'PENDING',
    start_time TIMESTAMP,
    end_time TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    pipeline_id UUID REFERENCES pipelines(id) DEFERRABLE INITIALLY DEFERRED,
    event_type VARCHAR(50),
    timestamp TIMESTAMP,
    payload JSONB
);

-- CREATE TABLE IF NOT EXISTS workflows (
--     id UUID PRIMARY KEY,
--     name VARCHAR(255) NOT NULL,
--     description TEXT,
--     parameters_id SERIAL REFERENCES workflow_parameters(id)
-- );
--
-- CREATE TABLE IF NOT EXISTS workflow_parameters (
--     id SERIAL PRIMARY KEY,
--     name VARCHAR(255) NOT NULL,
--     type VARCHAR(50) NOT NULL,
--     description TEXT,
--     options TEXT[],
--     default_value TEXT
-- );