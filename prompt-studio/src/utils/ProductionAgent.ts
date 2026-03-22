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
  parseSheet: (rawText: string, workspaceId: string, theme: any): Scene[] => {
    const lines = rawText.split(/\r?\n/);
    let chunks: string[] = [];
    let currentChunk = "";
    let currentSection = "";
    
    // Pattern for shot headers: PLANO 1, PANEL 2, etc.
    const shotPattern = /^\s*(?:[\*\-\+]\s*)?(?:\[cite_start\])?\s*\*?\*?(?:PLANO|PANEL|ESCENA|SCENE|SHOT)\s*(\d+)/i;
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
            // Match "Field: Content" or "**Field**: Content"
            const regex = new RegExp(`(?:[\\*\\-\\s]*\\*?${key}\\*?:?\\s*)(.*?)(?=\\n|\\s*[\\*\\-]*\\s*\\*?\\w+\\*?:|$)`, 'is');
            const match = cleanChunk.match(regex);
            if (match && match[1].trim()) return ProductionAgent.cleanText(match[1]);
          }
          return null;
        };

        const visual = getField(['Visual', 'Descripción', 'Visual Instruction', 'Visual Prompt', 'Video Core']);
        const optics = getField(['Óptica', 'Cámara', 'Lente', 'Sensor']);
        const lighting = getField(['Luz', 'Iluminación', 'Atmósfera', 'Ambiente']);
        const vfx = getField(['VFX', 'Post', 'Efectos', 'Post-producción']);
        const sound = getField(['Sonido', 'Sound Design', 'Audio', 'Música']);
        const action = getField(['Acción', 'Cinematic Action', 'Dinámica', 'Movimiento']);

        // Format the final prompt text
        let finalPrompt = visual || cleanChunk.split('\n').filter(l => !shotPattern.test(l) && !l.startsWith('//')).join(' ').trim();
        
        return {
          id: crypto.randomUUID(),
          imageText: ProductionAgent.cleanText(finalPrompt),
          videoText: ProductionAgent.cleanText(chunk), // Keep full context for video mode
          mode: 'image',
          asset: null,
          groupId: workspaceId,
          theme: theme,
          optics: optics || 'Detectar...',
          physics: lighting || 'Cinematic',
          vfx: vfx || 'No especificado',
          sound: sound || 'Ambiente',
          action: action || 'No especificado',
          sceneNumber: shotNumber
        };
      });
  }
};
