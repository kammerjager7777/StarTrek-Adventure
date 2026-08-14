/**
 * Lightweight "Ask for advice" path — no dice, no playTurnCount.
 */

import type { GameState } from "../../../packages/game-core/src/index.js";
import { isLlmConfigured } from "./llmGamemaster.js";
import OpenAI from "openai";
import { loadSkillPacksCompact } from "../content/loader.js";

export type AdviceResult = {
  ok: boolean;
  memberId: string;
  memberName: string;
  advice: string;
  error?: string;
};

function getClient() {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({
    apiKey: key,
    baseURL: process.env.XAI_BASE_URL || "https://api.x.ai/v1",
    timeout: 45_000,
    maxRetries: 0,
  });
}

export async function requestCrewAdvice(
  state: GameState,
  memberId: string,
  question?: string
): Promise<{ state: GameState; result: AdviceResult }> {
  if (!isLlmConfigured()) {
    return {
      state,
      result: {
        ok: false,
        memberId,
        memberName: "",
        advice: "",
        error: "AI narrator unavailable",
      },
    };
  }
  const member = state.ship?.crew?.find((c) => c.id === memberId);
  if (!member) {
    return {
      state,
      result: {
        ok: false,
        memberId,
        memberName: "",
        advice: "",
        error: "Crew member not found",
      },
    };
  }
  if ((member.status || "active") !== "active") {
    return {
      state,
      result: {
        ok: false,
        memberId,
        memberName: member.name,
        advice: "",
        error: `${member.name} is ${member.status} and cannot advise.`,
      },
    };
  }

  const turn = state.mission?.playTurnCount || 0;
  const cooldowns = { ...(state.adviceCooldowns || {}) };
  if (cooldowns[memberId] === turn && turn > 0) {
    return {
      state,
      result: {
        ok: false,
        memberId,
        memberName: member.name,
        advice: "",
        error: "Already sought this officer's advice this turn.",
      },
    };
  }

  const client = getClient();
  if (!client) {
    return {
      state,
      result: {
        ok: false,
        memberId,
        memberName: member.name,
        advice: "",
        error: "No AI client",
      },
    };
  }

  const skills = loadSkillPacksCompact();
  const model = process.env.XAI_MODEL || "grok-4.5";
  const shipSkills = state.ship?.skills?.total;
  const payload = {
    officer: {
      name: member.name,
      role: member.role,
      species: member.species,
      personality: member.personality,
      skills: member.skills,
      loyalty: member.loyalty,
      serviceTurns: member.serviceTurns,
    },
    question: question?.trim() || "What is your recommendation, given our situation?",
    situation: {
      phase: state.phase,
      pendingQuestion: state.pendingQuestion?.slice(0, 600),
      mission: state.mission
        ? {
            title: state.mission.title,
            type: state.mission.type,
            flags: state.mission.flags?.slice(-10),
            knownIntel: state.mission.knownIntel?.slice(-6),
          }
        : null,
      ship: state.ship
        ? {
            name: state.ship.name,
            hull: `${state.ship.integrity}/${state.ship.maxIntegrity}`,
            shields: `${state.ship.shieldIntegrity}/${state.ship.maxShieldIntegrity}`,
            systems: state.ship.systems,
            skills: shipSkills,
          }
        : null,
      universe: state.universe
        ? {
            stardate: state.universe.stardate,
            reputation: state.universe.factionReputation,
          }
        : null,
    },
  };

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.75,
      max_tokens: 350,
      messages: [
        {
          role: "system",
          content: [
            skills,
            "",
            "You are writing ONE short in-character advice line from a bridge officer.",
            "Return JSON only: { \"advice\": \"2-5 sentences in their voice\" }",
            "Do NOT invent dice, damage numbers, deaths, or new mission outcomes.",
            "Use only known intel and the mechanical snapshot. Stay in character for role/species.",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify(payload) },
      ],
    });
    const raw = response.choices[0]?.message?.content || "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    let advice = "";
    if (start >= 0 && end > start) {
      try {
        const obj = JSON.parse(raw.slice(start, end + 1)) as { advice?: string };
        advice = String(obj.advice || "").trim();
      } catch {
        advice = raw.trim();
      }
    } else {
      advice = raw.trim();
    }
    if (!advice) advice = `${member.name}: I need a moment to consider the data, Captain.`;

    cooldowns[memberId] = turn;
    const next: GameState = {
      ...state,
      adviceCooldowns: cooldowns,
      // Surface advice as a soft system/crew note without advancing the mission beat
      pendingQuestion: state.pendingQuestion,
      turn: state.turn
        ? {
            ...state.turn,
            crewDialogue: [
              ...(state.turn.crewDialogue || []),
              { speaker: member.name, line: advice },
            ].slice(-6),
          }
        : state.turn,
      log: [
        ...state.log,
        {
          at: new Date().toISOString(),
          phase: state.phase,
          kind: "system",
          text: `Advice — ${member.name}: ${advice}`,
        },
      ],
    };

    return {
      state: next,
      result: {
        ok: true,
        memberId,
        memberName: member.name,
        advice,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      state,
      result: {
        ok: false,
        memberId,
        memberName: member.name,
        advice: "",
        error: message,
      },
    };
  }
}
