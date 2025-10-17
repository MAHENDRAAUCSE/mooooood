import { RequestHandler } from "express";
import { RequestHandler } from "express";
import axios from "axios";

export const handleOpenAIClassify: RequestHandler = async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: "Missing image in request body" });

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) return res.status(500).json({ error: "OpenAI API key not configured" });

    // Clear, strict instruction to return only JSON
    const instruction = `You are an emotion classifier. Analyze the image and reply ONLY with a JSON object and no other text. The JSON must contain two keys: \n  - emotion: one of [happy, sad, angry, surprised, fearful, disgusted, neutral]\n  - confidence: a number between 0 and 1 (probability).\nIf uncertain, return {\"emotion\":\"neutral\",\"confidence\":0.5}. Example: {\"emotion\":\"happy\",\"confidence\":0.92}`;

    const payload = {
      model: "gpt-4o-mini-vision",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: instruction },
            { type: "input_image", image_url: image },
          ],
        },
      ],
      // Use deterministic settings
      temperature: 0,
      max_output_tokens: 150,
    } as any;

    let resp;
    try {
      resp = await axios.post("https://api.openai.com/v1/responses", payload, {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      });
    } catch (err: any) {
      // If model not found or other model errors, and expressions are provided, fallback to text model
      const code = err?.response?.data?.error?.code || err?.response?.data?.error || null;
      console.warn("[openai-classify] initial call failed", code || err?.message || err);
      if (req.body?.expressions) {
        // Build a deterministic text-only prompt using expressions
        const expr = JSON.stringify(req.body.expressions);
        const textOnlyInstruction = `You are an emotion classifier. Given face expression probabilities: ${expr}, determine the primary emotion among [happy, sad, angry, surprised, fearful, disgusted, neutral] and a confidence between 0 and 1. Reply ONLY with a JSON object like {"emotion":"sad","confidence":0.85}. If uncertain, return {"emotion":"neutral","confidence":0.5}.`;
        try {
          const textPayload = {
            model: "gpt-4o-mini",
            input: [{ role: "user", content: [{ type: "input_text", text: textOnlyInstruction }] }],
            temperature: 0,
            max_output_tokens: 200,
          } as any;
          resp = await axios.post("https://api.openai.com/v1/responses", textPayload, {
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            timeout: 15000,
          });
        } catch (err2: any) {
          console.error("[openai-classify] text fallback failed", err2?.response?.data ?? err2?.message ?? err2);
          return res.status(500).json({ error: "Failed to classify image (both vision and text fallbacks failed)", detail: err2?.response?.data ?? err2?.message });
        }
      } else {
        return res.status(500).json({ error: "Failed to classify image (vision model failed)" });
      }
    }

    // Verbose logging for debugging — will appear in server logs
    try {
      console.log("[openai-classify] resp.data:", JSON.stringify(resp.data));
    } catch (e) {
      console.log("[openai-classify] resp received (could not stringify)");
    }

    // Try to extract text from the Responses API payload
    let text = "";
    const out = resp.data?.output ?? resp.data?.choices ?? null;

    if (Array.isArray(out)) {
      for (const item of out) {
        if (item?.content) {
          const c = item.content;
          if (Array.isArray(c)) {
            for (const part of c) {
              if (part?.type === "output_text" && part?.text) text += part.text;
              else if (typeof part === "string") text += part;
            }
          } else if (typeof c === "string") text += c;
        } else if (typeof item === "string") {
          text += item;
        }
      }
    } else if (typeof out === "object" && out !== null) {
      const content = out?.[0]?.content ?? out?.content;
      if (typeof content === "string") text = content;
      else if (Array.isArray(content)) {
        for (const part of content) {
          if (typeof part === "string") text += part;
          else if (part?.text) text += part.text;
        }
      }
    }

    text = text.trim();

    // Attempt to parse JSON
    let parsed: any = null;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      // ignore
    }

    // If model didn't return directly, try to inspect other fields
    if (!parsed) {
      // Look for any JSON-looking substring in raw resp
      const raw = JSON.stringify(resp.data || {}).replace(/\\s+/g, " ");
      const m = raw.match(/\{[^\}]{10,}\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch (e) {
          /* ignore */
        }
      }
    }

    if (!parsed) {
      // Fallback: conservative neutral
      parsed = { emotion: "neutral", confidence: 0.5 };
    }

    // sanitize
    const allowed = ["happy", "sad", "angry", "surprised", "fearful", "disgusted", "neutral"];
    parsed.emotion = String(parsed.emotion || "neutral").toLowerCase();
    if (!allowed.includes(parsed.emotion)) parsed.emotion = "neutral";
    parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));

    return res.json(parsed);
  } catch (err: any) {
    console.error("[openai-classify] error:", err?.response?.data || err.message || err);
    // If OpenAI is unavailable or quota limited, return a safe neutral fallback so the app continues to work
    return res.json({ emotion: "neutral", confidence: 0.5, note: "openai_error", detail: err?.response?.data ?? err?.message });
  }
};
