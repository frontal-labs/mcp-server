export interface GraphQueryOptions {
  query: string;
  variables?: Record<string, unknown>;
}

export interface CreateNodeOptions {
  type: string;
  properties: Record<string, unknown>;
}

export interface GraphNode {
  id: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: string;
}

export interface GraphQueryResponse {
  data: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  executionTime: number;
}

export interface CreateNodeResponse {
  nodeId: string;
  type: string;
  properties: Record<string, unknown>;
  created: string;
}
