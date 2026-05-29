declare const process: any;
import { prisma } from "../src/db.js";
import { generateAcademicMockSummary } from "../src/services/ai.service.js";


async function main(): Promise<void> {
  console.log("[seeder] Fetching all papers from database...");
  const papers = await prisma.paper.findMany({
    include: {
      summary: true
    }
  });

  console.log(`[seeder] Found ${papers.length} paper(s) in total.`);
  let count = 0;

  for (const paper of papers) {
    const bullets = generateAcademicMockSummary(paper.abstract);

    await prisma.paperSummary.upsert({
      where: { paperId: paper.id },
      create: {
        paperId: paper.id,
        bullets: bullets,
        status: "SUCCEEDED",
        model: "gemini-2.0-flash-mocked",
        generatedAt: new Date()
      },
      update: {
        bullets: bullets,
        status: "SUCCEEDED",
        model: "gemini-2.0-flash-mocked",
        generatedAt: new Date()
      }
    });

    count++;
  }

  console.log(`[seeder] Successfully generated and seeded ${count} beautiful AI summaries into the database!`);
}

main()
  .catch((err: unknown) => {
    console.error("[seeder] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
