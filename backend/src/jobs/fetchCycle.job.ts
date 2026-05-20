import cron from "node-cron";

import { env } from "../config/env.js";
import { fetchCycleService } from "../services/fetchCycle.service.js";

let running = false;

export function registerFetchCycleJob(): void {
  if (!cron.validate(env.FETCH_CRON_EXPR)) {
    throw new Error(`Invalid FETCH_CRON_EXPR: ${env.FETCH_CRON_EXPR}`);
  }

  cron.schedule(env.FETCH_CRON_EXPR, () => {
    if (running) {
      console.warn("[scheduler] previous fetchCycle still running; skipping this tick");
      return;
    }
    running = true;
    fetchCycleService
      .run()
      .catch((err: unknown) => {
        console.error("[scheduler] fetchCycle crashed:", err);
      })
      .finally(() => {
        running = false;
      });
  });

  console.log(`[scheduler] node-cron registered fetchCycle on "${env.FETCH_CRON_EXPR}"`);
}
