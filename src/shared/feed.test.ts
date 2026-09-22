import { describe, expect, it } from "vitest";
import { buildFeedToAiText, buildTimelineSummary } from "./feed";

describe("buildFeedToAiText", () => {
  it("renders the fixed Chinese template", () => {
    const text = buildFeedToAiText({
      taskTitle: "重构登录",
      taskGoal: "OAuth + 本地密码",
      thoughts: ["兼容第三方 OAuth", "设备指纹要接风控"],
    });
    expect(text).toBe(
      [
        "【任务】重构登录",
        "【原始目标】OAuth + 本地密码",
        "【请你补充处理以下新想法】",
        "1. 兼容第三方 OAuth",
        "2. 设备指纹要接风控",
        "请基于以上更新你的方案/代码/文档，先确认你理解了新想法，再执行。",
      ].join("\n"),
    );
  });

  it("appends constraints when present", () => {
    const text = buildFeedToAiText({
      taskTitle: "t",
      taskGoal: "",
      thoughts: ["a"],
      constraints: ["不能破坏现有 API", "灰度一周"],
    });
    expect(text).toContain("【约束提醒】不能破坏现有 API；灰度一周");
  });
});

describe("buildTimelineSummary", () => {
  it("sorts nothing but renders items with time and kind", () => {
    const md = buildTimelineSummary({
      taskTitle: "任务X",
      taskGoal: "目标Y",
      items: [
        { time: "09:00", kind: "想法", text: "第一条" },
        { time: "10:00", kind: "AI 产出", text: "第二条" },
      ],
    });
    expect(md.startsWith("# 任务X")).toBe(true);
    expect(md).toContain("目标：目标Y");
    expect(md).toContain("- [09:00] (想法) 第一条");
    expect(md).toContain("- [10:00] (AI 产出) 第二条");
  });
});
