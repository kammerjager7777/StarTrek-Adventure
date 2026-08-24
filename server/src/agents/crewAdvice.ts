/**
 * Lightweight "Ask for advice" path — no dice, no playTurnCount.
 * Referee helpers live in packages/game-core/src/advice.ts.
 */

import type { GameState } from "../../../packages/game-core/src/index.js";
import {
  applyAdviceToState,
  buildAdviceSnapshot,
  gateCrewAdvice,
  parseAdviceScene,
} from "../../../packages/game-core/src/index.js";
import { isLlmConfigured } from "./llmGamemaster.js";
import OpenAI from "openai";
import { loadAdviceSkill } from "../content/loader.js";

export type AdviceResult = {
  ok: boolean;
  memberId: string;
  memberName: string;
  advice: string;
  narration?: string;
  suggestedOption?: { text: string; risk: string } | null;
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

function fail(
  state: GameState,
  memberId: string,
  error: string,
  memberName = ""
): { state: GameState; result: AdviceResult } {
  return {
    state,
    result: {
      ok: false,
      memberId,
      memberName,
      advice: "",
      error,
    },
  };
}

export async function requestCrewAdvice(
  state: GameState,
  memberId: string,
  question?: string
): Promise<{ state: GameState; result: AdviceResult }> {
  if (!isLlmConfigured()) {
    return fail(state, memberId, "AI narrator unavailable");
  }

  const gate = gateCrewAdvice(state, memberId);
  if (!gate.ok) {
    return fail(state, memberId, gate.error, gate.member?.name || "");
  }
  const { member } = gate;

  const client = getClient();
  if (!client) {
    return fail(state, memberId, "No AI client", member.name);
  }

  const skill = await loadAdviceSkill();
  const model = process.env.XAI_MODEL || "grok-4.5";
  const payload = buildAdviceSnapshot(state, member, question);

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.75,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: [
            skill,
            "",
            "Return JSON only. Do NOT invent dice, damage numbers, deaths, or new mission outcomes.",
            "Use only known intel, scars, recorded deaths, and the mechanical snapshot.",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify(payload) },
      ],
    });
    const raw = response.choices[0]?.message?.content || "";
    const scene = parseAdviceScene(raw, member.name);
    const next = applyAdviceToState(state, member, scene, question);

    return {
      state: next,
      result: {
        ok: true,
        memberId: member.id,
        memberName: member.name,
        advice: scene.advice,
        narration: scene.narration,
        suggestedOption: scene.suggestedOption,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(state, memberId, message, member.name);
  }
}
