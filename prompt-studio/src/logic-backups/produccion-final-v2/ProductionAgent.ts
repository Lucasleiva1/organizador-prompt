import { Scene } from "../types";

/**
 * PRODUCTION AGENT LOGIC
 * This agent specializes in parsing "Technical Production Sheets".
 * It expects a format with [PLANO X], Visual, Óptica, and Luz.
 */

export const ProductionAgent = {
  name: "Agente de Producción Técnica",
  
  /**
   * Cleans citation markers and reference noise
   */
  cleanText: (text: string): string => {
    return text
      .replace(/\[cite:.*?\]/g, '')
      .replace(/\[cite_start\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /**
   * Splits a massive markdown into individual scene objects using a line-by-line strategy
   */
  parseSheet: (rawText: string, workspaceId: string, theme: any, mode: 'image' | 'video' = 'image'): Scene[] => {
    const lines = rawText.split(/\r?\n/);
    let chunks: string[] = [];
    let currentChunk = "";
    let currentSection = "";
    
    // Pattern for shot headers: PLANO 1, PANEL 2, etc. (Supports 10+ and Markdown headers #)
    const shotPattern = /^\s*(?:#+\s*)?(?:[\*\-\+]\s*)?(?:\[cite_start\])?\s*\*?\*?(?:PLANO|PANEL|ESCENA|SCENE|SHOT|PÁGINA|PAGINA)\s*(\d+)/i;
    const sectionPattern = /^\s*#+\s*(SECCI[ÓO]N.*)/i;

    for (const line of lines) {
      const sectionMatch = line.match(sectionPattern);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim();
        continue;
      }

      if (shotPattern.test(line)) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = line + "\n";
        if (currentSection) {
          currentChunk = `// ${currentSection}\n` + currentChunk;
        }
      } else {
        currentChunk += line + "\n";
      }
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    // Process each chunk into a Scene object
    return chunks
      .filter(chunk => shotPattern.test(chunk))
      .map((chunk, index) => {
        const cleanChunk = chunk.trim();
        const firstLine = cleanChunk.split('\n').find(l => shotPattern.test(l)) || '';
        const numMatch = firstLine.match(shotPattern);
        const shotNumber = numMatch ? parseInt(numMatch[1], 10) : index + 1;

        const getField = (keys: string[]) => {
          for (const key of keys) {
            // Match "1. Field: Content" or "**Field & Extra**: Content" or "Field: Content"
            // Account for leading numbers, bullets, bold markers, and suffixes after the key but before the colon
            const regex = new RegExp(`(?:^|\\n)\\s*(?:\\d+[\\.\\)]\\s*)?(?:[\\*\\-\\s]*\\*?${key}[^:\\n]*\\*?:?\\s*)(.*?)(?=\\n\\s*(?:\\d+[\\.\\)]\\s*)?[\\*\\-]*\\s*\\*?\\w+\\*?:|$)`, 'is');
            const match = cleanChunk.match(regex);
            if (match && match[1].trim()) return ProductionAgent.cleanText(match[1]);
          }
          return null;
        };

        const video = getField(['Movimiento', 'Cinematic Action', 'Dinámica', 'Acción', 'Video Prompt']);
        const optics = getField(['Óptica', 'Cámara', 'Lente', 'Sensor']);
        const lighting = getField(['Luz', 'Iluminación', 'Atmósfera', 'Ambiente']);
        const vfx = getField(['VFX', 'Post', 'Efectos', 'Post-producción']);
        const sound = getField(['Sonido', 'Sound Design', 'Audio', 'Música']);
        const action = getField(['Acción', 'Cinematic Action', 'Dinámica', 'Movimiento']);

        const headerLine = cleanChunk.split('\n').find(l => shotPattern.test(l)) || "";
        
        // Format the final prompt text
        // We want to be inclusive: keep THE WHOLE header line (PLANO X: ...) and everything else.
        const otherLines = cleanChunk.split('\n').filter(l => !shotPattern.test(l) && !l.startsWith('//')).join('\n').trim();
        
        let finalImagePrompt = mode === 'image' ? (headerLine + "\n" + otherLines).trim() : '';
        let finalVideoPrompt = mode === 'video' ? (headerLine + "\n" + (video || otherLines)).trim() : '';
        
        return {
          id: crypto.randomUUID(),
          imageText: ProductionAgent.cleanText(finalImagePrompt),
          videoText: ProductionAgent.cleanText(finalVideoPrompt),
          mode: mode,
          asset: null,
          groupId: workspaceId,
          theme: theme,
          optics: optics || 'Detectar...',
          physics: lighting || 'Cinematic',
          vfx: vfx || 'No especificado',
          sound: sound || 'Ambiente',
          action: action || video || 'No especificado',
          sceneNumber: shotNumber
        };
      });
  },

  /**
   * IA-Powered scanning/splitting of technical text with PROGRESS support.
   */
  scanAndSplitTechnicalText: async (
    rawText: string, 
    onProgress?: (current: number, total: number, lastScene?: any) => void
  ): Promise<any[]> => {
    console.log("IA Scaneando texto técnico incrementalmente...");
    
    // 1. Identificar bloques de planos (Regex para PLANO X, SHOT X, ESCENA X) - Supports 10+
    const segments = rawText.split(/(?=PLANO|SHOT|ESCENA|SCENE|Panel \d+)/i).filter(s => s.trim().length > 5);
    const total = segments.length;
    const allResults: any[] = [];

    const systemPrompt = `Actúa como un EXPORTADOR DE DATOS CINEMATOGRÁFICOS profesional. 
    Tu única función es transformar la SIGUIENTE descripción de escena en un objeto JSON.
    REGLAS:
    - Devuelve SOLO el OBJETO JSON: { "sceneNumber": number, "imageText": string, "optics": string, "physics": string, "vfx": string, "sound": string, "action": string }.
    - Si un dato no existe, usa "N/A".`.trim();

    for (let i = 0; i < total; i++) {
      const segment = segments[i].trim();
      console.log(`[ProductionAgent] Procesando segmento ${i+1}/${total}: "${segment.substring(0, 30)}..."`);
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const response = await fetch('http://127.0.0.1:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: "qwen3.5:2b",
            prompt: `${systemPrompt}\n\nTEXTO A PROCESAR:\n${segment}`,
            stream: false,
            format: "json",
            options: { temperature: 0.0 }
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          console.log(`[ProductionAgent] Respuesta recibida para segmento ${i+1}`);
          let scene;
          try {
            // Intentar extraer JSON de la respuesta
            const rawResponse = data.response;
            const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              scene = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error("No JSON found in response");
            }
          } catch (e) {
            console.warn(`[ProductionAgent] Falló parseo JSON en segmento ${i+1}, usando fallback básico.`);
            scene = {
              sceneNumber: i + 1,
              imageText: segment.substring(0, 500),
              optics: "N/A", physics: "N/A", vfx: "N/A", sound: "N/A", action: "N/A"
            };
          }

          if (scene) {
            const finalScene = {
              ...scene,
              id: crypto.randomUUID(),
              mode: 'image',
              groupId: 'default', // Fallback
              sceneNumber: scene.sceneNumber || (i + 1)
            };
            allResults.push(finalScene);
            if (onProgress) onProgress(i + 1, total, finalScene);
          }
        } else {
          console.error(`[ProductionAgent] Error en respuesta de Ollama: ${response.status}`);
        }
      } catch (e: any) {
        console.error(`[ProductionAgent] Error crítico en segmento ${i+1}:`, e.message);
        if (e.name === 'AbortError') {
          console.error("[ProductionAgent] Tiempo de espera agotado (Timeout).");
        }
      }
    }

    return allResults;
  }
};
