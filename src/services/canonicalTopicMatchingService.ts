/**
 * Canonical Topic Matching Service (Etapa 1.28C).
 * Suggests canonical matches against the 75 STAZIAMED_CANONICAL_TOPICS.
 * Never auto-approves canonicalTopicId.
 */

import {
  CanonicalMedicalArea,
  CanonicalTopicMatchResult,
  STAZIAMED_CANONICAL_TOPICS,
} from "../types/medicalTaxonomy";

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Evaluates semantic match between detected title/context and StaziaMed Canonical Topics.
 */
export function suggestCanonicalTopicMatch(
  area?: CanonicalMedicalArea,
  _specialty?: string,
  detectedTopicTitle?: string,
  contextText?: string
): CanonicalTopicMatchResult {
  if (!detectedTopicTitle || !detectedTopicTitle.trim()) {
    return {
      matchConfidence: 0,
      matchMethod: "NO_MATCH",
    };
  }

  const normTitle = normalizeString(detectedTopicTitle);
  const normContext = contextText ? normalizeString(contextText) : "";

  // 1. Exact Name Matching
  for (const topic of STAZIAMED_CANONICAL_TOPICS) {
    if (area && topic.area !== area) continue;
    if (topic.name.toLowerCase() === detectedTopicTitle.trim().toLowerCase()) {
      return {
        suggestedCanonicalTopicId: topic.id,
        matchedTopicName: topic.name,
        matchConfidence: 1.0,
        matchMethod: "EXACT_NAME",
      };
    }
  }

  // 2. Normalized Name Matching
  for (const topic of STAZIAMED_CANONICAL_TOPICS) {
    if (area && topic.area !== area) continue;
    const normTopicName = normalizeString(topic.name);
    if (normTopicName === normTitle) {
      return {
        suggestedCanonicalTopicId: topic.id,
        matchedTopicName: topic.name,
        matchConfidence: 0.95,
        matchMethod: "NORMALIZED_NAME",
      };
    }
  }

  // 3. Synonyms Matching (SEMANTIC_MATCH)
  for (const topic of STAZIAMED_CANONICAL_TOPICS) {
    if (area && topic.area !== area) continue;
    for (const syn of topic.synonyms) {
      const normSyn = normalizeString(syn);
      const titleTokens = new Set(normTitle.split(" "));
      if (
        normSyn === normTitle ||
        titleTokens.has(normSyn) ||
        (normSyn.length >= 5 && normTitle.includes(normSyn))
      ) {
        return {
          suggestedCanonicalTopicId: topic.id,
          matchedTopicName: topic.name,
          matchConfidence: 0.9,
          matchMethod: "SEMANTIC_MATCH",
        };
      }
    }
  }

  // 4. Keyword / Context Overlap Matching (SEMANTIC_MATCH)
  let bestTopic = null;
  let bestScore = 0;

  for (const topic of STAZIAMED_CANONICAL_TOPICS) {
    if (area && topic.area !== area) continue;

    let score = 0;
    const contextTokens = new Set(`${normTitle} ${normContext.slice(0, 500)}`.split(" "));

    for (const kw of topic.keywords) {
      const normKw = normalizeString(kw);
      if (normKw.includes(" ")) {
        if (normTitle.includes(normKw) || normContext.includes(normKw)) {
          score += 0.5;
        }
      } else if (contextTokens.has(normKw)) {
        score += 0.35;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic;
    }
  }

  if (bestTopic && bestScore >= 0.6) {
    const confidence = Math.min(0.85, Math.max(0.7, bestScore));
    return {
      suggestedCanonicalTopicId: bestTopic.id,
      matchedTopicName: bestTopic.name,
      matchConfidence: confidence,
      matchMethod: "SEMANTIC_MATCH",
    };
  }

  return {
    matchConfidence: 0,
    matchMethod: "NO_MATCH",
  };
}
