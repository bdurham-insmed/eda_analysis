CREATE TABLE IF NOT EXISTS pipelines (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    start_time TIMESTAMP,
    end_time TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pipelines_status ON pipelines(status);

CREATE TABLE IF NOT EXISTS pipeline_steps (
    id SERIAL PRIMARY KEY,
    pipeline_id UUID REFERENCES pipelines(id) DEFERRABLE INITIALLY DEFERRED,
    step_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'PENDING',
    start_time TIMESTAMP,
    end_time TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pipeline_steps_pipeline_id ON pipeline_steps(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_status ON pipeline_steps(status);

CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    pipeline_id UUID REFERENCES pipelines(id) DEFERRABLE INITIALLY DEFERRED,
    event_type VARCHAR(50),
    timestamp TIMESTAMP,
    payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_events_pipeline_id ON events(pipeline_id);

CREATE TABLE IF NOT EXISTS workflow_parameters (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    type VARCHAR(50) CHECK (type IN ('string', 'number', 'select', 'boolean', 'file')) NOT NULL,
    description TEXT,
    options TEXT[] CHECK ((type = 'select' AND options IS NOT NULL) OR (type <> 'select' AND options IS NULL)),
    required BOOLEAN DEFAULT FALSE,
    default_value TEXT CHECK (options IS NULL OR default_value = ANY(options))
);

CREATE TABLE IF NOT EXISTS workflows (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS workflow_parameters_map (
    workflow_id INTEGER REFERENCES workflows(id) ON DELETE CASCADE,
    parameter_id INTEGER REFERENCES workflow_parameters(id) ON DELETE CASCADE,
    PRIMARY KEY (workflow_id, parameter_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_parameters_map_workflow_id ON workflow_parameters_map(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_parameters_map_parameter_id ON workflow_parameters_map(parameter_id);

CREATE TABLE IF NOT EXISTS workflow_steps (
    id SERIAL PRIMARY KEY,
    workflow_id INTEGER REFERENCES workflows(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    step_name VARCHAR(255) NOT NULL,
    step_type VARCHAR(50) NOT NULL CHECK (step_type IN ('processing', 'analysis', 'reporting'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_id ON workflow_steps(workflow_id);
