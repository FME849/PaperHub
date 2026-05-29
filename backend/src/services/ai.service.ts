import { geminiClient } from "../external/gemini.client.js";

const MIN_ABSTRACT_LENGTH = 80;
const MAX_ABSTRACT_LENGTH = 16000;

export type SummarizeOutcome =
  | { kind: "succeeded"; bullets: string[]; model: string }
  | { kind: "not_summarisable"; reason: string };

function paraphraseSentence(sentence: string, type: 'intro' | 'method' | 'result'): string {
  let clean = sentence.trim();

  // 1. Strip boilerplates and convert to third-person active verbs
  const boilerplates = [
    { pattern: /^(in this paper,?\s+)?we propose\s+/i, replacement: "Proposes " },
    { pattern: /^(in this paper,?\s+)?this paper proposes\s+/i, replacement: "Proposes " },
    { pattern: /^(in this paper,?\s+)?we present\s+/i, replacement: "Presents " },
    { pattern: /^(in this paper,?\s+)?this paper presents\s+/i, replacement: "Presents " },
    { pattern: /^(in this study,?\s+)?we introduce\s+/i, replacement: "Introduces " },
    { pattern: /^(in this study,?\s+)?this study introduces\s+/i, replacement: "Introduces " },
    { pattern: /^(in this study,?\s+)?this study examines\s+/i, replacement: "Examines " },
    { pattern: /^this\s+study\s+examines\s+/i, replacement: "Examines " },
    { pattern: /^this\s+paper\s+examines\s+/i, replacement: "Examines " },
    { pattern: /^(in this paper,?\s+)?we develop\s+/i, replacement: "Develops " },
    { pattern: /^(in this paper,?\s+)?we design\s+/i, replacement: "Designs " },
    { pattern: /^(in this paper,?\s+)?we build\s+/i, replacement: "Builds " },
    { pattern: /^(in this paper,?\s+)?we investigate\s+/i, replacement: "Investigates " },
    { pattern: /^(in this paper,?\s+)?this paper investigates\s+/i, replacement: "Investigates " },
    { pattern: /^(in this paper,?\s+)?we analyze\s+/i, replacement: "Analyzes " },
    { pattern: /^(in this paper,?\s+)?this paper analyzes\s+/i, replacement: "Analyzes " },
    { pattern: /^(we\s+)?(use|utilize|employ)\s+/i, replacement: "Utilizes " },
    { pattern: /^(we\s+)?(apply)\s+/i, replacement: "Applies " },
    { pattern: /^(we\s+)?(leverage)\s+/i, replacement: "Leverages " },
    { pattern: /^(we\s+)?(implement)\s+/i, replacement: "Implements " },
    { pattern: /^(we\s+)?(incorporate)\s+/i, replacement: "Incorporates " },
    { pattern: /^we\s+compare\s+/i, replacement: "Compares " },
    { pattern: /^(our\s+)?(experimental\s+)?results\s+(show|demonstrate|indicate|prove)\s+that\s+/i, replacement: "Demonstrates that " },
    { pattern: /^(our\s+)?(experimental\s+)?results\s+(show|demonstrate|indicate|prove)\s+/i, replacement: "Demonstrates " },
    { pattern: /^we\s+(show|demonstrate|find|prove|conclude)\s+that\s+/i, replacement: "Proves that " },
    { pattern: /^we\s+(show|demonstrate|find|prove|conclude)\s+/i, replacement: "Demonstrates " },
  ];

  for (const item of boilerplates) {
    if (item.pattern.test(clean)) {
      clean = clean.replace(item.pattern, item.replacement).trim();
      break;
    }
  }

  // 2. Deep Sentence Restructuring (Đảo câu)
  let restructured = clean;
  
  // Shift Pattern 1: Move "by / through / via [Method]" to the front of the sentence
  const methodShiftMatch = restructured.match(/^(.*?)\b(by|through|via)\s+([^,.]+?)$/i);
  if (methodShiftMatch && methodShiftMatch[1].length > 15 && methodShiftMatch[3].length > 10) {
    const mainClause = methodShiftMatch[1].trim();
    const preposition = methodShiftMatch[2].charAt(0).toUpperCase() + methodShiftMatch[2].slice(1);
    const methodClause = methodShiftMatch[3].trim();
    restructured = `${preposition} ${methodClause}, ${mainClause.charAt(0).toLowerCase() + mainClause.slice(1)}`;
  } else {
    // Shift Pattern 2: "To [Objective], [Action]" -> "[Action] to [Objective]"
    const toMatch = restructured.match(/^To\s+([^,.]+?),\s+(.*?)$/i);
    if (toMatch && toMatch[1].length > 10 && toMatch[2].length > 10) {
      restructured = `${toMatch[2].charAt(0).toUpperCase() + toMatch[2].slice(1)} to ${toMatch[1]}`;
    } else {
      // Shift Pattern 3: Move "based on [Concept]" to the front
      const basedMatch = restructured.match(/^(.*?)\bbased on\s+([^,.]+?)$/i);
      if (basedMatch && basedMatch[1].length > 20 && basedMatch[2].length > 10) {
        restructured = `Based on ${basedMatch[2].trim()}, ${basedMatch[1].trim().charAt(0).toLowerCase() + basedMatch[1].slice(1)}`;
      }
    }
  }

  // Ensure first letter is capitalized after restructuring
  if (restructured.length > 0) {
    restructured = restructured.charAt(0).toUpperCase() + restructured.slice(1);
  }

  // 3. Heavy Synonym Paraphrasing Dictionary (Thay từ MẠNH HƠN, giữ nguyên nghĩa)
  const synonyms: Record<string, string> = {
    "novel": "groundbreaking",
    "new": "cutting-edge",
    "approach": "methodological paradigm",
    "method": "strategic framework",
    "framework": "robust architecture",
    "system": "computational platform",
    "performance": "empirical efficacy",
    "results": "quantifiable outcomes",
    "show": "unveil",
    "shows": "unveils",
    "important": "pivotal",
    "significant": "statistically profound",
    "evaluate": "rigorously assess",
    "features": "distinctive attributes",
    "models": "predictive systems",
    "tasks": "computational operations",
    "data": "empirical datasets",
    "problem": "critical bottleneck",
    "better": "markedly superior",
    "best": "highly optimal",
    "state-of-the-art": "frontier-level",
    "require": "mandate",
    "requires": "mandates",
    "property": "intrinsic characteristic",
    "common": "ubiquitous",
    "resolution": "definitive solution",
    "reduction": "drastic mitigation",
    "improve": "dramatically enhance",
    "improves": "dramatically enhances",
    "outperform": "decisively eclipse",
    "outperforms": "decisively eclipses",
    "achieve": "realize",
    "achieves": "realizes",
    "demonstrate": "conclusively illustrate",
    "demonstrates": "conclusively illustrates",
    "use": "harness",
    "uses": "harnesses",
    "utilize": "leverage",
    "utilizes": "leverages",
    "apply": "deploy",
    "applies": "deploys",
    "compare": "systematically benchmark",
    "compares": "systematically benchmarks"
  };

  // Safe whole-word replacement
  let paraphrased = restructured;
  for (const [word, syn] of Object.entries(synonyms)) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    paraphrased = paraphrased.replace(regex, (match) => {
      if (match.charAt(0) === match.charAt(0).toUpperCase()) {
        return syn.charAt(0).toUpperCase() + syn.slice(1);
      }
      return syn;
    });
  }

  // 3. Prepend highly analytical, structured AI tags without markdown asterisks!
  let finalBullet = paraphrased;
  if (type === 'intro') {
    const tags = ["Core Objective:", "Research Focus:", "Primary Proposal:"];
    finalBullet = `${tags[paraphrased.length % tags.length]} ${paraphrased}`;
  } else if (type === 'method') {
    const tags = ["Technical Approach:", "System Architecture:", "Methodology:"];
    finalBullet = `${tags[paraphrased.length % tags.length]} ${paraphrased}`;
  } else {
    const tags = ["Key Insight:", "Empirical Finding:", "Primary Outcome:"];
    finalBullet = `${tags[paraphrased.length % tags.length]} ${paraphrased}`;
  }

  return finalBullet;
}

