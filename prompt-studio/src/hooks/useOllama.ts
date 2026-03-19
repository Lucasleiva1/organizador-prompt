import { useState } from 'react';

export const useOllama = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  const queryOllama = async (prompt: string, systemPrompt: string = "", isJson: boolean = true) => {
    setIsProcessing(true);
    try {
      const response = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "qwen3:0.6b", // defaulting to the user's preferred version
          prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
          stream: false,
          format: isJson ? "json" : undefined,
          options: {
            temperature: 0.3
          }
        })
      });

      if (!response.ok) {
        throw new Error("Ollama endpoint not responding");
      }

      const data = await response.json();
      return data.response;
    } catch (error) {
      console.error("Ollama Error:", error);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };

  return { queryOllama, isProcessing };
};
