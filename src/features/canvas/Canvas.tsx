import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GraphNode, Progress, TaskStatus } from "../../shared/graph";
import { centerOf, nodeSize, progressOf } from "../../shared/graph";
import { radialLayoutPositions } from "../../shared/layout";
import { copyText } from "../../shared/feed";
import { useGraph, type CtxMenuItem } from "../../store/graphStore";
import "./canvas.css";

type Drag =
  | { type: "pan"; sx: number; sy: number; cx: number; cy: number }
  | {
      type: "node";
      sx: number;
      sy: number;
      starts: Array<{ id: string; ox: number; oy: number }>;
    }
  | { type: "link"; from: string; port: "t" | "b" | "l" | "r"; x: number; y: number }
  | { type: "box"; sx: number; sy: number; x0: number; y0: number };

const PROGRESS_LABEL: Record<Progress, string> = {
  todo: "待开始",
  doing: "进行中",
  done: "已完成",
};

/** badge click cycles todo → doing → done → todo */
const PROGRESS_CYCLE: Progress[] = ["todo", "doing", "done"];

function nextProgress(cur: Progress): Progress {
  return PROGRESS_CYCLE[(PROGRESS_CYCLE.indexOf(cur) + 1) % PROGRESS_CYCLE.length];
}

function screenToWorld(
  sx: number,
  sy: number,
  rect: DOMRect,
  cam: { x: number; y: number; k: number },
) {
  return {
    x: (sx - rect.left - cam.x) / cam.k,
    y: (sy - rect.top - cam.y) / cam.k,
  };
}

/**
 * Edge endpoints land exactly on the port dots (t/b/l/r, 12px circle centered
 * 7px outside the card). Side is picked from the centers' relative direction,
 * the same heuristic the user reads from the port positions. Heights come from
 * the DOM when available because card height is content-driven, not nodeSize.
 */
function portSideFor(
  a: GraphNode,
  b: GraphNode,
  rectOf: (id: string) => { w: number; h: number } | undefined = () => undefined,
): "t" | "b" | "l" | "r" {
  const sa = rectOf(a.id) ?? nodeSize(a);
  const sb = rectOf(b.id) ?? nodeSize(b);
  const dx = b.x + sb.w / 2 - (a.x + sa.w / 2);
  const dy = b.y + sb.h / 2 - (a.y + sa.h / 2);
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "r" : "l") : dy >= 0 ? "b" : "t";
}

function portPoint(
  n: GraphNode,
  side: "t" | "b" | "l" | "r",
  rectOf: (id: string) => { w: number; h: number } | undefined,
): { x: number; y: number } {
  const { w, h } = rectOf(n.id) ?? nodeSize(n);
  const cx = n.x + w / 2;
  const cy = n.y + h / 2;
  if (side === "t") return { x: cx, y: n.y };
  if (side === "b") return { x: cx, y: n.y + h };
  if (side === "l") return { x: n.x, y: cy };
  return { x: n.x + w, y: cy };
}

function pathBetween(
  a: GraphNode,
  b: GraphNode,
  rectOf: (id: string) => { w: number; h: number } | undefined = () => undefined,
) {
  const sideA = portSideFor(a, b, rectOf);
  const sideB = portSideFor(b, a, rectOf);
  const p1 = portPoint(a, sideA, rectOf);
  const p2 = portPoint(b, sideB, rectOf);
  // control handles pull straight out of the card so the curve leaves/enters
  // perpendicular to the edge, visually connecting to the port dot
  const handle = Math.max(Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.4, 28);
  const h1 = sideA === "l" || sideA === "r" ? { x: handle, y: 0 } : { x: 0, y: handle };
  const h2 = sideB === "l" || sideB === "r" ? { x: handle, y: 0 } : { x: 0, y: handle };
  const s1 = sideA === "l" || sideA === "t" ? -1 : 1;
  const s2 = sideB === "l" || sideB === "t" ? -1 : 1;
  return `M ${p1.x} ${p1.y} C ${p1.x + h1.x * s1} ${p1.y + h1.y * s1}, ${p2.x + h2.x * s2} ${p2.y + h2.y * s2}, ${p2.x} ${p2.y}`;
}

