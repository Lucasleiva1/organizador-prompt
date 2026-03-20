import React, { useState } from 'react';
import { BrainCircuit, ImagePlus, CheckCircle, FileDown, Plus, Trash2, Copy } from 'lucide-react';
import jsPDF from 'jspdf';
import { documentDir, join } from '@tauri-apps/api/path';
import { writeFile, mkdir } from '@tauri-apps/plugin-fs';
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Scene } from '../types';

interface QwenPanel {
  scene: number;
  description: string;
  optics: string;
  physics: string;
  timing: string;
}

interface QwenEngineProps {
  onAddGeneratedScenes: (scenes: Scene[]) => void;
}

export const QwenEngine: React.FC<QwenEngineProps> = ({ onAddGeneratedScenes }) => {
  const [script, setScript] = useState("");
  const [panels, setPanels] = useState<QwenPanel[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const splitScriptIntoPanels = (text: string): string[] => {
    const lines = text.trim().split(/\r?\n/);
    // Detectamos si es CSV por la cabecera
    const isCSV = lines[0]?.toLowerCase().includes("shot") && lines[0]?.includes(",");
    
    if (isCSV) {
      // Retornamos las líneas de datos (saltando la cabecera)
      return lines.slice(1).filter(l => l.trim().length > 5);
    }
    
    // Dividimos por marcadores de panel, incluyendo el nuevo formato "Panel X.X" y variaciones de markdown
    const segments = text.split(/(?=### PANEL|## PANEL|PANEL #|PANEL \d+|- \*\*Panel \d+\.\d+|Panel \d+\.\d+)/gi);
    
    return segments
      .map(s => s.trim())
      .filter(s => {
        if (s.length < 10) return false;
        // Solo aceptamos si contiene "PANEL" o al menos 2 campos técnicos
        const hasPanelMarker = /PANEL\s*#?\d+/i.test(s);
        const techCount = (s.match(/Composición|Encuadre|Cámara|Lente|Luz|Atmósfera|Acción|Efecto/gi) || []).length;
        return hasPanelMarker || techCount >= 2;
      });
  };

  const regexExtract = (text: string, fallbackScene: number): QwenPanel | null => {
    const getVal = (label: string) => {
      // 1. Buscamos la etiqueta ignorando asteriscos previos.
      // 2. Capturamos TODO después del primer separador (:) o después del nombre si no hay separador.
      // 3. Capturamos hasta el FINAL de la línea (incluyendo asteriscos de formato intermedio).
      const reg = new RegExp(`(?:^|[\\s*#_]+)${label}[\\s*:]+([^\\n#]+)`, 'i');
      const m = text.match(reg);
      if (m && m[1]) {
        const val = m[1].replace(/\*\*/g, '').replace(/[\*_\\]/g, '').trim();
        // Si el valor es solo un símbolo (como ":" o "::"), lo ignoramos para que use la descripción o N/A
        if (/^[:\s\*]*$/.test(val) || (val.length < 2 && /^[^a-zA-Z0-9]+$/.test(val))) return null;
        return val;
      }
      return null;
    };


    const comp = getVal("Composición") || getVal("Encuadre") || getVal("Plano") || (text.match(/\[(.*?)\]/)?.[1] || "");
    const action = getVal("Acción") || getVal("Escena") || getVal("Movimiento") || "";
    const camera = getVal("Cámara") || getVal("Lente") || getVal("Movimiento") || getVal("Slide") || getVal("Vibración");
    const physics = getVal("Iluminación") || getVal("Atmósfera") || getVal("Efecto") || getVal("Física") || getVal("VFX") || getVal("Laboratorio") || getVal("Color") || getVal("Luz") || getVal("Audio") || getVal("Sonido");

    if (comp || action || camera || physics) {
      // Si el formato es de bullet point o CSV, limpiamos la acción
      let finalDesc = action || "";
      
      // Lógica específica para CSV (si el texto tiene comas y comillas pero no etiquetas)
      const csvCols = text.includes(",") && text.includes('"') ? parseCSVLine(text) : [];
      if (csvCols.length >= 4) {
        return {
          scene: fallbackScene,
          description: csvCols[3] || csvCols[1] || "Sin descripción",
          optics: csvCols[2] || "N/A",
          physics: csvCols[4] || "N/A",
          timing: "3s"
        };
      }

      if (!finalDesc) {
        // Intentamos extraer lo que hay después del marcador de panel
        const afterMarker = text.split(/:\*\*|\]:/)[1];
        if (afterMarker) {
          finalDesc = afterMarker.split(/\. (?:Movimiento|Efecto|VFX|Color|Luz|Cámara|Lente):/i)[0].trim();
        }
      }

      if (!finalDesc && comp) finalDesc = comp;
      if (!finalDesc && physics) finalDesc = physics;

      return {
        scene: fallbackScene, // Forzamos el orden secuencial para evitar saltos
        description: finalDesc || "Panel técnico",
        optics: camera || "N/A",
        physics: physics || "N/A",
        timing: "3s"
      };
    }

    // FALLBACK: Solo si el texto es descriptivo y no es un título
    if (!text.startsWith("#") && text.trim().length > 20 && !text.toUpperCase().includes("STORYBOARD")) {
      return {
        scene: fallbackScene,
        description: text.trim().split('\n')[0],
        optics: "Extraer del texto",
        physics: "Extraer del texto",
        timing: "3s"
      };
    }

    return null;
  };

  const processWithQwen = async () => {
    console.log("ALERTA: Iniciando la función processWithQwen...");
    
    try {
      const trimmedScript = script.trim();
      if (!trimmedScript) {
        alert("Por favor, pega un guion primero antes de procesar.");
        return;
      }

      setIsProcessing(true);
      setPanels([]);
      
      const chunks = splitScriptIntoPanels(trimmedScript);
      const finalChunks = chunks.length > 0 ? chunks : [trimmedScript];

      setProgress({ current: 0, total: finalChunks.length });
      
      const systemPrompt = `Actúa como extractor JSON literal. REGLAS: 1. NO resumas. 2. Copia y pega Acción, Cámara e Iluminación. Salida: SOLO objeto JSON {}.`.trim();

      const allPanels: QwenPanel[] = [];

      for (let i = 0; i < finalChunks.length; i++) {
        setProgress({ current: i + 1, total: finalChunks.length });
        
        // INTENTO 1: Regex
        const fastResult = regexExtract(finalChunks[i], i + 1);
        if (fastResult) {
          allPanels.push(fastResult);
          setPanels([...allPanels]);
          continue;
        }

        // INTENTO 2: IA
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        try {
          const response = await fetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              model: "qwen3:0.6b",
              prompt: `${systemPrompt}\n\nTEXTO:\n${finalChunks[i]}`,
              stream: false,
              format: "json",
              options: { temperature: 0 }
            })
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            const panel = JSON.parse(data.response);
            if (panel) {
              allPanels.push({
                scene: i + 1, // Siempre forzamos el orden del bucle para evitar saltos (1, 2, 3...)
                description: panel.description || panel.physics || "Sin descripción",
                optics: panel.optics || "N/A",
                physics: panel.physics || "N/A",
                timing: panel.timing || "3s"
              });
              setPanels([...allPanels]);
            }
          }
        } catch (e) {
          clearTimeout(timeoutId);
          console.warn("Fallo en panel IA:", e);
          allPanels.push({
            scene: i + 1,
            description: "⚠️ Error de procesamiento o timeout.",
            optics: "N/A",
            physics: "N/A",
            timing: "3s"
          });
          setPanels([...allPanels]);
        }
        await new Promise(r => setTimeout(r, 400));
      }
    } catch (globalError) {
      console.error("ERROR CRÍTICO EN PROCESO:", globalError);
      alert("Error inesperado en el motor. Por favor revisa la consola.");
    } finally {
      setIsProcessing(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  const handleExportToWorkspace = () => {
    if (panels.length === 0) return;
    const newScenes: Scene[] = panels.map((p: QwenPanel): Scene => ({
        id: crypto.randomUUID(),
        imageText: p.description || "",
        videoText: "",
        mode: "image",
        asset: null,
        theme: "normal",
        sceneNumber: p.scene || 1,
        optics: p.optics || "",
        physics: p.physics || "",
        timing: p.timing || "3s"
    }));
    onAddGeneratedScenes(newScenes);
    alert(`${newScenes.length} paneles han sido añadidos a tu espacio de trabajo principal.`);
  };

  const exportToPDF = async () => {
    if (panels.length === 0) return;
    setIsProcessing(true);
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      let yPos = 20;

      // Header Premium
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, 210, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("QWEN PRODUCTION ENGINE - STORYBOARD", 105, 20, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("TECHNICAL CINEMATOGRAPHY SCRIPT | PROMPT STUDIO", 105, 30, { align: 'center' });
      
      yPos = 50;

      panels.forEach((p: QwenPanel, i: number) => {
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        // Panel Container Border
        doc.setDrawColor(203, 213, 225); // slate-300
        doc.setLineWidth(0.1);
        doc.rect(10, yPos, 190, 50);

        // Header Panel (Black bar)
        doc.setFillColor(30, 41, 59); // slate-800
        doc.rect(10, yPos, 190, 8, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(`SCENE: ${p.scene || 1} | SHOT: ${i + 1}a | PANEL: ${i + 1}`, 15, yPos + 5.5);

        // Body Content
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        
        // Columna Izquierda: Descripción
        doc.text("DESCRIPCIÓN VISUAL:", 15, yPos + 15);
        const description = p.description || "Sin descripción";
        const splitDesc = doc.splitTextToSize(description, 110);
        doc.text(splitDesc, 15, yPos + 20);

        // Columna Derecha: Specs Técnicas
        const xMeta = 135;
        doc.setFont("helvetica", "bold");
        doc.text("SPECS TÉCNICAS:", xMeta, yPos + 15);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        
        doc.text(`• Optics: ${p.optics || "8K RAW / 100mm Macro"}`, xMeta, yPos + 22);
        doc.text(`• Physics: ${p.physics || "Standard Dynamic"}`, xMeta, yPos + 26);
        doc.text(`• Timeline: ${p.timing || "3s"}`, xMeta, yPos + 30);

        yPos += 58;
      });

      // Guardar PDF en carpeta Prompt Studio/guiones usando Tauri
      const pdfOutput = doc.output('arraybuffer');
      const docPath = await documentDir();
      
      const targetFolder = await join(docPath, 'Prompt Studio', 'guiones');
      await mkdir(targetFolder, { recursive: true });

      const defaultFileName = `Qwen_Storyboard_${Date.now()}.pdf`;
      const defaultPath = await join(targetFolder, defaultFileName);

      const fullPath = await saveDialog({
        title: "Guardar Storyboard PDF",
        defaultPath: defaultPath,
        filters: [{ name: "PDF", extensions: ["pdf"] }]
      });

      if (!fullPath) return; // User cancelled
      
      await writeFile(fullPath, new Uint8Array(pdfOutput));
      alert(`PDF exportado con éxito a:\n${fullPath}`);
      
    } catch (error) {
      console.error("Error exporting PDF:", error);
      alert("Error al exportar el PDF. Revisa que Ollama esté activo.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="py-10">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <div className="flex justify-between items-center mb-10 border-b border-white/10 pb-6">
          <h1 className="text-3xl lg:text-4xl font-black text-white tracking-tighter italic flex items-center gap-4 uppercase">
            <BrainCircuit className="text-violet-500" size={36} />
            Storyboard IA
          </h1>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                const text = JSON.stringify(panels, null, 2);
                navigator.clipboard.writeText(text);
                alert("¡JSON copiado con éxito!");
              }}
              disabled={panels.length === 0}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-xl font-bold border border-white/10 transition-all disabled:opacity-50 text-xs"
              title="Copiar resultado como JSON"
            >
              <Copy size={16} /> COPIAR JSON
            </button>
            <button 
              onClick={exportToPDF}
              disabled={panels.length === 0 || isProcessing}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/20"
            >
              <FileDown size={18} /> PDF EXPORT
            </button>
            <button 
              onClick={handleExportToWorkspace}
              disabled={panels.length === 0 || isProcessing}
              className="flex items-center gap-2 bg-white text-black px-6 py-2.5 rounded-xl font-bold hover:bg-slate-200 transition-all disabled:opacity-50"
            >
              <Plus size={18} /> AÑADIR AL WORKSPACE
            </button>
          </div>
        </div>

        {/* INPUT AREA */}
        <div className="mb-12 relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-emerald-600 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
          <textarea 
            className="relative w-full h-48 bg-slate-900/80 border border-white/10 rounded-3xl p-8 text-slate-200 text-lg focus:ring-2 focus:ring-violet-500/50 outline-none backdrop-blur-xl resize-none custom-scrollbar"
            placeholder="Pega tu guion aquí para que Qwen lo organice en un storyboard técnico..."
            value={script}
            onChange={(e) => setScript(e.target.value)}
          />
          <div className="absolute bottom-6 right-6 flex items-center gap-3">
            <button 
              onClick={() => setScript("")}
              disabled={isProcessing || !script.trim()}
              className="bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-400 p-3 rounded-xl transition-all border border-white/5 hover:border-red-500/30"
              title="Borrar guion"
            >
              <Trash2 size={20} />
            </button>
            <button 
              onClick={processWithQwen}
              disabled={isProcessing || !script.trim()}
              className="bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 text-white px-6 py-3 rounded-xl flex items-center gap-3 shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all font-black tracking-widest text-sm"
            >
              {isProcessing ? (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                  <span className="text-[10px] font-black tracking-widest uppercase">Analizando</span>
                </div>
                {progress.total > 0 && (
                  <div className="flex flex-col gap-1 w-full min-w-[120px]">
                    <div className="flex justify-between text-[9px] font-bold text-violet-400 uppercase">
                      <span>Procesando</span>
                      <span>{progress.current} / {progress.total}</span>
                    </div>
                    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-500"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
                <><BrainCircuit size={20}/> PROCESAR GUION</>
              )}
            </button>
          </div>
        </div>

        {/* GENERATED PANELS LIST - REDESIGNED */}
        {panels.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">
            {panels.map((p: QwenPanel, index: number) => (
              <div key={index} className="flex flex-col bg-slate-900/40 rounded-[2.5rem] border border-white/5 overflow-hidden shadow-xl hover:border-violet-500/40 transition-all duration-300 group">
                
                {/* Image Area (Top) */}
                <div className="aspect-video bg-black/60 relative group-hover:bg-black/40 transition-colors">
                  <div className="absolute inset-0 flex items-center justify-center opacity-20 group-hover:opacity-40 transition-opacity">
                    <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '15px 15px' }} />
                    <ImagePlus size={32} className="text-white" />
                  </div>
                  
                  {/* Scene Tag */}
                  <div className="absolute top-4 left-4 flex items-center gap-2">
                    <span className="bg-violet-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg shadow-violet-900/40">
                      SCENE {p.scene || 1}
                    </span>
                    <span className="bg-slate-800/80 backdrop-blur-md text-white/70 text-[10px] font-bold px-3 py-1 rounded-full border border-white/5">
                      SHOT {index + 1}
                    </span>
                  </div>

                  {/* Copy All Icon (Top Right) */}
                  <button 
                    onClick={() => {
                      const text = `ACCIÓN: ${p.description}\nCÁMARA: ${p.optics}\nEFECTO: ${p.physics}`;
                      navigator.clipboard.writeText(text);
                    }}
                    className="absolute top-4 right-4 p-2 bg-slate-800/80 backdrop-blur-md text-slate-400 hover:text-white rounded-xl border border-white/5 hover:border-white/20 transition-all opacity-0 group-hover:opacity-100 shadow-xl"
                    title="Copiar todo el panel"
                  >
                    <Copy size={16} />
                  </button>
                </div>

                {/* Content Area */}
                <div className="p-6 flex flex-col gap-5">
                  {/* Acción */}
                  <div className="space-y-1 group/field relative">
                    <span className="text-[10px] font-black text-violet-400/70 uppercase tracking-[0.2em]">Acción</span>
                    <p className="text-slate-200 text-sm leading-relaxed font-medium">
                      {p.description || "Describiendo escena..."}
                    </p>
                  </div>

                  {/* Bloques Técnicos Verticales */}
                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <div className="space-y-1 group/field relative">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Cámara</span>
                      <p className="text-violet-300 text-[11px] font-mono leading-relaxed bg-white/5 p-2 rounded-lg border border-white/5">
                        {p.optics || "N/A"}
                      </p>
                    </div>

                    <div className="space-y-1 group/field relative">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Efecto</span>
                      <p className="text-emerald-400 text-[11px] font-mono leading-relaxed bg-white/5 p-2 rounded-lg border border-white/5">
                        {p.physics || "N/A"}
                      </p>
                    </div>
                  </div>

                  {/* Footer Stats */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/5 opacity-60">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                      <CheckCircle size={12} className="text-emerald-500" />
                      <span>Listo para exportar</span>
                    </div>
                    <span className="text-[10px] font-mono text-amber-500">{p.timing || "3s"}</span>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Add New Slot if empty space */}
            <div className="flex flex-col items-center justify-center p-8 bg-slate-900/20 border-2 border-dashed border-white/5 rounded-[2.5rem] opacity-40 hover:opacity-100 transition-opacity cursor-pointer group hover:bg-violet-500/5">
              <Plus size={32} className="text-slate-600 group-hover:text-violet-500 transition-colors mb-4" />
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest group-hover:text-violet-400 transition-colors">Añadir Panel Manual</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
