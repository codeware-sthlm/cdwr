/**
 * Plain text with `backticks` drawn as inline code, the one piece of markup a
 * plain text field takes. A backtick without its pair stays as it is.
 */
export function InlineText({ text }: { text: string }) {
  // Odd parts are the ones between a pair of backticks
  const parts = text.split(/`([^`\n]+)`/);

  if (parts.length === 1) {
    return text;
  }

  return parts.map((part, i) =>
    i % 2 ? (
      <code
        key={i}
        className="rounded bg-[var(--code-bg,var(--muted))] px-1 py-0.5 font-mono text-[0.875em]"
      >
        {part}
      </code>
    ) : (
      part
    )
  );
}
