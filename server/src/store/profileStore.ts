/**
 * Profile-centric campaign persistence — scoped per owner email.
 * data/users/{slug}/profiles/{id}.json
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  CampaignLogEntry,
  CampaignProfile,
  GameState,
  Ship,
} from "../../../packages/game-core/src/types.js";
import {
  appendCampaignLog,
  applyReputation,
  applySkillXp,
  baselineSkillsForRole,
  calculateSkillGains,
  computeShipSkills,
  createCampaignProfile,
  emptyUniverse,
  interpretCaptainName,
  normalizeCrewMember,
  reputationDeltaFromFlags,
  stardateForEra,
  tickUniverse,
  normalizeShip,
} from "../../../packages/game-core/src/index.js";
import { emailsMatch, normalizeEmail } from "../auth/identity.js";
import {
  ensureUserDirs,
  maybeMigrateLegacyForUser,
  userProfilesDir,
} from "../auth/userData.js";

function profilePath(ownerEmail: string, id: string) {
  return path.join(userProfilesDir(ownerEmail), `${id}.json`);
}

export async function writeProfile(profile: CampaignProfile): Promise<void> {
  const email = normalizeEmail(profile.ownerEmail || "");
  if (!email) {
    throw new Error("writeProfile: profile.ownerEmail is required");
  }
  await ensureUserDirs(email);
  const next: CampaignProfile = {
    ...profile,
    ownerEmail: email,
    captainName: interpretCaptainName(profile.captainName),
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(
    profilePath(email, profile.id),
    JSON.stringify(next, null, 2),
    "utf8"
  );
}

export async function readProfile(
  id: string,
  ownerEmail: string
): Promise<CampaignProfile | null> {
  const email = normalizeEmail(ownerEmail);
  if (!email) return null;
  await maybeMigrateLegacyForUser(email);
  try {
    const raw = await fs.readFile(profilePath(email, id), "utf8");
    const p = JSON.parse(raw) as CampaignProfile;
    if (p.ownerEmail && !emailsMatch(p.ownerEmail, email)) return null;
    return {
      ...p,
      ownerEmail: email,
      captainName: interpretCaptainName(p.captainName),
    };
  } catch {
    return null;
  }
}

export async function listProfiles(ownerEmail: string): Promise<
  Array<{
    id: string;
    captainName: string;
    shipName: string;
    registryNumber: string;
    stardate: string;
    missions: number;
    updatedAt: string;
    createdAt: string;
    activeRunId: string | null;
    ownerEmail: string;
  }>
> {
  const email = normalizeEmail(ownerEmail);
  if (!email) return [];
  await maybeMigrateLegacyForUser(email);
  await ensureUserDirs(email);
  const dir = userProfilesDir(email);
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      const p = JSON.parse(raw) as CampaignProfile;
      if (p.ownerEmail && !emailsMatch(p.ownerEmail, email)) continue;
      out.push({
        id: p.id,
        captainName: interpretCaptainName(p.captainName),
        shipName: p.ship?.name || "Unknown vessel",
        registryNumber: p.ship?.registryNumber || "",
        stardate: p.universe?.stardate || p.ship?.stardate || "",
        missions: p.campaignLog?.length || 0,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt,
        activeRunId: p.activeRunId || null,
        ownerEmail: email,
      });
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteProfile(
  id: string,
  ownerEmail: string
): Promise<boolean> {
  const email = normalizeEmail(ownerEmail);
  if (!email) return false;
  const existing = await readProfile(id, email);
  if (!existing) return false;
  try {
    await fs.unlink(profilePath(email, id));
    return true;
  } catch {
    return false;
  }
}

/** Create profile from a ship that finished setup (or mid-run). */
export async function createProfileFromShip(
  captainName: string,
  ship: Ship,
  ownerEmail: string
): Promise<CampaignProfile> {
  const email = normalizeEmail(ownerEmail);
  if (!email) throw new Error("createProfileFromShip: ownerEmail required");
  const id = randomUUID();
  const profile = createCampaignProfile({
    id,
    captainName,
    ship,
    universe: emptyUniverse(stardateForEra(ship.era)),
    ownerEmail: email,
  });
  await writeProfile(profile);
  return profile;
}

