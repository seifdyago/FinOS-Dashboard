// FinOS Luna backend route: keeps GEMINI_API_KEY on the server.
type EmployeePayload = {
  id?: string; name?: string; role?: string; department?: string;
  personality?: string; systemPrompt?: string; skills?: string[];
  responsibilities?: string[]; knowledge?: string[];
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server' });
  try {
    const { employee = {}, message, history = [] } = req.body || {} as { employee?: EmployeePayload; message?: string; history?: string[] };
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'A message is required' });
    const prompt = [
      `You are ${employee.name || 'a FinOS AI employee'}.`,
      `Role: ${employee.role || 'AI employee'}. Department: ${employee.department || 'FinOS'}.`,
      `Personality: ${employee.personality || 'Professional, helpful, clear, and honest'}.`,
      employee.systemPrompt ? `Operating instructions: ${employee.systemPrompt}` : '',
      employee.skills?.length ? `Skills: ${employee.skills.join(', ')}.` : '',
      employee.responsibilities?.length ? `Responsibilities: ${employee.responsibilities.join('; ')}.` : '',
      employee.knowledge?.length ? `Knowledge: ${employee.knowledge.join('; ')}.` : '',
      'Stay in role. Do not claim to have completed external actions unless a real tool/API confirms it. Be concise and useful.',
      history.length ? `Recent user context:\n${history.slice(-8).map((x, i) => `${i + 1}. ${x}`).join('\n')}` : '',
      `Current user message: ${message}`,
    ].filter(Boolean).join('\n\n');
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const upstream = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 900 } }) });
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ error: data?.error?.message || 'Gemini request failed' });
    const reply = data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || '').join('').trim();
    if (!reply) return res.status(502).json({ error: 'Gemini returned no response' });
    return res.status(200).json({ reply });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'AI backend failed' });
  }
}
