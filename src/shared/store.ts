import type {
  DocumentCanvasNode,
  DocumentEdge,
  DocumentOutput,
  DocumentTask,
  DocumentThought,
  Progress,
  TaskStatus,
  ThoughtlineDocument,
} from "./document";
import {
  cloneDocument,
  createEmptyDocument,
  nowUtc,
  newUuid,
  validateDocument,
} from "./document";
import type { Edge, GraphNode, GraphView, Task } from "./graph";
import { viewFromDocument } from "./graph";
import { capturedThoughtPosition, findFreeRect } from "./layout";

const DOCUMENT_KEY = "qpm-thoughtline-document";
const LAST_EXPORT_KEY = "qpm-thoughtline-last-export";

function readRawDocument(): ThoughtlineDocument | null {
  const raw = localStorage.getItem(DOCUMENT_KEY);
  if (raw === null) return null;
  return validateDocument(JSON.parse(raw) as unknown);
}

function writeRawDocument(document: ThoughtlineDocument): void {
  localStorage.setItem(DOCUMENT_KEY, JSON.stringify(validateDocument(document)));
}

function loadOrCreateDocument(): ThoughtlineDocument {
  const current = readRawDocument();
  if (current) return current;
  const empty = createEmptyDocument();
  writeRawDocument(empty);
  return empty;
}

async function mutateDocument(mutator: (document: ThoughtlineDocument) => void): Promise<ThoughtlineDocument> {
  const next = cloneDocument(loadOrCreateDocument());
  mutator(next);
  next.revision += 1;
  next.updated_at = nowUtc();
  writeRawDocument(next);
  return next;
}

export async function loadDocument(): Promise<ThoughtlineDocument> {
  return loadOrCreateDocument();
}

export async function updateDocument(
  mutator: (document: ThoughtlineDocument) => void,
): Promise<ThoughtlineDocument> {
  return mutateDocument(mutator);
}

export async function replaceDocument(document: ThoughtlineDocument): Promise<void> {
  writeRawDocument(cloneDocument(validateDocument(document)));
}

export async function loadGraph(): Promise<GraphView> {
  return viewFromDocument(await loadDocument());
}

export function markExported(): void {
  localStorage.setItem(LAST_EXPORT_KEY, nowUtc());
}

export function lastExportedAt(): string | null {
  return localStorage.getItem(LAST_EXPORT_KEY);
}

export function storageUsage(): number {
  const raw = localStorage.getItem(DOCUMENT_KEY);
  return raw ? raw.length * 2 : 0;
}

export function clearLocalData(): void {
  localStorage.removeItem(DOCUMENT_KEY);
  localStorage.removeItem(LAST_EXPORT_KEY);
}

export async function insertTask(input: {
  id: string;
  title: string;
  goal?: string;
  status?: TaskStatus;
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
}): Promise<Task> {
  const now = nowUtc();
  const task: DocumentTask = {
    id: input.id,
    title: input.title,
    goal: input.goal ?? "",
    status: input.status ?? "running",
    archived_at: input.archived_at ?? null,
    created_at: input.created_at ?? now,
    updated_at: input.updated_at ?? now,
  };
  await mutateDocument((document) => {
    document.tasks = [...document.tasks.filter((item) => item.id !== task.id), task];
  });
  return task;
}

export async function updateTaskStatus(id: string, status: TaskStatus): Promise<void> {
  await mutateDocument((document) => {
    const task = document.tasks.find((item) => item.id === id);
    if (!task) return;
    task.status = status;
    task.updated_at = nowUtc();
  });
}

export async function deleteTaskRow(id: string): Promise<void> {
  await mutateDocument((document) => {
    document.tasks = document.tasks.filter((task) => task.id !== id);
  });
}

function canvasNodeFromView(node: GraphNode): DocumentCanvasNode {
  const entityType = node.kind === "task" ? "task" : node.kind === "ai" ? "output" : "thought";
  if (!node.ref_id && entityType === "task") throw new Error("task canvas node requires a task id");
  return {
    id: node.id,
    entity_type: entityType,
    entity_id: entityType === "task" ? node.ref_id! : node.id,
    position: { x: node.x, y: node.y },
    size: {
      width: node.width ?? (entityType === "task" ? 240 : 200),
      height: node.height ?? (entityType === "task" ? 100 : 88),
    },
    collapsed: entityType === "task" ? node.collapsed : false,
    created_at: node.created_at,
    updated_at: node.updated_at,
  };
}

export async function insertNode(node: GraphNode, text?: string): Promise<void> {
  const now = nowUtc();
  const canvasNode = canvasNodeFromView(node);
  await mutateDocument((document) => {
    document.canvas_nodes = [
      ...document.canvas_nodes.filter((item) => item.id !== canvasNode.id),
      canvasNode,
    ];
    if (node.kind === "task") return;
    if (node.kind === "ai") {
      const output: DocumentOutput = {
        id: node.id,
        task_id: node.ref_id,
        content: text ?? node.text ?? "",
        created_at: node.created_at || now,
        updated_at: node.updated_at || now,
      };
      document.outputs = [...document.outputs.filter((item) => item.id !== output.id), output];
      return;
    }
    const thought: DocumentThought = {
      id: node.id,
      task_id: node.ref_id,
      content: text ?? node.text ?? "",
      progress: node.progress ?? "todo",
      handled_at: node.handled_at ?? null,
      created_at: node.created_at || now,
      updated_at: node.updated_at || now,
    };
    document.thoughts = [...document.thoughts.filter((item) => item.id !== thought.id), thought];
  });
}

