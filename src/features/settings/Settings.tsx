import { useRef, useState } from "react";
import { applyTheme } from "../../main";
import {
  dataDirHint,
  exportGraphJson,
  exportTaskMarkdown,
  importGraphJson,
} from "../../shared/export";
import { clearLocalData, lastExportedAt, storageUsage } from "../../shared/store";
import { useGraph } from "../../store/graphStore";

const LS_QUOTA = 5 * 1024 * 1024; // browsers typically allow ~5MB per origin

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function Settings({
  theme,
  onThemeChange,
}: {
  theme: string;
  onThemeChange: (t: string) => void;
}) {
  const tasks = useGraph((s) => s.tasks);
  const nodes = useGraph((s) => s.nodes);
  const edges = useGraph((s) => s.edges);
  const reload = useGraph((s) => s.reload);
  const init = useGraph((s) => s.init);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const usage = storageUsage();
  const lastExport = lastExportedAt();

  const flash = (m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 2500);
  };

  return (
    <div className="settings">
      <h2>设置</h2>
      {msg && <div className="set-msg">{msg}</div>}

      <section className="set-card">
        <h3>外观</h3>
        <div className="set-row">
          <div>
            <div className="k">主题</div>
            <div className="d">明色纸感 / 暗色 infinite-canvas zinc</div>
          </div>
          <div className="set-actions">
            <button
              type="button"
              className={`tbtn ${theme === "light" ? "active" : ""}`}
              onClick={() => {
                applyTheme("light");
                onThemeChange("light");
              }}
            >
              明
            </button>
            <button
              type="button"
              className={`tbtn ${theme === "dark" ? "active" : ""}`}
              onClick={() => {
                applyTheme("dark");
                onThemeChange("dark");
              }}
            >
              暗
            </button>
          </div>
        </div>
      </section>

      <section className="set-card">
        <h3>捕获</h3>
        <div className="set-row">
          <div>
            <div className="k">记录想法</div>
            <div className="d">双击画布任意空白处唤起记录层;Enter 保存 · Esc 关闭 · Tab 切换任务</div>
          </div>
          <div className="set-val">双击画布</div>
        </div>
        <div className="set-row">
          <div>
            <div className="k">新建任务</div>
            <div className="d">左侧任务栏「+」按钮;完成后可在任务条上归档</div>
          </div>
          <div className="set-val">+</div>
        </div>
        <div className="set-row">
          <div>
            <div className="k">编辑与导航</div>
            <div className="d">双击节点编辑内容 · 端口连边 · Delete 删除 · 滚轮缩放 · 拖拽平移</div>
          </div>
          <div className="set-val">已启用</div>
        </div>
      </section>

      <section className="set-card">
        <h3>数据</h3>
        <div className="set-row">
          <div>
            <div className="k">本地存储</div>
            <div className="d">
              {dataDirHint()} · 占用约 {fmtBytes(usage)} / {fmtBytes(LS_QUOTA)}
              {lastExport ? ` · 上次备份 ${new Date(lastExport).toLocaleString("zh-CN")}` : " · 尚未备份，建议定期导出"}
            </div>
            <div className="usage-bar" role="presentation">
              <div
                className="usage-fill"
                style={{ width: `${Math.min(100, (usage / LS_QUOTA) * 100).toFixed(1)}%` }}
              />
            </div>
          </div>
          <div className="set-val">
            {tasks.length} 任务 · {nodes.length} 节点 · {edges.length} 边
          </div>
        </div>
        <div className="set-row">
          <div>
            <div className="k">导出当前任务时间线</div>
            <div className="d">Markdown 摘要，便于复盘或贴给 AI</div>
          </div>
          <select
            className="set-select"
            defaultValue={tasks[0]?.id ?? ""}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              void exportTaskMarkdown(id).then(() => flash("已导出 Markdown"));
            }}
          >
            <option value="" disabled>
              选择任务…
            </option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
        <div className="set-row">
          <div>
            <div className="k">导出完整备份</div>
            <div className="d">JSON：任务 + 节点 + 边</div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => {
              void exportGraphJson().then(() => flash("已导出 JSON 备份"));
            }}
          >
            导出 JSON
          </button>
        </div>
        <div className="set-row">
          <div>
            <div className="k">导入备份</div>
            <div className="d">按 id 合并，较新覆盖</div>
          </div>
          <div className="set-actions">
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const text = await f.text();
                const res = await importGraphJson(text);
                if (res) {
                  await reload();
                  flash(`已导入 ${res.tasks} 任务 / ${res.nodes} 节点`);
                } else {
                  flash("导入失败：不是有效的念头备份");
                }
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => fileRef.current?.click()}
            >
              选择文件
            </button>
          </div>
        </div>
        <div className="set-row">
          <div>
            <div className="k">清空本地数据</div>
            <div className="d">删除所有任务、想法与画布布局，不可恢复；建议先导出备份</div>
          </div>
          {confirmWipe ? (
            <div className="set-actions">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setConfirmWipe(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={async () => {
                  clearLocalData();
                  setConfirmWipe(false);
                  await init();
                  flash("本地数据已清空");
                }}
              >
                确认清空
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-ghost danger"
              onClick={() => setConfirmWipe(true)}
            >
              清空…
            </button>
          )}
        </div>
      </section>

      <section className="set-card">
        <h3>关于</h3>
        <div className="set-row">
          <div>
            <div className="k">念头 · qpm-thoughtline</div>
            <div className="d">
              AI 协作间隙的思维链画布。记下、串起、续上。
            </div>
          </div>
          <div className="set-val">v0.1.0 · 网页版</div>
        </div>
      </section>

      <style>{css}</style>
    </div>
  );
}

const css = `
.settings {
  height: 100%;
  overflow: auto;
  padding: 24px 28px 40px;
}
.settings h2 {
  font-size: 18px;
  margin-bottom: 16px;
}
.settings h3 {
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--text-3);
  margin-bottom: 8px;
  font-weight: 600;
}
.set-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 14px;
  max-width: 640px;
  box-shadow: var(--shadow);
}
.set-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line-soft);
}
.set-row:last-child { border-bottom: none; }
.set-row .k { font-size: 13px; color: var(--text); font-weight: 600; }
.set-row .d { font-size: 11px; color: var(--text-3); margin-top: 3px; line-height: 1.45; }
.set-val {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-2);
  background: var(--bg);
  border: 1px solid var(--line);
  padding: 6px 10px;
  border-radius: 8px;
  white-space: nowrap;
}
.set-actions { display: flex; gap: 8px; align-items: center; }
.btn-ghost.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, var(--line)); }
.usage-bar {
  margin-top: 8px;
  width: 220px;
  max-width: 100%;
  height: 4px;
  border-radius: 999px;
  background: var(--elev-2);
  overflow: hidden;
}
.usage-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 999px;
}
.set-select {
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  padding: 0 10px;
  font-family: inherit;
  font-size: 12px;
  max-width: 180px;
}
.set-msg {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--elev-2);
  color: var(--text);
  font-size: 12px;
  border: 1px solid var(--line);
  max-width: 640px;
}
.btn-ghost.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, var(--line)); }
.usage-bar {
  margin-top: 8px;
  width: 220px;
  max-width: 100%;
  height: 4px;
  border-radius: 999px;
  background: var(--elev-2);
  overflow: hidden;
}
.usage-fill {
  height: 100%;
  background: var(--text-2);
  border-radius: 999px;
}
`;
