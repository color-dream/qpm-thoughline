import type { Edge, GraphNode, GraphSnapshot, Progress, Task } from "./graph";
import { nowIso, progressFromMeta, sanitizeSnapshot, uid } from "./graph";
import { capturedThoughtPosition, findFreeRect } from "./layout";

/** Browser fallback when Tauri SQL plugin is unavailable */
const LS_KEY = "qpm-thoughtline-graph-v1";
const LEGACY_LS_KEY = "qpm-box-graph-v1";
const BACKUP_TS_KEY = "qpm-thoughtline-last-export";
const LEGACY_BACKUP_TS_KEY = "qpm-box-last-export";
const DB_NAME = "sqlite:qpm-thoughtline.db";

function migrateLegacyLocalStorage(): void {
  try {
    if (localStorage.getItem(LS_KEY) === null) {
      const legacy = localStorage.getItem(LEGACY_LS_KEY);
      if (legacy !== null) localStorage.setItem(LS_KEY, legacy);
    }
    if (localStorage.getItem(BACKUP_TS_KEY) === null) {
      const legacyBackup = localStorage.getItem(LEGACY_BACKUP_TS_KEY);
      if (legacyBackup !== null) localStorage.setItem(BACKUP_TS_KEY, legacyBackup);
    }
  } catch {
    /* ignore unavailable or quota-limited storage */
  }
}

export function markExported() {
  migrateLegacyLocalStorage();
  try {
    localStorage.setItem(BACKUP_TS_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

export function lastExportedAt(): string | null {
  migrateLegacyLocalStorage();
  try {
    return localStorage.getItem(BACKUP_TS_KEY);
  } catch {
    return null;
  }
}

/** Approximate local storage footprint of the graph snapshot (bytes) */
export function storageUsage(): number {
  migrateLegacyLocalStorage();
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? raw.length * 2 : 0; // UTF-16 code units
  } catch {
    return 0;
  }
}

/** DANGER: wipe local graph data (double-confirm lives in the UI) */
export function clearLocalData(): void {
  try {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LEGACY_LS_KEY);
    localStorage.removeItem(BACKUP_TS_KEY);
    localStorage.removeItem(LEGACY_BACKUP_TS_KEY);
  } catch {
    /* ignore */
  }
}

type DbLike = {
  select: <T>(sql: string, bind?: unknown[]) => Promise<T>;
  execute: (sql: string, bind?: unknown[]) => Promise<{ rowsAffected: number }>;
};

let dbPromise: Promise<DbLike | null> | null = null;

async function getDb(): Promise<DbLike | null> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const { default: Database } = await import("@tauri-apps/plugin-sql");
        const db = await Database.load(DB_NAME);
        return db as unknown as DbLike;
      } catch {
        return null;
      }
    })();
  }
  return dbPromise;
}

function lsLoad(): GraphSnapshot {
  migrateLegacyLocalStorage();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { tasks: [], nodes: [], edges: [] };
    return sanitizeSnapshot(JSON.parse(raw) as GraphSnapshot);
  } catch {
    return { tasks: [], nodes: [], edges: [] };
  }
}

function lsSave(snap: GraphSnapshot) {
  localStorage.setItem(LS_KEY, JSON.stringify(snap));
}

