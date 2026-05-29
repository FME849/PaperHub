// Handwritten HTML + plain-text renderers for the per-cycle digest email.
// Both consume the same typed DigestPayload, so the two bodies cannot drift.
// Inline styles only, table-based layout, no remote images (research.md Decision 5).

export type DigestSummaryStatus = "SUCCEEDED" | "PENDING_RETRY" | "NOT_SUMMARISABLE" | "ABSENT";

export interface DigestPaper {
  paperId: string;
  title: string;
  authors: string[];
  summaryStatus: DigestSummaryStatus;
  summaryBullets: string[];
  matchedTopicNames: string[];
  detailUrl: string;
}

export interface DigestPayload {
  recipientUserId: number;
  cycleId: string;
  topPicks: DigestPaper[];
  candidatePaperCount: number;
  seeMoreUrl: string;
  unsubscribeUrl: string;
}

const SUMMARY_PLACEHOLDER = "Summary not yet available.";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return "Unknown authors";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")}, et al.`;
}

export function digestSubject(candidatePaperCount: number): string {
  const noun = candidatePaperCount === 1 ? "new paper" : "new papers";
  return `PaperHub: ${candidatePaperCount} ${noun} in your topics`;
}

function paperBlockHtml(paper: DigestPaper): string {
  const topics =
    paper.matchedTopicNames.length > 0
      ? `<div style="font-size:12px;color:#6b7280;margin:2px 0 8px;">in ${escapeHtml(
          paper.matchedTopicNames.join(", "),
        )}</div>`
      : "";

  const summary =
    paper.summaryStatus === "SUCCEEDED" && paper.summaryBullets.length > 0
      ? `<ul style="margin:8px 0;padding-left:18px;color:#374151;font-size:14px;">${paper.summaryBullets
          .map((b) => `<li style="margin:2px 0;">${escapeHtml(b)}</li>`)
          .join("")}</ul>`
      : `<p style="margin:8px 0;color:#9ca3af;font-size:13px;font-style:italic;">${SUMMARY_PLACEHOLDER}</p>`;

  return `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #e5e7eb;">
        <a href="${escapeHtml(paper.detailUrl)}" style="font-size:16px;font-weight:600;color:#1d4ed8;text-decoration:none;">${escapeHtml(
          paper.title,
        )}</a>
        <div style="font-size:13px;color:#6b7280;margin:4px 0 0;">${escapeHtml(formatAuthors(paper.authors))}</div>
        ${topics}
        ${summary}
        <a href="${escapeHtml(paper.detailUrl)}" style="font-size:13px;color:#1d4ed8;text-decoration:none;">Read on PaperHub &rarr;</a>
      </td>
    </tr>`;
}

export function renderDigestHtml(payload: DigestPayload): string {
  const papers = payload.topPicks.map(paperBlockHtml).join("");
  const remaining = payload.candidatePaperCount - payload.topPicks.length;
  const seeMore =
    remaining > 0
      ? `<p style="margin:16px 0;font-size:14px;"><a href="${escapeHtml(
          payload.seeMoreUrl,
        )}" style="color:#1d4ed8;font-weight:600;text-decoration:none;">See ${remaining} more on PaperHub &rarr;</a></p>`
      : `<p style="margin:16px 0;font-size:14px;"><a href="${escapeHtml(
          payload.seeMoreUrl,
        )}" style="color:#1d4ed8;text-decoration:none;">View all of this batch on PaperHub &rarr;</a></p>`;

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td>
          <h1 style="margin:0 0 4px;font-size:20px;color:#111827;">New papers in your topics</h1>
          <p style="margin:0 0 12px;font-size:14px;color:#6b7280;">Here ${
            payload.topPicks.length === 1 ? "is the top pick" : `are the top ${payload.topPicks.length} picks`
          } from your latest PaperHub fetch.</p>
        </td></tr>
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${papers}</table>
          ${seeMore}
        </td></tr>
        <tr><td style="padding-top:24px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">You are receiving this because you enabled email notifications for new papers in your PaperHub account.</p>
          <p style="margin:8px 0 0;font-size:12px;color:#9ca3af;"><a href="${escapeHtml(
            payload.unsubscribeUrl,
          )}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function paperBlockText(paper: DigestPaper, index: number): string {
  const lines: string[] = [];
  lines.push(`${index + 1}. ${paper.title}`);
  lines.push(`   ${formatAuthors(paper.authors)}`);
  if (paper.matchedTopicNames.length > 0) {
    lines.push(`   in ${paper.matchedTopicNames.join(", ")}`);
  }
  if (paper.summaryStatus === "SUCCEEDED" && paper.summaryBullets.length > 0) {
    for (const bullet of paper.summaryBullets) {
      lines.push(`   - ${bullet}`);
    }
  } else {
    lines.push(`   ${SUMMARY_PLACEHOLDER}`);
  }
  lines.push(`   ${paper.detailUrl}`);
  return lines.join("\n");
}

export function renderDigestText(payload: DigestPayload): string {
  const papers = payload.topPicks.map(paperBlockText).join("\n\n");
  const remaining = payload.candidatePaperCount - payload.topPicks.length;
  const seeMore =
    remaining > 0
      ? `See ${remaining} more on PaperHub: ${payload.seeMoreUrl}`
      : `View all of this batch on PaperHub: ${payload.seeMoreUrl}`;

  return [
    "New papers in your topics",
    "",
    papers,
    "",
    seeMore,
    "",
    "—",
    "You are receiving this because you enabled email notifications for new papers in your PaperHub account.",
    `Unsubscribe: ${payload.unsubscribeUrl}`,
  ].join("\n");
}
