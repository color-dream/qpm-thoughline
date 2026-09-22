export type NodeKind = "task" | "thought" | "ai" | "free";
export type EdgeKind = "child" | "related" | "sequence";
export type TaskStatus = "draft" | "running" | "waiting_review" | "done" | "cancelled";
/** manual progress marker on idea-like nodes; absent = unmarked */
export type Progress = "todo" | "doing" | "done";

export interface Task {
  id: string;
  title: string;
  goal: string;
  status: TaskStatus;
  source: string;
  created_at: string;
  updated_at: string;
  meta: Record<string, unknown>;
}

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
  /** joined content for thought/ai/free */
  text?: string;
  title?: string;
  pending?: boolean;
  /** idea consumed via feed-to-AI; excluded from pending counts */
  handled_at?: string | null;
  /** manual progress marker; absent = unmarked (neutral look) */
  progress?: Progress;
}

export interface Edge {
  id: string;
  source_id: string;
  target_id: string;
  kind: EdgeKind;
  created_at: string;
}

export interface GraphSnapshot {
  tasks: Task[];
  nodes: GraphNode[];
  edges: Edge[];
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function nodeSize(n: GraphNode): { w: number; h: number } {
  if (n.kind === "task") return { w: 240, h: 100 };
  return { w: n.width ?? 200, h: n.height ?? 88 };
}

export function centerOf(n: GraphNode): { x: number; y: number } {
  const { w, h } = nodeSize(n);
  return { x: n.x + w / 2, y: n.y + h / 2 };
}

const PROGRESSES = new Set(["todo", "doing", "done"]);

export function isProgress(v: unknown): v is Progress {
  return typeof v === "string" && PROGRESSES.has(v);
}

/** every idea card is at least 待开始; unmarked data reads as todo (zero migration) */
export function progressOf(n: GraphNode): Progress {
  return isProgress(n.progress) ? n.progress : "todo";
}

/** read progress out of a thoughts.meta JSON payload */
export function progressFromMeta(meta: unknown): Progress | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const p = (meta as Record<string, unknown>).progress;
  return isProgress(p) ? p : undefined;
}

/**
 * Progress change as a new node record. done implies handled (drops out of
 * pending counts); going back to todo/doing never revives an earlier
 * handled_at.
 */
export function withProgress(n: GraphNode, progress: Progress): GraphNode {
  if (progress === "done") {
    const now = nowIso();
    return { ...n, progress, handled_at: n.handled_at ?? now, updated_at: now };
  }
  return { ...n, progress, updated_at: nowIso() };
}

const NODE_KINDS = new Set(["task", "thought", "ai", "free"]);
const EDGE_KINDS = new Set(["child", "related", "sequence"]);
const TASK_STATUSES = new Set(["draft", "running", "waiting_review", "done", "cancelled"]);

function isStr(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/** Drop malformed records instead of crashing on a corrupted snapshot */
export function sanitizeSnapshot(snap: GraphSnapshot): GraphSnapshot {
  const tasks = (Array.isArray(snap?.tasks) ? snap.tasks : []).filter(
    (t) => t && isStr(t.id) && isStr(t.title) && TASK_STATUSES.has(t.status),
  );
  const taskIds = new Set(tasks.map((t) => t.id));
  const nodes = (Array.isArray(snap?.nodes) ? snap.nodes : []).filter(
    (n) =>
      n &&
      isStr(n.id) &&
      NODE_KINDS.has(n.kind) &&
      Number.isFinite(n.x) &&
      Number.isFinite(n.y) &&
      // task node must point at a real task; others may be free-standing
      (n.kind !== "task" || (isStr(n.ref_id) && taskIds.has(n.ref_id))),
  );
  const nodeIds = new Set(nodes.map((n) => n.id));
  const nodesClean = nodes.map((n) =>
    n.progress !== undefined && !isProgress(n.progress) ? { ...n, progress: undefined } : n,
  );
  const edges = (Array.isArray(snap?.edges) ? snap.edges : []).filter(
    (e) =>
      e &&
      isStr(e.id) &&
      isStr(e.source_id) &&
      isStr(e.target_id) &&
      EDGE_KINDS.has(e.kind) &&
      nodeIds.has(e.source_id) &&
      nodeIds.has(e.target_id),
  );
  return { tasks, nodes: nodesClean, edges };
}
