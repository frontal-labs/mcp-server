/*
 * Copyright 2026 Frontal Labs, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
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
    name: "ontology_list_object_types",
    title: "List ontology object types",
    description: "List the object types defined in the ontology.",
    operationId: "getV1OntologyObjectsObject_types",
    inputSchema: { ...listQuery },
    map: (a) => ({ query: a }),
  },
  {
    name: "ontology_list_objects",
    title: "List ontology objects",
    description:
      "List ontology objects, optionally filtered by object type. Cursor-paginated.",
    operationId: "getV1OntologyObjectsObjects",
    inputSchema: {
      object_type_id: z.string().optional(),
      ...listQuery,
    },
    map: (a) => ({ query: a }),
  },
  {
    name: "ontology_get_object",
    title: "Get an ontology object",
    description: "Fetch a single ontology object by its id.",
    operationId: "getV1OntologyObjectsObjectsObject_id",
    inputSchema: { object_id: z.string().describe("The object id") },
    map: (a) => ({ pathParams: { object_id: a.object_id as string } }),
  },
  {
    name: "ontology_list_relationships",
    title: "List ontology relationships",
    description: "List relationships in the ontology. Cursor-paginated.",
    operationId: "getV1OntologyRelationshipsRelationships",
    inputSchema: { ...listQuery },
    map: (a) => ({ query: a }),
  },
  {
    name: "ontology_query_graph",
    title: "Query the ontology graph",
    description:
      "Run a graph query against the ontology. Pass the query specification as the body.",
    operationId: "postV1OntologyGraphGraphQuery",
    inputSchema: {
      query: z.record(z.string(), z.unknown()).describe("Graph query body"),
    },
    map: (a) => ({ body: a.query }),
  },
  {
    name: "ontology_graph_neighborhood",
    title: "Get graph neighborhood",
    description:
      "Return the neighborhood around one or more entities in the ontology graph.",
    operationId: "postV1OntologyGraphGraphNeighborhood",
    inputSchema: {
      request: z
        .record(z.string(), z.unknown())
        .describe("Neighborhood request body (entity ids, depth, etc.)"),
    },
    map: (a) => ({ body: a.request }),
  },
  {
    name: "ontology_graph_path",
    title: "Find a graph path",
    description:
      "Find a path between entities in the ontology graph. Pass source/target and options as the body.",
    operationId: "postV1OntologyGraphGraphPath",
    inputSchema: {
      request: z.record(z.string(), z.unknown()).describe("Path request body"),
    },
    map: (a) => ({ body: a.request }),
  },
  {
    name: "ontology_extract_entities",
    title: "Extract entities from text",
    description:
      "Run semantic entity extraction over text using the ontology extract service.",
    operationId: "postV1OntologyExtractExtractEntities",
    inputSchema: {
      request: z
        .record(z.string(), z.unknown())
        .describe("Extraction request body (e.g. { text, ... })"),
    },
    map: (a) => ({ body: a.request }),
  },
  {
    name: "ontology_list_schemas",
    title: "List ontology schemas",
    description: "List ontology schemas.",
    operationId: "getV1OntologySchemasSchemas",
    inputSchema: { ...listQuery },
    map: (a) => ({ query: a }),
  },
  {
    name: "ontology_get_schema",
    title: "Get an ontology schema",
    description: "Fetch a single ontology schema by id.",
    operationId: "getV1OntologySchemasSchemasSchema_id",
    inputSchema: { schema_id: z.string().describe("The schema id") },
    map: (a) => ({ pathParams: { schema_id: a.schema_id as string } }),
  },
];

/** Curated tools for the ontology / knowledge-graph surface. */
export class OntologyAdapter implements ServiceAdapter {
  name = "ontology";
  toolset = "ontology" as const;

  register(server: McpServer, ctx: AdapterContext): void {
    for (const tool of TOOLS) {
      registerCuratedTool(server, ctx, tool);
    }
  }
}
