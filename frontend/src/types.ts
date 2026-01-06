export type Workflow = {
  id: string;
  name: string;
  description?: string;
  parameters: Parameter[];
};

type Parameter = {
  name: string;
  type: string;
  required?: boolean;
  options?: string[];
  default?: string;
  description?: string;
};


type Step = {
  name: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
};

export type Pipeline = {
  id: string;
  name: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  steps?: Step[];
};

export type WebSocketUpdate = {
  pipeline_id: string;
  name: string;
  status: string;
  event_type: string;
  step_name?: string;
  timestamp: number;
};
