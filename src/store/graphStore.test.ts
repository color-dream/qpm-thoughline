// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { Edge, GraphNode, Task } from "../shared/graph";
import { insertEdge, insertNode, insertTask, loadGraph } from "../shared/store";
import { useGraph } from "./graphStore";

const task: Task = {
  id: "task-delete",
  title: "删除测试任务",
  goal: "",
  status: "running",
  source: "manual",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  meta: {},
};

const taskNode: GraphNode = {
  id: "node-task-delete",
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
  id: "node-thought-delete",
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
};

const nestedNode: GraphNode = {
  id: "node-nested-delete",
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
  id: "edge-task-thought-delete",
  source_id: taskNode.id,
  target_id: thoughtNode.id,
  kind: "child",
  created_at: task.created_at,
};

const thoughtNestedEdge: Edge = {
  id: "edge-thought-nested-delete",
  source_id: thoughtNode.id,
  target_id: nestedNode.id,
  kind: "child",
  created_at: task.created_at,
};

async function seedGraph() {
  await insertTask(task);
  await insertNode(taskNode);
  await insertNode(thoughtNode, thoughtNode.text);
  await insertNode(nestedNode, nestedNode.text);
  await insertEdge(taskThoughtEdge);
  await insertEdge(thoughtNestedEdge);
  useGraph.setState({
    tasks: [task],
    nodes: [taskNode, thoughtNode, nestedNode],
    edges: [taskThoughtEdge, thoughtNestedEdge],
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
  it("deletes a selected task, its full child subtree, and its task row", async () => {
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

  it("deletes a selected idea and clears its connected edges and selection", async () => {
    await seedGraph();
    useGraph.setState({ selection: new Set([thoughtNode.id]) });

    await useGraph.getState().removeSelection();

    expect(useGraph.getState().tasks).toHaveLength(1);
    expect(useGraph.getState().nodes.map((n) => n.id)).toEqual([taskNode.id, nestedNode.id]);
    expect(useGraph.getState().edges).toEqual([]);
    expect(useGraph.getState().selection.size).toBe(0);
    const persisted = await loadGraph();
    expect(persisted.nodes.map((n) => n.id)).toEqual([taskNode.id, nestedNode.id]);
    expect(persisted.edges).toEqual([]);
  });
});
