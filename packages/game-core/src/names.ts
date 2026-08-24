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

/** Voice / presentation gender inferred by the referee — never invented by the LLM. */
export type CrewGender = "female" | "male" | "any";

const FEMALE_GIVEN = new Set(
  [
    "adele",
    "alice",
    "amara",
    "amanda",
    "amy",
    "anna",
    "anne",
    "aria",
    "ashley",
    "beverly",
    "b'elanna",
    "carol",
    "catherine",
    "christine",
    "claire",
    "deanna",
    "diana",
    "elena",
    "elizabeth",
    "emma",
    "ezri",
    "farah",
    "grace",
    "hannah",
    "helen",
    "hoshi",
    "imani",
    "iris",
    "jadzia",
    "jane",
    "jennifer",
    "jessica",
    "julia",
    "kathryn",
    "katherine",
    "kira",
    "laura",
    "leah",
    "lira",
    "lisa",
    "lwaxana",
    "m'ress",
    "margaret",
    "maria",
    "marie",
    "mary",
    "maya",
    "megan",
    "michelle",
    "naomi",
    "natalie",
    "nomi",
    "nyota",
    "olivia",
    "patricia",
    "rachel",
    "rebecca",
    "sarah",
    "seven",
    "sofia",
    "susan",
    "t'lara",
    "t'lyn",
    "t'pau",
    "t'pel",
    "t'pol",
    "t'pring",
    "talia",
    "tasha",
    "teresa",
    "troi",
    "uhura",
    "una",
    "victoria",
    "wendy",
    "wren",
    "zoe",
  ].map((n) => n.toLowerCase())
);

const MALE_GIVEN = new Set(
  [
    "adam",
    "alexander",
    "andrew",
    "benjamin",
    "brennan",
    "charles",
    "christopher",
    "daniel",
    "data",
    "david",
    "edward",
    "elias",
    "eric",
    "frank",
    "garek",
    "geordi",
    "george",
    "harold",
    "harry",
    "henry",
    "hiroshi",
    "jack",
    "james",
    "jason",
    "jean-luc",
    "john",
    "jonathan",
    "joran",
    "joseph",
    "julian",
    "kevin",
    "kirk",
    "leonard",
    "malcolm",
    "marek",
    "michael",
    "miles",
    "nicholas",
    "orin",
    "patrick",
    "paul",
    "pavel",
    "peter",
    "philip",
    "picard",
    "renn",
    "richard",
    "riker",
    "robert",
    "samuel",
    "sarek",
    "scott",
    "soran",
    "spock",
    "stephen",
    "thomas",
    "timothy",
    "tom",
    "tuvok",
    "voss",
    "william",
    "worf",
  ].map((n) => n.toLowerCase())
);

export function sexFieldIsBlank(sex?: string | null): boolean {
  const s = String(sex || "")
    .trim()
    .toLowerCase();
  return !s || s === "unspecified" || s === "unknown" || s === "n/a" || s === "any";
}

function genderFromText(raw?: string | null): CrewGender {
  const s = String(raw || "").toLowerCase();
  if (!s) return "any";
  if (
    /\b(female|feminine|woman|women|girl|lady|she\/her|she-her)\b/.test(s) ||
    /\bshe\b/.test(s)
  ) {
    return "female";
  }
  if (
    /\b(male|masculine|man|men|boy|gentleman|he\/him|he-him)\b/.test(s) ||
    /\bhe\b/.test(s)
  ) {
    return "male";
  }
  if (s === "f" || s === "w") return "female";
  if (s === "m") return "male";
  return "any";
}

function givenNameToken(name: string): string {
  const stripped = String(name || "")
    .replace(
      /^(captain|cmdr\.?|commander|lt\.?\s*cmdr\.?|lt\.?\s*j\.g\.?|lieutenant|lt\.?|ensign|ens\.?|chief|dr\.?|doctor)\s+/i,
      ""
    )
    .trim();
  return (stripped.split(/\s+/)[0] || "").replace(/[.,]/g, "");
}

function genderFromName(name: string): CrewGender {
  const full = String(name || "");
  const given = givenNameToken(full).toLowerCase();
  if (FEMALE_GIVEN.has(given)) return "female";
  if (MALE_GIVEN.has(given)) return "male";
  // Andorian prefixes: sh'/zh' typically feminine, ch'/th' typically masculine
  if (/\b(sh'|zh')/i.test(full)) return "female";
  if (/\b(ch'|th')/i.test(full)) return "male";
  // Vulcan T' names are almost always feminine (T'Pol, T'Lara, T'Pau)
  if (/^t'/i.test(given)) return "female";
  // Caitian M'Ress-style feminine given names
  if (/^m'/i.test(given) && /ress|ria|ren/i.test(given)) return "female";
  return "any";
}

/**
 * Infer presentation gender for TTS / portraits.
 * Prefer an explicit sex field; otherwise pronouns, visual prompt, then name.
 */
export function inferCrewGender(member: {
  name?: string;
  sex?: string | null;
  personality?: string | null;
  bio?: string | null;
  clothing?: string | null;
  visual?: { imagePrompt?: string; tags?: string[] } | null;
}): CrewGender {
  const fromSex = genderFromText(member.sex);
  if (fromSex !== "any") return fromSex;

  const blob = [
    member.personality,
    member.bio,
    member.clothing,
    member.visual?.imagePrompt,
    ...(member.visual?.tags || []),
  ]
    .filter(Boolean)
    .join(" ");
  const fromText = genderFromText(blob);
  if (fromText !== "any") return fromText;

  return genderFromName(member.name || "");
}
