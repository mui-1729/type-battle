type ClipboardEnvironment = {
  clipboard?: {
    writeText: (text: string) => Promise<void>;
  } | undefined;
  document?: {
    body: {
      appendChild: (node: HTMLTextAreaElement) => void;
      removeChild: (node: HTMLTextAreaElement) => void;
    };
    createElement: (tagName: "textarea") => HTMLTextAreaElement;
    execCommand?: (command: string) => boolean;
  } | undefined;
};

export async function copyText(
  text: string,
  environment: ClipboardEnvironment = {
    clipboard: typeof navigator === "undefined" ? undefined : navigator.clipboard,
    document: typeof document === "undefined" ? undefined : document,
  },
): Promise<void> {
  try {
    if (environment.clipboard) {
      await environment.clipboard.writeText(text);
      return;
    }
  } catch {
    // Clipboard permissions can be denied even when the API exists.
  }

  const currentDocument = environment.document;
  if (!currentDocument?.execCommand) {
    throw new Error("Clipboard access is unavailable.");
  }

  const textarea = currentDocument.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  currentDocument.body.appendChild(textarea);

  try {
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    if (!currentDocument.execCommand("copy")) {
      throw new Error("Copy command was rejected.");
    }
  } finally {
    currentDocument.body.removeChild(textarea);
  }
}
