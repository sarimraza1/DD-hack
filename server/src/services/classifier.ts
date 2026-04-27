import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

interface ClassificationResult {
  label: "action item" | "decision" | "open question" | "reference";
  confidence: number;
}

// Debounce timers per nodeId
const debounceTimers = new Map<string, Timer>();

export function classifyWithDebounce(
  nodeId: string,
  text: string,
  callback: (result: ClassificationResult) => void
) {
  const existing = debounceTimers.get(nodeId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    debounceTimers.delete(nodeId);
    try {
      const result = await classifyText(text);
      callback(result);
    } catch (err) {
      console.error("Classification failed for node", nodeId, err);
    }
  }, 1500);

  debounceTimers.set(nodeId, timer);
}

async function classifyText(text: string): Promise<ClassificationResult> {
  if (process.env.USE_FALLBACK_CLASSIFIER === "true") {
    return fallbackClassifier(text);
  }

  try {
    const res = await groq.chat.completions.create({
      model: "llama3-8b-8192",
      messages: [
        {
          role: "user",
          content: `Classify the following canvas note into exactly one category.
Categories: "action item", "decision", "open question", "reference".
Respond with JSON only: { "label": "<category>", "confidence": <0.0-1.0> }

Note: "${text}"`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 60,
    });

    const content = res.choices[0]?.message?.content;
    if (!content) return fallbackClassifier(text);

    const parsed = JSON.parse(content) as ClassificationResult;
    if (!parsed.label || typeof parsed.confidence !== "number") {
      return fallbackClassifier(text);
    }
    return parsed;
  } catch {
    console.warn("Groq API failed, using fallback classifier");
    return fallbackClassifier(text);
  }
}

function fallbackClassifier(text: string): ClassificationResult {
  const lower = text.toLowerCase();

  // Action item heuristics: imperative verbs
  const actionVerbs =
    /^(review|fix|update|create|implement|add|remove|deploy|build|test|check|send|schedule|write|complete|finish|submit|prepare|design|refactor|merge|resolve|investigate)\b/i;
  const actionPhrases =
    /\b(need to|should|must|todo|to-do|action item|by friday|by monday|deadline|asap|urgent)\b/i;

  if (actionVerbs.test(lower.trim()) || actionPhrases.test(lower)) {
    return { label: "action item", confidence: 0.75 };
  }

  // Decision
  if (/\b(decided|agreed|we will|let's go with|approved|chosen)\b/i.test(lower)) {
    return { label: "decision", confidence: 0.7 };
  }

  // Open question
  if (/\?|^(how|what|why|when|where|who|should we|can we|do we)\b/i.test(lower.trim())) {
    return { label: "open question", confidence: 0.7 };
  }

  return { label: "reference", confidence: 0.5 };
}
