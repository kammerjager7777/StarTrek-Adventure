/**
 * Captain / ship name helpers. Code interprets what the player meant;
 * the LLM does not invent the name.
 */

/** Title-case names: "picard" → "Picard", "jean-luc picard" → "Jean-Luc Picard" */
export function capitalizeName(raw: string): string {
  return String(raw || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word
        .split("-")
        .map((part) => {
          if (!part) return part;
          if (
            /^[IVXLCDM]+$/i.test(part) &&
            part.length <= 5 &&
            part === part.toUpperCase()
          ) {
            return part.toUpperCase();
          }
          if (part.includes("'")) {
            return part
              .split("'")
              .map((p) =>
                p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p
              )
              .join("'");
          }
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join("-")
    )
    .join(" ");
}

/**
 * Pull the name they want to be called from a free-text answer.
 * "Michael Stephens, but call me Stephens" → "Stephens"
 * "My name is Jean-Luc Picard" → "Jean-Luc Picard"
 */
export function interpretCaptainName(raw: string): string {
  let s = String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  if (!s) return "Captain";

  const callMe = s.match(
    /\b(?:(?:but|and|or|please|just)\s+)*(?:you\s+(?:can|may)\s+)?(?:please\s+)?(?:just\s+)?call me\s+(.+)$/i
  );
  if (callMe) {
    s = callMe[1];
  } else {
    s = s.replace(
      /^(?:well,?\s+)?(?:my name is|i(?:'m| am)|this is|it'?s|they call me)\s+/i,
      ""
    );
    s = s.replace(/^(?:captain|cmdr\.?|commander)\s+/i, "");
  }

  s = s.replace(/[.,;:!?]+$/g, "").replace(/\bplease\s*$/i, "").trim();
  const words = s.split(/\s+/).filter(Boolean).slice(0, 4);
  const named = capitalizeName(words.join(" "));
  return named || "Captain";
}
