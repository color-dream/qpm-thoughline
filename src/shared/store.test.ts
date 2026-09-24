// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { Edge, GraphNode, Task } from "./graph";
import {
  deleteNodes,
  insertEdge,
  insertNode,
  insertTask,
  loadGraph,
  setTaskArchived,
  setThoughtHandled,
  updateNodeProgress,
  updateNodeText,
  updateTaskFields,
} from "./store";

const task: Task = {
  id: "task-1",
  title: "初始标题",
  goal: "初始目标",
  status: "running",
  source: "manual",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  meta: {},
};

const node: GraphNode = {
  id: "thought-1",
  kind: "thought",
  ref_id: task.id,
  x: 10,
  y: 20,
  width: 200,
  height: 88,
  collapsed: false,
  created_at: task.created_at,
  updated_at: task.updated_at,
};

const edge: Edge = {
  id: "edge-1",
  source_id: "task-node-1",
  target_id: node.id,
  kind: "child",
  created_at: task.created_at,
};

beforeEach(() => {
  localStorage.clear();
});

describe("localStorage graph persistence", () => {
  it("persists node content and metadata through updates", async () => {
    await insertTask(task);
    await insertNode({ ...node, handled_at: "2026-01-02T00:00:00.000Z", progress: "doing" }, "原始想法");
    await updateNodeText(node.id, "更新后的想法");
    await setThoughtHandled(node.id, false);
    await updateNodeProgress(node.id, "done");

    const graph = await loadGraph();
    expect(graph.nodes[0]).toMatchObject({
      id: node.id,
      text: "更新后的想法",
      handled_at: null,
      progress: "done",
    });
  });

  it("preserves task metadata when editing and archiving", async () => {
    await insertTask(task);
    await updateTaskFields(task.id, { title: "更新标题" });
    await setTaskArchived(task.id, true);

    const graph = await loadGraph();
    expect(graph.tasks[0]).toMatchObject({
      title: "更新标题",
      goal: task.goal,
      meta: { archived_at: expect.any(String) },
    });
  });

  it("removes connected edges when deleting nodes", async () => {
    await insertTask(task);
    await insertNode({ ...node, id: "task-node-1", kind: "task", ref_id: task.id });
    await insertNode(node, "想法");
    await insertEdge(edge);

    await deleteNodes([node.id]);

    const graph = await loadGraph();
    expect(graph.nodes.map((item) => item.id)).toEqual(["task-node-1"]);
    expect(graph.edges).toEqual([]);
  });
});
