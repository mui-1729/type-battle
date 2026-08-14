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
import { StickFigure } from "../app/_components/stick-figure";

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

function renderFigure(headAccessoryId: HeadAccessoryId, heldItemId: HeldItemId): string {
  return renderToStaticMarkup(
    React.createElement(StickFigure, {
      side: "left",
      pose: "idle",
      status: "active",
      headAccessoryId,
      heldItemId,
    }),
  );
}

describe("cosmetic SVG artwork", () => {
  it("shapes starter headwear around the head instead of as horizontal bars", () => {
    const cap = renderHead("cap");
    const headband = renderHead("headband");

    expect(cap).toContain('d="M23 10C24 2 28-2 33-2c6 0 10 5 10 13-7-2-13-2-20-1Z"');
    expect(headband).toContain('d="M22 7c5-3 15-3 20 0l-1 5c-5-2-13-2-18 0Z"');
    expect(headband).toContain('cx="42" cy="9" r="2.5"');

    for (const starterHeadwear of [cap, headband]) {
      expect(starterHeadwear).not.toMatch(/\sd="[^"]*[hH]\d/u);
    }
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

  it("renders the generated-art cosmetics as recognisable SVG silhouettes", () => {
    const wizardHat = renderHead("wizard-hat");
    const halo = renderHead("halo");
    const frozenTuna = renderHeld("frozen-tuna");
    const giantPencil = renderHeld("giant-pencil");

    for (const markup of [wizardHat, halo, frozenTuna, giantPencil]) {
      expect(markup).toContain('stroke="#07153d"');
      expect(markup).not.toContain("<text");
      expect(markup).not.toMatch(/(?:★|✨|🐟|✏️)/u);
    }

    expect(wizardHat).toContain('fill="#ffd428"');
    expect(halo).toContain('fill="#fff"');
    expect(frozenTuna).toContain('fill="#8ee7ff"');
    expect(giantPencil).toContain('fill="#facc15"');
  });

  it("keeps generated-art cosmetics on the shared stick figure", () => {
    const wizardWithTuna = renderFigure("wizard-hat", "frozen-tuna");
    const haloWithPencil = renderFigure("halo", "giant-pencil");

    expect(wizardWithTuna).toContain('data-cosmetic-id="wizard-hat"');
    expect(wizardWithTuna).toContain('data-cosmetic-id="frozen-tuna"');
    expect(haloWithPencil).toContain('data-cosmetic-id="halo"');
    expect(haloWithPencil).toContain('data-cosmetic-id="giant-pencil"');
  });
});
