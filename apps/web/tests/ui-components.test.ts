import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, SectionHeading, SurfaceCard } from "../app/_components/ui";
import { PlayerIdentity } from "../app/_components/player-identity";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

describe("shared UI foundation", () => {
  it("keeps button variants and accessible pressed state composable", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Button, { variant: "primary", "aria-pressed": true }, "Start")
    );

    expect(markup).toContain('class="primaryButton uiButton"');
    expect(markup).toContain('aria-pressed="true"');
  });

  it("renders headings and cards without duplicating layout markup", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        SurfaceCard,
        { className: "testCard" },
        React.createElement(SectionHeading, {
          eyebrow: "ROOM",
          title: "Lobby",
          description: "Choose a match."
        })
      )
    );

    expect(markup).toContain('class="uiCard testCard"');
    expect(markup).toContain('class="sectionHeading"');
    expect(markup).toContain("Lobby");
  });

  it.each([
    ["you", "YOU", "1P"],
    ["one", "1P", "1P"],
    ["two", "2P", "2P"],
    ["com", "COM", "2P"]
  ] as const)("makes %s distinct with text and slot", (kind, label, slot) => {
    const markup = renderToStaticMarkup(
      React.createElement(PlayerIdentity, { nickname: "Player", kind, slot })
    );

    expect(markup).toContain(`data-player-role="${kind}"`);
    expect(markup).toContain(label);
    expect(markup).toContain(slot);
  });
});
