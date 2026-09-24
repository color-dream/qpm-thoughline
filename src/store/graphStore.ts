import { create } from "zustand";
import type { Edge, GraphNode, Progress, Task, TaskStatus } from "../shared/graph";
import { nodeSize, nowIso, uid, withProgress } from "../shared/graph";
import { findFreeRect } from "../shared/layout";
import {
  deleteEdge,
  deleteNodes,
  insertEdge,
  insertTask,
  loadGraph,
  saveCapturedThought,
  setTaskArchived,
  setThoughtHandled,
  updateNodeCollapsed,
  updateNodePos,
  updateNodeProgress,
  updateNodeText,
  updateTaskFields,
  updateTaskStatus,
} from "../shared/store";

type Mode = "select" | "link";

export interface CtxMenuItem {
  label: string;
  kbd?: string;
  danger?: boolean;
  onClick: () => void;
}

export interface CtxMenuState {
  x: number;
  y: number;
  items: CtxMenuItem[];
}

interface GraphState {
  loaded: boolean;
  tasks: Task[];
  nodes: GraphNode[];
  edges: Edge[];
  selection: Set<string>;
  selectedEdge: string | null;
  mode: Mode;
  focusTask: string | null;
  /** bumped whenever UI should re-fit focusTask (notification click, pool jump, re-focus) */
  focusSeq: number;
  /** node id the canvas should navigate to and pulse (set by pool click; consumed by Canvas) */
  jumpToNodeId: string | null;
  /** world position where a capture was requested (canvas double-click; consumed by App) */
  pendingCapture: { x: number; y: number } | null;
  /** source node of a "next step" capture; after save, a sequence edge is linked from here */
  sequenceFromNodeId: string | null;
  /** global context menu (canvas nodes/edges/blank, sidebar rows, pool items) */
  ctxMenu: CtxMenuState | null;
  openCtxMenu: (menu: CtxMenuState) => void;
  closeCtxMenu: () => void;
  collapsed: Set<string>;
  cam: { x: number; y: number; k: number };
  notificationTaskId: string | null;
  init: () => Promise<void>;
  reload: () => Promise<void>;
  setMode: (m: Mode) => void;
  setCam: (cam: { x: number; y: number; k: number }) => void;
  select: (ids: string[], edgeId?: string | null) => void;
  moveNodes: (ids: string[], dx: number, dy: number) => void;
  commitMove: (origins: Array<{ id: string; x: number; y: number }>, x: number, y: number) => Promise<void>;
  addEdge: (from: string, to: string, kind: Edge["kind"]) => Promise<void>;
  addFreeNode: (x: number, y: number, text: string) => Promise<string>;
  capture: (text: string, taskId: string | null, at?: { x: number; y: number }) => Promise<string>;
  removeSelection: () => Promise<void>;
  removeEdge: (id: string) => Promise<void>;
  toggleCollapse: (id: string) => Promise<void>;
  focusTaskById: (taskId: string | null) => void;
  /** request canvas re-fit of focusTask without changing it */
  requestFocus: () => void;
  /** ask canvas to navigate to a node and pulse it */
  jumpToNode: (nodeId: string) => void;
  /** canvas consumes the jump request */
  consumeJump: () => void;
  /** canvas double-click requests a capture at world position */
  requestCaptureAt: (x: number, y: number) => void;
  /** canvas requests a "next step" capture chained from a node */
  requestNextStepFrom: (nodeId: string) => void;
  /** App consumes the capture request after opening the capture layer */
  consumeCapture: () => void;
  setTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  reopenTask: (id: string) => Promise<void>;
  archiveTask: (id: string) => Promise<void>;
  unarchiveTask: (id: string) => Promise<void>;
  feedSelected: () => Promise<{ text: string; count: number } | null>;
  addAiOutput: (text: string) => Promise<string>;
  createTask: (title: string, goal?: string) => Promise<string>;
  editNodeText: (nodeId: string, text: string) => Promise<void>;
  /** set the progress marker on an idea-like node (unmarked reads as todo) */
  setNodeProgress: (nodeId: string, progress: Progress) => Promise<void>;
  editTaskFields: (taskId: string, fields: { title?: string; goal?: string }) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  /** delete one node (cascade) without touching the selection */
  deleteNodeById: (nodeId: string) => Promise<void>;
  clearNotification: () => void;
}

