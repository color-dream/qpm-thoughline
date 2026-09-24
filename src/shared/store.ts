import type { Edge, GraphNode, GraphSnapshot, Progress, Task } from "./graph";
import { nowIso, sanitizeSnapshot, uid } from "./graph";
import { capturedThoughtPosition, findFreeRect } from "./layout";

/** Browser localStorage snapshot */
const LS_KEY = "qpm-thoughtline-graph-v1";
const LEGACY_LS_KEY = "qpm-box-graph-v1";
const BACKUP_TS_KEY = "qpm-thoughtline-last-export";
const LEGACY_BACKUP_TS_KEY = "qpm-box-last-export";

function migrateLegacyLocalStorage(): void {
  try {
    if (localStorage.getItem(LS_KEY) === null) {
      const legacy = localStorage.getItem(LEGACY_LS_KEY);
      if (legacy !== null) localStorage.setItem(LS_KEY, legacy);
    }
    if (localStorage.getItem(BACKUP_TS_KEY) === null) {
      const legacyBackup = localStorage.getItem(LEGACY_BACKUP_TS_KEY);
      if (legacyBackup !== null) localStorage.setItem(BACKUP_TS_KEY, legacyBackup);
    }
  } catch {
    /* ignore unavailable or quota-limited storage */
  }
}

export function markExported() {
  migrateLegacyLocalStorage();
  try {
    localStorage.setItem(BACKUP_TS_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

export function lastExportedAt(): string | null {
  migrateLegacyLocalStorage();
  try {
    return localStorage.getItem(BACKUP_TS_KEY);
  } catch {
    return null;
  }
}

/** Approximate local storage footprint of the graph snapshot (bytes) */
export function storageUsage(): number {
  migrateLegacyLocalStorage();
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? raw.length * 2 : 0; // UTF-16 code units
  } catch {
    return 0;
  }
}

/** DANGER: wipe local graph data (double-confirm lives in the UI) */
export function clearLocalData(): void {
  try {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LEGACY_LS_KEY);
    localStorage.removeItem(BACKUP_TS_KEY);
    localStorage.removeItem(LEGACY_BACKUP_TS_KEY);
  } catch {
    /* ignore */
  }
}

function lsLoad(): GraphSnapshot {
  migrateLegacyLocalStorage();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { tasks: [], nodes: [], edges: [] };
    return sanitizeSnapshot(JSON.parse(raw) as GraphSnapshot);
  } catch {
    return { tasks: [], nodes: [], edges: [] };
  }
}

function lsSave(snap: GraphSnapshot) {
  localStorage.setItem(LS_KEY, JSON.stringify(snap));
}

export async function loadGraph(): Promise<GraphSnapshot> {
  return lsLoad();
}

export async function insertTask(input: {
  id: string;
  title: string;
  goal?: string;
  status?: Task["status"];
  source?: string;
  meta?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}): Promise<Task> {
  const t: Task = {
    id: input.id,
    title: input.title,
    goal: input.goal ?? "",
    status: input.status ?? "running",
    source: input.source ?? "manual",
    meta: input.meta ?? {},
    created_at: input.created_at || nowIso(),
    updated_at: input.updated_at || nowIso(),
  };

  const snap = lsLoad();
  snap.tasks = [...snap.tasks.filter((x) => x.id !== t.id), t];
  lsSave(snap);
  return t;
}

export async function updateTaskStatus(id: string, status: Task["status"]) {
  const ts = nowIso();
  const snap = lsLoad();
  snap.tasks = snap.tasks.map((t) => (t.id === id ? { ...t, status, updated_at: ts } : t));
  lsSave(snap);
}

/** Delete the task row (canvas cascade is handled by deleteNodes on the task node) */
export async function deleteTaskRow(id: string) {
  const snap = lsLoad();
  snap.tasks = snap.tasks.filter((t) => t.id !== id);
  lsSave(snap);
}

export async function insertNode(n: GraphNode, text?: string) {
  const snap = lsLoad();
  snap.nodes = [...snap.nodes.filter((x) => x.id !== n.id), { ...n, text: text ?? n.text }];
  lsSave(snap);
}

export async function updateNodePos(id: string, x: number, y: number) {
  const ts = nowIso();
  const snap = lsLoad();
  snap.nodes = snap.nodes.map((n) => (n.id === id ? { ...n, x, y, updated_at: ts } : n));
  lsSave(snap);
}

