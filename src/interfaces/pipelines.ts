export interface CreatePipelineOptions {
  name: string;
  description: string;
  steps: Record<string, unknown>[];
}

export interface RunPipelineOptions {
  pipelineId: string;
  input?: Record<string, unknown>;
}

export interface PipelineInfo {
  pipelineId: string;
  name: string;
  description: string;
  steps: Record<string, unknown>[];
  status: string;
  created: string;
}

export interface RunPipelineResponse {
  runId: string;
  pipelineId: string;
  status: string;
  started: string;
  input: Record<string, unknown>;
}
