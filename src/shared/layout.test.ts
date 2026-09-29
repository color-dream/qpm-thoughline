import { describe, expect, it } from "vitest";
import { capturedThoughtPosition, radialLayoutPositions, findFreeRect } from "./layout";
import type { Edge, GraphNode } from "./graph";

const taskId = "11111111-1111-4111-8111-111111111111";
const createdAt = "2026-01-01T00:00:00.000Z";

function taskNode(id: string, x = 0, y = 0): GraphNode {
  return {
    id,
    kind: "task",
    ref_id: taskId,
    x,
    y,
    width: 240,
    height: 100,
    collapsed: false,
    created_at: createdAt,
    updated_at: createdAt,
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
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function edge(id: string, from: string, to: string, kind: Edge["kind"] = "child"): Edge {
  return { id, source_id: from, target_id: to, kind, created_at: createdAt, updated_at: createdAt };
}

describe("radialLayoutPositions", () => {
  it("places children evenly around a task", () => {
    const nodes = [taskNode("tn", 100, 100), thoughtNode("a", taskId), thoughtNode("b", taskId), thoughtNode("c", taskId)];
    const pos = radialLayoutPositions(nodes, [edge("e1", "tn", "a"), edge("e2", "tn", "b"), edge("e3", "tn", "c")]);
    expect(pos.size).toBe(3);
  });

  it("lines free nodes up in the pool row", () => {
    const pos = radialLayoutPositions([thoughtNode("f1", null), thoughtNode("f2", null)], []);
    expect(pos.get("f1")).toEqual({ x: 20, y: 520 });
    expect(pos.get("f2")).toEqual({ x: 240, y: 520 });
  });
});

describe("capturedThoughtPosition and findFreeRect", () => {
  it("returns a pool position when unbound and orbits a task when bound", () => {
    expect(capturedThoughtPosition([], [], null).y).toBeGreaterThanOrEqual(480);
    const task = taskNode("tn");
    const first = capturedThoughtPosition([task], [], taskId);
    const second = capturedThoughtPosition([task], [edge("e1", "tn", "n1")], taskId);
    expect(first).not.toEqual(second);
  });

  it("avoids existing cards", () => {
    const out = findFreeRect([thoughtNode("a", null)], { x: 0, y: 0 });
    expect(out).not.toEqual({ x: 0, y: 0 });
  });
});
