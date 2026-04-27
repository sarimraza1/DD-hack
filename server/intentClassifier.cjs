/**
 * AI Intent Classifier
 * 
 * Classifies canvas node text into one of four intents:
 * - action_item: Something that needs to be done
 * - decision: A decision that has been made
 * - question: An open question
 * - reference: Reference material / general info
 * 
 * Uses pattern-based classification (no paid APIs).
 * This is a hybrid approach: keyword patterns + structural heuristics.
 */

const ACTION_PATTERNS = [
  /\b(todo|to-do|to do)\b/i,
  /\b(action item|action point)\b/i,
  /\b(need to|needs to|must|should|have to|has to)\b/i,
  /\b(implement|create|build|fix|update|deploy|write|design|refactor|test|review|merge)\b/i,
  /\b(assign|assigned to|responsible)\b/i,
  /\b(deadline|due date|by|before)\b.*\b\d/i,
  /^\s*[-*\[\]]\s/m,  // Bullet points or checkboxes
  /\b(task|ticket)\b/i,
  /^(do|make|add|remove|change|set up|configure)\b/i,
  /@\w+/,  // @mentions often indicate assignment
];

const DECISION_PATTERNS = [
  /\b(decided|decision|agreed|approved|confirmed|finalized)\b/i,
  /\b(we will|we'll|going with|chosen|selected|picked)\b/i,
  /\b(conclusion|resolved|settled on|opted for)\b/i,
  /\b(let's go with|we're going|the plan is)\b/i,
  /\b(verdict|ruling|determination)\b/i,
  /^(decision|agreed|confirmed):/im,
];

const QUESTION_PATTERNS = [
  /\?\s*$/m,  // Ends with question mark
  /\b(how|what|why|when|where|who|which|should we|can we|could we|shall we)\b/i,
  /\b(question|open question|unclear|unsure|tbd|to be decided|to be determined)\b/i,
  /\b(discuss|debate|consider|think about|figure out)\b/i,
  /^(q:|question:)/im,
];

/**
 * Classify the intent of a text string.
 * Returns: { intent: string, confidence: number }
 */
function classifyIntent(text) {
  if (!text || text.trim().length < 3) {
    return { intent: 'reference', confidence: 0.1 };
  }

  const scores = {
    action_item: 0,
    decision: 0,
    question: 0,
    reference: 0.3, // Base score — default fallback
  };

  // Score each category
  for (const pattern of ACTION_PATTERNS) {
    if (pattern.test(text)) scores.action_item += 1;
  }
  for (const pattern of DECISION_PATTERNS) {
    if (pattern.test(text)) scores.decision += 1;
  }
  for (const pattern of QUESTION_PATTERNS) {
    if (pattern.test(text)) scores.question += 1;
  }

  // Normalize scores
  const maxScore = Math.max(...Object.values(scores));
  const intent = Object.entries(scores).reduce((best, [key, val]) =>
    val > best[1] ? [key, val] : best, ['reference', 0]
  );

  // Only classify if we have meaningful signal
  const confidence = maxScore > 0 ? Math.min(maxScore / 3, 1) : 0.1;

  return {
    intent: intent[0],
    confidence: confidence,
    scores // Include all scores for transparency
  };
}

/**
 * Check if text should be auto-extracted as a task.
 * Requires higher confidence threshold — we don't want false positives.
 */
function isActionItem(text) {
  const result = classifyIntent(text);
  return result.intent === 'action_item' && result.confidence >= 0.33;
}

module.exports = { classifyIntent, isActionItem };
