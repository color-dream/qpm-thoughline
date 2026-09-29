import type { DocumentCanvasNode, DocumentOutput, DocumentThought, ThoughtlineDocument } from "./document";
import { validateDocument } from "./document";
import { buildTimelineSummary } from "./feed";
import { loadDocument, markExported, replaceDocument } from "./store";

export function downloadFile(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function markdownItems(
  document: ThoughtlineDocument,
  taskNode: DocumentCanvasNode | undefined,
): Array<{ time: string; kind: string; text: string }> {
  if (!taskNode) return [];
  const nodesById = new Map(document.canvas_nodes.map((node) => [node.id, node]));
  const thoughtsById = new Map(document.thoughts.map((thought) => [thought.id, thought]));
  const outputsById = new Map(document.outputs.map((output) => [output.id, output]));
  return document.edges
    .filter((edge) => edge.source_node_id === taskNode.id && edge.kind === "child")
    .map((edge) => nodesById.get(edge.target_node_id))
    .filter((node): node is DocumentCanvasNode => !!node)
    .map((node) => {
      const entity = node.entity_type === "thought" ? thoughtsById.get(node.entity_id) : outputsById.get(node.entity_id);
      if (!entity) return null;
      return {
        sortTime: entity.created_at,
        time: new Date(entity.created_at).toLocaleString("zh-CN"),
        kind: node.entity_type === "thought" ? "想法" : "AI 产出",
        text: node.entity_type === "thought" ? (entity as DocumentThought).content || "（空）" : (entity as DocumentOutput).content || "（空）",
      };
    })
    .filter((item): item is { sortTime: string; time: string; kind: string; text: string } => !!item)
    .sort((a, b) => a.sortTime.localeCompare(b.sortTime))
    .map(({ time, kind, text }) => ({ time, kind, text }));
}

export async function exportTaskMarkdown(taskId: string): Promise<string | null> {
  const document = await loadDocument();
  const task = document.tasks.find((item) => item.id === taskId);
  if (!task) return null;
  const taskNode = document.canvas_nodes.find(
    (node) => node.entity_type === "task" && node.entity_id === taskId,
  );
  const md = buildTimelineSummary({
    taskTitle: task.title,
    taskGoal: task.goal,
    items: markdownItems(document, taskNode),
  });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  downloadFile(`念头-${task.title}-${stamp}.md`, md, "text/markdown");
  return md;
}

export async function exportGraphJson(): Promise<void> {
  const document = await loadDocument();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  downloadFile(
    `qpm-thoughtline-document-${stamp}.json`,
    JSON.stringify(document, null, 2),
    "application/json",
  );
  markExported();
}

export function parseDocumentJson(raw: string): ThoughtlineDocument | null {
  try {
    return validateDocument(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export async function importGraphJson(raw: string): Promise<{
  document_id: string;
  revision: number;
  tasks: number;
  thoughts: number;
  outputs: number;
  canvas_nodes: number;
  edges: number;
} | null> {
  const document = parseDocumentJson(raw);
  if (!document) return null;
  await replaceDocument(document);
  return {
    document_id: document.document_id,
    revision: document.revision,
    tasks: document.tasks.length,
    thoughts: document.thoughts.length,
    outputs: document.outputs.length,
    canvas_nodes: document.canvas_nodes.length,
    edges: document.edges.length,
  };
}

export function dataDirHint(): string {
  return "浏览器 localStorage（canonical document，本地优先；云端备份可直接使用同一 JSON）";
}
