export interface InvokeOptions {
  name: string;
  payload: Record<string, unknown>;
  invokeAsync?: boolean;
}

export interface ListFunctionsOptions {
  status?: "active" | "inactive" | "all";
}

export interface FunctionInfo {
  id: string;
  name: string;
  status: string;
  runtime: string;
  memory: number;
  timeout: number;
  created: string;
}

export interface InvokeResponse {
  functionId: string;
  name: string;
  status: "pending" | "completed";
  result: unknown;
  executionTime?: number;
  logs: string[];
}

export interface ListFunctionsResponse {
  functions: FunctionInfo[];
}
