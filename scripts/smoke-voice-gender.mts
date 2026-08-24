/**
 * Crew TTS voices must match inferred gender.
 * Run: npm run test:voices
 */
import { inferCrewGender } from "../packages/game-core/src/names.ts";
import {
  buildCrewVoiceIdentity,
  ensureCrewVoices,
} from "../server/src/services/voice/voiceIdentity.ts";
import type { CrewMember } from "../packages/game-core/src/types.ts";

let failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log("ok ", msg);
    return;
  }
  failed++;
  console.error("FAIL", msg);
}

const FEMALE_IDS = new Set(["ara", "eve", "carina", "luna", "celeste", "iris", "ursa"]);
const MALE_IDS = new Set([
  "leo",
  "rex",
  "sal",
  "zagan",
  "helix",
  "orion",
  "kepler",
  "atlas",
  "sirius",
  "perseus",
  "helios",
  "castor",
  "cosmo",
  "altair",
  "lux",
  "lumen",
  "rigel",
  "naksh",
]);

assert(inferCrewGender({ name: "T'Lara" }) === "female", "T'Lara is female");
assert(inferCrewGender({ name: "Lwaxana Hale" }) === "female", "Lwaxana is female");
assert(inferCrewGender({ name: "Hiroshi Tan" }) === "male", "Hiroshi is male");
assert(
  inferCrewGender({ name: "Lt. Vethar ch'Rhaas" }) === "male",
  "Andorian ch' is male"
);
assert(inferCrewGender({ name: "Lt. M'Ress Adele" }) === "female", "M'Ress Adele is female");
assert(
  inferCrewGender({ name: "Data", sex: "android male presentation" }) === "male",
  "male presentation counts"
);
assert(
  inferCrewGender({ name: "Officer", sex: "female" }) === "female",
  "explicit sex wins"
);

function officer(
  name: string,
  role: string,
  extra: Partial<CrewMember> = {}
): CrewMember {
  return {
    id: name,
    name,
    role,
    species: extra.species || "Human",
    ...extra,
  };
}

const tlara = buildCrewVoiceIdentity({ name: "T'Lara", role: "XO", species: "Vulcan" });
assert(FEMALE_IDS.has(tlara.voiceId), `T'Lara voice is female (got ${tlara.voiceId})`);
assert(!MALE_IDS.has(tlara.voiceId), "T'Lara does not get a male catalog voice");

const hiroshi = buildCrewVoiceIdentity({
  name: "Hiroshi Tan",
  role: "Command Officer",
});
assert(MALE_IDS.has(hiroshi.voiceId), `Hiroshi voice is male (got ${hiroshi.voiceId})`);
assert(hiroshi.voiceId !== "luna", "Hiroshi is not locked to Luna");

const lwaxana = buildCrewVoiceIdentity({ name: "Lwaxana Hale", role: "XO" });
assert(FEMALE_IDS.has(lwaxana.voiceId), `Lwaxana voice is female (got ${lwaxana.voiceId})`);

const mismatched: CrewMember[] = [
  officer("Hiroshi Tan", "Command Officer", {
    voice: {
      voiceId: "luna",
      voiceName: "Luna",
      voicePrompt: "wrong",
      baselineTone: "warm",
      speed: 1,
      profileVersion: 3,
    },
  }),
  officer("Lwaxana Hale", "XO", {
    voice: {
      voiceId: "castor",
      voiceName: "Castor",
      voicePrompt: "wrong",
      baselineTone: "formal",
      speed: 1,
      profileVersion: 3,
    },
  }),
  officer("T'Lara", "XO", {
    species: "Vulcan",
    voice: {
      voiceId: "zagan",
      voiceName: "Zagan",
      voicePrompt: "wrong",
      baselineTone: "formal",
      speed: 1,
      profileVersion: 3,
    },
  }),
];

const fixed = ensureCrewVoices(mismatched, "orion");
assert(MALE_IDS.has(fixed[0].voice!.voiceId), "relock Hiroshi off Luna");
assert(FEMALE_IDS.has(fixed[1].voice!.voiceId), "relock Lwaxana off Castor");
assert(FEMALE_IDS.has(fixed[2].voice!.voiceId), "relock T'Lara off Zagan");
assert(fixed[0].sex === "male", "persist inferred sex on Hiroshi");
assert(fixed[1].sex === "female", "persist inferred sex on Lwaxana");
assert(new Set(fixed.map((c) => c.voice!.voiceId)).size === 3, "voices stay unique");

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nCrew voice gender: all assertions passed");