export default function Canvas() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ nodeId: string; text: string; title: string; goal: string } | null>(null);

  const {
    nodes,
    edges,
    selection,
    selectedEdge,
    cam,
    collapsed,
    focusTask,
    mode,
    tasks,
    setCam,
    select,
    addEdge,
    toggleCollapse,
    setMode,
    feedSelected,
    addAiOutput,
    completeTask,
    reopenTask,
  } = useGraph();

  const [feedModal, setFeedModal] = useState<{ text: string; count: number } | null>(null);
  const [aiPaste, setAiPaste] = useState(false);
  const [aiText, setAiText] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const visible = useMemo(() => {
    const hidden = new Set<string>();
    // 已完成/已归档任务及其子树默认不在画布显示;聚焦该任务时临时可见(查看/重新打开)
    const hiddenTaskNodeIds = new Set(
      nodes
        .filter((n) => {
          if (n.kind !== "task") return false;
          const t = tasks.find((x) => x.id === n.ref_id);
          return !!t && (t.status === "done" || !!t.meta?.archived_at);
        })
        .map((n) => n.id),
    );
    const focusTaskNodeId = focusTask
      ? nodes.find((n) => n.kind === "task" && n.ref_id === focusTask)?.id
      : undefined;
    for (const id of hiddenTaskNodeIds) {
      if (id !== focusTaskNodeId) hidden.add(id);
    }
    for (const e of edges) {
      if (e.kind === "child" && hiddenTaskNodeIds.has(e.source_id) && e.source_id !== focusTaskNodeId) {
        hidden.add(e.target_id);
      }
    }
    for (const cid of collapsed) {
      for (const e of edges) {
        if (e.source_id === cid && e.kind === "child") hidden.add(e.target_id);
      }
    }
    return nodes.filter((n) => !hidden.has(n.id));
  }, [nodes, edges, collapsed, tasks, focusTask]);

  const visibleIds = useMemo(() => new Set(visible.map((n) => n.id)), [visible]);

  // card height is content-driven (CSS), so store sizes go stale; measure the
  // DOM after each commit and re-render once when a height actually changed
  const nodeElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const sizesRef = useRef<Map<string, { w: number; h: number }>>(new Map());
  const [, bumpSizes] = useState(0);
  useLayoutEffect(() => {
    let changed = false;
    for (const [id, el] of nodeElsRef.current) {
      const r = el.getBoundingClientRect();
      const size = { w: r.width / cam.k, h: r.height / cam.k };
      const prev = sizesRef.current.get(id);
      if (!prev || Math.abs(prev.w - size.w) > 0.5 || Math.abs(prev.h - size.h) > 0.5) {
        sizesRef.current.set(id, size);
        changed = true;
      }
    }
    if (changed) bumpSizes((t) => t + 1);
  }, [nodes, cam.k]);
  const measuredSize = useCallback(
    (id: string) => sizesRef.current.get(id),
    [],
  );

  const fitNodes = useCallback(
    (list: GraphNode[], pad = 80) => {
      const el = viewportRef.current;
      if (!el || !list.length) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const n of list) {
        const { w, h } = nodeSize(n);
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + w);
        maxY = Math.max(maxY, n.y + h);
      }
      const r = el.getBoundingClientRect();
      const bw = maxX - minX + pad * 2;
      const bh = maxY - minY + pad * 2;
      const k = Math.min(1.2, Math.max(0.35, Math.min(r.width / bw, r.height / bh)));
      setCam({
        k,
        x: r.width / 2 - (minX + (maxX - minX) / 2) * k,
        y: r.height / 2 - (minY + (maxY - minY) / 2) * k,
      });
    },
    [setCam],
  );

  // fit when focusTask changes OR when a re-fit is requested (notification click, pool jump)
  const focusSeq = useGraph((s) => s.focusSeq);
  useEffect(() => {
    if (!focusTask) return;
    const list = nodes.filter(
      (n) => n.ref_id === focusTask || n.id === focusTask || n.kind === "task" && n.ref_id === focusTask,
    );
    const taskNode = nodes.find((n) => n.kind === "task" && n.ref_id === focusTask);
    const subtree = list.length ? list : taskNode ? [taskNode] : [];
    if (subtree.length) fitNodes(subtree);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTask, focusSeq, nodes.length]);

  const zoomAt = useCallback(
    (f: number, cx?: number, cy?: number) => {
      const el = viewportRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = cx ?? r.left + r.width / 2;
      const py = cy ?? r.top + r.height / 2;
      const k0 = cam.k;
      const k1 = Math.min(2.5, Math.max(0.25, k0 * f));
      const wx = (px - r.left - cam.x) / k0;
      const wy = (py - r.top - cam.y) / k0;
      setCam({
        k: k1,
        x: px - r.left - wx * k1,
        y: py - r.top - wy * k1,
      });
    },
    [cam, setCam],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      zoomAt(e.deltaY > 0 ? 1 / 1.08 : 1.08, e.clientX, e.clientY);
    },
    [zoomAt],
  );

  /** build the context menu for a node (kind-aware) */
  const nodeCtxMenu = (nodeId: string, x: number, y: number) => {
    const st = useGraph.getState();
    const n = st.nodes.find((v) => v.id === nodeId);
    if (!n) return;
    st.select([nodeId], null);
    const items: CtxMenuItem[] = [];
    items.push({
      label: "增加下一步",
      kbd: "Tab",
      onClick: () => st.requestNextStepFrom(nodeId),
    });
    if (n.kind === "task") {
      items.push({
        label: st.collapsed.has(nodeId) ? "展开子树" : "折叠子树",
        onClick: () => void st.toggleCollapse(nodeId),
      });
    }
    if (n.kind === "thought" || n.kind === "free") {
      const cur = progressOf(n);
      const mark = (p: Progress) => ({
        label: `${cur === p ? "✓ " : ""}${PROGRESS_LABEL[p]}`,
        onClick: () => void st.setNodeProgress(nodeId, p),
      });
      items.push(mark("todo"), mark("doing"), mark("done"));
    }
    items.push({
      label: "编辑",
      onClick: () => {
        const task = n.kind === "task" ? st.tasks.find((t) => t.id === n.ref_id) : null;
        setEditing({
          nodeId,
          text: n.text ?? task?.goal ?? "",
          title: task?.title ?? "",
          goal: task?.goal ?? "",
        });
      },
    });
    items.push({
      label: n.kind === "task" ? "删除任务" : "删除",
      danger: true,
      onClick: () => {
        if (n.kind === "task" && n.ref_id) void st.deleteTask(n.ref_id);
        else void st.deleteNodeById(nodeId);
      },
    });
    st.openCtxMenu({ x, y, items });
  };

  const onPointerDown = (e: React.MouseEvent) => {
    useGraph.getState().closeCtxMenu();
    if (e.button === 1 || e.button === 0) {
      const port = (e.target as HTMLElement).closest(".port") as HTMLElement | null;
      const nodeEl = (e.target as HTMLElement).closest(".node") as HTMLElement | null;
      const edgeHit = (e.target as HTMLElement).closest("[data-edge]") as HTMLElement | null;

      if (port && e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = {
          type: "link",
          from: port.dataset.id!,
          port: (port.dataset.port as "t" | "b" | "l" | "r") ?? "b",
          x: e.clientX,
          y: e.clientY,
        };
        return;
      }
      if (edgeHit) {
        select([], edgeHit.dataset.edge!);
        return;
      }
      if (nodeEl && mode === "select") {
        const id = nodeEl.dataset.id!;
        let sel = selection;
        if (e.shiftKey) {
          sel = new Set(selection);
          if (sel.has(id)) sel.delete(id);
          else sel.add(id);
        } else if (!selection.has(id)) {
          sel = new Set([id]);
        }
        select([...sel], null);
        const starts = [...sel].map((sid) => {
          const n = nodes.find((x) => x.id === sid)!;
          return { id: sid, ox: n.x, oy: n.y };
        });
        dragRef.current = { type: "node", sx: e.clientX, sy: e.clientY, starts };
        return;
      }
      if (e.shiftKey) {
        const r = viewportRef.current!.getBoundingClientRect();
        const x0 = e.clientX - r.left;
        const y0 = e.clientY - r.top;
        dragRef.current = { type: "box", sx: e.clientX, sy: e.clientY, x0, y0 };
        setBox({ x: x0, y: y0, w: 0, h: 0 });
      } else {
        dragRef.current = {
          type: "pan",
          sx: e.clientX,
          sy: e.clientY,
          cx: cam.x,
          cy: cam.y,
        };
        select([], null);
      }
    }
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.type === "pan") {
        setCam({
          ...cam,
          x: drag.cx + (e.clientX - drag.sx),
          y: drag.cy + (e.clientY - drag.sy),
        });
      } else if (drag.type === "node") {
        const dx = (e.clientX - drag.sx) / cam.k;
        const dy = (e.clientY - drag.sy) / cam.k;
        const idSet = new Set(drag.starts.map((s) => s.id));
        useGraph.setState({
          nodes: useGraph.getState().nodes.map((n) => {
            const s = drag.starts.find((x) => x.id === n.id);
            return s && idSet.has(n.id) ? { ...n, x: s.ox + dx, y: s.oy + dy } : n;
          }),
        });
      } else if (drag.type === "link") {
        const from = nodes.find((n) => n.id === drag.from);
        if (!from) return;
        const el = viewportRef.current!;
        const w = screenToWorld(e.clientX, e.clientY, el.getBoundingClientRect(), cam);
        const start = portPoint(from, drag.port, measuredSize);
        const dir = drag.port === "l" || drag.port === "r" ? 1 : 0;
        const hx = dir ? Math.max(30, Math.abs(w.x - start.x) * 0.5) * (drag.port === "l" ? -1 : 1) : 0;
        const hy = dir ? 0 : Math.max(30, Math.abs(w.y - start.y) * 0.5);
        setPreview(
          `M ${start.x} ${start.y} C ${start.x + hx} ${start.y + hy}, ${w.x - hx} ${w.y - hy}, ${w.x} ${w.y}`,
        );
      } else if (drag.type === "box") {
        const r = viewportRef.current!.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        setBox({
          x: Math.min(x, drag.x0),
          y: Math.min(y, drag.y0),
          w: Math.abs(x - drag.x0),
          h: Math.abs(y - drag.y0),
        });
      }
    };

    const onUp = async (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.type === "link") {
        setPreview(null);
        const targetEl =
          (e.target as HTMLElement).closest?.(".port") as HTMLElement | null ||
          (e.target as HTMLElement).closest?.(".node") as HTMLElement | null;
        const targetId = targetEl?.dataset?.id;
        if (targetId && targetId !== drag.from) {
          const fromN = useGraph.getState().nodes.find((n) => n.id === drag.from);
          const toN = useGraph.getState().nodes.find((n) => n.id === targetId);
          let kind: "child" | "related" = "related";
          if (fromN?.kind === "task" || toN?.kind === "task") kind = "child";
          await addEdge(drag.from, targetId, kind);
        }
      } else if (drag.type === "node") {
        const map = new Map(useGraph.getState().nodes.map((n) => [n.id, n]));
        for (const s of drag.starts) {
          const n = map.get(s.id);
          if (n) {
            const { updateNodePos } = await import("../../shared/store");
            await updateNodePos(n.id, n.x, n.y);
          }
        }
      } else if (drag.type === "box") {
        setBox(null);
        const r = viewportRef.current!.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const selBox = {
          x: Math.min(x, drag.x0),
          y: Math.min(y, drag.y0),
          w: Math.abs(x - drag.x0),
          h: Math.abs(y - drag.y0),
        };
        if (selBox.w > 4 || selBox.h > 4) {
          const picked: string[] = [];
          visible.forEach((n) => {
            const el = viewportRef.current!.querySelector(`[data-id="${n.id}"]`);
            if (!el) return;
            const nr = el.getBoundingClientRect();
            if (
              !(
                nr.right < r.left + selBox.x ||
                nr.left > r.left + selBox.x + selBox.w ||
                nr.bottom < r.top + selBox.y ||
                nr.top > r.top + selBox.y + selBox.h
              )
            ) {
              picked.push(n.id);
            }
          });
          select(picked, null);
        }
      }
      dragRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [cam, nodes, box, addEdge, select, setCam, visible]);

  // pan camera so world point (wx, wy) sits at viewport center
  const centerOn = useCallback(
    (wx: number, wy: number, k?: number) => {
      const el = viewportRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const kk = k ?? cam.k;
      setCam({
        k: kk,
        x: r.width / 2 - wx * kk,
        y: r.height / 2 - wy * kk,
      });
    },
    [cam, setCam],
  );

  /** jump camera to a node and pulse it (used by minimap / pool navigation) */
  const jumpToNode = useCallback((id: string) => {
    const n = useGraph.getState().nodes.find((x) => x.id === id);
    if (!n) return;
    const c = centerOf(n);
    centerOn(c.x, c.y);
    select([id], null);
    setPulseId(id);
    window.setTimeout(() => setPulseId((cur) => (cur === id ? null : cur)), 800);
  }, [centerOn, select]);

  // pool panel (and other surfaces) can request a jump via store
  const jumpToNodeId = useGraph((s) => s.jumpToNodeId);
  const consumeJump = useGraph((s) => s.consumeJump);
  useEffect(() => {
    if (!jumpToNodeId) return;
    jumpToNode(jumpToNodeId);
    consumeJump();
  }, [jumpToNodeId, jumpToNode, consumeJump]);

  const onDoubleClick = async (e: React.MouseEvent) => {
    const nodeEl = (e.target as HTMLElement).closest(".node") as HTMLElement | null;
    if (nodeEl) {
      const id = nodeEl.dataset.id!;
      const n = nodes.find((x) => x.id === id);
      if (!n) return;
      const task = n.kind === "task" ? tasks.find((t) => t.id === n.ref_id) : null;
      setEditing({
        nodeId: id,
        text: n.text ?? task?.goal ?? "",
        title: task?.title ?? "",
        goal: task?.goal ?? "",
      });
      return;
    }
    // blank canvas: open the unified capture layer anchored at the clicked point
    const el = viewportRef.current!;
    const w = screenToWorld(e.clientX, e.clientY, el.getBoundingClientRect(), cam);
    useGraph.getState().requestCaptureAt(w.x, w.y);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "Escape") {
        useGraph.getState().closeCtxMenu();
        select([], null);
        setMode("select");
        return;
      }
      // Tab on a selection = "add next step" from that node
      if (e.key === "Tab" && selection.size === 1) {
        e.preventDefault();
        const id = [...selection][0];
        if (id) {
          useGraph.getState().closeCtxMenu();
          useGraph.getState().requestNextStepFrom(id);
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        void useGraph.getState().removeSelection();
      }
      if (e.key === "1") setMode("select");
      if (e.key === "2") setMode("link");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select, setMode, selection]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const commitEditing = async () => {
    if (!editing) return;
    const n = useGraph.getState().nodes.find((x) => x.id === editing.nodeId);
    if (!n) {
      setEditing(null);
      return;
    }
    if (n.kind === "task" && n.ref_id) {
      const { editTaskFields } = useGraph.getState();
      await editTaskFields(n.ref_id, {
        title: editing.title.trim() || undefined,
        goal: editing.goal.trim(),
      });
    } else {
      const { editNodeText } = useGraph.getState();
      await editNodeText(n.id, editing.text.trim());
    }
    setEditing(null);
    showToast("已保存");
  };

  const onFeed = async () => {
    const res = await feedSelected();
    if (!res) {
      showToast("未选中想法节点，请先选中或聚焦任务");
      return;
    }
    setFeedModal(res);
  };

  const currentTask = tasks.find((t) => t.id === focusTask) || null;

  const statusLabel = (s: TaskStatus) =>
    s === "running" ? "进行中" : s === "done" ? "已完成" : s;

  const pendingCount = useMemo(() => {
    if (!focusTask) return 0;
    const taskNode = nodes.find((n) => n.kind === "task" && n.ref_id === focusTask);
    if (!taskNode) return 0;
    return edges
      .filter((e) => e.source_id === taskNode.id && e.kind === "child")
      .map((e) => nodes.find((n) => n.id === e.target_id))
      .filter((n) => n && (n.kind === "thought" || n.kind === "free") && !n.handled_at).length;
  }, [nodes, edges, focusTask]);

  /** unconsumed idea count under one task node (badge on canvas) */
  const pendingOfNode = (taskNodeId: string) => {
    return edges
      .filter((e) => e.source_id === taskNodeId && e.kind === "child")
      .map((e) => nodes.find((n) => n.id === e.target_id))
      .filter((n) => n && (n.kind === "thought" || n.kind === "free") && !n.handled_at).length;
  };

  const radialLayout = () => {
    const st = useGraph.getState();
    const positions = radialLayoutPositions(st.nodes, st.edges);
    useGraph.setState({
      nodes: st.nodes.map((n) => {
        const p = positions.get(n.id);
        return p ? { ...n, x: p.x, y: p.y } : n;
      }),
    });
  };

  return (
    <div className="canvas-root">
      <div className="canvas-toolbar">
        <button
          type="button"
          className={`tbtn ${mode === "select" ? "active" : ""}`}
          onClick={() => setMode("select")}
        >
          选择
        </button>
        <button
          type="button"
          className={`tbtn ${mode === "link" ? "active" : ""}`}
          onClick={() => setMode("link")}
        >
          连边
        </button>
        <span className="sep" />
        <button type="button" className="tbtn" onClick={() => zoomAt(1.15)}>
          放大
        </button>
        <button type="button" className="tbtn" onClick={() => zoomAt(1 / 1.15)}>
          缩小
        </button>
        <button
          type="button"
          className="tbtn"
          onClick={() => {
            if (!focusTask) return;
            fitNodes(
              nodes.filter((n) => n.ref_id === focusTask || (n.kind === "task" && n.ref_id === focusTask)),
            );
          }}
        >
          适配任务
        </button>
        <button type="button" className="tbtn" onClick={radialLayout}>
          放射整理
        </button>
        <span className="sep" />
        <button type="button" className="tbtn" onClick={() => void onFeed()}>
          交给 AI
        </button>
        <button type="button" className="tbtn" onClick={() => setAiPaste(true)}>
          贴回产出
        </button>
        <button
          type="button"
          className="tbtn"
          onClick={() => {
            const id = [...selection][0];
            if (id) void toggleCollapse(id);
            else if (focusTask) {
              const tn = nodes.find((n) => n.kind === "task" && n.ref_id === focusTask);
              if (tn) void toggleCollapse(tn.id);
            }
          }}
        >
          折叠
        </button>
        <span className="sep" />
        <button
          type="button"
          className="tbtn"
          onClick={() => void useGraph.getState().removeSelection()}
        >
          删除
        </button>
      </div>

      {currentTask && (
        <div className="task-chip-bar">
          <span className="chip-title">{currentTask.title}</span>
          <span className={`status-pill s-${currentTask.status}`}>
            {statusLabel(currentTask.status)}
          </span>
          {pendingCount > 0 && <span className="badge">{pendingCount} 想法</span>}
          <span className="sep" />
          {currentTask.status === "done" ? (
            <>
              <button
                type="button"
                className="tbtn"
                onClick={() => void reopenTask(currentTask.id)}
              >
                重新打开
              </button>
              <button
                type="button"
                className="tbtn"
                onClick={() => void useGraph.getState().archiveTask(currentTask.id)}
              >
                归档
              </button>
            </>
          ) : (
            <button
              type="button"
              className="tbtn"
              onClick={() => void completeTask(currentTask.id)}
            >
              标记完成
            </button>
          )}
        </div>
      )}

      <div
        className="canvas-viewport"
        ref={viewportRef}
        onMouseDown={onPointerDown}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const st = useGraph.getState();
          st.closeCtxMenu();
          const el = e.target as HTMLElement;
          const edgeEl = el.closest("[data-edge]") as HTMLElement | null;
          if (edgeEl) {
            const edgeId = edgeEl.dataset.edge!;
            const kindLabel =
              edges.find((x) => x.id === edgeId)?.kind === "sequence" ? "下一步连线" : "连线";
            st.select([], edgeId);
            st.openCtxMenu({
              x: e.clientX,
              y: e.clientY,
              items: [
                {
                  label: `删除${kindLabel}`,
                  danger: true,
                  onClick: () => void st.removeEdge(edgeId),
                },
              ],
            });
            return;
          }
          const items: CtxMenuItem[] = [
            { label: "放射整理", onClick: radialLayout },
            {
              label: "适配任务",
              onClick: () => {
                if (!focusTask) return;
                fitNodes(
                  nodes.filter((n) => n.ref_id === focusTask || (n.kind === "task" && n.ref_id === focusTask)),
                );
              },
            },
            { label: "交给 AI", onClick: () => void onFeed() },
            { label: "贴回产出", onClick: () => setAiPaste(true) },
          ];
          st.openCtxMenu({ x: e.clientX, y: e.clientY, items });
        }}
      >
        {/* 48px dot grid, scaled & panning with the camera (canvas.best style) */}
        <div
          className="canvas-grid"
          style={{
            backgroundImage: `radial-gradient(circle, var(--grid-dot) 1.15px, transparent 1.35px)`,
            backgroundSize: `${48 * cam.k}px ${48 * cam.k}px`,
            backgroundPosition: `${cam.x % (48 * cam.k)}px ${cam.y % (48 * cam.k)}px`,
          }}
        />
        <div
          className="canvas-world"
          style={{
            transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})`,
          }}
        >
          <svg className="canvas-edges">
            <defs>
              <marker
                id="edge-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="context-stroke" strokeWidth="1.6" strokeLinecap="round" />
              </marker>
              <marker
                id="edge-arrow-active"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
              </marker>
            </defs>
            {edges
              .filter((e) => visibleIds.has(e.source_id) && visibleIds.has(e.target_id))
              .map((e) => {
                const a = nodes.find((n) => n.id === e.source_id);
                const b = nodes.find((n) => n.id === e.target_id);
                if (!a || !b) return null;
                const d = pathBetween(a, b, measuredSize);
                const isSeq = e.kind === "sequence";
                const isSel = selectedEdge === e.id;
                return (
                  <g key={e.id}>
                    <path
                      className="edge-hit"
                      d={d}
                      data-edge={e.id}
                      style={{ pointerEvents: "stroke" }}
                    />
                    <path
                      className={`edge ${e.kind} ${isSel ? "selected" : ""}`}
                      d={d}
                      markerEnd={isSeq ? (isSel ? "url(#edge-arrow-active)" : "url(#edge-arrow)") : undefined}
                    />
                  </g>
                );
              })}
            {preview ? <path className="edge preview" d={preview} /> : null}
          </svg>

          {visible.map((n) => {
            const sel = selection.has(n.id);
            const kindLabel =
              n.kind === "task"
                ? "任务"
                : n.kind === "ai"
                  ? "AI 产出"
                  : "想法";
            const task = n.kind === "task" ? tasks.find((t) => t.id === n.ref_id) : null;
            const body = n.text ?? "";
            const kids = edges.filter((e) => e.source_id === n.id && e.kind === "child").length;
            const isIdea = n.kind === "thought" || n.kind === "free";
            const isEditing = editing?.nodeId === n.id;
            return (
              <div
                key={n.id}
                data-id={n.id}
                className={`node ${n.kind} ${progressOf(n)} ${sel ? "selected" : ""} ${pulseId === n.id ? "pulse" : ""}`}
                style={{ left: n.x, top: n.y }}
                ref={(el) => {
                  if (el) nodeElsRef.current.set(n.id, el);
                  else nodeElsRef.current.delete(n.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  useGraph.getState().closeCtxMenu();
                  nodeCtxMenu(n.id, e.clientX, e.clientY);
                }}
              >
                <div className="port t" data-port="t" data-id={n.id} />
                <div className="port b" data-port="b" data-id={n.id} />
                <div className="port l" data-port="l" data-id={n.id} />
                <div className="port r" data-port="r" data-id={n.id} />
                <div className="n-head">
                  <span className="kind">{kindLabel}</span>
                  {n.kind !== "task" ? (
                    <button
                      type="button"
                      className="n-copy"
                      title="复制内容"
                      onMouseDown={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onContextMenu={(e) => e.stopPropagation()}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const ok = await copyText(n.text ?? "");
                        showToast(ok ? "已复制" : "复制失败");
                      }}
                    >
                      ⧉
                    </button>
                  ) : null}
                  {isEditing ? <span className="tag accent">编辑中</span> : null}
                </div>
                {n.kind === "task" ? <div className="n-title">{task?.title ?? "任务"}</div> : null}
                {isEditing ? (
                  <div className="n-body n-editing">双击画布空白处取消…</div>
                ) : (
                  <div className="n-body">{body || (n.kind === "task" ? task?.goal ?? "" : "（空 · 双击编辑）")}</div>
                )}
                <div className="n-foot">
                  {isIdea ? (
                    <button
                      type="button"
                      className={`n-progress ${progressOf(n)}`}
                      title={`${PROGRESS_LABEL[progressOf(n)]} · 点击切换`}
                      onMouseDown={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onContextMenu={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const cur = progressOf(n);
                        // leaving "已完成" is a real change: confirm to avoid stray clicks
                        if (cur === "done" && !window.confirm("把这条想法改回「待开始」？")) return;
                        void useGraph.getState().setNodeProgress(n.id, nextProgress(cur));
                      }}
                    >
                      {PROGRESS_LABEL[progressOf(n)]}
                    </button>
                  ) : null}
                  {task ? (
                    <span className={`tag ${task.status === "done" ? "" : "accent"}`}>
                      {statusLabel(task.status)}
                    </span>
                  ) : null}
                  {n.kind === "task" && kids > 0 ? <span className="tag">{kids} 子节点</span> : null}
                  {n.kind === "task" && pendingOfNode(n.id) > 0 ? (
                    <span className="tag warn">{pendingOfNode(n.id)} 未处理</span>
                  ) : null}
                  {isIdea && n.handled_at && progressOf(n) !== "done" ? (
                    <span className="tag handled">已处理</span>
                  ) : null}
                  {/* 未消化提示只留给进行中的卡:待开始角标已表达"还没弄" */}
                  {isIdea && progressOf(n) === "doing" && !n.handled_at && body ? (
                    <span className="tag pending-dot" title="未处理">•</span>
                  ) : null}
                  {collapsed.has(n.id) ? <span className="tag accent">已折叠</span> : null}
                </div>
              </div>
            );
          })}
        </div>
        {box ? (
          <div
            className="boxsel"
            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
          />
        ) : null}

        {nodes.length === 0 && (
          <div className="canvas-empty">
            <div className="ce-title">画布还是空的</div>
            <div className="ce-sub">
              双击画布任意处记下第一条念头 · 左侧 + 新建任务 ·
              拖卡片端口连线把想法挂到任务下
            </div>
          </div>
        )}

        <div className="minimap" aria-hidden="true">
          <div className="minimap-label">MAP</div>
          <MinimapNodes nodes={visible} cam={cam} viewportRef={viewportRef} onJump={jumpToNode} />
        </div>
      </div>

      <div className="canvas-hint">
        双击空白记想法 · 双击节点编辑 · 拖节点 · 端口连边 · 右键更多操作 · 滚轮缩放 · 拖拽平移 · Delete 删除
      </div>

      {toast && <div className="canvas-toast">{toast}</div>}

      {feedModal && (
        <div className="modal-backdrop" onClick={() => setFeedModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>交给 AI · 已复制 {feedModal.count} 条</span>
              <button type="button" className="tbtn" onClick={() => setFeedModal(null)}>
                关闭
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-tip">已复制到剪贴板，切到 AI 工具窗口后 Ctrl+V 粘贴。</p>
              <pre>{feedModal.text}</pre>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-primary" onClick={() => setFeedModal(null)}>
                知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {aiPaste && (
        <div className="modal-backdrop" onClick={() => setAiPaste(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>贴回 AI 产出</span>
              <button type="button" className="tbtn" onClick={() => setAiPaste(false)}>
                关闭
              </button>
            </div>
            <div className="modal-body">
              <textarea
                className="ai-textarea"
                value={aiText}
                placeholder="粘贴 AI 的产出摘要…"
                onChange={(e) => setAiText(e.target.value)}
                rows={5}
              />
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-ghost" onClick={() => setAiPaste(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  const v = aiText.trim();
                  if (!v) return;
                  const id = await addAiOutput(v);
                  setAiPaste(false);
                  setAiText("");
                  setPulseId(id);
                  window.setTimeout(() => setPulseId(null), 800);
                  showToast("已写入 AI 产出节点");
                }}
              >
                写入画布
              </button>
            </div>
          </div>
        </div>
      )}
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>编辑内容</span>
              <button type="button" className="tbtn" onClick={() => setEditing(null)}>
                关闭
              </button>
            </div>
            <div className="modal-body">
              {editing.title !== "" || editing.goal !== "" ? (
                <>
                  <div className="edit-label">任务标题</div>
                  <input
                    className="edit-input"
                    value={editing.title}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  />
                  <div className="edit-label">目标 / 约束</div>
                  <textarea
                    className="ai-textarea"
                    value={editing.goal}
                    rows={3}
                    onChange={(e) => setEditing({ ...editing, goal: e.target.value })}
                  />
                </>
              ) : (
                <>
                  <div className="edit-label">内容</div>
                  <textarea
                    className="ai-textarea"
                    autoFocus
                    value={editing.text}
                    rows={4}
                    onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        void commitEditing();
                      }
                    }}
                  />
                </>
              )}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void commitEditing()}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MinimapNodes({
  nodes,
  cam,
  viewportRef,
  onJump,
}: {
  nodes: GraphNode[];
  cam: { x: number; y: number; k: number };
  viewportRef: React.RefObject<HTMLDivElement | null>;
  onJump: (id: string) => void;
}) {
  if (!nodes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const { w, h } = nodeSize(n);
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + w);
    maxY = Math.max(maxY, n.y + h);
  }
  const pad = 40;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const W = 140;
  const H = 96;
  const s = Math.min(W / (maxX - minX || 1), H / (maxY - minY || 1));
  const r = viewportRef.current?.getBoundingClientRect();
  const vw = r ? r.width / cam.k : 0;
  const vh = r ? r.height / cam.k : 0;
  const vx = r ? -cam.x / cam.k : 0;
  const vy = r ? -cam.y / cam.k : 0;

  return (
    <>
      {nodes.map((n) => {
        const { w, h } = nodeSize(n);
        return (
          <div
            key={n.id}
            className={`mm-node ${n.kind} ${progressOf(n)}`}
            title="点击定位"
            onClick={(e) => {
              e.stopPropagation();
              onJump(n.id);
            }}
            style={{
              left: (n.x - minX) * s,
              top: (n.y - minY) * s,
              width: Math.max(3, w * s),
              height: Math.max(2, h * s),
            }}
          />
        );
      })}
      <div
        className="mm-view"
        style={{
          left: (vx - minX) * s,
          top: (vy - minY) * s,
          width: Math.max(8, vw * s),
          height: Math.max(6, vh * s),
        }}
      />
    </>
  );
}
