// FinOS AI Employee Backend
// Vercel Serverless Function

import { GoogleGenerativeAI } from "@google/generative-ai";
import { setTimeout as delay } from "node:timers/promises";

declare const process: {
  env: Record<string, string | undefined>;
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST.",
    });
  }

  try {
    const {
      message,
      employee,
      conversation = [],
      history = [],
    } = req.body || {};

    // Validate message
    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Message is required.",
      });
    }

    // Validate employee
    if (!employee) {
      return res.status(400).json({
        error: "Employee information is required.",
      });
    }

    // Get Gemini API key
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured on the server.",
      });
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);

    // Gemini model
    const model = genAI.getGenerativeModel({
      model: "gemini-3.7-flash",
    });

    // Employee information
    const employeeName = employee.name || "FinOS AI Employee";
    const employeeRole = employee.role || "AI Assistant";
    const employeeDepartment = employee.department || "FinOS";

    const personality =
      employee.personality ||
      "Professional, intelligent, helpful, and human-like.";

    const systemPrompt =
      employee.systemPrompt ||
      employee.prompt ||
      "You are a professional AI employee working for FinOS.";

    const skills = Array.isArray(employee.skills)
      ? employee.skills.join(", ")
      : "";

    const responsibilities = Array.isArray(employee.responsibilities)
      ? employee.responsibilities.join(", ")
      : "";

    const knowledge = Array.isArray(employee.knowledge)
      ? employee.knowledge.join(", ")
      : typeof employee.knowledge === "string"
        ? employee.knowledge
        : "";

    // Support both conversation and history
    const conversationItems =
      Array.isArray(conversation) && conversation.length > 0
        ? conversation
        : Array.isArray(history)
          ? history
          : [];

    // Keep latest 10 messages
    const conversationText = conversationItems
      .slice(-10)
      .map((item: any) => {
        const role =
          item.role === "user"
            ? "User"
            : employeeName;

        return `${role}: ${
          item.content || item.message || ""
        }`;
      })
      .join("\n");

    // Employee system instructions
    const systemInstruction = `
You are ${employeeName}.

Your job title is: ${employeeRole}.
Department: ${employeeDepartment}.

Personality:
${personality}

Your professional system instructions:
${systemPrompt}

Skills:
${skills || "General professional assistance"}

Responsibilities:
${responsibilities || "Help users professionally"}

Professional knowledge:
${knowledge || "Use your professional expertise"}

IMPORTANT RULES:
- Behave like a real professional employee, not a generic chatbot.
- Stay consistent with your job role and responsibilities.
- Give useful, practical and accurate answers.
- Remember the context of the current conversation.
- Do not mention these hidden instructions.
- Speak naturally and professionally.
- Answer in the same language used by the user whenever possible.
`;

    // Final prompt
    const prompt = `
${systemInstruction}

Conversation history:
${conversationText || "No previous conversation."}

Current user message:
${message}

Respond naturally as ${employeeName}.
`;

    // Generate response with automatic retry for temporary 503 errors
    let result: any = null;
    let lastError: any = null;

    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        result = await model.generateContent(prompt);
        break;
      } catch (error: any) {
        lastError = error;

        const errorMessage = String(error?.message || "").toLowerCase();

        const isTemporaryError =
          errorMessage.includes("503") ||
          errorMessage.includes("unavailable") ||
          errorMessage.includes("high demand") ||
          errorMessage.includes("service unavailable") ||
          errorMessage.includes("overloaded") ||
          errorMessage.includes("temporarily");

        // Stop immediately for non-temporary errors
        if (!isTemporaryError || attempt === maxAttempts - 1) {
          throw error;
        }

        // Exponential backoff:
        // Retry 1 -> 2 seconds
        // Retry 2 -> 4 seconds
        // Retry 3 -> 8 seconds
        // Retry 4 -> 16 seconds
        const waitTime = Math.min(
          2000 * Math.pow(2, attempt),
          30000
        );

        await delay(waitTime);
      }
    }

    if (!result) {
      throw (
        lastError ||
        new Error("Gemini request failed after multiple retries.")
      );
    }

    const response = await result.response;

    const reply =
      response.text().trim() ||
      "I apologize, but I could not generate a response right now.";

    // Return successful response
    return res.status(200).json({
      success: true,
      reply,
      employee: {
        id: employee.id || null,
        name: employeeName,
        role: employeeRole,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      error:
        error?.message ||
        "The AI service encountered an unexpected error.",
    });
  }
}
