import { Scene } from "../types";

export const cleanCell = (cell: string): string => {
  return cell
    .replace(/\*\*/g, '')           // Remove bold markers
    .replace(/\*([^*]+)\*/g, '$1')  // Remove italic markers
    .replace(/`([^`]+)`/g, '$1')    // Remove code markers
    .replace(/^\s*\|\s*/, '')       // Remove leading pipe
    .replace(/\s*\|\s*$/, '')       // Remove trailing pipe
    .trim();
};

export const parseMarkdownTable = (text: string, defaultSection: 'image' | 'video' = 'image'): Scene[] => {
  const lines = text.split('\n');
  const newScenes: Scene[] = [];
  
  let currentSection: 'image' | 'video' | null = defaultSection;
  let inTable = false;
  let headerSkipped = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Detect section headers
    if (/im[aá]gen|est[aá]tic|foto|photo|static|image/i.test(line) && /^#+\s|^##/.test(line)) {
      currentSection = 'image';
      inTable = false;
      headerSkipped = false;
      continue;
    }
    if (/video|movimiento|motion|animaci[oó]n|din[aá]mic/i.test(line) && /^#+\s|^##/.test(line)) {
      currentSection = 'video';
      inTable = false;
      headerSkipped = false;
      continue;
    }

    // Also detect section from emoji headers without ##
    if (/📸|🖼️/.test(line) && /im[aá]gen|est[aá]tic/i.test(line)) {
      currentSection = 'image';
      inTable = false;
      headerSkipped = false;
      continue;
    }
    if (/🎥|🎬|📹/.test(line) && /video|movimiento/i.test(line)) {
      currentSection = 'video';
      inTable = false;
      headerSkipped = false;
      continue;
    }
    
    // Skip non-table lines
    if (!line.startsWith('|')) {
      if (inTable && line === '') {
        inTable = false;
        headerSkipped = false;
      }
      continue;
    }

    // We're in a table row
    inTable = true;

    // Skip separator rows (| :--- | :--- |) and header rows
    if (/^[\|\s:\-]+$/.test(line)) {
      continue;
    }

    // Skip the header row (first row with column titles)  
    if (!headerSkipped) {
      if (/título|escena|descripci[oó]n|direcci[oó]n|c[aá]mara|#/i.test(line)) {
        headerSkipped = true;
        continue;
      }
    }

    // Parse data row
    const cells = line.split('|').map(c => cleanCell(c)).filter(c => c !== '');
    
    if (cells.length < 2) continue;

    // The description/prompt is typically the LAST column
    const description = cells[cells.length - 1];
    const title = cells.length >= 3 ? cells[1] : '';
    
    if (!description || description.length < 10) continue;

    const mode = currentSection || 'image';
    const sceneText = title ? `${title}: ${description}` : description;

    newScenes.push({
      id: crypto.randomUUID(),
      imageText: mode === 'image' ? sceneText : '',
      videoText: mode === 'video' ? sceneText : '',
      mode: mode,
      asset: null,
    });
  }

  return newScenes;
};

export const parseSimpleText = (rawText: string, mode: "image" | "video"): Scene[] => {
  const lines = rawText.split('\n');
  const chunks: string[] = [];
  let currentChunk = "";
  const numberPattern = /^\s*(?:\*\*)?\d+[\s\.\-\)]+\s*(?:\*\*)?[A-ZÁÉÍÓÚÑ]/;
  let inList = false;

  for (const line of lines) {
    if (numberPattern.test(line)) {
      if (inList && currentChunk.trim()) {
         chunks.push(currentChunk.trim());
      }
      currentChunk = line + "\n";
      inList = true;
    } else {
      if (inList) currentChunk += line + "\n";
    }
  }
  if (inList && currentChunk.trim()) {
      chunks.push(currentChunk.trim());
  }

  const finalParts = chunks.length > 0 ? chunks : [rawText.trim()];

  return finalParts.map((p) => {
    let cleaned = p.trim()
      .replace(/^\s*(?:\*\*)?\d+[\s\.\-\)]+\s*(?:\*\*)?/, '')  
      .replace(/^[\s🎥📸#*:]+/, '')        
      .trim();

    return {
      id: crypto.randomUUID(),
      imageText: mode === "image" ? cleaned : "",
      videoText: mode === "video" ? cleaned : "",
      mode: mode,
      asset: null,
    };
  });
};