export async function loadGraph(): Promise<GraphSnapshot> {
  const db = await getDb();
  if (!db) return lsLoad();

  const tasks = await db.select<Task[]>("SELECT * FROM tasks ORDER BY created_at ASC");
  const nodeRows = await db.select<Array<Omit<GraphNode, "collapsed"> & { collapsed: number | boolean }>>(
    "SELECT * FROM nodes ORDER BY created_at ASC",
  );
  const edgeRows = await db.select<Edge[]>("SELECT * FROM edges ORDER BY created_at ASC");
  // content row is keyed by node id (task_id column holds the association)
  const thoughtRows = await db.select<Array<{ id: string; content_text: string; kind: string; meta: string }>>(
    "SELECT id, content_text, kind, meta FROM thoughts",
  );
  const thoughtMap = new Map(thoughtRows.map((t) => [t.id, t]));

  return {
    tasks,
    nodes: nodeRows.map((n) => {
      const th = n.kind === "thought" || n.kind === "ai" || n.kind === "free" ? thoughtMap.get(n.id) : undefined;
      let handledAt: string | null = null;
      let progress: Progress | undefined;
      if (th?.meta) {
        try {
          const meta = JSON.parse(th.meta) as { handled_at?: string | null; progress?: unknown };
          handledAt = meta.handled_at ?? null;
          progress = progressFromMeta(meta);
        } catch {
          handledAt = null;
        }
      }
      return {
        ...n,
        collapsed: !!n.collapsed,
        text: th?.content_text ?? n.text,
        pending: (n.kind === "thought" || n.kind === "free") && th?.kind === "idea",
        handled_at: handledAt,
        progress,
        title: n.kind === "task" ? tasks.find((t) => t.id === n.ref_id)?.title : undefined,
      } satisfies GraphNode;
    }),
    edges: edgeRows,
  };
}

export async function insertTask(input: {
  id: string;
  title: string;
  goal?: string;
  status?: Task["status"];
  source?: string;
  meta?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}): Promise<Task> {
  const t: Task = {
    id: input.id,
    title: input.title,
    goal: input.goal ?? "",
    status: input.status ?? "running",
    source: input.source ?? "manual",
    meta: input.meta ?? {},
    created_at: input.created_at || nowIso(),
    updated_at: input.updated_at || nowIso(),
  };

  const db = await getDb();
  if (db) {
    await db.execute(
      `INSERT OR REPLACE INTO tasks (id,title,goal,status,source,created_at,updated_at,meta)
       VALUES (?,?,?,?,?,?,?,?)`,
      [t.id, t.title, t.goal, t.status, t.source, t.created_at, t.updated_at, JSON.stringify(t.meta)],
    );
    return t;
  }
  const snap = lsLoad();
  snap.tasks = [...snap.tasks.filter((x) => x.id !== t.id), t];
  lsSave(snap);
  return t;
}

export async function updateTaskStatus(id: string, status: Task["status"]) {
  const ts = nowIso();
  const db = await getDb();
  if (db) {
    await db.execute("UPDATE tasks SET status=?, updated_at=? WHERE id=?", [status, ts, id]);
    return;
  }
  const snap = lsLoad();
  snap.tasks = snap.tasks.map((t) => (t.id === id ? { ...t, status, updated_at: ts } : t));
  lsSave(snap);
}

/** Delete the task row (canvas cascade is handled by deleteNodes on the task node) */
export async function deleteTaskRow(id: string) {
  const db = await getDb();
  if (db) {
    await db.execute("DELETE FROM tasks WHERE id=?", [id]);
    return;
  }
  const snap = lsLoad();
  snap.tasks = snap.tasks.filter((t) => t.id !== id);
  lsSave(snap);
}

export async function insertNode(n: GraphNode, text?: string) {
  const db = await getDb();
  if (db) {
    await db.execute(
      `INSERT OR REPLACE INTO nodes (id,kind,ref_id,x,y,width,height,collapsed,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        n.id,
        n.kind,
        n.ref_id,
        n.x,
        n.y,
        n.width,
        n.height,
        n.collapsed ? 1 : 0,
        n.created_at,
        n.updated_at,
      ],
    );
    if ((n.kind === "thought" || n.kind === "ai" || n.kind === "free") && text != null) {
      await db.execute(
        `INSERT OR REPLACE INTO thoughts (id,task_id,content_text,kind,origin,created_at,updated_at,meta)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          n.id,
          n.kind === "free" ? null : n.ref_id,
          text,
          n.kind === "ai" ? "other" : "idea",
          "hotkey",
          n.created_at,
          n.updated_at,
          n.progress ? JSON.stringify({ progress: n.progress }) : "{}",
        ],
      );
    } else if ((n.kind === "thought" || n.kind === "ai" || n.kind === "free") && (n.handled_at != null || n.progress)) {
      // text unchanged but handled flag / progress needs persisting
      await db.execute(`UPDATE thoughts SET meta=? WHERE id=?`, [
        JSON.stringify({ ...(n.handled_at != null ? { handled_at: n.handled_at } : {}), ...(n.progress ? { progress: n.progress } : {}) }),
        n.id,
      ]);
    }
    return;
  }
  const snap = lsLoad();
  snap.nodes = [...snap.nodes.filter((x) => x.id !== n.id), { ...n, text: text ?? n.text }];
  lsSave(snap);
}

