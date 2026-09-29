// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { Edge, GraphNode, Task } from "../shared/graph";
import { insertEdge, insertNode, insertTask, loadGraph } from "../shared/store";
import { useGraph } from "./graphStore";

const task: Task = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "删除测试任务",
  goal: "",
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
  x: 300,
  y: 0,
  width: 200,
  height: 88,
  collapsed: false,
  created_at: task.created_at,
  updated_at: task.updated_at,
  text: "待删除想法",
  handled_at: null,
  progress: "todo",
};

const outputNode: GraphNode = {
  id: "44444444-4444-4444-8444-444444444444",
  kind: "ai",
  ref_id: task.id,
  x: 560,
  y: 0,
  width: 200,
  height: 88,
  collapsed: false,
  created_at: task.created_at,
  updated_at: task.updated_at,
  text: "待删除产出",
};

const taskThoughtEdge: Edge = {
  id: "55555555-5555-4555-8555-555555555555",
  source_id: taskNode.id,
  target_id: thoughtNode.id,
  kind: "child",
  created_at: task.created_at,
  updated_at: task.created_at,
};

const taskOutputEdge: Edge = {
  id: "66666666-6666-4666-8666-666666666666",
  source_id: taskNode.id,
  target_id: outputNode.id,
  kind: "child",
  created_at: task.created_at,
  updated_at: task.created_at,
};

async function seedGraph() {
  await insertTask(task);
  await insertNode(taskNode);
  await insertNode(thoughtNode, thoughtNode.text);
  await insertNode(outputNode, outputNode.text);
  await insertEdge(taskThoughtEdge);
  await insertEdge(taskOutputEdge);
  useGraph.setState({
    tasks: [task],
    nodes: [taskNode, thoughtNode, outputNode],
    edges: [taskThoughtEdge, taskOutputEdge],
  });
}

beforeEach(() => {
  localStorage.clear();
  useGraph.setState({
    loaded: true,
    tasks: [],
    nodes: [],
    edges: [],
    selection: new Set(),
    selectedEdge: null,
    focusTask: null,
    focusSeq: 0,
    collapsed: new Set(),
    notificationTaskId: null,
    sequenceFromNodeId: null,
  });
});

describe("graph deletion actions", () => {
  it("deletes a selected task, its child entities, and its task row", async () => {
    await seedGraph();
    useGraph.setState({ selection: new Set([taskNode.id]), focusTask: task.id });

    await useGraph.getState().removeSelection();

    expect(useGraph.getState().tasks).toEqual([]);
    expect(useGraph.getState().nodes).toEqual([]);
    expect(useGraph.getState().edges).toEqual([]);
    expect(useGraph.getState().focusTask).toBeNull();
    expect(useGraph.getState().selection.size).toBe(0);
    expect(await loadGraph()).toEqual({ tasks: [], nodes: [], edges: [] });
  });

  it("deletes a selected thought and clears its connected edge and selection", async () => {
    await seedGraph();
    useGraph.setState({ selection: new Set([thoughtNode.id]) });

    await useGraph.getState().removeSelection();

    expect(useGraph.getState().tasks).toHaveLength(1);
    expect(useGraph.getState().nodes.map((n) => n.id)).toEqual([taskNode.id, outputNode.id]);
    expect(useGraph.getState().edges.map((e) => e.id)).toEqual([taskOutputEdge.id]);
    expect(useGraph.getState().selection.size).toBe(0);
    const persisted = await loadGraph();
    expect(persisted.nodes.map((n) => n.id)).toEqual([taskNode.id, outputNode.id]);
    expect(persisted.edges.map((e) => e.id)).toEqual([taskOutputEdge.id]);
  });
});