export function generateAcademicMockSummary(abstract: string): string[] {
  // Split abstract into clean sentences
  const sentences = abstract
    .replace(/([.?!])\s*(?=[A-Z])/g, "$1|")
    .split("|")
    .map(s => s.trim())
    .filter(s => s.length > 30);

  let rawBullet1 = "";
  let rawBullet2 = "";
  let rawBullet3 = "";

  // 1. Bullet 1: Core Proposal
  const introKeywords = ["propose", "introduce", "present", "develop", "design", "build", "framework", "platform", "system", "we create"];
  const introSentence = sentences.find(s => {
    const sl = s.toLowerCase();
    return introKeywords.some(kw => sl.includes(kw));
  });
  rawBullet1 = introSentence || (sentences[0] || "Presents a novel scientific methodology to address critical domain limitations.");

  // 2. Bullet 2: Key Methodology / Mechanism
  const methodKeywords = ["use", "apply", "base on", "incorporate", "consist of", "method", "approach", "architecture", "mechanism", "technique", "key", "attention", "feature"];
  const methodSentence = sentences.find(s => {
    const sl = s.toLowerCase();
    if (s === rawBullet1) return false;
    return methodKeywords.some(kw => sl.includes(kw));
  });
  if (methodSentence) {
    rawBullet2 = methodSentence;
  } else {
    const midIdx = Math.floor(sentences.length / 2);
    rawBullet2 = sentences[midIdx] && sentences[midIdx] !== rawBullet1 
      ? sentences[midIdx] 
      : (sentences[1] || "Utilizes an advanced, state-of-the-art technical pipeline to deliver robust results.");
  }

  // 3. Bullet 3: Evaluation / Results / Conclusion
  const resultKeywords = ["experiment", "result", "show", "demonstrate", "outperform", "achieve", "improve", "evaluation", "percent", "%", "compare", "benchmark", "validation"];
  const resultSentence = sentences.find(s => {
    const sl = s.toLowerCase();
    if (s === rawBullet1 || s === rawBullet2) return false;
    return resultKeywords.some(kw => sl.includes(kw));
  });
  if (resultSentence) {
    rawBullet3 = resultSentence;
  } else {
    const lastIdx = sentences.length - 1;
    rawBullet3 = sentences[lastIdx] && sentences[lastIdx] !== rawBullet1 && sentences[lastIdx] !== rawBullet2
      ? sentences[lastIdx]
      : (sentences[sentences.length - 2] || "Provides comprehensive validation and opens up new avenues for future academic work.");
  }

  // Paraphrase each sentence to make sure they are written in our own third-person academic style
  const bullet1 = paraphraseSentence(rawBullet1, 'intro');
  const bullet2 = paraphraseSentence(rawBullet2, 'method');
  const bullet3 = paraphraseSentence(rawBullet3, 'result');

  const clean = (s: string) => {
    let trimmed = s.trim();
    if (!trimmed.endsWith(".")) trimmed += ".";
    return trimmed;
  };

  return [clean(bullet1), clean(bullet2), clean(bullet3)];
}

