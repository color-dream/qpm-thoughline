import { describe, expect, it } from "vitest";
import { capturedThoughtPosition, radialLayoutPositions, findFreeRect } from "./layout";
import type { Edge, GraphNode } from "./graph";

function taskNode(id: string, refId: string, x = 0, y = 0): GraphNode {
  return {
    id,
    kind: "task",
    ref_id: refId,
    x,
    y,
    width: 240,
    height: 100,
    collapsed: false,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };
}

function thoughtNode(id: string, refId: string | null): GraphNode {
  return {
    id,
    kind: refId ? "thought" : "free",
    ref_id: refId,
    x: 0,
    y: 0,
    width: 200,
    height: 88,
    collapsed: false,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };
}

function edge(id: string, from: string, to: string, kind: Edge["kind"] = "child"): Edge {
  return { id, source_id: from, target_id: to, kind, created_at: "2026-01-01" };
}

describe("radialLayoutPositions", () => {
  it("places children evenly on a circle around the task", () => {
    const nodes = [
      taskNode("tn", "t1", 100, 100),
      thoughtNode("a", "t1"),
      thoughtNode("b", "t1"),
      thoughtNode("c", "t1"),
    ];
    const edges = [edge("e1", "tn", "a"), edge("e2", "tn", "b"), edge("e3", "tn", "c")];
    const pos = radialLayoutPositions(nodes, edges);
    expect(pos.size).toBe(3);

    const cx = 100 + 120; // task center x
    const cy = 100 + 50; // task center y
    const R = 220;
    for (const id of ["a", "b", "c"]) {
      const p = pos.get(id)!;
      // center of the laid-out node sits ~R from the task center
      const ncx = p.x + 100;
      const ncy = p.y + 44;
      expect(Math.hypot(ncx - cx, ncy - cy)).toBeCloseTo(R, 0);
    }
    // three distinct angles
    const angles = ["a", "b", "c"].map((id) => {
      const p = pos.get(id)!;
      return Math.atan2(p.y + 44 - cy, p.x + 100 - cx);
    });
    expect(new Set(angles.map((a) => a.toFixed(3))).size).toBe(3);
  });

  it("lines free nodes up in the pool row", () => {
    const nodes = [thoughtNode("f1", null), thoughtNode("f2", null)];
    const pos = radialLayoutPositions(nodes, []);
    expect(pos.get("f1")).toEqual({ x: 20, y: 520 });
    expect(pos.get("f2")).toEqual({ x: 240, y: 520 });
  });
});

describe("capturedThoughtPosition", () => {
  it("returns a pool position when unbound", () => {
    const p = capturedThoughtPosition([], [], null);
    expect(p.x).toBeGreaterThanOrEqual(40);
    expect(p.y).toBeGreaterThanOrEqual(480);
  });

  it("orbits around the bound task, spacing successive captures", () => {
    const nodes = [taskNode("tn", "t1", 0, 0)];
    const edges: Edge[] = [];
    const p1 = capturedThoughtPosition(nodes, edges, "t1");
    edges.push(edge("e1", "tn", "a"));
    const p2 = capturedThoughtPosition(nodes, edges, "t1");
    expect(p1).not.toEqual(p2);
    // both ~R from task center
    const cx = 120;
    const cy = 50;
    for (const p of [p1, p2]) {
      expect(Math.hypot(p.x + 100 - cx, p.y + 44 - cy)).toBeCloseTo(200, 0);
    }
  });

  it("falls back to a default area when the task has no node yet", () => {
    const p = capturedThoughtPosition([], [], "ghost_task");
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});

describe("findFreeRect", () => {
  it("returns the desired spot untouched on an empty canvas", () => {
    expect(findFreeRect([], { x: 500, y: 300 })).toEqual({ x: 500, y: 300 });
  });

  it("returns the desired spot when it clears existing cards", () => {
    const nodes = [thoughtNode("a", null)];
    nodes[0].x = 0;
    nodes[0].y = 0;
    // desired far away from card at (0,0)
    expect(findFreeRect(nodes, { x: 800, y: 600 })).toEqual({ x: 800, y: 600 });
  });

  it("moves a colliding drop point to a nearby non-overlapping spot", () => {
    const nodes = [thoughtNode("a", null)];
    nodes[0].x = 480;
    nodes[0].y = 280;
    const out = findFreeRect(nodes, { x: 500, y: 300 });
    // new rect (with GAP margin) must not intersect the existing card
    const gap = 24;
    const clear =
      out.x + 200 + gap <= 480 ||
      out.x - gap >= 480 + 200 ||
      out.y + 88 + gap <= 280 ||
      out.y - gap >= 280 + 88;
    expect(clear).toBe(true);
  });

  it("keeps successive next-step drops distinct (no exact stacking)", () => {
    const source = taskNode("tn", "t1", 100, 100);
    const first = findFreeRect([source], { x: 400, y: 100 });
    const secondSource = [...source ? [source] : [], { ...thoughtNode("n1", null), x: first.x, y: first.y }];
    const second = findFreeRect(secondSource, { x: 400, y: 100 });
    expect(second).not.toEqual(first);
    const dist = Math.hypot(second.x - first.x, second.y - first.y);
    expect(dist).toBeGreaterThanOrEqual(88); // at least one step away
  });

  it("respects task-card size (240x100) when clearing", () => {
    const nodes = [taskNode("tn", "t1", 200, 200)];
    const out = findFreeRect(nodes, { x: 220, y: 220 });
    const gap = 24;
    const clear =
      out.x + 200 + gap <= 200 ||
      out.x - gap >= 200 + 240 ||
      out.y + 88 + gap <= 200 ||
      out.y - gap >= 200 + 100;
    expect(clear).toBe(true);
  });
});
