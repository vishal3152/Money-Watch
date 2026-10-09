"use server";

import { createDb } from "@/db/client";
import type { DemoSeedData } from "@/demo-data/generate-seed-data";
import { loadDemoSeedData, type LoadDemoSeedResult } from "@/demo-data/load-demo-seed";

export type LoadDemoSeedState = {
  ok?: boolean;
  error?: string;
  result?: LoadDemoSeedResult;
};

function isDemoSeedData(value: unknown): value is DemoSeedData {
  if (!value || typeof value !== "object") {
    return false;
  }
  const data = value as DemoSeedData;
  return (
    Array.isArray(data.institutions) &&
    Array.isArray(data.accounts) &&
    Array.isArray(data.fixedDeposits) &&
    Array.isArray(data.transactions) &&
    Array.isArray(data.transfers)
  );
}

export async function loadDemoSeedAction(
  _prev: LoadDemoSeedState,
  formData: FormData
): Promise<LoadDemoSeedState> {
  if (process.env.NODE_ENV === "production") {
    return { error: "Demo seed loading is disabled in production." };
  }

  const raw = String(formData.get("seedJson") ?? "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Seed JSON could not be parsed." };
  }

  if (!isDemoSeedData(parsed)) {
    return { error: "Seed JSON is missing required collections." };
  }

  try {
    const result = await loadDemoSeedData(createDb(), parsed);
    return { ok: true, result };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to load demo seed data."
    };
  }
}
