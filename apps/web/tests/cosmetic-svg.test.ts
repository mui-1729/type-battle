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
  it("shapes starter headwear around the head instead of as horizontal bars", () => {
    const cap = renderHead("cap");
    const headband = renderHead("headband");

    expect(cap).toContain('d="M23 14C24 7 28 3 33 3c6 0 9 4 9 11Z"');
    expect(cap).toContain('d="M21 14c7-2 16-2 22 1-3 2-8 3-13 1-4-1-7-1-9-1Z"');
    expect(headband).toContain('d="M22 12c5-3 15-3 20 0l-1 5c-5-2-13-2-18 0Z"');
    expect(headband).not.toMatch(/d="M21 12h22v6H21z"/u);
  });

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
