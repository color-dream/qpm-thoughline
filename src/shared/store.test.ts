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
  id: "11111111-1111-4111-8111-111111111111",
  title: "初始标题",
  goal: "初始目标",
  status: "running",
  archived_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const taskNode: GraphNode = {
  id: "22222222-2222-4222-8222-222222222222",
  kind: "task",
  ref_id: task.id,
  x: 0,
  y: 0,
  width: 240,
  height: 100,
  collapsed: false,
  created_at: task.created_at,
  updated_at: task.updated_at,
};

const thoughtNode: GraphNode = {
  id: "33333333-3333-4333-8333-333333333333",
  kind: "thought",
  ref_id: task.id,
  x: 10,
  y: 20,
  width: 200,
  height: 88,
  collapsed: false,
  created_at: task.created_at,
  updated_at: task.updated_at,
  text: "原始想法",
  handled_at: null,
  progress: "todo",
};

const edge: Edge = {
  id: "44444444-4444-4444-8444-444444444444",
  source_id: taskNode.id,
  target_id: thoughtNode.id,
  kind: "child",
  created_at: task.created_at,
  updated_at: task.updated_at,
};

beforeEach(() => {
  localStorage.clear();
});

describe("canonical local document persistence", () => {
  it("starts with a versioned empty document and graph view", async () => {
    expect((await loadGraph()).tasks).toEqual([]);
    expect(JSON.parse(localStorage.getItem("qpm-thoughtline-document")!).schema_version).toBe(1);
  });

  it("persists content, progress, handled state, and archive as explicit fields", async () => {
    await insertTask(task);
    await insertNode(taskNode);
    await insertNode(thoughtNode, thoughtNode.text);
    await updateNodeText(thoughtNode.id, "更新后的想法");
    await setThoughtHandled(thoughtNode.id, false);
    await updateNodeProgress(thoughtNode.id, "done");
    await updateTaskFields(task.id, { title: "更新标题" });
    await setTaskArchived(task.id, true);

    const graph = await loadGraph();
    expect(graph.tasks[0]).toMatchObject({ title: "更新标题", archived_at: expect.any(String) });
    expect(graph.nodes[1]).toMatchObject({ text: "更新后的想法", progress: "done", handled_at: expect.any(String) });
  });

  it("removes a node, its entity, and connected edges", async () => {
    await insertTask(task);
    await insertNode(taskNode);
    await insertNode(thoughtNode, thoughtNode.text);
    await insertEdge(edge);
    await deleteNodes([thoughtNode.id]);

    const graph = await loadGraph();
    expect(graph.nodes.map((item) => item.id)).toEqual([taskNode.id]);
    expect(graph.edges).toEqual([]);
  });
});
