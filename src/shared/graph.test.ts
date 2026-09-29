import { describe, expect, it } from "vitest";
import {
  DOCUMENT_FORMAT,
  DOCUMENT_SCHEMA_VERSION,
  createEmptyDocument,
  validateDocument,
} from "./document";
import { centerOf, nodeSize, progressOf, withProgress, type GraphNode } from "./graph";

const taskId = "11111111-1111-4111-8111-111111111111";
const thoughtId = "22222222-2222-4222-8222-222222222222";
const taskCanvasId = "33333333-3333-4333-8333-333333333333";
const thoughtCanvasId = "44444444-4444-4444-8444-444444444444";
const edgeId = "55555555-5555-4555-8555-555555555555";
const createdAt = "2026-01-01T00:00:00.000Z";
const updatedAt = "2026-01-02T00:00:00.000Z";

function validDocument() {
  return {
    format: DOCUMENT_FORMAT,
    schema_version: DOCUMENT_SCHEMA_VERSION,
    document_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    revision: 3,
    created_at: createdAt,
    updated_at: updatedAt,
    tasks: [
      {
        id: taskId,
        title: "任务",
        goal: "目标",
        status: "running",
        archived_at: null,
        created_at: createdAt,
        updated_at: updatedAt,
      },
    ],
    thoughts: [
      {
        id: thoughtId,
        task_id: taskId,
        content: "想法",
        progress: "todo",
        handled_at: null,
        created_at: createdAt,
        updated_at: updatedAt,
      },
    ],
    outputs: [],
    canvas_nodes: [
      {
        id: taskCanvasId,
        entity_type: "task",
        entity_id: taskId,
        position: { x: 0, y: 0 },
        size: { width: 240, height: 100 },
        collapsed: false,
        created_at: createdAt,
        updated_at: updatedAt,
      },
      {
        id: thoughtCanvasId,
        entity_type: "thought",
        entity_id: thoughtId,
        position: { x: 300, y: 0 },
        size: { width: 200, height: 88 },
        collapsed: false,
        created_at: createdAt,
        updated_at: updatedAt,
      },
    ],
    edges: [
      {
        id: edgeId,
        source_node_id: taskCanvasId,
        target_node_id: thoughtCanvasId,
        kind: "child",
        created_at: createdAt,
        updated_at: updatedAt,
      },
    ],
  };
}

describe("canonical document validation", () => {
  it("creates an empty versioned document", () => {
    const document = createEmptyDocument(createdAt);
    expect(document).toMatchObject({
      format: DOCUMENT_FORMAT,
      schema_version: 1,
      revision: 0,
      created_at: createdAt,
      updated_at: createdAt,
      tasks: [],
      thoughts: [],
      outputs: [],
      canvas_nodes: [],
      edges: [],
    });
    expect(document.document_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/);
    expect(validateDocument(document)).toEqual(document);
  });

  it("accepts the complete canonical fixture", () => {
    expect(validateDocument(validDocument())).toMatchObject({
      document_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      tasks: [{ id: taskId }],
      thoughts: [{ id: thoughtId }],
      edges: [{ id: edgeId }],
    });
  });

  it("rejects old formats, unknown schema versions, and extra fields", () => {
    expect(() => validateDocument({ tasks: [], nodes: [], edges: [] })).toThrow();
    expect(() => validateDocument({ ...validDocument(), format: "qpm-thoughtline-graph" })).toThrow();
    expect(() => validateDocument({ ...validDocument(), schema_version: 2 })).toThrow();
    expect(() => validateDocument({ ...validDocument(), legacy: true })).toThrow();
  });

  it("rejects duplicate IDs and dangling references", () => {
    const duplicate = validDocument();
    duplicate.thoughts.push({ ...duplicate.thoughts[0] });
    expect(() => validateDocument(duplicate)).toThrow(/IDs must be unique/);

    const dangling = validDocument();
    dangling.thoughts[0].task_id = "99999999-9999-4999-8999-999999999999";
    expect(() => validateDocument(dangling)).toThrow(/unknown task/);
  });
});

describe("canvas view helpers", () => {
  const node: GraphNode = {
    id: thoughtCanvasId,
    kind: "thought",
    ref_id: taskId,
    x: 10,
    y: 20,
    width: 200,
    height: 88,
    collapsed: false,
    created_at: createdAt,
    updated_at: updatedAt,
    text: "想法",
    handled_at: null,
    progress: "todo",
  };

  it("uses explicit geometry and center", () => {
    expect(nodeSize(node)).toEqual({ w: 200, h: 88 });
    expect(centerOf(node)).toEqual({ x: 110, y: 64 });
  });

  it("keeps progress and handled state together", () => {
    const done = withProgress(node, "done");
    expect(done.progress).toBe("done");
    expect(done.handled_at).toBeTruthy();
    expect(progressOf({ ...node, progress: undefined })).toBe("todo");
  });
});
