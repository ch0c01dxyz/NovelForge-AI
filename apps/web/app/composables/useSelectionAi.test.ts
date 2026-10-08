/**
 * useSelectionAi transport tests (NF-WF-015, Invariant 4): the composable
 * posts the pinned task/profile/messages to the existing generations
 * stream endpoint, parses SSE deltas, maps 409 (NoRouteError) to the
 * actionable no-model state, and never writes to the document directly.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { markRaw } from "vue";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { useSelectionAi } from "./useSelectionAi";

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

function editor(content: string): Editor {
  return markRaw(
    new Editor({
      extensions: [
        StarterKit.configure({
          code: false,
          codeBlock: false,
          strike: false,
          underline: false,
          link: false,
          heading: { levels: [2] },
        }),
      ],
      content,
    }),
  );
}

function sseResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("useSelectionAi", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the pinned task/profile/messages and streams deltas", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        'event: delta\ndata: {"delta":"Expanded "}\n\n',
        'event: delta\ndata: {"delta":"prose."}\n\n',
      ]),
    );
    const ed = editor("<p>the quick brown fox</p>");
    await tick(30);
    ed.commands.setTextSelection({ from: 5, to: 10 });

    const ai = useSelectionAi();
    await ai.run({ workspaceId: "w1", novelId: "n1", chapterId: "c1", editor: ed, operation: "expand" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/workspaces/w1/generations/stream");
    const body = JSON.parse(init.body as string);
    expect(body.task).toBe("selection.expand");
    expect(body.profile).toBe("CREATIVE_WRITER");
    expect(body.novelId).toBe("n1");
    expect(body.component).toBe("CHAPTER");
    expect(body.artifactId).toBe("c1");
    expect(body.maxTokens).toBe(2000);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].content).toContain("quick");
    // Bounded context: the whole doc here is small, but the caps apply.
    expect(body.messages[1].content.length).toBeLessThan(2000 + 1000 + 500);

    expect(ai.result.value).toBe("Expanded prose.");
    expect(ai.streaming.value).toBe(false);
    expect(ai.errorKey.value).toBeNull();
    expect(ai.activeRequest.value?.task).toBe("selection.expand");
    expect(ai.captured.value?.text).toBe("quick");
    // Never a direct write: the document is untouched until Accept.
    expect(ed.getHTML()).toBe("<p>the quick brown fox</p>");
    ed.destroy();
  });

  it("maps 409 (no model routed) to the actionable no-model state", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "NoRouteError" }), { status: 409 }),
    );
    const ed = editor("<p>hello world</p>");
    await tick(30);
    ed.commands.setTextSelection({ from: 1, to: 6 });

    const ai = useSelectionAi();
    await ai.run({ workspaceId: "w1", novelId: "n1", editor: ed, operation: "rewrite-tone" });

    expect(ai.errorKey.value).toBe("aiAssist.noModel");
    expect(ai.streaming.value).toBe(false);
    expect(ai.result.value).toBe("");
    ed.destroy();
  });

  it("requires a selection before running", async () => {
    const ed = editor("<p>hello</p>");
    await tick(30);
    ed.commands.setTextSelection({ from: 2, to: 2 }); // collapsed

    const ai = useSelectionAi();
    await ai.run({ workspaceId: "w1", novelId: "n1", editor: ed, operation: "expand" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(ai.errorKey.value).toBe("editor.selectTextFirst");
    ed.destroy();
  });

  it("caps the selection at 2000 chars", async () => {
    fetchMock.mockResolvedValueOnce(sseResponse(['event: delta\ndata: {"delta":"x"}\n\n']));
    const ed = editor(`<p>${"a".repeat(3000)}</p>`);
    await tick(30);
    ed.commands.setTextSelection({ from: 1, to: 3001 });

    const ai = useSelectionAi();
    await ai.run({ workspaceId: "w1", novelId: "n1", editor: ed, operation: "expand" });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    const userContent: string = body.messages[1].content;
    const selected = userContent.split("Selected passage:\n")[1]!.split("\n\nSurrounding")[0]!;
    expect(selected.length).toBe(2000);
    ed.destroy();
  });

  it("cancel() aborts the in-flight stream without an error state", async () => {
    let aborted = false;
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const ed = editor("<p>hello world</p>");
    await tick(30);
    ed.commands.setTextSelection({ from: 1, to: 6 });

    const ai = useSelectionAi();
    const running = ai.run({ workspaceId: "w1", novelId: "n1", editor: ed, operation: "expand" });
    await tick(20);
    ai.cancel();
    await running;

    expect(aborted).toBe(true);
    expect(ai.errorKey.value).toBeNull();
    expect(ai.streaming.value).toBe(false);
    ed.destroy();
  });
});
