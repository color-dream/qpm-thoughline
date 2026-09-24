/** 「交给 AI」结构化文本模板（M2 固定中文模板） */
export function buildFeedToAiText(opts: {
  taskTitle: string;
  taskGoal: string;
  thoughts: string[];
  constraints?: string[];
}): string {
  const lines = [
    `【任务】${opts.taskTitle}`,
    `【原始目标】${opts.taskGoal}`,
    `【请你补充处理以下新想法】`,
    ...opts.thoughts.map((t, i) => `${i + 1}. ${t}`),
  ];
  if (opts.constraints?.length) {
    lines.push(`【约束提醒】${opts.constraints.join("；")}`);
  }
  lines.push(
    `请基于以上更新你的方案/代码/文档，先确认你理解了新想法，再执行。`,
  );
  return lines.join("\n");
}

export function buildTimelineSummary(opts: {
  taskTitle: string;
  taskGoal: string;
  items: Array<{ time: string; kind: string; text: string }>;
}): string {
  return [
    `# ${opts.taskTitle}`,
    ``,
    `目标：${opts.taskGoal}`,
    ``,
    ...opts.items.map((i) => `- [${i.time}] (${i.kind}) ${i.text}`),
  ].join("\n");
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function notify(opts: {
  title: string;
  body: string;
  onClick?: () => void;
}): Promise<void> {
  try {
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        const n = new Notification(opts.title, { body: opts.body });
        if (opts.onClick) n.onclick = () => {
          try {
            window.focus();
          } catch {
            /* ignore */
          }
          opts.onClick?.();
        };
      } else if (Notification.permission === "default") {
        void Notification.requestPermission();
      }
    }
  } catch {
    /* ignore */
  }
}
