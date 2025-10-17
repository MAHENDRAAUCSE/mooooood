import { RequestHandler } from "express";
import axios from "axios";

export const handleJoke: RequestHandler = async (_req, res) => {
  try {
    const resp = await axios.get("https://v2.jokeapi.dev/joke/Any", {
      params: { type: "single", blacklistFlags: "nsfw,religious,political,racist,sexist,explicit" },
      timeout: 10000,
    });
    const data = resp.data;
    const joke = data?.joke || null;
    if (!joke) return res.status(502).json({ error: "No joke returned" });
    return res.json({ joke });
  } catch (err: any) {
    console.error(err?.response?.data || err.message || err);
    return res.status(502).json({ error: "Failed to fetch joke" });
  }
};
