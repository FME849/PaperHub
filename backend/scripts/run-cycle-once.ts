import { prisma } from "../src/db.js";
import { fetchCycleService } from "../src/services/fetchCycle.service.js";

async function main(): Promise<void> {
  console.log("[run-cycle-once] starting one fetch cycle…");
  const { cycleId, stats } = await fetchCycleService.run();
  console.log(`[run-cycle-once] cycle ${cycleId} finished`);
  console.log(JSON.stringify(stats, null, 2));
}

main()
  .catch((err: unknown) => {
    console.error("[run-cycle-once] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