function findCanvasNode(document: ThoughtlineDocument, id: string): DocumentCanvasNode | undefined {
  return document.canvas_nodes.find((node) => node.id === id);
}

export async function updateNodePos(id: string, x: number, y: number): Promise<void> {
  await mutateDocument((document) => {
    const node = findCanvasNode(document, id);
    if (!node) return;
    node.position = { x, y };
    node.updated_at = nowUtc();
  });
}

export async function updateNodeCollapsed(id: string, collapsed: boolean): Promise<void> {
  await mutateDocument((document) => {
    const node = findCanvasNode(document, id);
    if (!node) return;
    node.collapsed = node.entity_type === "task" ? collapsed : false;
    node.updated_at = nowUtc();
  });
}

export async function updateNodeText(id: string, text: string): Promise<void> {
  await mutateDocument((document) => {
    const node = findCanvasNode(document, id);
    if (!node || node.entity_type === "task") return;
    const updatedAt = nowUtc();
    if (node.entity_type === "thought") {
      const thought = document.thoughts.find((item) => item.id === node.entity_id);
      if (thought) {
        thought.content = text;
        thought.updated_at = updatedAt;
      }
    } else {
      const output = document.outputs.find((item) => item.id === node.entity_id);
      if (output) {
        output.content = text;
        output.updated_at = updatedAt;
      }
    }
  });
}

export async function updateTaskFields(id: string, fields: { title?: string; goal?: string }): Promise<void> {
  await mutateDocument((document) => {
    const task = document.tasks.find((item) => item.id === id);
    if (!task) return;
    if (fields.title !== undefined) task.title = fields.title;
    if (fields.goal !== undefined) task.goal = fields.goal;
    task.updated_at = nowUtc();
  });
}

export async function setThoughtHandled(id: string, handled: boolean): Promise<void> {
  await mutateDocument((document) => {
    const thought = document.thoughts.find((item) => item.id === id);
    if (!thought) return;
    thought.handled_at = handled ? nowUtc() : null;
    thought.updated_at = nowUtc();
  });
}

export async function updateNodeProgress(id: string, progress: Progress): Promise<void> {
  await mutateDocument((document) => {
    const thought = document.thoughts.find((item) => item.id === id);
    if (!thought) return;
    const updatedAt = nowUtc();
    thought.progress = progress;
    thought.handled_at = progress === "done" ? thought.handled_at ?? updatedAt : thought.handled_at;
    thought.updated_at = updatedAt;
  });
}

export async function setTaskArchived(id: string, archived: boolean): Promise<void> {
  await mutateDocument((document) => {
    const task = document.tasks.find((item) => item.id === id);
    if (!task) return;
    task.archived_at = archived ? nowUtc() : null;
    task.updated_at = nowUtc();
  });
}

export async function insertEdge(edge: Edge): Promise<void> {
  const now = nowUtc();
  const canonical: DocumentEdge = {
    id: edge.id,
    source_node_id: edge.source_id,
    target_node_id: edge.target_id,
    kind: edge.kind,
    created_at: edge.created_at || now,
    updated_at: edge.updated_at || now,
  };
  await mutateDocument((document) => {
    document.edges = [...document.edges.filter((item) => item.id !== canonical.id), canonical];
  });
}

export async function deleteNodes(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await mutateDocument((document) => {
    const idSet = new Set(ids);
    const removed = document.canvas_nodes.filter((node) => idSet.has(node.id));
    const thoughtIds = new Set(removed.filter((node) => node.entity_type === "thought").map((node) => node.entity_id));
    const outputIds = new Set(removed.filter((node) => node.entity_type === "output").map((node) => node.entity_id));
    document.canvas_nodes = document.canvas_nodes.filter((node) => !idSet.has(node.id));
    document.thoughts = document.thoughts.filter((thought) => !thoughtIds.has(thought.id));
    document.outputs = document.outputs.filter((output) => !outputIds.has(output.id));
    document.edges = document.edges.filter((edge) => !idSet.has(edge.source_node_id) && !idSet.has(edge.target_node_id));
  });
}

export async function deleteEdge(id: string): Promise<void> {
  await mutateDocument((document) => {
    document.edges = document.edges.filter((edge) => edge.id !== id);
  });
}

export async function saveCapturedThought(opts: {
  text: string;
  taskId: string | null;
  at?: { x: number; y: number };
}): Promise<{ nodeId: string }> {
  const snap = await loadGraph();
  const desired = opts.at ?? capturedThoughtPosition(snap.nodes, snap.edges, opts.taskId);
  const pos = findFreeRect(snap.nodes, desired);
  const now = nowUtc();
  const nodeId = newUuid();
  const taskNode = opts.taskId
    ? snap.nodes.find((node) => node.kind === "task" && node.ref_id === opts.taskId)
    : undefined;
  const edgeId = taskNode ? newUuid() : null;

  await updateDocument((document) => {
    document.thoughts.push({
      id: nodeId,
      task_id: opts.taskId,
      content: opts.text,
      progress: "todo",
      handled_at: null,
      created_at: now,
      updated_at: now,
    });
    document.canvas_nodes.push({
      id: nodeId,
      entity_type: "thought",
      entity_id: nodeId,
      position: { x: pos.x, y: pos.y },
      size: { width: 200, height: 88 },
      collapsed: false,
      created_at: now,
      updated_at: now,
    });
    if (taskNode && edgeId) {
      document.edges.push({
        id: edgeId,
        source_node_id: taskNode.id,
        target_node_id: nodeId,
        kind: "child",
        created_at: now,
        updated_at: now,
      });
    }
  });
  return { nodeId };
}

export function documentKey(): string {
  return DOCUMENT_KEY;
}
