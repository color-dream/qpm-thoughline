import type {
  DocumentCanvasNode,
  DocumentEdge,
  DocumentOutput,
  DocumentTask,
  DocumentThought,
  EdgeKind,
  Progress,
  TaskStatus,
  ThoughtlineDocument,
} from "./document";
import { nowUtc } from "./document";

export type { EdgeKind, Progress, TaskStatus };
export type NodeKind = "task" | "thought" | "ai" | "free";

/** UI view of a canonical task. Persistence uses DocumentTask. */
export type Task = DocumentTask;

/** UI projection of a canonical entity onto the canvas. */
export interface GraphNode {
  id: string;
  kind: NodeKind;
  ref_id: string | null;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  collapsed: boolean;
  created_at: string;
  updated_at: string;
  text?: string;
  handled_at?: string | null;
  progress?: Progress;
}

/** UI edge view; canonical persistence uses source_node_id/target_node_id. */
export interface Edge {
  id: string;
  source_id: string;
  target_id: string;
  kind: EdgeKind;
  created_at: string;
  updated_at: string;
}

/** In-memory canvas view, never serialized as the canonical document. */
export interface GraphView {
  tasks: Task[];
  nodes: GraphNode[];
  edges: Edge[];
}

export function nodeSize(n: GraphNode): { w: number; h: number } {
  if (n.kind === "task") return { w: n.width ?? 240, h: n.height ?? 100 };
  return { w: n.width ?? 200, h: n.height ?? 88 };
}

export function centerOf(n: GraphNode): { x: number; y: number } {
  const { w, h } = nodeSize(n);
  return { x: n.x + w / 2, y: n.y + h / 2 };
}

const PROGRESSES = new Set<Progress>(["todo", "doing", "done"]);

export function isProgress(v: unknown): v is Progress {
  return typeof v === "string" && PROGRESSES.has(v as Progress);
}

export function progressOf(n: GraphNode): Progress {
  return isProgress(n.progress) ? n.progress : "todo";
}

export function withProgress(n: GraphNode, progress: Progress): GraphNode {
  const updatedAt = nowUtc();
  if (progress === "done") {
    return { ...n, progress, handled_at: n.handled_at ?? updatedAt, updated_at: updatedAt };
  }
  return { ...n, progress, updated_at: updatedAt };
}

export function viewTaskNode(task: DocumentTask, node: DocumentCanvasNode): GraphNode {
  return {
    id: node.id,
    kind: "task",
    ref_id: task.id,
    x: node.position.x,
    y: node.position.y,
    width: node.size.width,
    height: node.size.height,
    collapsed: node.collapsed,
    created_at: node.created_at,
    updated_at: node.updated_at,
  };
}

export function viewThoughtNode(thought: DocumentThought, node: DocumentCanvasNode): GraphNode {
  return {
    id: node.id,
    kind: thought.task_id ? "thought" : "free",
    ref_id: thought.task_id,
    x: node.position.x,
    y: node.position.y,
    width: node.size.width,
    height: node.size.height,
    collapsed: node.collapsed,
    created_at: node.created_at,
    updated_at: node.updated_at,
    text: thought.content,
    handled_at: thought.handled_at,
    progress: thought.progress,
  };
}

export function viewOutputNode(output: DocumentOutput, node: DocumentCanvasNode): GraphNode {
  return {
    id: node.id,
    kind: "ai",
    ref_id: output.task_id,
    x: node.position.x,
    y: node.position.y,
    width: node.size.width,
    height: node.size.height,
    collapsed: node.collapsed,
    created_at: node.created_at,
    updated_at: node.updated_at,
    text: output.content,
  };
}

export function viewEdge(edge: DocumentEdge): Edge {
  return {
    id: edge.id,
    source_id: edge.source_node_id,
    target_id: edge.target_node_id,
    kind: edge.kind,
    created_at: edge.created_at,
    updated_at: edge.updated_at,
  };
}

export function viewFromDocument(document: ThoughtlineDocument): GraphView {
  const tasksById = new Map(document.tasks.map((task) => [task.id, task]));
  const thoughtsById = new Map(document.thoughts.map((thought) => [thought.id, thought]));
  const outputsById = new Map(document.outputs.map((output) => [output.id, output]));
  const nodes = document.canvas_nodes.flatMap((node) => {
    if (node.entity_type === "task") {
      const task = tasksById.get(node.entity_id);
      return task ? [viewTaskNode(task, node)] : [];
    }
    if (node.entity_type === "thought") {
      const thought = thoughtsById.get(node.entity_id);
      return thought ? [viewThoughtNode(thought, node)] : [];
    }
    const output = outputsById.get(node.entity_id);
    return output ? [viewOutputNode(output, node)] : [];
  });
  return {
    tasks: document.tasks,
    nodes,
    edges: document.edges.map(viewEdge),
  };
}
