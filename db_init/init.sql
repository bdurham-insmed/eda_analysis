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
    end_time TIMESTAMP,
    step_order INTEGER,
    step_type VARCHAR(50) CHECK (step_type IS NULL OR step_type IN ('processing','analysis','reporting'))
);

CREATE INDEX IF NOT EXISTS idx_pipeline_steps_pipeline_id ON pipeline_steps(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_status ON pipeline_steps(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_order ON pipeline_steps(pipeline_id, step_order);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pipeline_steps_pipeline_step
    ON pipeline_steps (pipeline_id, step_name);

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
    default_value TEXT CHECK (options IS NULL OR default_value = ANY(options)),
    archived_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_parameters_active
    ON workflow_parameters(id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS workflows (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    archived_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    revision INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_workflows_active
    ON workflows(id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS workflow_versions (
    id SERIAL PRIMARY KEY,
    workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    version_label VARCHAR(64),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    description TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP,
    archived_at TIMESTAMP,
    UNIQUE (workflow_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow_id ON workflow_versions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_active
    ON workflow_versions(workflow_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_workflow_versions_published
    ON workflow_versions(workflow_id) WHERE status = 'published' AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS workflow_version_parameters (
    workflow_version_id INTEGER REFERENCES workflow_versions(id) ON DELETE CASCADE,
    parameter_id INTEGER REFERENCES workflow_parameters(id) ON DELETE CASCADE,
    PRIMARY KEY (workflow_version_id, parameter_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_version_parameters_version
    ON workflow_version_parameters(workflow_version_id);
CREATE INDEX IF NOT EXISTS idx_workflow_version_parameters_param
    ON workflow_version_parameters(parameter_id);

CREATE TABLE IF NOT EXISTS workflow_version_steps (
    id SERIAL PRIMARY KEY,
    workflow_version_id INTEGER REFERENCES workflow_versions(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    step_name VARCHAR(255) NOT NULL,
    step_type VARCHAR(50) NOT NULL CHECK (step_type IN ('processing', 'analysis', 'reporting'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_version_steps_version
    ON workflow_version_steps(workflow_version_id);

ALTER TABLE pipelines
    ADD COLUMN IF NOT EXISTS workflow_id INTEGER REFERENCES workflows(id) ON DELETE SET NULL;
ALTER TABLE pipelines
    ADD COLUMN IF NOT EXISTS workflow_version_id INTEGER REFERENCES workflow_versions(id) ON DELETE SET NULL;
ALTER TABLE pipelines
    ADD COLUMN IF NOT EXISTS parameter_values JSONB;

CREATE INDEX IF NOT EXISTS idx_pipelines_workflow_id ON pipelines(workflow_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_workflow_version_id ON pipelines(workflow_version_id);
