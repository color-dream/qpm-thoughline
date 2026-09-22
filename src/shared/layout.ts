import type { Edge, GraphNode } from "./graph";
import { nodeSize } from "./graph";

/** Radial layout: children of each task spread on a circle around it; free nodes lined up below */
export function radialLayoutPositions(
  nodes: GraphNode[],
  edges: Edge[],
): Map<string, { x: number; y: number }> {
  const next = new Map<string, { x: number; y: number }>();
  const tasks = nodes.filter((n) => n.kind === "task");
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const task of tasks) {
    const ox = task.x + nodeSize(task).w / 2;
    const oy = task.y + nodeSize(task).h / 2;
    const kids = edges
      .filter((e) => e.source_id === task.id && e.kind === "child")
      .map((e) => byId.get(e.target_id))
      .filter(Boolean) as GraphNode[];
    kids.forEach((c, i) => {
      const ang = (Math.PI * 2 * i) / Math.max(kids.length, 1) - Math.PI / 2;
      const R = 220;
      const { w, h } = nodeSize(c);
      next.set(c.id, {
        x: ox + Math.cos(ang) * R - w / 2,
        y: oy + Math.sin(ang) * R - h / 2,
      });
    });
  }
  nodes
    .filter((n) => n.kind === "free")
    .forEach((n, i) => {
      next.set(n.id, { x: 20 + i * 220, y: 520 });
    });
  return next;
}

/** Drop point for a captured thought: orbit around its task node, or the pool area */
export function capturedThoughtPosition(
  nodes: GraphNode[],
  edges: Edge[],
  taskId: string | null,
): { x: number; y: number } {
  const w = 200;
  const h = 88;
  if (!taskId) {
    const freeCount = nodes.filter((n) => n.kind === "free").length;
    return { x: 40 + Math.random() * 40, y: 480 + freeCount * 8 + Math.random() * 40 };
  }
  const taskNode = nodes.find((n) => n.kind === "task" && n.ref_id === taskId);
  const kids = taskNode ? edges.filter((e) => e.source_id === taskNode.id).length : 0;
  const ang = -Math.PI / 3 + kids * 0.7;
  const R = 200;
  const baseX = taskNode ? taskNode.x + 120 : 200;
  const baseY = taskNode ? taskNode.y + 50 : 200;
  return { x: baseX + Math.cos(ang) * R - w / 2, y: baseY + Math.sin(ang) * R - h / 2 };
}

const GAP = 24;

function overlaps(
  x: number,
  y: number,
  w: number,
  h: number,
  others: Array<{ x: number; y: number; w: number; h: number }>,
): boolean {
  return others.some(
    (o) => x < o.x + o.w + GAP && x + w + GAP > o.x && y < o.y + o.h + GAP && y + h + GAP > o.y,
  );
}

/**
 * Nearest non-overlapping spot to a desired drop point. Expands a ring around
 * the desired position along 8 directions until the rect clears every existing
 * card, so a new card never covers (or lands tight against) an old one.
 */
export function findFreeRect(
  nodes: GraphNode[],
  desired: { x: number; y: number },
  size: { w: number; h: number } = { w: 200, h: 88 },
): { x: number; y: number } {
  const others = nodes.map((n) => ({ ...nodeSize(n), x: n.x, y: n.y }));
  if (!overlaps(desired.x, desired.y, size.w, size.h, others)) {
    return { x: desired.x, y: desired.y };
  }
  const step = size.h + GAP;
  for (let ring = 1; ring < 40; ring++) {
    const r = ring * step;
    for (let k = 0; k < 8; k++) {
      const ang = (Math.PI * 2 * k) / 8;
      const x = desired.x + Math.cos(ang) * r;
      const y = desired.y + Math.sin(ang) * r;
      if (!overlaps(x, y, size.w, size.h, others)) {
        return { x, y };
      }
    }
  }
  // extremely crowded canvas: fall back to a spot well below everything
  return { x: desired.x, y: desired.y + 40 * step };
}
