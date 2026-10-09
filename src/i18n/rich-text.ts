import { createElement, type ReactNode } from "react";

/**
 * Renders a message whose `{placeholders}` stand for React nodes rather than
 * plain values — a link or a `<code>` sample inside a sentence. The nodes land
 * wherever the translation puts them, so word order stays the translator's
 * choice instead of English's.
 */
export function renderMessage(message: string, nodes: Record<string, ReactNode>): ReactNode[] {
  return message.split(/(\{[a-zA-Z]+\})/).reduce<ReactNode[]>((parts, segment, index) => {
    if (segment.length === 0) {
      return parts;
    }

    const name = segment.startsWith("{") && segment.endsWith("}") ? segment.slice(1, -1) : null;
    if (name === null || !(name in nodes)) {
      parts.push(segment);
      return parts;
    }

    parts.push(createElement("span", { key: `${name}-${index}` }, nodes[name]));
    return parts;
  }, []);
}
