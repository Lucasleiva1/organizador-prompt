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
    
    // Pattern that handles: * **PLANO 1, - **PLANO 1, [cite_start]**PLANO 1, or just **PLANO 1
    const panoPattern = /^\s*(?:[\*\-\+]\s*)?(?:\[cite_start\])?\s*\*?\*?(?:PLANO|PANEL|ESCENA|SCENE|SHOT)\s*\d+/i;

    for (const line of lines) {
      if (panoPattern.test(line)) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = line + "\n";
      } else {
        currentChunk += line + "\n";
      }
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    // Merge everything before the FIRST PLANO into the first PLANO chunk
    const firstPanoIndex = chunks.findIndex(c => panoPattern.test(c));
    if (firstPanoIndex > 0) {
      const intro = chunks.slice(0, firstPanoIndex).join('\n\n');
      chunks = chunks.slice(firstPanoIndex);
      chunks[0] = intro + "\n\n" + chunks[0];
    }

    return chunks.map((chunk, index) => {
      const cleanChunk = chunk.trim();
      
      const getField = (keys: string[]) => {
        for (const key of keys) {
          // Flexible field extraction even with list markers and bold text
          const regex = new RegExp(`[\\*\\-\\s]*\\*\\*${key}:?\\*\\*\\s*(.*?)(?=\\n|\\s*\\*\\*|$)`, 'is');
          const match = cleanChunk.match(regex);
          if (match) return ProductionAgent.cleanText(match[1]);
        }
        return null;
      };

      const visual = getField(['Visual', 'Descripción', 'Visual Instruction', 'Instruction']);
      const optics = getField(['Óptica', 'Cámara', 'Óptica & Sensor', 'Lente']);
      const lighting = getField(['Luz', 'Iluminación', 'Iluminación & Atmósfera', 'Atmósfera']);

      // Default text extraction: everything after the header line if "Visual" is missing
      let imageText = visual || cleanChunk.replace(panoPattern, '').split('\n').filter(l => l.trim()).join(' ');

      return {
        id: crypto.randomUUID(),
        imageText: ProductionAgent.cleanText(imageText),
        videoText: '',
        mode: 'image',
        asset: null,
        groupId: workspaceId,
        theme: theme,
        optics: optics || 'Detectar en guion',
        physics: lighting || 'Normal',
        sceneNumber: index + 1
      };
    });
  }
};
