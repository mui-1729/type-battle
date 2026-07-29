import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HEAD_ACCESSORY_IDS,
  HELD_ITEM_IDS,
  type HeadAccessoryId,
  type HeldItemId,
} from "@type-battle/shared";
import {
  HeadAccessorySvg,
  HeldItemSvg,
} from "../app/_components/cosmetic-svg";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

function renderHead(id: HeadAccessoryId): string {
  return renderToStaticMarkup(
    React.createElement("svg", null, React.createElement(HeadAccessorySvg, { id })),
  );
}

function renderHeld(id: HeldItemId): string {
  return renderToStaticMarkup(
    React.createElement("svg", null, React.createElement(HeldItemSvg, { id })),
  );
}

describe("cosmetic SVG artwork", () => {
  it("renders every head accessory without text or emoji nodes", () => {
    for (const id of HEAD_ACCESSORY_IDS) {
      const markup = renderHead(id);
      expect(markup).not.toContain("<text");
      if (id === "none") {
        expect(markup).toBe("<svg></svg>");
      } else {
        expect(markup).toContain(`data-cosmetic-id="${id}"`);
        expect(markup).toMatch(/<(?:path|circle|ellipse)/u);
      }
    }
  });

  it("renders every held item without text or emoji nodes", () => {
    for (const id of HELD_ITEM_IDS) {
      const markup = renderHeld(id);
      expect(markup).not.toContain("<text");
      if (id === "none") {
        expect(markup).toBe("<svg></svg>");
      } else {
        expect(markup).toContain(`data-cosmetic-id="${id}"`);
        expect(markup).toMatch(/<(?:path|circle|ellipse)/u);
      }
    }
  });
});