export async function updateNodePos(id: string, x: number, y: number) {
  const ts = nowIso();
  const db = await getDb();
  if (db) {
    await db.execute("UPDATE nodes SET x=?, y=?, updated_at=? WHERE id=?", [x, y, ts, id]);
    return;
  }
  const snap = lsLoad();
  snap.nodes = snap.nodes.map((n) => (n.id === id ? { ...n, x, y, updated_at: ts } : n));
  lsSave(snap);
}

export async function updateNodeCollapsed(id: string, collapsed: boolean) {
  const ts = nowIso();
  const db = await getDb();
  if (db) {
    await db.execute("UPDATE nodes SET collapsed=?, updated_at=? WHERE id=?", [collapsed ? 1 : 0, ts, id]);
    return;
  }
  const snap = lsLoad();
  snap.nodes = snap.nodes.map((n) => (n.id === id ? { ...n, collapsed, updated_at: ts } : n));
  lsSave(snap);
}

/** Persist edited content for a thought/ai/free node */
export async function updateNodeText(id: string, text: string) {
  const ts = nowIso();
  const db = await getDb();
  if (db) {
    await db.execute("UPDATE thoughts SET content_text=?, updated_at=? WHERE id=?", [text, ts, id]);
    return;
  }
  const snap = lsLoad();
  snap.nodes = snap.nodes.map((n) => (n.id === id ? { ...n, text, updated_at: ts } : n));
  lsSave(snap);
}

/** Persist task title/goal */
export async function updateTaskFields(id: string, fields: { title?: string; goal?: string }) {
  const ts = nowIso();
  const db = await getDb();
  if (db) {
    await db.execute("UPDATE tasks SET title=COALESCE(?, title), goal=COALESCE(?, goal), updated_at=? WHERE id=?", [
      fields.title ?? null,
      fields.goal ?? null,
      ts,
      id,
    ]);
    return;
  }
  const snap = lsLoad();
  snap.tasks = snap.tasks.map((t) =>
    t.id === id ? { ...t, ...fields, updated_at: ts } : t,
  );
  lsSave(snap);
}

/** Mark an idea consumed (fed to AI) or back to pending */
export async function setThoughtHandled(id: string, handled: boolean) {
  const ts = nowIso();
  const handledAt = handled ? ts : null;
  const db = await getDb();
  if (db) {
    // read-modify-write: meta also carries progress; never clobber it
    const rows = await db.select<Array<{ meta: string }>>("SELECT meta FROM thoughts WHERE id=?", [id]);
    let meta: Record<string, unknown> = {};
    try {
      meta = rows[0]?.meta ? JSON.parse(rows[0].meta) : {};
    } catch {
      meta = {};
    }
    if (handledAt) meta.handled_at = handledAt;
    else delete meta.handled_at;
    await db.execute("UPDATE thoughts SET meta=?, updated_at=? WHERE id=?", [
      JSON.stringify(meta),
      ts,
      id,
    ]);
    return;
  }
  const snap = lsLoad();
  snap.nodes = snap.nodes.map((n) => (n.id === id ? { ...n, handled_at: handledAt } : n));
  lsSave(snap);
}

/** Set the manual progress marker on an idea-like node (thoughts.meta.progress) */
export async function updateNodeProgress(id: string, progress: Progress) {
  const ts = nowIso();
  const db = await getDb();
  if (db) {
    const rows = await db.select<Array<{ meta: string }>>("SELECT meta FROM thoughts WHERE id=?", [id]);
    let meta: Record<string, unknown> = {};
    try {
      meta = rows[0]?.meta ? JSON.parse(rows[0].meta) : {};
    } catch {
      meta = {};
    }
    meta.progress = progress;
    await db.execute("UPDATE thoughts SET meta=?, updated_at=? WHERE id=?", [
      JSON.stringify(meta),
      ts,
      id,
    ]);
    return;
  }
  const snap = lsLoad();
  snap.nodes = snap.nodes.map((n) => (n.id === id ? { ...n, progress, updated_at: ts } : n));
  lsSave(snap);
}

