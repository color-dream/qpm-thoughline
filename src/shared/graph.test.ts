import { describe, expect, it } from "vitest";
import { sanitizeSnapshot, centerOf, nodeSize, uid, withProgress, progressFromMeta, progressOf } from "./graph";
import type { GraphSnapshot, GraphNode } from "./graph";

const validTask = {
  id: "task_1",
  title: "T",
  goal: "",
  status: "running" as const,
  source: "manual",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  meta: {},
};

const validNode = {
  id: "n_1",
  kind: "thought" as const,
  ref_id: "task_1",
  x: 0,
  y: 0,
  width: 200,
  height: 88,
  collapsed: false,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

const validEdge = {
  id: "e_1",
  source_id: "n_1",
  target_id: "n_1",
  kind: "related" as const,
  created_at: "2026-01-01",
};

describe("sanitizeSnapshot", () => {
  it("keeps a fully valid snapshot", () => {
    const snap: GraphSnapshot = {
      tasks: [validTask],
      nodes: [validNode],
      edges: [validEdge],
    };
    const out = sanitizeSnapshot(snap);
    expect(out.tasks).toHaveLength(1);
    expect(out.nodes).toHaveLength(1);
    expect(out.edges).toHaveLength(1);
  });

  it("drops malformed records instead of throwing", () => {
    const snap = {
      tasks: [validTask, { ...validTask, id: "" }, { ...validTask, status: "bogus" }, null as never],
      nodes: [
        validNode,
        { ...validNode, id: "" },
        { ...validNode, kind: "ghost" },
        { ...validNode, x: Number.NaN },
        // task node pointing at a missing task
        { ...validNode, id: "n_task", kind: "task", ref_id: "nope" },
      ],
      edges: [
        validEdge,
        { ...validEdge, id: "" },
        { ...validEdge, kind: "sequence_x" },
        // dangling endpoints after bad nodes were dropped
        { ...validEdge, id: "e_2", source_id: "ghost", target_id: "n_1" },
      ],
    } as unknown as GraphSnapshot;
    const out = sanitizeSnapshot(snap);
    expect(out.tasks.map((t) => t.id)).toEqual(["task_1"]);
    expect(out.nodes.map((n) => n.id)).toEqual(["n_1"]);
    expect(out.edges.map((e) => e.id)).toEqual(["e_1"]);
  });

  it("tolerates non-array fields", () => {
    const out = sanitizeSnapshot({ tasks: null, nodes: undefined, edges: 42 } as never);
    expect(out).toEqual({ tasks: [], nodes: [], edges: [] });
  });
});

describe("geometry helpers", () => {
  it("nodeSize defaults thought-like nodes", () => {
    expect(nodeSize({ ...validNode, width: null, height: null })).toEqual({ w: 200, h: 88 });
    expect(nodeSize({ ...validNode, kind: "task", width: null, height: null })).toEqual({ w: 240, h: 100 });
  });

  it("centerOf returns node center", () => {
    expect(centerOf(validNode)).toEqual({ x: 100, y: 44 });
  });
});

describe("uid", () => {
  it("is prefixed and unique-ish", () => {
    const a = uid("e");
    const b = uid("e");
    expect(a.startsWith("e_")).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe("progress", () => {
  const node = (extra: Partial<GraphNode> = {}): GraphNode => ({ ...validNode, ...extra });

  it("progressOf defaults unmarked nodes to todo", () => {
    expect(progressOf(node({}))).toBe("todo");
    expect(progressOf(node({ progress: "doing" }))).toBe("doing");
    expect(progressOf(node({ progress: "done" }))).toBe("done");
  });

  it("done implies handled_at, keeping an existing one", () => {
    const a = withProgress(node({}), "done");
    expect(a.progress).toBe("done");
    expect(a.handled_at).toBeTruthy();
    const b = withProgress(node({ handled_at: "2026-01-02" }), "done");
    expect(b.handled_at).toBe("2026-01-02");
  });

  it("todo/doing never set or revive handled_at", () => {
    for (const p of ["todo", "doing"] as const) {
      const out = withProgress(node({}), p);
      expect(out.progress).toBe(p);
      expect(out.handled_at).toBeUndefined();
    }
    const revived = withProgress(node({ handled_at: "2026-01-02" }), "doing");
    expect(revived.handled_at).toBe("2026-01-02");
  });

  it("progressFromMeta reads valid values only", () => {
    expect(progressFromMeta({ progress: "doing" })).toBe("doing");
    expect(progressFromMeta({ handled_at: "x" })).toBeUndefined();
    expect(progressFromMeta({ progress: "bogus" })).toBeUndefined();
    expect(progressFromMeta(null)).toBeUndefined();
    expect(progressFromMeta("nope")).toBeUndefined();
  });
});
