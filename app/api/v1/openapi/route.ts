import { NextResponse } from "next/server";

export const runtime = "nodejs";

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Servio API",
    version: "1.0.0",
    description: "Public REST API for Servio ITSM. Authenticate with a Bearer token (Settings › API Tokens).",
  },
  servers: [{ url: "/api/v1" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
    },
    schemas: {
      Ticket: {
        type: "object",
        properties: {
          id: { type: "integer" },
          ref: { type: "string", example: "INC-0001" },
          title: { type: "string" },
          type: { type: "string", enum: ["INCIDENT", "REQUEST"] },
          status: { type: "string" },
          priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
        },
      },
      Asset: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: { type: "string" },
          status: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/tickets": {
      get: {
        summary: "List tickets",
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "priority", in: "query", schema: { type: "string" } },
          { name: "type", in: "query", schema: { type: "string" } },
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "per_page", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "A paginated list of tickets" } },
      },
      post: {
        summary: "Create a ticket",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Ticket" } } } },
        responses: { "201": { description: "Created" }, "422": { description: "Validation failed" } },
      },
    },
    "/tickets/{id}": {
      get: { summary: "Get a ticket", parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { "200": { description: "OK" }, "404": { description: "Not found" } } },
      patch: { summary: "Update a ticket", parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { "200": { description: "Updated" } } },
    },
    "/assets": {
      get: { summary: "List assets", responses: { "200": { description: "OK" } } },
      post: { summary: "Create an asset", responses: { "201": { description: "Created" } } },
    },
    "/assets/{id}": {
      get: { summary: "Get an asset", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } },
      patch: { summary: "Update an asset", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
    },
    "/services": {
      get: { summary: "List services and their status", responses: { "200": { description: "OK" } } },
    },
  },
};

export function GET() {
  return NextResponse.json(spec, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
