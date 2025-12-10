
import { GoogleGenAI, Chat } from "@google/genai";

let client: GoogleGenAI | null = null;

export const getClient = (): GoogleGenAI => {
  if (!client) {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      console.error("API Key is missing");
      throw new Error("API Key is missing");
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
};

export const createConfessionalSession = (topic: string, specificInstruction?: string): Chat => {
  const ai = getClient();
  const baseInstruction = `Context: The user is confessing about "${topic}". \n\n You are an empathetic, anonymous listener. Be brief, solemn, and kind.`;
  
  return ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      temperature: 0.7,
      systemInstruction: specificInstruction ? `${specificInstruction}\n\n${baseInstruction}` : baseInstruction,
    },
  });
};

export const createPenitentSession = (topic: string, specificInstruction?: string): Chat => {
  const ai = getClient();
  const baseInstruction = `Roleplay: You are a stranger confessing about "${topic}". You are vulnerable. waiting for the user (who is the Listener) to comfort you.`;

  return ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      temperature: 0.9,
      systemInstruction: specificInstruction ? `${specificInstruction}\n\n${baseInstruction}` : baseInstruction,
    },
  });
};

export const generateInitialConfession = async (topic: string, specificInstruction?: string): Promise<string> => {
    const ai = getClient();
    // We create a temporary chat just to generate the first line with the correct persona
    const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            temperature: 0.9,
            systemInstruction: specificInstruction || `Write a short, raw, anonymous confession about ${topic}.`,
        }
    });

    const response = await chat.sendMessage({ message: `Start the confession about ${topic} now. Max 2 sentences. In Spanish.`});
    return response.text || "...";
}

// --- Radio Services ---

export const generateRadioContent = async (): Promise<string> => {
  const ai = getClient();
  const prompt = "Genera una confesión anónima muy corta (máximo 2 frases), poética o una reflexión filosófica profunda sobre la vida, el dolor o la esperanza. Hazlo en español. No uses introducciones, solo el texto.";
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 1.0 }
    });
    return response.text || "El silencio a veces dice más que mil gritos...";
  } catch (e) {
    return "Sintonizando frecuencias del alma...";
  }
};

export const generateAudienceReactions = async (broadcasterText: string): Promise<string[]> => {
  const ai = getClient();
  const prompt = `Contexto: Un usuario anónimo está hablando en una radio pública de confesiones. Acaba de decir: "${broadcasterText}".
  Tarea: Genera 3 reacciones cortas (estilo chat de internet) que podrían escribir los oyentes.
  Variedad: Una debe ser de apoyo, una filosófica/abstracta, y una simplemente una reacción emocional (ej: "wow", "que fuerte").
  Formato: Devuelve solo las 3 frases separadas por tubería (|). Sin numeración.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    const text = response.text || "Escuchando...|Estamos contigo.|...";
    return text.split('|').map(s => s.trim());
  } catch (e) {
    return ["..."];
  }
};
