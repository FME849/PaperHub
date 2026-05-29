import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const paperCount = await prisma.paper.count();
  const summaryCount = await prisma.paperSummary.count();
  console.log(`\n==================================================`);
  console.log(`   THỐNG KÊ DATABASE TRÊN CỔNG 3307 (XAMPP)   `);
  console.log(`==================================================`);
  console.log(`- Số lượng bài báo (Paper): ${paperCount}`);
  console.log(`- Số lượng tóm tắt (PaperSummary): ${summaryCount}`);
  
  if (summaryCount > 0) {
    const sample = await prisma.paperSummary.findFirst({
      select: { model: true, bullets: true }
    });
    console.log(`- Dòng tóm tắt mẫu:`);
    console.log(JSON.stringify(sample, null, 2));
  }
  console.log(`==================================================\n`);
}

main().finally(() => prisma.$disconnect());
