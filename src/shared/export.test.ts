// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { importGraphJson, parseGraphJson } from "./export";
import { clearLocalData, loadGraph } from "./store";
import type { GraphSnapshot } from "./graph";

function seedLocalStorage(snap: Partial<GraphSnapshot>, key = "qpm-thoughtline-graph-v1") {
  localStorage.setItem(
    key,
    JSON.stringify({ tasks: [], nodes: [], edges: [], ...snap }),
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("parseGraphJson", () => {
  it("rejects invalid payloads", () => {
    expect(parseGraphJson("not json")).toBeNull();
    expect(parseGraphJson("{}")).toBeNull();
    expect(parseGraphJson('{"tasks":1,"nodes":[],"edges":[]}')).toBeNull();
  });

  it("accepts an unversioned snapshot for backwards compatibility", () => {
    const raw = JSON.stringify({ tasks: [], nodes: [], edges: [] });
    expect(parseGraphJson(raw)).toEqual({ tasks: [], nodes: [], edges: [] });
  });

  it("accepts current and legacy backup format markers", () => {
    expect(
      parseGraphJson(JSON.stringify({ format: "qpm-box-graph", tasks: [], nodes: [], edges: [] })),
    ).toEqual({ tasks: [], nodes: [], edges: [] });
    expect(
      parseGraphJson(JSON.stringify({ format: "qpm-thoughtline-graph", tasks: [], nodes: [], edges: [] })),
    ).toEqual({ tasks: [], nodes: [], edges: [] });
    expect(
      parseGraphJson(JSON.stringify({ format: "other-app", tasks: [], nodes: [], edges: [] })),
    ).toBeNull();
  });

  it("migrates a legacy browser snapshot on first read", async () => {
    seedLocalStorage(
      {
        tasks: [
          {
            id: "legacy-task",
            title: "旧数据",
            goal: "",
            status: "running",
            source: "manual",
            created_at: "2026-01-01",
            updated_at: "2026-01-01",
            meta: {},
          },
        ],
        nodes: [],
        edges: [],
      },
      "qpm-box-graph-v1",
    );

    expect((await loadGraph()).tasks[0]?.title).toBe("旧数据");
    expect(localStorage.getItem("qpm-thoughtline-graph-v1")).not.toBeNull();
  });
});

describe("importGraphJson merge rules", () => {
  it("adds incoming items not present locally", async () => {
    seedLocalStorage({ tasks: [], nodes: [], edges: [] });
    const incoming = {
      tasks: [
        {
          id: "t1",
          title: "新任务",
          goal: "",
          status: "running",
          source: "manual",
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
          meta: {},
        },
      ],
      nodes: [],
      edges: [],
    };
    const res = await importGraphJson(JSON.stringify(incoming));
    expect(res).toEqual({ tasks: 1, nodes: 0, edges: 0 });
    const snap = await loadGraph();
    expect(snap.tasks.map((t) => t.title)).toEqual(["新任务"]);
  });

  it("keeps local when incoming is older, overwrites when newer", async () => {
    seedLocalStorage({
      tasks: [
        {
          id: "t1",
          title: "本地较新",
          goal: "",
          status: "running",
          source: "manual",
          created_at: "2026-01-01",
          updated_at: "2026-01-02",
          meta: {},
        },
      ],
      nodes: [],
      edges: [],
    });
    const older = await importGraphJson(
      JSON.stringify({
        tasks: [
          {
            id: "t1",
            title: "导入较旧",
            goal: "",
            status: "done",
            source: "manual",
            created_at: "2026-01-01",
            updated_at: "2026-01-01",
            meta: {},
          },
        ],
        nodes: [],
        edges: [],
      }),
    );
    expect(older).not.toBeNull();
    expect((await loadGraph()).tasks[0].title).toBe("本地较新");

    const newer = await importGraphJson(
      JSON.stringify({
        tasks: [
          {
            id: "t1",
            title: "导入更新",
            goal: "",
            status: "done",
            source: "manual",
            created_at: "2026-01-01",
            updated_at: "2026-01-03",
            meta: {},
          },
        ],
        nodes: [],
        edges: [],
      }),
    );
    expect(newer).not.toBeNull();
    expect((await loadGraph()).tasks[0].title).toBe("导入更新");
  });

  it("clearLocalData empties the snapshot", async () => {
    seedLocalStorage({
      tasks: [
        {
          id: "t1",
          title: "x",
          goal: "",
          status: "running",
          source: "manual",
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
          meta: {},
        },
      ],
      nodes: [],
      edges: [],
    });
    expect((await loadGraph()).tasks).toHaveLength(1);
    clearLocalData();
    expect((await loadGraph()).tasks).toHaveLength(0);
  });
});