export const useGraph = create<GraphState>((set, get) => ({
  loaded: false,
  tasks: [],
  nodes: [],
  edges: [],
  selection: new Set(),
  selectedEdge: null,
  mode: "select",
  focusTask: null,
  focusSeq: 0,
  jumpToNodeId: null,
  pendingCapture: null,
  sequenceFromNodeId: null,
  ctxMenu: null,
  collapsed: new Set(),
  cam: { x: 0, y: 0, k: 1 },
  notificationTaskId: null,

  init: async () => {
    await get().reload();
    const first = get().tasks[0];
    set({ loaded: true, focusTask: first?.id ?? null });
  },

  reload: async () => {
    const snap = await loadGraph();
    set({
      tasks: snap.tasks,
      nodes: snap.nodes,
      edges: snap.edges,
      collapsed: new Set(snap.nodes.filter((n) => n.collapsed).map((n) => n.id)),
    });
  },

  setMode: (m) => set({ mode: m }),
  setCam: (cam) => set({ cam }),

  select: (ids, edgeId = null) =>
    set({ selection: new Set(ids), selectedEdge: edgeId }),

  moveNodes: (ids, dx, dy) => {
    const idSet = new Set(ids);
    set({
      nodes: get().nodes.map((n) =>
        idSet.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n,
      ),
    });
  },

  commitMove: async (origins, x, y) => {
    // origins are start positions; final already applied visually
    // persist each node's current pos
    const map = new Map(get().nodes.map((n) => [n.id, n]));
    for (const o of origins) {
      const n = map.get(o.id);
      if (n) await updateNodePos(n.id, n.x, n.y);
    }
    void x;
    void y;
  },

  addEdge: async (from, to, kind) => {
    const exists = get().edges.some(
      (e) =>
        (e.source_id === from && e.target_id === to) ||
        (e.source_id === to && e.target_id === from),
    );
    if (exists) return;
    const fromN = get().nodes.find((n) => n.id === from);
    const toN = get().nodes.find((n) => n.id === to);
    let source = from;
    let target = to;
    let k = kind;
    if (fromN && toN) {
      if (fromN.kind === "task" || toN.kind === "task") k = "child";
      if (toN.kind === "task" && fromN.kind !== "task") {
        source = to;
        target = from;
      }
    }
    const e: Edge = {
      id: uid("e"),
      source_id: source,
      target_id: target,
      kind: k,
      created_at: nowIso(),
    };
    await insertEdge(e);
    set({ edges: [...get().edges, e] });
  },

  addFreeNode: async (x, y, text) => {
    const ts = nowIso();
    const id = uid("n");
    const pos = findFreeRect(get().nodes, { x: x - 100, y: y - 40 });
    const node: GraphNode = {
      id,
      kind: "free",
      ref_id: null,
      x: pos.x,
      y: pos.y,
      width: 200,
      height: 88,
      collapsed: false,
      created_at: ts,
      updated_at: ts,
      text,
    };
    const { insertNode } = await import("../shared/store");
    await insertNode(node, text);
    set({ nodes: [...get().nodes, node], selection: new Set([id]) });
    return id;
  },

  capture: async (text, taskId, at) => {
    const { nodeId } = await saveCapturedThought({ text, taskId, at });
    await get().reload();
    if (taskId) set({ focusTask: taskId });
    set({ selection: new Set([nodeId]) });
    return nodeId;
  },

  removeSelection: async () => {
    const { selection, selectedEdge } = get();
    if (selectedEdge) {
      await deleteEdge(selectedEdge);
      set({
        edges: get().edges.filter((e) => e.id !== selectedEdge),
        selectedEdge: null,
      });
      return;
    }
    const ids = [...selection];
    if (!ids.length) return;

    const selectedNodes = ids
      .map((id) => get().nodes.find((n) => n.id === id))
      .filter((n): n is GraphNode => !!n);
    const taskIds = selectedNodes
      .filter((n) => n.kind === "task" && n.ref_id)
      .map((n) => n.ref_id as string);

    for (const taskId of taskIds) {
      await get().deleteTask(taskId);
    }

    const remainingIds = ids.filter((id) => get().nodes.some((n) => n.id === id));
    for (const id of remainingIds) {
      await get().deleteNodeById(id);
    }

    set({ selection: new Set(), selectedEdge: null });
  },

  removeEdge: async (id) => {
    await deleteEdge(id);
    set({ edges: get().edges.filter((e) => e.id !== id), selectedEdge: null });
  },

  toggleCollapse: async (id) => {
    const next = new Set(get().collapsed);
    const on = !next.has(id);
    if (on) next.add(id);
    else next.delete(id);
    await updateNodeCollapsed(id, on);
    set({ collapsed: next });
  },

  focusTaskById: (taskId) => set({ focusTask: taskId, focusSeq: get().focusSeq + 1 }),

  requestFocus: () => set({ focusSeq: get().focusSeq + 1 }),

  jumpToNode: (nodeId) => set({ jumpToNodeId: nodeId }),

  consumeJump: () => set({ jumpToNodeId: null }),

  requestCaptureAt: (x, y) => set({ pendingCapture: { x, y } }),

  requestNextStepFrom: (nodeId) => {
    const n = get().nodes.find((x) => x.id === nodeId);
    if (!n) return;
    const { w } = nodeSize(n);
    const desired = { x: n.x + w + 60, y: n.y };
    set({ pendingCapture: findFreeRect(get().nodes, desired), sequenceFromNodeId: nodeId });
  },

  consumeCapture: () => set({ pendingCapture: null }),

  openCtxMenu: (menu) => set({ ctxMenu: menu }),

  closeCtxMenu: () => set({ ctxMenu: null }),

  setTaskStatus: async (id, status) => {
    await updateTaskStatus(id, status);
    set({
      tasks: get().tasks.map((t) => (t.id === id ? { ...t, status } : t)),
    });
  },

  /** 标记完成；若仍有未消化想法则发通知 */
  completeTask: async (id) => {
    const st = get();
    const taskNode = st.nodes.find((n) => n.kind === "task" && n.ref_id === id);
    const pending = taskNode
      ? st.edges
          .filter((e) => e.source_id === taskNode.id && e.kind === "child")
          .map((e) => st.nodes.find((n) => n.id === e.target_id))
          .filter((n): n is GraphNode => !!n && (n.kind === "thought" || n.kind === "free"))
          .filter((n) => !n.handled_at)
      : [];
    await get().setTaskStatus(id, "done");
    if (pending.length) {
      const { notify } = await import("../shared/feed");
      const title = st.tasks.find((t) => t.id === id)?.title ?? "任务";
      await notify({
        title: "念头",
        body: `「${title}」已完成，还有 ${pending.length} 条想法未处理`,
        onClick: () => {
          try {
            window.focus();
          } catch {
            /* ignore */
          }
          get().focusTaskById(id);
        },
      });
      set({ focusTask: id, notificationTaskId: id, focusSeq: get().focusSeq + 1 });
    }
  },

  reopenTask: async (id) => {
    await get().setTaskStatus(id, "running");
    set({ focusTask: id, focusSeq: get().focusSeq + 1 });
  },

  /** 归档已完成任务:侧栏/画布不再显示,数据保留,可在归档面板恢复 */
  archiveTask: async (id) => {
    await setTaskArchived(id, true);
    set({
      tasks: get().tasks.map((t) =>
        t.id === id
          ? { ...t, meta: { ...(t.meta || {}), archived_at: nowIso() }, updated_at: nowIso() }
          : t,
      ),
      focusTask: get().focusTask === id ? null : get().focusTask,
    });
  },

  unarchiveTask: async (id) => {
    await setTaskArchived(id, false);
    set({
      tasks: get().tasks.map((t) => {
        if (t.id !== id) return t;
        const meta = { ...(t.meta || {}) };
        delete meta.archived_at;
        return { ...t, meta, updated_at: nowIso() };
      }),
    });
  },

  feedSelected: async () => {
    const st = get();
    let picked = [...st.selection]
      .map((id) => st.nodes.find((n) => n.id === id))
      .filter((n): n is GraphNode => !!n && (n.kind === "thought" || n.kind === "free" || n.kind === "ai"));

    if (!picked.length && st.focusTask) {
      const taskNode = st.nodes.find((n) => n.kind === "task" && n.ref_id === st.focusTask);
      if (taskNode) {
        picked = st.edges
          .filter((e) => e.source_id === taskNode.id && e.kind === "child")
          .map((e) => st.nodes.find((n) => n.id === e.target_id))
          .filter((n): n is GraphNode => !!n && (n.kind === "thought" || n.kind === "free"))
          .filter((n) => !n.handled_at);
      }
    }

    const thoughts = picked
      .map((n) => n.text?.trim())
      .filter((t): t is string => !!t);

    if (!thoughts.length) return null;

    const task =
      st.tasks.find((t) => t.id === st.focusTask) ||
      st.tasks.find(
        (t) => st.nodes.some((n) => n.kind === "task" && n.ref_id === t.id && n.id === picked[0]?.ref_id),
      ) ||
      st.tasks[0];

    const { buildFeedToAiText, copyText } = await import("../shared/feed");
    const text = buildFeedToAiText({
      taskTitle: task?.title ?? "（无任务）",
      taskGoal: task?.goal ?? "",
      thoughts,
    });
    await copyText(text);

    // ideas fed to AI count as consumed; ai-output nodes are excluded
    const fedIds = picked
      .filter((n) => n.kind === "thought" || n.kind === "free")
      .map((n) => n.id);
    for (const id of fedIds) {
      await setThoughtHandled(id, true);
    }
    const handledAt = nowIso();
    set({
      nodes: get().nodes.map((n) => (fedIds.includes(n.id) ? { ...n, handled_at: handledAt } : n)),
    });

    return { text, count: thoughts.length };
  },

  addAiOutput: async (text: string) => {
    const st = get();
    const taskId = st.focusTask;
    const taskNode = st.nodes.find((n) => n.kind === "task" && n.ref_id === taskId);
    const ts = nowIso();
    const id = uid("n");
    const kids = st.edges.filter((e) => taskNode && e.source_id === taskNode.id).length;
    const node: GraphNode = {
      id,
      kind: "ai",
      ref_id: taskId,
      ...(() => {
        // 贴回产出:固定偏移若与现有卡重叠,挪到最近空位
        const desired = {
          x: (taskNode?.x ?? 200) + (kids % 3) * 40,
          y: (taskNode?.y ?? 200) + 220 + (kids % 2) * 40,
        };
        return findFreeRect(st.nodes, desired);
      })(),
      width: 200,
      height: 88,
      collapsed: false,
      created_at: ts,
      updated_at: ts,
      text,
    };
    const { insertNode, insertEdge } = await import("../shared/store");
    await insertNode(node, text);
    if (taskNode) {
      await insertEdge({
        id: uid("e"),
        source_id: taskNode.id,
        target_id: id,
        kind: "child",
        created_at: ts,
      });
    }
    set({
      nodes: [...st.nodes, node],
      edges: taskNode
        ? [
            ...st.edges,
            { id: uid("e"), source_id: taskNode.id, target_id: id, kind: "child", created_at: ts },
          ]
        : st.edges,
      selection: new Set([id]),
    });
    return id;
  },

  createTask: async (title, goal = "") => {
    const id = uid("task");
    const t = await insertTask({
      id,
      title,
      goal,
      status: "running",
      source: "manual",
      meta: {},
    });
    const ts = nowIso();
    const node: GraphNode = {
      id: uid("n_task"),
      kind: "task",
      ref_id: id,
      x: 120,
      y: 120,
      width: 240,
      height: 100,
      collapsed: false,
      created_at: ts,
      updated_at: ts,
    };
    const { insertNode } = await import("../shared/store");
    await insertNode(node);
    set({
      tasks: [...get().tasks, t],
      nodes: [...get().nodes, node],
      focusTask: id,
    });
    return id;
  },

  editNodeText: async (nodeId, text) => {
    await updateNodeText(nodeId, text);
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, text, updated_at: nowIso() } : n,
      ),
    });
  },

  setNodeProgress: async (nodeId, progress) => {
    const prev = get().nodes.find((n) => n.id === nodeId);
    if (!prev) return;
    const next = withProgress(prev, progress);
    await updateNodeProgress(nodeId, progress);
    set({
      nodes: get().nodes.map((n) => (n.id === nodeId ? next : n)),
    });
  },

  editTaskFields: async (taskId, fields) => {
    await updateTaskFields(taskId, fields);
    set({
      tasks: get().tasks.map((t) => (t.id === taskId ? { ...t, ...fields, updated_at: nowIso() } : t)),
    });
  },

  /** 删除任务:任务节点 + 整棵子树(想法/AI 产出)+ 任务行 */
  deleteTask: async (taskId) => {
    const before = get();
    const taskNode = before.nodes.find((n) => n.kind === "task" && n.ref_id === taskId);
    const subtreeIds = new Set<string>();
    if (taskNode) {
      const pending = [taskNode.id];
      while (pending.length) {
        const id = pending.pop()!;
        if (subtreeIds.has(id)) continue;
        subtreeIds.add(id);
        for (const edge of before.edges) {
          if (edge.source_id === id && edge.kind === "child" && !subtreeIds.has(edge.target_id)) {
            pending.push(edge.target_id);
          }
        }
      }
      await deleteNodes([...subtreeIds]);
    }
    const { deleteTaskRow } = await import("../shared/store");
    await deleteTaskRow(taskId);

    const after = get();
    const removedIds = subtreeIds;
    const selectedEdge = after.selectedEdge
      ? after.edges.find((e) => e.id === after.selectedEdge)
      : undefined;
    set({
      tasks: after.tasks.filter((t) => t.id !== taskId),
      nodes: after.nodes.filter((n) => !removedIds.has(n.id)),
      edges: after.edges.filter((e) => !removedIds.has(e.source_id) && !removedIds.has(e.target_id)),
      collapsed: new Set([...after.collapsed].filter((id) => !removedIds.has(id))),
      focusTask: after.focusTask === taskId ? null : after.focusTask,
      notificationTaskId: after.notificationTaskId === taskId ? null : after.notificationTaskId,
      sequenceFromNodeId:
        after.sequenceFromNodeId && removedIds.has(after.sequenceFromNodeId)
          ? null
          : after.sequenceFromNodeId,
      selection: new Set([...after.selection].filter((id) => !removedIds.has(id))),
      selectedEdge:
        selectedEdge &&
        !removedIds.has(selectedEdge.source_id) &&
        !removedIds.has(selectedEdge.target_id)
          ? after.selectedEdge
          : null,
    });
  },

  /** 删除单个节点(级联边/想法内容) */
  deleteNodeById: async (nodeId) => {
    const before = get();
    const removedSelectedEdge = before.selectedEdge
      ? before.edges.some(
          (e) =>
            e.id === before.selectedEdge && (e.source_id === nodeId || e.target_id === nodeId),
        )
      : false;
    await deleteNodes([nodeId]);
    const after = get();
    set({
      nodes: after.nodes.filter((n) => n.id !== nodeId),
      edges: after.edges.filter((e) => e.source_id !== nodeId && e.target_id !== nodeId),
      collapsed: new Set([...after.collapsed].filter((id) => id !== nodeId)),
      selection: new Set([...after.selection].filter((id) => id !== nodeId)),
      selectedEdge: removedSelectedEdge ? null : after.selectedEdge,
      sequenceFromNodeId: after.sequenceFromNodeId === nodeId ? null : after.sequenceFromNodeId,
    });
  },

  clearNotification: () => set({ notificationTaskId: null }),
}));
