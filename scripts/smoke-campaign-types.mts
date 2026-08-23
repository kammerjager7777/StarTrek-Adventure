/**
 * Phase 0 campaign type-contract smoke.
 * Run: npm run test:campaign
 */
import {
  FACTIONS,
  SKILL_DIMENSIONS,
  computeShipSkills,
  createCampaignProfile,
  emptyUniverse,
  normalizeCrewMember,
} from "../packages/game-core/src/campaign.ts";
import { interpretCaptainName } from "../packages/game-core/src/names.ts";
import type { CrewMember, Ship } from "../packages/game-core/src/types.ts";

let failed = 0;

function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log("ok ", msg);
    return;
  }
  failed++;
  console.error("FAIL", msg);
}

const EXPECTED_SKILLS = [
  "tactical",
  "science",
  "diplomacy",
  "piloting",
  "engineering",
  "medical",
  "command",
] as const;

const EXPECTED_FACTIONS = [
  "federation",
  "klingon",
  "romulan",
  "cardassian",
  "borg",
  "independent",
  "other",
] as const;

assert(
  SKILL_DIMENSIONS.length === 7 &&
    EXPECTED_SKILLS.every((k, i) => SKILL_DIMENSIONS[i] === k),
  "SKILL_DIMENSIONS matches spec (7 axes)"
);

assert(
  FACTIONS.length === EXPECTED_FACTIONS.length &&
    EXPECTED_FACTIONS.every((f, i) => FACTIONS[i] === f),
  "FACTIONS matches spec union"
);

const incomplete = normalizeCrewMember(
  { id: "c0", name: "T'Pol", role: "Science Officer" } as CrewMember,
  "2154.2"
);
assert(incomplete.status === "active", "normalizeCrewMember default status is active");
assert(incomplete.serviceTurns === 0, "normalizeCrewMember default serviceTurns is 0");
assert(incomplete.missionsServed === 0, "normalizeCrewMember default missionsServed is 0");
assert(
  typeof incomplete.loyalty === "number" &&
    incomplete.loyalty >= 0 &&
    incomplete.loyalty <= 100,
  "normalizeCrewMember loyalty is 0–100"
);
assert(incomplete.joinedStardate === "2154.2", "normalizeCrewMember fills joinedStardate");
assert(
  typeof incomplete.skills?.science === "number" && incomplete.skills.science >= 40,
  "normalizeCrewMember fills science baseline for science role"
);

const systems = {
  shields: "ok",
  torpedoes: "ok",
  warp: "ok",
  communications: "ok",
  sensors: "ok",
  lifeSupport: "ok",
} as const;

const ship: Ship = {
  id: "s1",
  name: "USS Test",
  registryNumber: "NCC-1",
  className: "Intrepid",
  era: "24th",
  stardate: "48000.1",
  description: "",
  capabilities: [],
  integrity: 100,
  maxIntegrity: 100,
  shieldIntegrity: 100,
  maxShieldIntegrity: 100,
  shieldGridOnline: true,
  shieldRechargeTurns: 0,
  systems: { ...systems },
  crew: [
    { id: "alive", name: "Kim", role: "Operations Officer", status: "active" },
    {
      id: "dead",
      name: "Torres",
      role: "Chief Engineer",
      status: "dead",
      deathCause: "test",
    },
    {
      id: "hurt",
      name: "Paris",
      role: "Helmsman",
      status: "injured",
      injuryTurnsRemaining: 2,
    },
  ],
  scars: [],
};

const skills = computeShipSkills(ship);
assert(
  SKILL_DIMENSIONS.every(
    (k) => skills.total[k] >= 0 && skills.total[k] <= 100
  ),
  "computeShipSkills total is clamped 0–100"
);

const onlyActive: Ship = {
  ...ship,
  crew: ship.crew.filter((c) => c.id === "alive"),
};
const onlyActiveSkills = computeShipSkills(onlyActive);
assert(
  SKILL_DIMENSIONS.every((k) => skills.fromCrew[k] === onlyActiveSkills.fromCrew[k]),
  "dead/injured crew do not contribute to fromCrew"
);

const universe = emptyUniverse("47457.1");
assert(universe.stardate === "47457.1", "emptyUniverse uses given stardate");
assert(universe.factionReputation.federation === 5, "emptyUniverse Federation rep starts at 5");
assert(
  FACTIONS.filter((f) => f !== "federation").every(
    (f) => universe.factionReputation[f] === 0
  ),
  "emptyUniverse other factions start at 0"
);
assert(universe.globalTurn === 0, "emptyUniverse globalTurn is 0");

const profile = createCampaignProfile({
  captainName: "Janeway",
  ship,
});
assert(Array.isArray(profile.campaignLog) && profile.campaignLog.length === 0, "createCampaignProfile empty campaignLog");
assert(profile.captainName === "Janeway", "createCampaignProfile keeps captainName");
assert(
  profile.crew.length === ship.crew.length &&
    profile.ship.crew.length === profile.crew.length,
  "createCampaignProfile copies crew onto profile.crew and profile.ship.crew"
);
assert(
  profile.crew.every((c) => c.status && typeof c.loyalty === "number" && c.skills),
  "createCampaignProfile crew is normalized"
);
assert(profile.activeRunId == null, "createCampaignProfile activeRunId is empty");

assert(
  interpretCaptainName("Michael Stephens, But Call Me Stephens") === "Stephens",
  "interpretCaptainName uses call-me nickname"
);
assert(
  interpretCaptainName("my name is jean-luc picard") === "Jean-Luc Picard",
  "interpretCaptainName strips my-name-is"
);
assert(
  interpretCaptainName("Captain Kirk") === "Kirk",
  "interpretCaptainName strips Captain rank"
);
assert(
  interpretCaptainName("you can call me Bones") === "Bones",
  "interpretCaptainName handles you-can-call-me"
);

const nick = createCampaignProfile({
  captainName: "Michael Stephens, but call me Stephens",
  ship,
});
assert(nick.captainName === "Stephens", "createCampaignProfile interprets call-me name");

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nPhase 0 campaign type contract: all assertions passed");
