import { RequestHandler } from "express";
import axios from "axios";

export const handleQuote: RequestHandler = async (_req, res) => {
  try {
    const resp = await axios.get("https://zenquotes.io/api/random", { timeout: 10000 });
    const data = resp.data;
    const item = Array.isArray(data) ? data[0] : data;
    const quote = item ? `${item.q} — ${item.a}` : null;
    if (!quote) return res.status(502).json({ error: "No quote returned" });
    return res.json({ quote });
  } catch (err: any) {
    console.error(err?.response?.data || err.message || err);
    return res.status(502).json({ error: "Failed to fetch quote" });
  }
};
