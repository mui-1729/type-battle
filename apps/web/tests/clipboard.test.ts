import { describe, expect, it, vi } from "vitest";
import { copyText } from "../app/_lib/clipboard";

function createFallbackDocument(copyResult: boolean) {
  const textarea = {
    value: "",
    style: {},
    setAttribute: vi.fn(),
    select: vi.fn(),
    setSelectionRange: vi.fn(),
  } as unknown as HTMLTextAreaElement;
  const appendChild = vi.fn();
  const removeChild = vi.fn();
  const execCommand = vi.fn(() => copyResult);

  return {
    textarea,
    appendChild,
    removeChild,
    execCommand,
    document: {
      body: { appendChild, removeChild },
      createElement: vi.fn(() => textarea),
      execCommand,
    },
  };
}

describe("copyText", () => {
  it("uses the Clipboard API when it is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await copyText("AB12CD", { clipboard: { writeText } });

    expect(writeText).toHaveBeenCalledWith("AB12CD");
  });

  it("falls back to a temporary textarea when the Clipboard API is rejected", async () => {
    const fallback = createFallbackDocument(true);

    await copyText("AB12CD", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      document: fallback.document,
    });

    expect(fallback.textarea.value).toBe("AB12CD");
    expect(fallback.textarea.select).toHaveBeenCalled();
    expect(fallback.execCommand).toHaveBeenCalledWith("copy");
    expect(fallback.removeChild).toHaveBeenCalledWith(fallback.textarea);
  });

  it("reports an error and removes the textarea when every copy method fails", async () => {
    const fallback = createFallbackDocument(false);

    await expect(copyText("AB12CD", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      document: fallback.document,
    })).rejects.toThrow("Copy command was rejected.");

    expect(fallback.removeChild).toHaveBeenCalledWith(fallback.textarea);
  });
});
