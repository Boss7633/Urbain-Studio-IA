import { GoogleGenAI, Type } from "@google/genai";

export const generateProjectStream = async (
  prompt: string, 
  onText: (text: string) => void,
  currentFiles: Record<string, string> = {}, 
  customApiKey?: string
) => {
  const model = "gemini-3-flash-preview";
  const apiKey = customApiKey || process.env.GEMINI_API_KEY || '';
  
  if (!apiKey) {
    throw new Error("API Key missing");
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
    You are Urbain Studio AI, a world-class full-stack engineer.
    Your goal is to generate high-quality web applications based on user prompts.
    
    CRITICAL INSTRUCTIONS:
    1. Commencez TOUJOURS par expliquer CLAIREMENT et ÉTAPE PAR ÉTAPE ce que vous allez faire (en Français).
    2. Utilisez un ton professionnel et pédagogique.
    3. Ne mettez AUCUN code dans votre explication textuelle, sauf si c'est pour illustrer un point précis.
    4. Fournissez TOUS les fichiers du projet dans un SEUL bloc de code JSON à la TOUTE FIN de votre réponse.
    5. Le bloc JSON DOIT être valide et suivre cette structure:
       \`\`\`json
       {
         "file/path": "content",
         ...
       }
       \`\`\`
    
    Project Requirements:
    - Framework: React (Vite)
    - Styling: Tailwind CSS
    - Icons: Lucide React
    - Context: African business (Côte d'Ivoire, CFA, Mobile Money)
    
    If this is a new project, you MUST generate: package.json, index.html, src/main.tsx, src/App.tsx, src/index.css, vite.config.ts.
    
    Current project state (existing files): ${JSON.stringify(Object.keys(currentFiles))}
  `;

  const responseStream = await ai.models.generateContentStream({
    model,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      systemInstruction,
    }
  });

  let fullText = "";
  for await (const chunk of responseStream) {
    const text = chunk.text;
    if (text) {
      fullText += text;
      onText(fullText);
    }
  }

  // Extract JSON from the full text
  const jsonBlockMatch = fullText.match(/```json\n([\s\S]*?)\n```/);
  const jsonStr = jsonBlockMatch ? jsonBlockMatch[1] : null;

  if (jsonStr) {
    try {
      return JSON.parse(jsonStr.trim()) as Record<string, string>;
    } catch (e) {
      console.error("Failed to parse JSON block", e);
    }
  }

  // Fallback: try to find anything that looks like a JSON object
  const fallbackMatch = fullText.match(/\{[\s\S]*\}/);
  if (fallbackMatch) {
    try {
      return JSON.parse(fallbackMatch[0].trim()) as Record<string, string>;
    } catch (e) {
      console.error("Failed to parse fallback JSON", e);
    }
  }

  return {};
};
