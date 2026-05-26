declare const process: any;
import { prisma } from "../src/db.js";

function generateAcademicMockSummary(title: string, abstract: string): string[] {
  // Clean up title
  const subject = title.replace(/^(A|An|The|On|Towards|Study of|Analysis of|Research on)\s+/i, "").trim();

  // Split abstract into clean sentences
  const sentences = abstract
    .replace(/([.?!])\s*(?=[A-Z])/g, "$1|")
    .split("|")
    .map(s => s.trim())
    .filter(s => s.length > 30);

  let bullet1 = "";
  let bullet2 = "";
  let bullet3 = "";

  // 1. Bullet 1: Core Proposal
  // Find sentence introducing the new thing
  const introKeywords = ["propose", "introduce", "present", "develop", "design", "build", "framework", "platform", "system", "we create"];
  const introSentence = sentences.find(s => {
    const sl = s.toLowerCase();
    return introKeywords.some(kw => sl.includes(kw));
  });
  if (introSentence) {
    bullet1 = introSentence;
  } else {
    // Fallback to the 1st sentence (usually contains problem statement/introduction)
    bullet1 = sentences[0] || `Presents a novel study on ${subject} to address key scientific limitations.`;
  }

  // 2. Bullet 2: Key Methodology / Mechanism
  // Find sentence describing how it works
  const methodKeywords = ["use", "apply", "base on", "incorporate", "consist of", "method", "approach", "architecture", "mechanism", "technique", "key", "attention", "feature"];
  const methodSentence = sentences.find(s => {
    const sl = s.toLowerCase();
    // Make sure we don't repeat Bullet 1
    if (s === bullet1) return false;
    return methodKeywords.some(kw => sl.includes(kw));
  });
  if (methodSentence) {
    bullet2 = methodSentence;
  } else {
    // Fallback to the middle sentence of the abstract
    const midIdx = Math.floor(sentences.length / 2);
    bullet2 = sentences[midIdx] && sentences[midIdx] !== bullet1 
      ? sentences[midIdx] 
      : (sentences[1] || "Utilizes an advanced, state-of-the-art pipeline to deliver robust and highly efficient results.");
  }

  // 3. Bullet 3: Evaluation / Results / Conclusion
  // Find sentence detailing performance, experiments, or conclusion
  const resultKeywords = ["experiment", "result", "show", "demonstrate", "outperform", "achieve", "improve", "evaluation", "percent", "%", "compare", "benchmark", "validation"];
  const resultSentence = sentences.find(s => {
    const sl = s.toLowerCase();
    // Avoid repeating Bullet 1 or 2
    if (s === bullet1 || s === bullet2) return false;
    return resultKeywords.some(kw => sl.includes(kw));
  });
  if (resultSentence) {
    bullet3 = resultSentence;
  } else {
    // Fallback to the last sentence (almost always the conclusion/impact)
    const lastIdx = sentences.length - 1;
    bullet3 = sentences[lastIdx] && sentences[lastIdx] !== bullet1 && sentences[lastIdx] !== bullet2
      ? sentences[lastIdx]
      : (sentences[sentences.length - 2] || "Provides comprehensive validation and opens up new avenues for future academic work.");
  }

  // Ensure all bullets end with a period and are clean
  const clean = (s: string) => {
    let trimmed = s.trim();
    if (!trimmed.endsWith(".")) trimmed += ".";
    return trimmed;
  };

  return [clean(bullet1), clean(bullet2), clean(bullet3)];
}

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
    const bullets = generateAcademicMockSummary(paper.title, paper.abstract);

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
