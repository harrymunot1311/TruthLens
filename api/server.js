const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5";

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "..")));

// Use OpenAI's hosted web_search tool for current online sources.
async function webSearch(query) {
  if (!OPENAI_API_KEY) return [];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      input: `Search the web for up to 8 credible, relevant sources about this claim. Return a concise research note. Claim/search query: ${query}`
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI web search failed (${response.status}): ${details.slice(0, 300)}`);
  }

  const data = await response.json();
  const found = [];
  const seen = new Set();

  for (const item of data.output || []) {
    if (item.type === "web_search_call") {
      for (const source of item.action?.sources || []) {
        if (!source.url || seen.has(source.url)) continue;
        seen.add(source.url);
        found.push({
          title: source.title || source.url,
          url: source.url,
          snippet: source.snippet || source.description || ""
        });
      }
    }

    if (item.type === "message") {
      for (const content of item.content || []) {
        for (const annotation of content.annotations || []) {
          if (annotation.type !== "url_citation" || !annotation.url || seen.has(annotation.url)) continue;
          seen.add(annotation.url);
          found.push({
            title: annotation.title || annotation.url,
            url: annotation.url,
            snippet: "Source cited in OpenAI web-search results."
          });
        }
      }
    }
  }

  return found.slice(0, 8);
}

async function aiVerify(claim, sources) {
  if (!OPENAI_API_KEY) return null;

  const evidence = sources
    .map(
      (s, i) =>
        `SOURCE ${i + 1}\nTitle: ${s.title}\nURL: ${s.url}\nSnippet: ${s.snippet}`
    )
    .join("\n\n");

  const prompt = `You are the evidence-analysis layer of TruthLens.\n\nAnalyze the user's claim using ONLY the supplied web-search evidence. Do not invent facts, citations, or source contents.\n\nClaim:\n${claim}\n\nEvidence:\n${evidence || "No usable sources were returned by web search."}\n\nReturn valid JSON exactly:\n{\n  "verdict": "Likely true" | "Likely false" | "Partly true / misleading" | "Insufficient evidence",\n  "confidence": number,\n  "explanation": string,\n  "evidence": [{"label": string, "text": string}]\n}\n\nPrefer agreement among independent reputable sources. If evidence conflicts or is weak, use "Insufficient evidence" or "Partly true / misleading". If no sources are available, return "Insufficient evidence" with low confidence. Confidence must be between 0 and 100.`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: prompt
    })
  });

  if (!response.ok) throw new Error(`AI analysis failed (${response.status}).`);

  const data = await response.json();
  const output = (data.output || [])
    .flatMap((x) => x.content || [])
    .map((x) => x.text || "")
    .join("")
    .replace(/^```json\s*/, "")
    .replace(/```$/, "")
    .trim();

  return JSON.parse(output);
}

function fallback(sources) {
  return {
    verdict: sources.length ? "Evidence found — review sources" : "Insufficient evidence",
    confidence: sources.length ? 25 : 10,
    explanation: sources.length
      ? "TruthLens found relevant online sources, but AI evidence analysis is unavailable. Review the cited sources before deciding whether the claim is correct."
      : "No usable online sources were returned. Add an OPENAI_API_KEY in .env to enable web search and evidence analysis.",
    evidence: sources.slice(0, 3).map((x) => ({
      label: "Related source",
      text: `${x.title}. ${x.snippet}`
    }))
  };
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    searchConfigured: Boolean(OPENAI_API_KEY),
    aiConfigured: Boolean(OPENAI_API_KEY),
    mode: OPENAI_API_KEY ? "live" : "offline",
    searchProvider: OPENAI_API_KEY ? "OpenAI web_search" : "Local review checklist"
  });
});

app.post("/api/verify", async (req, res) => {
  try {
    const { input, type = "message" } = req.body || {};

    if (typeof input !== "string" || !input.trim()) {
      return res.status(400).json({ error: "Please enter a claim or URL." });
    }

    if (!OPENAI_API_KEY) {
      return res.json({
        mode: "offline",
        verdict: "Manual review needed",
        confidence: null,
        explanation: "Your information was received, but no live search or AI analysis is connected. TruthLens will not guess or label this claim as true or false. Use the review checklist below to examine it.",
        evidence: [
          { label: "Find the original source", text: "Who first published this information? Locate the original post, report, or document." },
          { label: "Check date and context", text: "Confirm when and where it happened. Watch for old material presented as new." },
          { label: "Compare independent sources", text: "Look for confirmation from more than one credible and independent source." },
          { label: "Look for missing details", text: "Check names, places, numbers, captions, and what may have been left out." }
        ],
        sources: [],
        inputType: type
      });
    }

    let query = input.trim();
    const urls = query.match(/https?:\/\/[^\s)]+/gi) || [];

    if (type === "link" && urls[0]) query = `"${urls[0]}"`;

    const sources = await webSearch(query);
    const analysis = (await aiVerify(input.trim(), sources)) || fallback(sources);

    res.json({
      ...analysis,
      sources,
      inputType: type,
      aiEnabled: Boolean(OPENAI_API_KEY)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Verification failed." });
  }
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});

app.listen(PORT, () => {
  console.log(`TruthLens running at http://localhost:${PORT}`);
});
