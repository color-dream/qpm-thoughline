import type { GraphSnapshot, Task } from "./graph";
import { buildTimelineSummary } from "./feed";
import { loadGraph } from "./store";

export function downloadFile(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportTaskMarkdown(taskId: string): Promise<string | null> {
  const snap = await loadGraph();
  const task = snap.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  const taskNode = snap.nodes.find((n) => n.kind === "task" && n.ref_id === taskId);
  const kids = taskNode
    ? snap.edges
        .filter((e) => e.source_id === taskNode.id && e.kind === "child")
        .map((e) => snap.nodes.find((n) => n.id === e.target_id))
        .filter((n): n is NonNullable<typeof n> => !!n)
    : [];

  const kindLabel = (k: string) =>
    k === "thought" ? "想法" : k === "ai" ? "AI 产出" : k;

  const items = kids
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((n) => ({
      time: new Date(n.created_at).toLocaleString("zh-CN"),
      kind: kindLabel(n.kind),
      text: n.text || "（空）",
    }));

  const md = buildTimelineSummary({
    taskTitle: task.title,
    taskGoal: task.goal,
    items,
  });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  downloadFile(`念头-${task.title}-${stamp}.md`, md, "text/markdown");
  return md;
}

export async function exportGraphJson(): Promise<void> {
  const snap = await loadGraph();
  const payload = {
    format: "qpm-thoughtline-graph",
    version: 1,
    exported_at: new Date().toISOString(),
    ...snap,
  };
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  downloadFile(`qpm-thoughtline-backup-${stamp}.json`, JSON.stringify(payload, null, 2), "application/json");
  const { markExported } = await import("./store");
  markExported();
}

export function parseGraphJson(raw: string): GraphSnapshot | null {
  try {
    const data = JSON.parse(raw) as Partial<GraphSnapshot> & { format?: string };
    const supportedFormats = new Set(["qpm-thoughtline-graph", "qpm-box-graph"]);
    if (
      !data ||
      (data.format !== undefined && !supportedFormats.has(data.format)) ||
      !Array.isArray(data.tasks) ||
      !Array.isArray(data.nodes) ||
      !Array.isArray(data.edges)
    ) {
      return null;
    }
    return {
      tasks: data.tasks as Task[],
      nodes: data.nodes,
      edges: data.edges,
    };
  } catch {
    return null;
  }
}

/** Import: merge by id, newer updated_at wins for tasks/nodes */
export async function importGraphJson(raw: string): Promise<{ tasks: number; nodes: number; edges: number } | null> {
  const incoming = parseGraphJson(raw);
  if (!incoming) return null;
  const { insertTask, insertNode, insertEdge, loadGraph: lg } = await import("./store");
  const current = await lg();
  const taskMap = new Map(current.tasks.map((t) => [t.id, t]));
  const nodeMap = new Map(current.nodes.map((n) => [n.id, n]));
  const edgeMap = new Map(current.edges.map((e) => [e.id, e]));

  for (const t of incoming.tasks) {
    const old = taskMap.get(t.id);
    if (!old || (t.updated_at || "") >= (old.updated_at || "")) {
      await insertTask({
        id: t.id,
        title: t.title,
        goal: t.goal,
        status: t.status,
        source: t.source,
        meta: t.meta ?? {},
        created_at: t.created_at,
        updated_at: t.updated_at,
      });
    }
  }
  for (const n of incoming.nodes) {
    const old = nodeMap.get(n.id);
    if (!old || (n.updated_at || "") >= (old.updated_at || "")) {
      await insertNode({ ...n, collapsed: !!n.collapsed }, n.text);
    }
  }
  for (const e of incoming.edges) {
    if (!edgeMap.has(e.id)) await insertEdge(e);
  }

  return {
    tasks: incoming.tasks.length,
    nodes: incoming.nodes.length,
    edges: incoming.edges.length,
  };
}

export function dataDirHint(): string {
  // Tauri build persists to SQLite under the app data dir; web build uses localStorage
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    ? "%APPDATA%/app.qpm.thoughtline/ (Windows · Tauri data directory)"
    : "浏览器 localStorage（本地优先，清除浏览器数据会丢失，请定期导出备份）";
}