/** Archive / unarchive a task (meta.archived_at; data is kept, lists hide it) */
export async function setTaskArchived(id: string, archived: boolean) {
  const ts = nowIso();
  const archivedAt = archived ? ts : null;
  const db = await getDb();
  if (db) {
    const rows = await db.select<Array<{ meta: string }>>("SELECT meta FROM tasks WHERE id=?", [id]);
    let meta: Record<string, unknown> = {};
    try {
      meta = rows[0]?.meta ? JSON.parse(rows[0].meta) : {};
    } catch {
      meta = {};
    }
    if (archivedAt) meta.archived_at = archivedAt;
    else delete meta.archived_at;
    await db.execute("UPDATE tasks SET meta=?, updated_at=? WHERE id=?", [
      JSON.stringify(meta),
      ts,
      id,
    ]);
    return;
  }
  const snap = lsLoad();
  snap.tasks = snap.tasks.map((t) => {
    if (t.id !== id) return t;
    const meta = { ...(t.meta || {}) };
    if (archivedAt) meta.archived_at = archivedAt;
    else delete meta.archived_at;
    return { ...t, meta, updated_at: ts };
  });
  lsSave(snap);
}

export async function insertEdge(e: Edge) {
  const db = await getDb();
  if (db) {
    await db.execute(
      `INSERT OR REPLACE INTO edges (id,source_id,target_id,kind,created_at) VALUES (?,?,?,?,?)`,
      [e.id, e.source_id, e.target_id, e.kind, e.created_at],
    );
    return;
  }
  const snap = lsLoad();
  snap.edges = [...snap.edges.filter((x) => x.id !== e.id), e];
  lsSave(snap);
}

export async function deleteNodes(ids: string[]) {
  if (!ids.length) return;
  const db = await getDb();
  if (db) {
    const ph = ids.map(() => "?").join(",");
    await db.execute(`DELETE FROM edges WHERE source_id IN (${ph}) OR target_id IN (${ph})`, [...ids, ...ids]);
    await db.execute(`DELETE FROM nodes WHERE id IN (${ph})`, ids);
    await db.execute(`DELETE FROM thoughts WHERE id IN (${ph})`, ids);
    return;
  }
  const snap = lsLoad();
  const set = new Set(ids);
  snap.nodes = snap.nodes.filter((n) => !set.has(n.id));
  snap.edges = snap.edges.filter((e) => !set.has(e.source_id) && !set.has(e.target_id));
  lsSave(snap);
}

export async function deleteEdge(id: string) {
  const db = await getDb();
  if (db) {
    await db.execute("DELETE FROM edges WHERE id=?", [id]);
    return;
  }
  const snap = lsLoad();
  snap.edges = snap.edges.filter((e) => e.id !== id);
  lsSave(snap);
}

/** Seed demo tasks on first run if empty */
let seeding: Promise<void> | null = null;
export async function ensureSeed(): Promise<void> {
  // StrictMode / double-invoke guard: both calls must observe the same decision
  if (!seeding) {
    seeding = (async () => {
      const snap = await loadGraph();
      if (snap.tasks.length > 0 || snap.nodes.length > 0) return;
      await seedDemoGraph();
    })();
  }
  return seeding;
}