export async function updateNodeCollapsed(id: string, collapsed: boolean) {
  const ts = nowIso();
  const snap = lsLoad();
  snap.nodes = snap.nodes.map((n) => (n.id === id ? { ...n, collapsed, updated_at: ts } : n));
  lsSave(snap);
}

/** Persist edited content for a thought/ai/free node */
export async function updateNodeText(id: string, text: string) {
  const ts = nowIso();
  const snap = lsLoad();
  snap.nodes = snap.nodes.map((n) => (n.id === id ? { ...n, text, updated_at: ts } : n));
  lsSave(snap);
}

/** Persist task title/goal */
export async function updateTaskFields(id: string, fields: { title?: string; goal?: string }) {
  const ts = nowIso();
  const snap = lsLoad();
  snap.tasks = snap.tasks.map((t) =>
    t.id === id ? { ...t, ...fields, updated_at: ts } : t,
  );
  lsSave(snap);
}

/** Mark an idea consumed (fed to AI) or back to pending */
export async function setThoughtHandled(id: string, handled: boolean) {
  const ts = nowIso();
  const handledAt = handled ? ts : null;
  const snap = lsLoad();
  snap.nodes = snap.nodes.map((n) => (n.id === id ? { ...n, handled_at: handledAt, updated_at: ts } : n));
  lsSave(snap);
}

/** Set the manual progress marker on an idea-like node (thoughts.meta.progress) */
export async function updateNodeProgress(id: string, progress: Progress) {
  const ts = nowIso();
  const snap = lsLoad();
  snap.nodes = snap.nodes.map((n) => (n.id === id ? { ...n, progress, updated_at: ts } : n));
  lsSave(snap);
}

/** Archive / unarchive a task (meta.archived_at; data is kept, lists hide it) */
export async function setTaskArchived(id: string, archived: boolean) {
  const ts = nowIso();
  const archivedAt = archived ? ts : null;
  const snap = lsLoad();
  snap.tasks = snap.tasks.map((t) => {
    if (t.id !== id) return t;
    const meta = { ...(t.meta || {}) };
    if (archivedAt) meta.archived_at = archivedAt;
    else delete meta.archived_at;
    return { ...t, meta, updated_at: ts };
  });
  lsSave(snap);
}

export async function insertEdge(e: Edge) {
  const snap = lsLoad();
  snap.edges = [...snap.edges.filter((x) => x.id !== e.id), e];
  lsSave(snap);
}

export async function deleteNodes(ids: string[]) {
  if (!ids.length) return;
  const snap = lsLoad();
  const set = new Set(ids);
  snap.nodes = snap.nodes.filter((n) => !set.has(n.id));
  snap.edges = snap.edges.filter((e) => !set.has(e.source_id) && !set.has(e.target_id));
  lsSave(snap);
}

export async function deleteEdge(id: string) {
  const snap = lsLoad();
  snap.edges = snap.edges.filter((e) => e.id !== id);
  lsSave(snap);
}

/** Capture path: thought + node + child edge. `at` overrides the default drop position */
export async function saveCapturedThought(opts: {
  text: string;
  taskId: string | null;
  at?: { x: number; y: number };
}): Promise<{ nodeId: string }> {
  const ts = nowIso();
  const snap = await loadGraph();
  const desired = opts.at ?? capturedThoughtPosition(snap.nodes, snap.edges, opts.taskId);
  // never stack on top of an existing card: shift to the nearest free spot
  const pos = findFreeRect(snap.nodes, desired);
  const nodeId = uid("n");

  await insertNode(
    {
      id: nodeId,
      kind: opts.taskId ? "thought" : "free",
      ref_id: opts.taskId,
      x: pos.x,
      y: pos.y,
      width: 200,
      height: 88,
      collapsed: false,
      created_at: ts,
      updated_at: ts,
    },
    opts.text,
  );

  if (opts.taskId) {
    const taskNode = snap.nodes.find((n) => n.kind === "task" && n.ref_id === opts.taskId);
    if (taskNode) {
      await insertEdge({
        id: uid("e"),
        source_id: taskNode.id,
        target_id: nodeId,
        kind: "child",
        created_at: ts,
      });
    }
  }
  return { nodeId };
}
