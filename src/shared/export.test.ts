// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { importGraphJson, parseDocumentJson } from "./export";
import { createEmptyDocument } from "./document";
import { clearLocalData, loadDocument, loadGraph } from "./store";

const taskId = "11111111-1111-4111-8111-111111111111";
const createdAt = "2026-01-01T00:00:00.000Z";

function documentWithTask(title: string) {
  const document = createEmptyDocument(createdAt);
  document.document_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  document.tasks.push({
    id: taskId,
    title,
    goal: "",
    status: "running",
    archived_at: null,
    created_at: createdAt,
    updated_at: createdAt,
  });
  return document;
}

beforeEach(() => {
  localStorage.clear();
});

describe("canonical JSON import", () => {
  it("rejects malformed, old, and unknown-version payloads", () => {
    expect(parseDocumentJson("not json")).toBeNull();
    expect(parseDocumentJson(JSON.stringify({ tasks: [], nodes: [], edges: [] }))).toBeNull();
    expect(parseDocumentJson(JSON.stringify({ ...documentWithTask("x"), schema_version: 2 }))).toBeNull();
    expect(parseDocumentJson(JSON.stringify({ ...documentWithTask("x"), format: "qpm-thoughtline-graph" }))).toBeNull();
  });

  it("replaces the complete local document atomically", async () => {
    const incoming = documentWithTask("恢复后的任务");
    const result = await importGraphJson(JSON.stringify(incoming));
    expect(result).toMatchObject({ document_id: incoming.document_id, tasks: 1, thoughts: 0, outputs: 0 });
    expect((await loadDocument()).tasks[0].title).toBe("恢复后的任务");
    expect((await loadGraph()).tasks[0].title).toBe("恢复后的任务");
  });

  it("does not change local data when validation fails", async () => {
    await importGraphJson(JSON.stringify(documentWithTask("保留的数据")));
    const before = await loadDocument();
    expect(await importGraphJson(JSON.stringify({ ...before, schema_version: 99 }))).toBeNull();
    expect((await loadDocument()).tasks[0].title).toBe("保留的数据");
  });

  it("initializes a new canonical document and clears only the new store", async () => {
    const document = await loadDocument();
    expect(document.tasks).toEqual([]);
    expect(localStorage.getItem("qpm-thoughtline-document")).not.toBeNull();
    localStorage.setItem("qpm-thoughtline-graph-v1", "legacy");
    clearLocalData();
    expect((await loadDocument()).tasks).toEqual([]);
    expect(localStorage.getItem("qpm-thoughtline-graph-v1")).toBe("legacy");
  });
});
