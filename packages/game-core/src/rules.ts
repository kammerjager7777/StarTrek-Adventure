import {
  DICE_THRESHOLDS,
  type Difficulty,
  type Ship,
  type ShipSystems,
  type SystemStatus,
} from "./types.js";

export function successThreshold(
  difficulty: Difficulty,
  actionModifier = 0
): number {
  return Math.min(20, Math.max(2, DICE_THRESHOLDS[difficulty] + actionModifier));
}

export function evaluateD20(
  roll: number,
  difficulty: Difficulty,
  actionModifier = 0
): {
  success: boolean;
  critical: "none" | "success" | "failure";
  threshold: number;
} {
  const threshold = successThreshold(difficulty, actionModifier);
  const critFailMax = difficulty === "hardcore" ? 3 : 1;

  if (roll === 20) {
    return { success: true, critical: "success", threshold };
  }
  if (roll <= critFailMax) {
    return { success: false, critical: "failure", threshold };
  }
  return {
    success: roll >= threshold,
    critical: "none",
    threshold,
  };
}

export function rollD20(rng: () => number = Math.random): number {
  return Math.floor(rng() * 20) + 1;
}

export function clampIntegrity(value: number, max = 100): number {
  return Math.max(0, Math.min(max, value));
}

export function applyIntegrityDamage(
  ship: Ship,
  amount: number
): { ship: Ship; destroyed: boolean; abandonSuggested: boolean } {
  const integrity = clampIntegrity(ship.integrity - amount, ship.maxIntegrity);
  return {
    ship: { ...ship, integrity },
    destroyed: integrity <= 0,
    abandonSuggested: integrity > 0 && integrity <= 15,
  };
}

export function setSystem(
  systems: ShipSystems,
  key: keyof ShipSystems,
  status: SystemStatus
): ShipSystems {
  return { ...systems, [key]: status };
}

export function systemLabel(key: keyof ShipSystems): string {
  const labels: Record<keyof ShipSystems, string> = {
    shields: "Shield array",
    torpedoes: "Photon torpedo launcher",
    warp: "Warp nacelles",
    communications: "Communications",
    sensors: "Sensors",
    lifeSupport: "Life support",
  };
  return labels[key];
}

export function shipStatusSummary(ship: Ship): string {
  const damaged = (Object.entries(ship.systems) as [keyof ShipSystems, SystemStatus][])
    .filter(([, s]) => s !== "ok")
    .map(([k, s]) => `${systemLabel(k)}: ${s}`)
    .join("; ");

  return [
    `${ship.name} (${ship.className}) — Stardate ${ship.stardate}`,
    `Integrity: ${ship.integrity}/${ship.maxIntegrity}`,
    damaged ? `Damage: ${damaged}` : "Systems: all nominal",
    ship.scars.length ? `Scars: ${ship.scars.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function hintsAllowed(difficulty: Difficulty | null): boolean {
  return difficulty !== "hardcore";
}

export function metaCommandList(difficulty: Difficulty | null): string[] {
  const base = [
    "mission status",
    "recap",
    "change difficulty",
    "restart",
    "new mission",
    "enemy status",
  ];
  if (hintsAllowed(difficulty)) base.splice(1, 0, "hint");
  return base;
}
