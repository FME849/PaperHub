import { fetchCycleService } from "../services/fetchCycle.service.js";

async function main() {
  console.log("Starting manual Arxiv fetch cycle...");
  try {
    const result = await fetchCycleService.run();
    console.log("Fetch cycle completed successfully!");
    console.log(JSON.stringify(result.stats, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("Fetch cycle failed:", err);
    process.exit(1);
  }
}

main();
