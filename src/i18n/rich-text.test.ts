import { createElement, isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { renderMessage } from "@/i18n/rich-text";

/** The parts that are plain text, in order — enough to assert word order per locale. */
function textParts(parts: ReactNode[]): string[] {
  return parts.filter((part): part is string => typeof part === "string");
}

const link = createElement("a", { href: "#" }, "App Password");

describe("renderMessage", () => {
  it("returns the message unchanged when it has no placeholders", () => {
    expect(renderMessage("Plain sentence.", {})).toEqual(["Plain sentence."]);
  });

  it("substitutes a node for its placeholder, keeping the surrounding text", () => {
    const parts = renderMessage("Use an {link}, not a password.", { link });

    expect(textParts(parts)).toEqual(["Use an ", ", not a password."]);
    expect(parts.filter((part) => isValidElement(part))).toHaveLength(1);
  });

  it("substitutes every placeholder, including repeats", () => {
    const parts = renderMessage("{a} and {b} and {a}", {
      a: createElement("code", null, "x"),
      b: createElement("code", null, "y")
    });

    expect(parts.filter((part) => isValidElement(part))).toHaveLength(3);
  });

  it("leaves a placeholder with no matching node as literal text", () => {
    expect(renderMessage("Hi {missing}", {})).toEqual(["Hi ", "{missing}"]);
  });

  it("follows the translation's word order, not the English one", () => {
    const parts = renderMessage("قبل {link} بعد", { link });

    expect(textParts(parts)).toEqual(["قبل ", " بعد"]);
  });
});
