import { Router } from "express";
import { generateAiResponse } from "../lib/gemini.js";

const router = Router();

router.post("/chat", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const aiResponse = await generateAiResponse(prompt);
    return res.json({ message: aiResponse });
  } catch (error) {
    console.error("AI Route Error:", error);
    return res.status(500).json({ error: "Failed to generate AI response" });
  }
});

export default router;