async function seedDemoGraph(): Promise<void> {

  const t1 = await insertTask({
    id: "task_login",
    title: "重构登录模块",
    goal: "把登录重构为 OAuth + 本地密码，兼容现有 session",
    status: "running",
    source: "manual",
  });
  const t2 = await insertTask({
    id: "task_report",
    title: "竞品调研报告",
    goal: "调研 5 个竞品的 AI 协作功能",
    status: "running",
    source: "manual",
  });

  const seedNodes: Array<[GraphNode, string?]> = [
    [
      {
        id: "n_task_login",
        kind: "task",
        ref_id: t1.id,
        x: 80,
        y: 160,
        width: 240,
        height: 100,
        collapsed: false,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ],
    [
      {
        id: "th_login_1",
        kind: "thought",
        ref_id: t1.id,
        x: -40,
        y: -20,
        width: 200,
        height: 88,
        collapsed: false,
        created_at: nowIso(),
        updated_at: nowIso(),
        handled_at: nowIso(),
      },
      "先兼容现有 session 格式，灰度期双写校验",
    ],
    [
      {
        id: "th_login_2",
        kind: "thought",
        ref_id: t1.id,
        x: 360,
        y: -40,
        width: 200,
        height: 88,
        collapsed: false,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
      "还要兼容第三方 OAuth，别只做密码登录",
    ],
    [
      {
        id: "th_login_3",
        kind: "thought",
        ref_id: t1.id,
        x: 380,
        y: 120,
        width: 200,
        height: 88,
        collapsed: false,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
      "别忘了设备指纹字段，风控要接",
    ],
    [
      {
        id: "ai_login_1",
        kind: "ai",
        ref_id: t1.id,
        x: 200,
        y: 300,
        width: 200,
        height: 88,
        collapsed: false,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
      "阶段 1–2 完成：AuthProvider + LegacySession",
    ],
    [
      {
        id: "n_task_report",
        kind: "task",
        ref_id: t2.id,
        x: 720,
        y: 80,
        width: 240,
        height: 100,
        collapsed: false,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ],
    [
      {
        id: "th_report_1",
        kind: "thought",
        ref_id: t2.id,
        x: 980,
        y: 0,
        width: 200,
        height: 88,
        collapsed: false,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
      "先做功能矩阵，再写机会点",
    ],
    [
      {
        id: "free_1",
        kind: "free",
        ref_id: null,
        x: 40,
        y: 480,
        width: 200,
        height: 88,
        collapsed: false,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
      "下个季度要不要做一个播客？先记着",
    ],
  ];

  for (const [n, text] of seedNodes) {
    await insertNode(n, text);
  }

  const seedEdges: Edge[] = [
    { id: uid("e"), source_id: "n_task_login", target_id: "th_login_1", kind: "child", created_at: nowIso() },
    { id: uid("e"), source_id: "n_task_login", target_id: "th_login_2", kind: "child", created_at: nowIso() },
    { id: uid("e"), source_id: "n_task_login", target_id: "th_login_3", kind: "child", created_at: nowIso() },
    { id: uid("e"), source_id: "n_task_login", target_id: "ai_login_1", kind: "child", created_at: nowIso() },
    { id: uid("e"), source_id: "th_login_2", target_id: "th_login_3", kind: "related", created_at: nowIso() },
    { id: uid("e"), source_id: "n_task_report", target_id: "th_report_1", kind: "child", created_at: nowIso() },
  ];
  for (const e of seedEdges) await insertEdge(e);
}

/** Capture path: thought + node + child edge. `at` overrides the default drop position */
export async function saveCapturedThought(opts: {
  text: string;
  taskId: string | null;
  at?: { x: number; y: number };
}): Promise<{ nodeId: string }> {
  const ts = nowIso();
  const snap = await loadGraph();
  const desired = opts.at ?? capturedThoughtPosition(snap.nodes, snap.edges, opts.taskId);
  // never stack on top of an existing card: shift to the nearest free spot
  const pos = findFreeRect(snap.nodes, desired);
  const nodeId = uid("n");

  await insertNode(
    {
      id: nodeId,
      kind: opts.taskId ? "thought" : "free",
      ref_id: opts.taskId,
      x: pos.x,
      y: pos.y,
      width: 200,
      height: 88,
      collapsed: false,
      created_at: ts,
      updated_at: ts,
    },
    opts.text,
  );

  if (opts.taskId) {
    const taskNode = snap.nodes.find((n) => n.kind === "task" && n.ref_id === opts.taskId);
    if (taskNode) {
      await insertEdge({
        id: uid("e"),
        source_id: taskNode.id,
        target_id: nodeId,
        kind: "child",
        created_at: ts,
      });
    }
  }
  return { nodeId };
}
