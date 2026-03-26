// SceneCard Parsing Logic Backup (Producción Final v2)
// This logic ensures that PLANO X header and all subsequent fields are captured properly.

interface ParsedMetadata {
  mainPrompt: string;
  metadata: Record<string, string>;
  optics: string;
  lighting: string;
  audio: string;
  dynamics: string;
  vfx: string;
  vfxDetail: string;
  sound: string;
  cameraChoreography: string;
}

const parseScriptText = (text: string): ParsedMetadata => {
  const metadata: Record<string, string> = {};
  
  const getField = (keys: string[]) => {
    for (const key of keys) {
      const regex = new RegExp(`(?:${key}):\\s*(.*?)(?=\\n|\\*\\*|$)`, 'i');
      const match = text.match(regex);
      if (match) return match[1].trim();
    }
    return "";
  };

  const optics = getField(['Óptica & Sensor', 'Óptica', 'Cámara', 'Lente', 'Visual Prompt']);
  const lighting = getField(['Iluminación & Atmósfera', 'Iluminación', 'Luz', 'Atmósfera']);
  const sound = getField(['Sound Design', 'Sonido', 'Audio', 'Música & Audio']);
  const vfx = getField(['VFX & Post', 'VFX', 'Post-producción', 'Efectos']);
  const audio = getField(['Audio', 'Música']);
  const dynamics = getField(['Cinematic Action', 'Acción', 'Efecto & Dinámica', 'Dinámica']);
  const cameraChoreography = getField(['Camera Choreography', 'Movimiento de Cámara', 'Cámara']);

  let mainPrompt = "";
  const fieldNames = ['Visual', 'Descripción', 'Óptica', 'Cámara', 'Lente', 'Iluminación', 'Luz', 'Atmósfera', 'Sound', 'Sonido', 'Audio', 'Cinematic', 'Acción', 'Efecto', 'Dynamics', 'VFX', 'Post', 'Movimiento'];
  const fieldsRegex = new RegExp(`(?:\\n|^)\\s*(?:\\d+[\\.\\)]\\s*)?(?:${fieldNames.join('|')}):\\s*`, 'i');
  const firstFieldMatch = text.match(fieldsRegex);
  
  const headerText = firstFieldMatch ? text.substring(0, firstFieldMatch.index).trim() : "";
  const visualMatch = text.match(/(?:^|\\n)\\s*(?:\\d+[\\.\\)]\\s*)?(?:Visual Prompt \(Video Core\)|Visual Instruction|Visual|Descripción):\\s*(.*?)(?=\\n|(?:\\s*\\d+[\\.\\)]\\s*)?(?:Visual|Descripción|Óptica|Cámara|Lente|Iluminación|Luz|Atmósfera|Sound|Sonido|Audio|Cinematic|Acción|Efecto|Dynamics|VFX|Post|Movimiento)|\\*\\*|$)/is);
  
  if (visualMatch) {
    mainPrompt = (headerText ? headerText + "\\n" : "") + visualMatch[1].trim();
  } else {
    // Fallback cleaning
    const baseText = headerText || text;
    const lines = baseText
      .replace(/##+.*?\\n/g, '')
      .split('\\n');
    
    const descriptiveLines = lines.filter(line => !line.includes(':') && line.trim().length > 0);
    if (descriptiveLines.length > 0) {
       mainPrompt = (headerText ? headerText + "\\n" : "") + descriptiveLines.join(' ').trim();
    } else {
       mainPrompt = (headerText ? headerText + "\\n" : "") + lines.join(' ').trim();
    }
  }
  
  return { mainPrompt, metadata, optics, lighting, audio, dynamics, vfx: "", sound, cameraChoreography, vfxDetail: vfx };
};