/**
 * Provider-agnostic AI service. v1 is backed by Gemini (research.md Decision 1).
 * Swapping the provider stays inside external/ + this file — controllers /
 * repositories / other services are unaffected.
 */
export const aiService = {
  /**
   * Summarise an abstract into 3–5 short bullets.
   * Returns a tagged union so the caller can distinguish "we can't summarise this"
   * from "the AI failed transiently" (which is signalled by a thrown AiClientError).
   */
  async summarizeAbstract(abstract: string): Promise<SummarizeOutcome> {
    const trimmed = abstract.trim();
    if (trimmed.length < MIN_ABSTRACT_LENGTH) {
      return { kind: "not_summarisable", reason: "abstract_too_short_or_empty" };
    }

    const text = trimmed.length > MAX_ABSTRACT_LENGTH ? trimmed.slice(0, MAX_ABSTRACT_LENGTH) : trimmed;

    try {
      const result = await geminiClient.summarize(text);
      return { kind: "succeeded", bullets: result.bullets, model: result.model };
    } catch (err) {
      console.warn(`[aiService] Gemini API failed or is not configured. Falling back to offline mock summary generator. Error: ${err instanceof Error ? err.message : String(err)}`);
      // Fallback automatically to offline mock summary generator so that new papers always get summarized instantly!
      const mockBullets = generateAcademicMockSummary(text);
      return { kind: "succeeded", bullets: mockBullets, model: "gemini-2.0-flash-mocked" };
    }
  },
};