/**
 * Merge active run state back into the durable profile.
 * Call on debrief / explicit save / starbase entry.
 */
export async function updateProfileFromRun(
  runState: GameState,
  opts: {
    outcome?: "success" | "failed" | "abandoned";
    clearActiveRun?: boolean;
  } = {}
): Promise<CampaignProfile | null> {
  const profileId = runState.profileId;
  const ownerEmail = normalizeEmail(runState.ownerEmail || "");
  if (!profileId || !runState.ship || !ownerEmail) return null;

  let profile = await readProfile(profileId, ownerEmail);
  if (!profile) {
    // Bootstrap profile if missing
    profile = await createProfileFromShip(
      runState.playerName || "Captain",
      runState.ship,
      ownerEmail
    );
  }

  const ship = normalizeShip(runState.ship);
  const stardate =
    runState.universe?.stardate ||
    profile.universe.stardate ||
    ship.stardate;
  let crew = (ship.crew || []).map((c) => normalizeCrewMember(c, stardate));
  const skills = computeShipSkills({ ...ship, crew }, crew);

  let universe = runState.universe || profile.universe;
  const outcome = opts.outcome;
  let campaignLog = profile.campaignLog;

  if (outcome && runState.mission) {
    const flags = runState.mission.flags || [];
    const gains = calculateSkillGains(
      runState.mission,
      outcome,
      runState.mission.playTurnCount || 0,
      flags,
      runState.mission.objectives
    );
    const repDeltas = reputationDeltaFromFlags(flags, outcome);
    universe = applyReputation(universe, repDeltas);
    universe = tickUniverse(
      universe,
      Math.max(
        1,
        (runState.mission.playTurnCount || 1) - (universe.lastTickTurn || 0)
      ),
      flags
    );

    crew = crew.map((c) => {
      if (c.status !== "active" && c.status !== "injured") return c;
      const nextSkills = applySkillXp(
        { ...baselineFromCrew(c), ...(c.skills || {}) },
        gains,
        c.status === "active" ? 1 : 0.5
      );
      return {
        ...c,
        skills: nextSkills,
        missionsServed:
          (c.missionsServed || 0) +
          (outcome === "success" || outcome === "failed" ? 1 : 0),
        loyalty: Math.min(
          100,
          (c.loyalty || 55) + (outcome === "success" ? 3 : 0)
        ),
      };
    });

    const entry: CampaignLogEntry = {
      missionId: runState.mission.id,
      title: runState.mission.title,
      stardate: universe.stardate,
      outcome,
      keyFlags: flags.slice(-12),
      casualties: crew
        .filter((c) => c.status === "dead")
        .map((c) => c.name)
        .filter(
          (n) => !profile!.campaignLog.some((e) => e.casualties.includes(n))
        ),
      skillGains: gains,
      reputationDeltas: repDeltas,
    };
    profile = appendCampaignLog(
      {
        ...profile,
        ownerEmail,
        ship: { ...ship, crew, skills, stardate: universe.stardate },
        crew,
        skills: computeShipSkills({ ...ship, crew }, crew),
        universe,
      },
      entry
    );
  } else {
    profile = {
      ...profile,
      ownerEmail,
      ship: { ...ship, crew, skills, stardate },
      crew,
      skills,
      universe,
      updatedAt: new Date().toISOString(),
    };
  }

  if (opts.clearActiveRun) {
    profile = { ...profile, activeRunId: null };
  } else if (runState.status === "active") {
    profile = { ...profile, activeRunId: runState.runId };
  }

  // silence unused
  void campaignLog;

  await writeProfile(profile);
  return profile;
}

function baselineFromCrew(c: { role: string }) {
  return baselineSkillsForRole(c.role);
}

/** Spec names for Phase 1 persistence. */
export const saveProfile = writeProfile;
export const loadProfile = readProfile;
