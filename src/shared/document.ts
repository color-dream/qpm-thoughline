export const DOCUMENT_FORMAT = "qpm-thoughtline-document" as const;
export const DOCUMENT_SCHEMA_VERSION = 1 as const;

export type TaskStatus = "draft" | "running" | "waiting_review" | "done" | "cancelled";
export type Progress = "todo" | "doing" | "done";
export type EntityType = "task" | "thought" | "output";
export type EdgeKind = "child" | "related" | "sequence";

export interface DocumentTask {
  id: string;
  title: string;
  goal: string;
  status: TaskStatus;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentThought {
  id: string;
  task_id: string | null;
  content: string;
  progress: Progress;
  handled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentOutput {
  id: string;
  task_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CanvasPosition {
  x: number;
  y: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface DocumentCanvasNode {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  position: CanvasPosition;
  size: CanvasSize;
  collapsed: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  kind: EdgeKind;
  created_at: string;
  updated_at: string;
}

export interface ThoughtlineDocument {
  format: typeof DOCUMENT_FORMAT;
  schema_version: typeof DOCUMENT_SCHEMA_VERSION;
  document_id: string;
  revision: number;
  created_at: string;
  updated_at: string;
  tasks: DocumentTask[];
  thoughts: DocumentThought[];
  outputs: DocumentOutput[];
  canvas_nodes: DocumentCanvasNode[];
  edges: DocumentEdge[];
}

export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentValidationError";
  }
}

const TASK_STATUSES = new Set<TaskStatus>([
  "draft",
  "running",
  "waiting_review",
  "done",
  "cancelled",
]);
const PROGRESSES = new Set<Progress>(["todo", "doing", "done"]);
const ENTITY_TYPES = new Set<EntityType>(["task", "thought", "output"]);
const EDGE_KINDS = new Set<EdgeKind>(["child", "related", "sequence"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const allowed = new Set(expected);
  const actual = Object.keys(value);
  if (actual.length !== expected.length || actual.some((key) => !allowed.has(key))) {
    throw new DocumentValidationError(`${label} contains unknown or missing fields`);
  }
}

function requireString(value: unknown, label: string, nonEmpty = true): string {
  if (typeof value !== "string" || (nonEmpty && value.length === 0)) {
    throw new DocumentValidationError(`${label} must be a ${nonEmpty ? "non-empty " : ""}string`);
  }
  return value;
}

function requireUuid(value: unknown, label: string): string {
  const id = requireString(value, label);
  if (!UUID_RE.test(id)) throw new DocumentValidationError(`${label} must be a UUID v4`);
  return id;
}

function requireTimestamp(value: unknown, label: string): string {
  const timestamp = requireString(value, label);
  if (!UTC_RFC3339_RE.test(timestamp) || Number.isNaN(Date.parse(timestamp))) {
    throw new DocumentValidationError(`${label} must be an RFC3339 UTC timestamp with milliseconds`);
  }
  return timestamp;
}

function requireNullableTimestamp(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requireTimestamp(value, label);
}

function requireFinitePositive(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new DocumentValidationError(`${label} must be a finite positive number`);
  }
  return value;
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DocumentValidationError(`${label} must be a finite number`);
  }
  return value;
}

function ensureUnique(ids: string[], label: string): void {
  if (new Set(ids).size !== ids.length) throw new DocumentValidationError(`${label} IDs must be unique`);
}

function validateTask(value: unknown, index: number): DocumentTask {
  const label = `tasks[${index}]`;
  if (!isRecord(value)) throw new DocumentValidationError(`${label} must be an object`);
  exactKeys(value, ["id", "title", "goal", "status", "archived_at", "created_at", "updated_at"], label);
  const status = requireString(value.status, `${label}.status`) as TaskStatus;
  if (!TASK_STATUSES.has(status)) throw new DocumentValidationError(`${label}.status is invalid`);
  return {
    id: requireUuid(value.id, `${label}.id`),
    title: requireString(value.title, `${label}.title`),
    goal: requireString(value.goal, `${label}.goal`, false),
    status,
    archived_at: requireNullableTimestamp(value.archived_at, `${label}.archived_at`),
    created_at: requireTimestamp(value.created_at, `${label}.created_at`),
    updated_at: requireTimestamp(value.updated_at, `${label}.updated_at`),
  };
}

function validateThought(value: unknown, index: number): DocumentThought {
  const label = `thoughts[${index}]`;
  if (!isRecord(value)) throw new DocumentValidationError(`${label} must be an object`);
  exactKeys(value, ["id", "task_id", "content", "progress", "handled_at", "created_at", "updated_at"], label);
  const progress = requireString(value.progress, `${label}.progress`) as Progress;
  if (!PROGRESSES.has(progress)) throw new DocumentValidationError(`${label}.progress is invalid`);
  return {
    id: requireUuid(value.id, `${label}.id`),
    task_id: value.task_id === null ? null : requireUuid(value.task_id, `${label}.task_id`),
    content: requireString(value.content, `${label}.content`, false),
    progress,
    handled_at: requireNullableTimestamp(value.handled_at, `${label}.handled_at`),
    created_at: requireTimestamp(value.created_at, `${label}.created_at`),
    updated_at: requireTimestamp(value.updated_at, `${label}.updated_at`),
  };
}

function validateOutput(value: unknown, index: number): DocumentOutput {
  const label = `outputs[${index}]`;
  if (!isRecord(value)) throw new DocumentValidationError(`${label} must be an object`);
  exactKeys(value, ["id", "task_id", "content", "created_at", "updated_at"], label);
  return {
    id: requireUuid(value.id, `${label}.id`),
    task_id: value.task_id === null ? null : requireUuid(value.task_id, `${label}.task_id`),
    content: requireString(value.content, `${label}.content`, false),
    created_at: requireTimestamp(value.created_at, `${label}.created_at`),
    updated_at: requireTimestamp(value.updated_at, `${label}.updated_at`),
  };
}

function validateCanvasNode(value: unknown, index: number): DocumentCanvasNode {
  const label = `canvas_nodes[${index}]`;
  if (!isRecord(value)) throw new DocumentValidationError(`${label} must be an object`);
  exactKeys(value, ["id", "entity_type", "entity_id", "position", "size", "collapsed", "created_at", "updated_at"], label);
  const entityType = requireString(value.entity_type, `${label}.entity_type`) as EntityType;
  if (!ENTITY_TYPES.has(entityType)) throw new DocumentValidationError(`${label}.entity_type is invalid`);
  if (!isRecord(value.position)) throw new DocumentValidationError(`${label}.position must be an object`);
  exactKeys(value.position, ["x", "y"], `${label}.position`);
  if (!isRecord(value.size)) throw new DocumentValidationError(`${label}.size must be an object`);
  exactKeys(value.size, ["width", "height"], `${label}.size`);
  if (typeof value.collapsed !== "boolean") throw new DocumentValidationError(`${label}.collapsed must be boolean`);
  if (entityType !== "task" && value.collapsed !== false) {
    throw new DocumentValidationError(`${label}.collapsed must be false for non-task nodes`);
  }
  return {
    id: requireUuid(value.id, `${label}.id`),
    entity_type: entityType,
    entity_id: requireUuid(value.entity_id, `${label}.entity_id`),
    position: {
      x: requireFiniteNumber(value.position.x, `${label}.position.x`),
      y: requireFiniteNumber(value.position.y, `${label}.position.y`),
    },
    size: {
      width: requireFinitePositive(value.size.width, `${label}.size.width`),
      height: requireFinitePositive(value.size.height, `${label}.size.height`),
    },
    collapsed: value.collapsed,
    created_at: requireTimestamp(value.created_at, `${label}.created_at`),
    updated_at: requireTimestamp(value.updated_at, `${label}.updated_at`),
  };
}

function validateEdge(value: unknown, index: number): DocumentEdge {
  const label = `edges[${index}]`;
  if (!isRecord(value)) throw new DocumentValidationError(`${label} must be an object`);
  exactKeys(value, ["id", "source_node_id", "target_node_id", "kind", "created_at", "updated_at"], label);
  const kind = requireString(value.kind, `${label}.kind`) as EdgeKind;
  if (!EDGE_KINDS.has(kind)) throw new DocumentValidationError(`${label}.kind is invalid`);
  return {
    id: requireUuid(value.id, `${label}.id`),
    source_node_id: requireUuid(value.source_node_id, `${label}.source_node_id`),
    target_node_id: requireUuid(value.target_node_id, `${label}.target_node_id`),
    kind,
    created_at: requireTimestamp(value.created_at, `${label}.created_at`),
    updated_at: requireTimestamp(value.updated_at, `${label}.updated_at`),
  };
}

export function validateDocument(value: unknown): ThoughtlineDocument {
  if (!isRecord(value)) throw new DocumentValidationError("document must be an object");
  exactKeys(
    value,
    [
      "format",
      "schema_version",
      "document_id",
      "revision",
      "created_at",
      "updated_at",
      "tasks",
      "thoughts",
      "outputs",
      "canvas_nodes",
      "edges",
    ],
    "document",
  );
  if (value.format !== DOCUMENT_FORMAT) throw new DocumentValidationError("document.format is invalid");
  if (value.schema_version !== DOCUMENT_SCHEMA_VERSION) {
    throw new DocumentValidationError("document.schema_version is unsupported");
  }
  if (typeof value.revision !== "number" || !Number.isInteger(value.revision) || value.revision < 0) {
    throw new DocumentValidationError("document.revision must be a non-negative integer");
  }
  const documentId = requireUuid(value.document_id, "document.document_id");
  const createdAt = requireTimestamp(value.created_at, "document.created_at");
  const updatedAt = requireTimestamp(value.updated_at, "document.updated_at");
  if (!Array.isArray(value.tasks) || !Array.isArray(value.thoughts) || !Array.isArray(value.outputs) || !Array.isArray(value.canvas_nodes) || !Array.isArray(value.edges)) {
    throw new DocumentValidationError("document collections must be arrays");
  }

  const tasks = value.tasks.map(validateTask);
  const thoughts = value.thoughts.map(validateThought);
  const outputs = value.outputs.map(validateOutput);
  const canvasNodes = value.canvas_nodes.map(validateCanvasNode);
  const edges = value.edges.map(validateEdge);

  ensureUnique(tasks.map((item) => item.id), "task");
  ensureUnique(thoughts.map((item) => item.id), "thought");
  ensureUnique(outputs.map((item) => item.id), "output");
  ensureUnique(canvasNodes.map((item) => item.id), "canvas node");
  ensureUnique(edges.map((item) => item.id), "edge");

  const taskIds = new Set(tasks.map((item) => item.id));
  for (const thought of thoughts) {
    if (thought.task_id !== null && !taskIds.has(thought.task_id)) {
      throw new DocumentValidationError(`thought ${thought.id} references an unknown task`);
    }
  }
  for (const output of outputs) {
    if (output.task_id !== null && !taskIds.has(output.task_id)) {
      throw new DocumentValidationError(`output ${output.id} references an unknown task`);
    }
  }

  const entityIds = new Set<string>();
  for (const node of canvasNodes) {
    const entitySet = node.entity_type === "task" ? taskIds : node.entity_type === "thought" ? new Set(thoughts.map((item) => item.id)) : new Set(outputs.map((item) => item.id));
    if (!entitySet.has(node.entity_id)) throw new DocumentValidationError(`canvas node ${node.id} references an unknown entity`);
    if (entityIds.has(`${node.entity_type}:${node.entity_id}`)) {
      throw new DocumentValidationError(`${node.entity_type} entity ${node.entity_id} has duplicate canvas projections`);
    }
    entityIds.add(`${node.entity_type}:${node.entity_id}`);
  }

  const canvasNodeIds = new Set(canvasNodes.map((item) => item.id));
  const canvasById = new Map(canvasNodes.map((item) => [item.id, item]));
  const edgeKeys = new Set<string>();
  for (const edge of edges) {
    if (!canvasNodeIds.has(edge.source_node_id) || !canvasNodeIds.has(edge.target_node_id)) {
      throw new DocumentValidationError(`edge ${edge.id} references an unknown canvas node`);
    }
    if (edge.source_node_id === edge.target_node_id) throw new DocumentValidationError(`edge ${edge.id} cannot be a self-loop`);
    const key = `${edge.kind}:${edge.source_node_id}:${edge.target_node_id}`;
    if (edgeKeys.has(key)) throw new DocumentValidationError(`duplicate edge endpoints for ${key}`);
    edgeKeys.add(key);
    if (edge.kind === "child") {
      const source = canvasById.get(edge.source_node_id)!;
      const target = canvasById.get(edge.target_node_id)!;
      if (source.entity_type !== "task" || (target.entity_type !== "thought" && target.entity_type !== "output")) {
        throw new DocumentValidationError(`child edge ${edge.id} has invalid entity types`);
      }
    }
  }

  return {
    format: DOCUMENT_FORMAT,
    schema_version: DOCUMENT_SCHEMA_VERSION,
    document_id: documentId,
    revision: value.revision,
    created_at: createdAt,
    updated_at: updatedAt,
    tasks,
    thoughts,
    outputs,
    canvas_nodes: canvasNodes,
    edges,
  };
}

export function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function nowUtc(): string {
  return new Date().toISOString();
}

export function createEmptyDocument(now = nowUtc()): ThoughtlineDocument {
  return {
    format: DOCUMENT_FORMAT,
    schema_version: DOCUMENT_SCHEMA_VERSION,
    document_id: newUuid(),
    revision: 0,
    created_at: now,
    updated_at: now,
    tasks: [],
    thoughts: [],
    outputs: [],
    canvas_nodes: [],
    edges: [],
  };
}

export function cloneDocument(document: ThoughtlineDocument): ThoughtlineDocument {
  return JSON.parse(JSON.stringify(document)) as ThoughtlineDocument;
}
