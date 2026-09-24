import { useCallback, useEffect, useRef, useState } from "react";
import { applyTheme } from "./main";
import Canvas from "./features/canvas/Canvas";
import Settings from "./features/settings/Settings";
import { progressOf } from "./shared/graph";
import { useGraph, type CtxMenuItem } from "./store/graphStore";

type Toast = { id: number; title: string; sub?: string };

function TaskRow({ t }: { t: { id: string; title: string; status: string } }) {
  const focusTask = useGraph((s) => s.focusTask);
  const focusTaskById = useGraph((s) => s.focusTaskById);
  const completeTask = useGraph((s) => s.completeTask);
  const nodes = useGraph((s) => s.nodes);
  const kidCount = nodes.filter((n) => n.ref_id === t.id && n.kind !== "task").length;
  const statusText =
    t.status === "running"
      ? "进行中"
      : t.status === "done"
        ? "已完成"
        : t.status;

  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const st = useGraph.getState();
    st.closeCtxMenu();
    const items: CtxMenuItem[] = [
      { label: "打开画布", onClick: () => st.focusTaskById(t.id) },
    ];
    if (t.status !== "done") {
      items.push({ label: "标记完成", onClick: () => void st.completeTask(t.id) });
    } else {
      items.push({ label: "重新打开", onClick: () => void st.reopenTask(t.id) });
      items.push({ label: "归档", onClick: () => void st.archiveTask(t.id) });
    }
    items.push({
      label: "删除任务",
      danger: true,
      onClick: () => {
        if (window.confirm(`删除任务「${t.title}」及其全部想法?不可恢复。`)) {
          void st.deleteTask(t.id);
        }
      },
    });
    st.openCtxMenu({ x: e.clientX, y: e.clientY, items });
  };

  return (
    <div className="task-row">
      <button
        type="button"
        className={"task-item" + (focusTask === t.id ? " active" : "")}
        onClick={() => focusTaskById(t.id)}
        onContextMenu={openMenu}
      >
        <div className="t-name">
          <span className={"dot-run" + (t.status === "done" ? " done" : "")} />
          {t.title}
        </div>
        <div className="t-meta">
          <span>{kidCount} 节点</span>
          <span>{statusText}</span>
        </div>
      </button>
      {t.status !== "done" && focusTask === t.id ? (
        <button
          type="button"
          className="btn btn-sm btn-ghost task-done"
          title="标记完成"
          onClick={() => void completeTask(t.id)}
        >
          完成
        </button>
      ) : null}
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState<string>(
    () => document.documentElement.getAttribute("data-theme") || "light",
  );
  const [captureOpen, setCaptureOpen] = useState(false);
  const [text, setText] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [poolOpen, setPoolOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskDraft, setTaskDraft] = useState<{ title: string; goal: string }>({ title: "", goal: "" });
  const [view, setView] = useState<"canvas" | "settings">("canvas");

  const tasks = useGraph((s) => s.tasks);
  const nodes = useGraph((s) => s.nodes);
  const loaded = useGraph((s) => s.loaded);
  const init = useGraph((s) => s.init);
  const capture = useGraph((s) => s.capture);
  const createTask = useGraph((s) => s.createTask);
  const notificationTaskId = useGraph((s) => s.notificationTaskId);
  const ctxMenu = useGraph((s) => s.ctxMenu);

  const showToast = useCallback((title: string, sub?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, title, sub }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 2200);
  }, []);

  useEffect(() => {
    void init();
  }, [init]);

  // 完成后有未处理想法：应用内可点击横幅（系统通知的 onclick 已在 completeTask 里挂）
  useEffect(() => {
    if (!notificationTaskId) return;
    const t = tasks.find((x) => x.id === notificationTaskId);
    if (t) {
      showToast(
        `「${t.title}」还有想法未处理`,
        "点击此处回到画布继续",
      );
    }
  }, [notificationTaskId, tasks, showToast]);

  // toasts may carry an action: focus the notification task
  const activateNotificationToast = useCallback(() => {
    if (!notificationTaskId) return;
    useGraph.getState().focusTaskById(notificationTaskId);
    setView("canvas");
    useGraph.getState().clearNotification();
  }, [notificationTaskId]);

  const openCapture = useCallback(() => {
    setText("");
    setCaptureOpen(true);
  }, []);

  const closeCapture = useCallback(() => {
    setCaptureOpen(false);
    capturePosRef.current = null;
    useGraph.setState({ sequenceFromNodeId: null });
  }, []);

  const saveThought = useCallback(async () => {
    const v = text.trim();
    if (!v) return;
    const fromNodeId = useGraph.getState().sequenceFromNodeId;
    const at = capturePosRef.current ?? undefined;
    // 想法一律先入想法池;挂任务靠画布上拖线(端口→任务节点自动 child)
    const nodeId = await capture(v, null, at);
    capturePosRef.current = null;
    if (fromNodeId) {
      useGraph.getState().consumeCapture();
      await useGraph.getState().addEdge(fromNodeId, nodeId, "sequence");
      useGraph.setState({ sequenceFromNodeId: null });
    }
    const prefix = fromNodeId ? "已接下一步" : "已记入";
    showToast(prefix, v.slice(0, 40) + (v.length > 40 ? "…" : ""));
    setText("");
    await closeCapture();
    void nodeId;
  }, [text, capture, showToast, closeCapture]);

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }, [theme]);

  const submitTaskDraft = useCallback(async () => {
    const title = taskDraft.title.trim();
    if (!title) return;
    await createTask(title, taskDraft.goal.trim());
    setTaskModalOpen(false);
  }, [taskDraft, createTask]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (taskModalOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          setTaskModalOpen(false);
        }
        if (e.key === "Enter" && !e.shiftKey && taskDraft.title.trim()) {
          e.preventDefault();
          void submitTaskDraft();
        }
        return;
      }
      if (!captureOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        void closeCapture();
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void saveThought();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [captureOpen, closeCapture, saveThought, taskModalOpen, taskDraft, submitTaskDraft]);

  // canvas double-click requests a capture at that world position
  const pendingCapture = useGraph((s) => s.pendingCapture);
  const capturePosRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!pendingCapture) return;
    capturePosRef.current = pendingCapture;
    useGraph.getState().consumeCapture();
    openCapture();
  }, [pendingCapture, openCapture]);

  const freeNodes = nodes.filter((n) => n.kind === "free");
  const isArchived = (t: { meta: Record<string, unknown> }) => !!t.meta?.archived_at;
  const liveTasks = tasks.filter((t) => !isArchived(t));
  const archivedTasks = tasks.filter((t) => isArchived(t));

  // 全局禁用默认右键;输入框(select/input/textarea/contentEditable)保留系统菜单
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT" || el?.isContentEditable) return;
      e.preventDefault();
    };
    window.addEventListener("contextmenu", onCtx);
    return () => window.removeEventListener("contextmenu", onCtx);
  }, []);

  // 右键任意处(含页面非菜单区)关闭已打开的菜单;菜单自身 stopPropagation
  useEffect(() => {
    const close = () => useGraph.getState().closeCtxMenu();
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const captureUi = (
    <>
      <div className="cap-head">
        <div className="cap-brand">
          <span className="leaf sm" />
          念头
        </div>
        <span className="kbd">Enter 保存 · Esc 关闭</span>
      </div>
      <div className="cap-body">
        <textarea
          autoFocus
          value={text}
          placeholder="记下闪过的念头…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void saveThought();
            }
          }}
        />
        <div className="cap-foot">
          <div className="cap-actions">
            <button type="button" className="btn btn-ghost" onClick={() => void closeCapture()}>
              取消
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void saveThought()}>
              记下
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="shell">
      <header className="header">
        <div className="brand">
          <span className="leaf" />
          念头 <span className="sub">· qpm-thoughtline</span>
        </div>
        <nav className="tabs">
          <button
            type="button"
            className={"htab" + (view === "canvas" ? " active" : "")}
            onClick={() => setView("canvas")}
          >
            画布
          </button>
          <button
            type="button"
            className={"htab" + (poolOpen && view === "canvas" ? " active" : "")}
            onClick={() => {
              setView("canvas");
              setPoolOpen((v) => !v);
            }}
          >
            想法池
          </button>
          <button
            type="button"
            className={"htab" + (view === "settings" ? " active" : "")}
            onClick={() => setView("settings")}
          >
            设置
          </button>
        </nav>
        <div className="header-right">
          <button type="button" className="btn btn-sm btn-ghost" onClick={toggleTheme} title="切换明暗">
            {theme === "dark" ? "暗" : "明"}
          </button>
        </div>
      </header>

      <div className="body-row">
        <aside className="sidebar">
          <div className="side-head">
            <span>任务</span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              title="新建任务"
              onClick={() => {
                setTaskDraft({ title: "", goal: "" });
                setTaskModalOpen(true);
              }}
            >
              +
            </button>
          </div>
          <div className="task-list">
            {liveTasks.filter((t) => t.status !== "done").map((t) => (
              <TaskRow key={t.id} t={t} />
            ))}
            {liveTasks.some((t) => t.status === "done") && (
              <div className="side-group">已完成</div>
            )}
            {liveTasks.filter((t) => t.status === "done").map((t) => (
              <TaskRow key={t.id} t={t} />
            ))}
            {liveTasks.length === 0 && <div className="empty">还没有任务，点 + 新建</div>}
          </div>
          <div className="side-foot archive-foot">
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-block"
              onClick={() => setArchiveOpen((v) => !v)}
            >
              归档{archivedTasks.length > 0 ? ` (${archivedTasks.length})` : ""}
            </button>
          </div>
        </aside>

        <main className="main">
          {view === "settings" ? (
            <Settings theme={theme} onThemeChange={setTheme} />
          ) : loaded ? (
            <>
              <Canvas />
              {poolOpen && (
                <div className="pool-panel">
                  <div className="pool-head">想法池 · 未关联</div>
                  <div className="pool-list">
                    {freeNodes.length === 0 ? (
                      <div className="empty">暂无未关联想法</div>
                    ) : (
                      freeNodes.map((n) => (
                        <div
                          key={n.id}
                          className="pool-item"
                          onClick={() => useGraph.getState().jumpToNode(n.id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const st = useGraph.getState();
                            st.closeCtxMenu();
                            st.openCtxMenu({
                              x: e.clientX,
                              y: e.clientY,
                              items: [
                                { label: "在画布中定位", onClick: () => st.jumpToNode(n.id) },
                                {
                                  label: "删除想法",
                                  danger: true,
                                  onClick: () => void st.deleteNodeById(n.id),
                                },
                              ],
                            });
                          }}
                        >
                          {n.text || "（空）"}
                          <span className={`pool-tag ${n.progress ?? "todo"}`}>
                            {progressOf(n) === "todo" ? "待开始" : progressOf(n) === "doing" ? "进行中" : "已完成"}
                          </span>
                          <div className="meta">点击在画布中定位</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              {archiveOpen && (
                <div className="pool-panel archive-panel">
                  <div className="pool-head">归档 · 已完成任务</div>
                  <div className="pool-list">
                    {archivedTasks.length === 0 ? (
                      <div className="empty">暂无归档任务;完成任务后可在任务条上归档</div>
                    ) : (
                      archivedTasks.map((t) => (
                        <div key={t.id} className="pool-item archive-item">
                          <div className="ai-title">{t.title}</div>
                          <div className="meta">
                            {new Date(String(t.meta.archived_at)).toLocaleString("zh-CN")} 归档
                          </div>
                          <div className="archive-actions">
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              onClick={() => void useGraph.getState().unarchiveTask(t.id)}
                            >
                              取消归档
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="loading">加载中…</div>
          )}
        </main>
      </div>

      <footer className="status">
        <span>
          状态 <b>{loaded ? "就绪" : "加载中"}</b>
        </span>
        <span className="sep" />
        <span>qpm-thoughtline · 网页版</span>
        <span className="sep" />
        <span>
          {nodes.length} 节点 · {useGraph.getState().edges.length} 边
        </span>
      </footer>

      {captureOpen && (
        <div className="ov-root" role="presentation">
          <div className="ov-backdrop" onClick={() => void closeCapture()} aria-hidden="true" />
          <div className="capture" role="dialog" aria-label="快速记想法">
            {captureUi}
          </div>
        </div>
      )}

      <div className="toast-wrap" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={"toast show" + (notificationTaskId ? " clickable" : "")}
            onClick={notificationTaskId ? activateNotificationToast : undefined}
            role={notificationTaskId ? "button" : undefined}
          >
            {t.title}
            {t.sub ? <span className="t-sub">{t.sub}</span> : null}
          </div>
        ))}
      </div>

      {ctxMenu && <CtxMenuOverlay />}

      {taskModalOpen && (
        <div className="modal-backdrop" onClick={() => setTaskModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>新建任务</span>
              <button type="button" className="tbtn" onClick={() => setTaskModalOpen(false)}>
                关闭
              </button>
            </div>
            <div className="modal-body">
              <div className="edit-label">任务名称</div>
              <input
                className="edit-input"
                autoFocus
                value={taskDraft.title}
                placeholder="例如：重构登录模块"
                onChange={(e) => setTaskDraft({ ...taskDraft, title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && taskDraft.title.trim()) {
                    e.preventDefault();
                    void submitTaskDraft();
                  }
                }}
              />
              <div className="edit-label">目标 / 约束（可选）</div>
              <textarea
                className="ai-textarea"
                rows={3}
                value={taskDraft.goal}
                placeholder="交给 AI 的目标、约束、验收标准…"
                onChange={(e) => setTaskDraft({ ...taskDraft, goal: e.target.value })}
              />
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-ghost" onClick={() => setTaskModalOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!taskDraft.title.trim()}
                onClick={() => void submitTaskDraft()}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{css}</style>
    </div>
  );
}

function CtxMenuOverlay() {
  const ctxMenu = useGraph((s) => s.ctxMenu);
  if (!ctxMenu) return null;
  const W = 180;
  const ITEM_H = 36;
  const estH = ctxMenu.items.length * ITEM_H + 10;
  const x = Math.min(ctxMenu.x, window.innerWidth - W - 8);
  const y = Math.min(ctxMenu.y, window.innerHeight - estH - 8);
  return (
    <div
      className="ctx-menu"
      style={{ left: x, top: y }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {ctxMenu.items.map((item) => (
        <button
          key={item.label}
          type="button"
          className={"ctx-item" + (item.danger ? " danger" : "")}
          onClick={() => {
            useGraph.getState().closeCtxMenu();
            item.onClick();
          }}
        >
          {item.label}
          {item.kbd ? <span className="kbd">{item.kbd}</span> : null}
        </button>
      ))}
    </div>
  );
}

const css = `
.shell {
  display: grid;
  grid-template-rows: 48px 1fr 32px;
  height: 100%;
}
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  background: var(--panel);
  border-bottom: 1px solid var(--line-soft);
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 14px;
}
.brand .sub { color: var(--text-2); font-weight: 500; margin-left: 2px; }
.leaf {
  width: 18px;
  height: 18px;
  border-radius: 50% 6px 50% 6px;
  background: linear-gradient(145deg, #e0a07a 0%, #b85c38 50%, #8f4528 100%);
  box-shadow: 0 0 10px rgba(184, 92, 56, 0.35);
  flex-shrink: 0;
}
.leaf.sm { width: 14px; height: 14px; }
.tabs { display: flex; gap: 4px; margin-left: 8px; }
.htab {
  height: 28px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-2);
  border: none;
  background: transparent;
}
.htab:hover:not(:disabled) { color: var(--text); }
.htab.active { background: var(--elev-2); color: var(--text); }
.htab:disabled { opacity: 0.45; cursor: not-allowed; }
.header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.body-row {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 0;
}
.sidebar {
  background: var(--panel);
  border-right: 1px solid var(--line-soft);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.side-head {
  padding: 12px 12px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--text-3);
}
.task-list {
  flex: 1;
  overflow: auto;
  padding: 0 8px 12px;
}
.task-row {
  position: relative;
  margin-bottom: 6px;
}
.task-done {
  position: absolute;
  right: 8px;
  top: 8px;
  opacity: 0;
  transition: opacity 0.15s;
}
.task-row:hover .task-done {
  opacity: 1;
}
.task-item {
  width: 100%;
  text-align: left;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text);
  font-family: inherit;
}
.task-item:hover {
  background: var(--elev);
  border-color: var(--line-soft);
}
.task-item.active {
  background: var(--elev-2);
  border-color: var(--line);
}
.task-item .t-name {
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}
.task-item .t-meta {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 4px;
  display: flex;
  gap: 8px;
}
.dot-run {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-2);
  flex-shrink: 0;
}
.dot-run.done {
  background: var(--text-3);
  opacity: 0.5;
}
.side-group {
  padding: 12px 12px 6px;
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--text-3);
}
.task-list .empty {
  padding: 16px 12px;
  font-size: 12px;
  color: var(--text-3);
}
.side-foot {
  padding: 10px;
  border-top: 1px solid var(--line-soft);
}
.archive-foot { padding: 6px 10px; }
.archive-panel { max-height: 60%; }
.archive-item { cursor: default; }
.archive-item .ai-title { font-weight: 600; }
.archive-actions { margin-top: 8px; display: flex; justify-content: flex-end; }
.btn-block { width: 100%; }
.main {
  position: relative;
  min-width: 0;
  min-height: 0;
}
.loading {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--text-3);
  font-size: 13px;
}
.pool-panel {
  position: absolute;
  top: 56px;
  right: 12px;
  width: 280px;
  max-height: 50%;
  background: var(--toolbar-bg);
  border: 1px solid var(--line);
  border-radius: 14px;
  z-index: 9;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  backdrop-filter: blur(12px);
  box-shadow: var(--shadow-pop);
}
.pool-head {
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--line-soft);
  color: var(--text-2);
}
.pool-list { overflow: auto; padding: 8px; }
.pool-item {
  padding: 10px;
  border-radius: 12px;
  margin-bottom: 6px;
  background: var(--elev);
  border: 1px solid var(--line-soft);
  font-size: 12px;
  color: var(--text);
  line-height: 1.45;
  cursor: pointer;
}
.pool-item:hover { border-color: var(--line); }
.pool-item .meta { font-size: 10px; color: var(--text-3); margin-top: 4px; }
.pool-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  vertical-align: 1px;
}
.pool-tag.todo { background: var(--bg-2); color: var(--text-2); }
.pool-tag.doing { background: var(--ok-soft); color: var(--ok); }
.pool-tag.done { background: transparent; border: 1px solid var(--line); color: var(--faint); }
.empty { padding: 16px; font-size: 12px; color: var(--text-3); }
.status {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 12px;
  font-size: 11px;
  color: var(--text-3);
  background: var(--panel);
  border-top: 1px solid var(--line-soft);
}
.status b { color: var(--text-2); font-weight: 600; }
.status .sep { width: 1px; height: 12px; background: var(--line); }
.ov-root { position: fixed; inset: 0; z-index: 100; }
.ov-backdrop { position: absolute; inset: 0; background: var(--scrim); }
.capture {
  position: absolute;
  top: 36%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(440px, calc(100vw - 40px));
  background: var(--capture-bg);
  border: 1px solid var(--line);
  border-top: 2px solid var(--accent);
  border-radius: 18px;
  box-shadow: var(--shadow-pop);
  backdrop-filter: blur(12px);
}
.cap-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 0;
}
.cap-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: 0.05em;
}
.cap-body { padding: 12px 16px 16px; }
.cap-body textarea {
  width: 100%;
  height: 84px;
  resize: none;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
  padding: 12px;
  outline: none;
  font-family: inherit;
}
.cap-body textarea:focus {
  border-color: var(--text-3);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.cap-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: 14px;
}
.cap-actions { display: flex; gap: 8px; }
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.toast-wrap {
  position: fixed;
  right: 20px;
  bottom: 48px;
  z-index: 120;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.toast {
  background: var(--capture-bg);
  border: 1px solid var(--line);
  border-radius: 14px;
  color: var(--text);
  padding: 12px 16px;
  font-size: 13px;
  box-shadow: var(--shadow-pop);
  max-width: 280px;
}
.toast .t-sub {
  display: block;
  font-size: 11px;
  color: var(--text-3);
  margin-top: 3px;
}
.toast.clickable {
  cursor: pointer;
  border-color: var(--text-3);
}
.toast.clickable:hover {
  border-color: var(--text-2);
}
`;
