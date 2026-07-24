import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type CuratedToolDef, registerCuratedTool } from "./curated.js";
import type { AdapterContext, ServiceAdapter } from "./types.js";

const listQuery = {
  limit: z.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
};

const TOOLS: CuratedToolDef[] = [
  {
    name: "data_query_federated",
    title: "Run a federated data query",
    description:
      "Execute a federated query across the data platform. Pass the query specification as the body.",
    operationId: "postV1DataQueryQueryFederated",
    inputSchema: {
      query: z.record(z.string(), z.unknown()).describe("Federated query body"),
    },
    map: (a) => ({ body: a.query }),
  },
  {
    name: "data_list_datasets",
    title: "List catalog datasets",
    description: "List datasets in the data catalog. Cursor-paginated.",
    operationId: "getV1DataCatalogCatalogDatasets",
    inputSchema: { ...listQuery },
    map: (a) => ({ query: a }),
  },
  {
    name: "data_get_dataset",
    title: "Get a catalog dataset",
    description: "Fetch a single catalog dataset by id.",
    operationId: "getV1DataCatalogCatalogDatasetsDataset_id",
    inputSchema: { dataset_id: z.string().describe("The dataset id") },
    map: (a) => ({ pathParams: { dataset_id: a.dataset_id as string } }),
  },
  {
    name: "data_list_pipelines",
    title: "List data pipelines",
    description: "List pipeline definitions. Cursor-paginated.",
    operationId: "getV1DataPipelinesPipelines",
    inputSchema: { ...listQuery },
    map: (a) => ({ query: a }),
  },
  {
    name: "data_create_pipeline",
    title: "Create a data pipeline",
    description:
      "Create a new pipeline definition. Pass the pipeline definition as the body.",
    operationId: "postV1DataPipelinesPipelines",
    inputSchema: {
      definition: z
        .record(z.string(), z.unknown())
        .describe("Pipeline definition body"),
    },
    map: (a) => ({ body: a.definition }),
  },
  {
    name: "data_get_pipeline",
    title: "Get a data pipeline",
    description: "Fetch a single pipeline definition by id.",
    operationId: "getV1DataPipelinesPipelinesDefinition_id",
    inputSchema: {
      definition_id: z.string().describe("The pipeline definition id"),
    },
    map: (a) => ({ pathParams: { definition_id: a.definition_id as string } }),
  },
  {
    name: "data_list_pipeline_runs",
    title: "List pipeline runs",
    description: "List pipeline runs. Cursor-paginated.",
    operationId: "getV1DataPipelinesPipeline_runs",
    inputSchema: { ...listQuery },
    map: (a) => ({ query: a }),
  },
  {
    name: "data_get_pipeline_run",
    title: "Get a pipeline run",
    description: "Fetch a single pipeline run by id.",
    operationId: "getV1DataPipelinesPipeline_runsRun_id",
    inputSchema: { run_id: z.string().describe("The pipeline run id") },
    map: (a) => ({ pathParams: { run_id: a.run_id as string } }),
  },
  {
    name: "data_ingest_dataset",
    title: "Ingest a dataset",
    description:
      "Ingest data into a dataset. Pass the ingest request as the body.",
    operationId: "postV1DataIngestDatasetsIngest",
    inputSchema: {
      request: z
        .record(z.string(), z.unknown())
        .describe("Ingest request body"),
    },
    map: (a) => ({ body: a.request }),
  },
  {
    name: "data_list_streams",
    title: "List data streams",
    description: "List data streams. Cursor-paginated.",
    operationId: "getV1DataStreamsStreams",
    inputSchema: { ...listQuery },
    map: (a) => ({ query: a }),
  },
  {
    name: "data_list_schemas",
    title: "List data schemas",
    description: "List data schemas.",
    operationId: "getV1DataSchemasSchemas",
    inputSchema: { ...listQuery },
    map: (a) => ({ query: a }),
  },
];

/** Curated tools for the data platform surface. */
export class DataAdapter implements ServiceAdapter {
  name = "data";
  toolset = "data" as const;

  register(server: McpServer, ctx: AdapterContext): void {
    for (const tool of TOOLS) {
      registerCuratedTool(server, ctx, tool);
    }
  }
}
