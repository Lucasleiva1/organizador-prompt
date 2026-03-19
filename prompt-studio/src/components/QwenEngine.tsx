import React, { useState } from 'react';
import { BrainCircuit, ImagePlus, CheckCircle, FileDown, Plus } from 'lucide-react';
import jsPDF from 'jspdf';
import { documentDir, join } from '@tauri-apps/api/path';
import { writeFile, mkdir } from '@tauri-apps/plugin-fs';
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

  const processWithQwen = async () => {
    if (!script.trim()) return;
    setIsProcessing(true);
    setPanels([]);
    
    const systemPrompt = `
Actúa como Director de Fotografía experto. Analiza el siguiente guion y sepáralo en paneles de storyboard.
REGLAS ESTRICTAS PARA EL JSON:
1. Devuelve SOLO un array JSON válido, sin markdown, sin texto adicional.
2. Cada objeto debe tener los siguientes campos:
- "scene": Número de la escena (entero).
- "description": Resumen de la acción (fotorrealista).
- "optics": Especifica si es "Macro 100mm" o "Gran Angular 14mm-24mm".
- "physics": Describe la física de partículas (ej: "Ceniza volumétrica", "Niebla densa").
- "timing": Fase de duración (ej: "0-2s", "2-4s", "4s+").

Ejemplo de salida esperada:
[
  {
    "scene": 1,
    "description": "Plano general de la ciudad cyber-punk envuelta en neblina neón.",
    "optics": "Gran Angular 14mm-24mm",
    "physics": "Niebla densa y lluvia volumétrica",
    "timing": "0-2s"
  }
]
    `.trim();

    try {
      // Usamos 127.0.0.1 para mayor compatibilidad en Windows con Ollama
      const response = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "qwen3:0.6b",
          prompt: `${systemPrompt}\n\nGuion:\n${script}`,
          stream: false,
          format: "json",
          options: {
            temperature: 0.2
          }
        })
      });
      
      if (!response.ok) {
        throw new Error("Ollama endpoint not responding properly");
      }

      const data = await response.json();
      let parsedPanels = [];
      try {
        parsedPanels = JSON.parse(data.response);
        if (!Array.isArray(parsedPanels)) {
            parsedPanels = [parsedPanels];
        }
      } catch (e) {
        console.error("Error parsing Qwen JSON:", e);
        // Fallback simple extract
        const match = data.response.match(/\[.*\]/s);
        if (match) {
            parsedPanels = JSON.parse(match[0]);
        }
      }
      setPanels(parsedPanels);
    } catch (error) {
      console.error("Error conectando con Qwen local:", error);
      alert("Error conectando con Ollama (http://localhost:11434). Asegúrate de que esté corriendo y tengas el modelo.");
    } finally {
      setIsProcessing(false);
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

      const fileName = `Qwen_Storyboard_${Date.now()}.pdf`;
      const fullPath = await join(targetFolder, fileName);
      
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
          <h1 className="text-3xl lg:text-4xl font-black text-white tracking-tighter italic flex items-center gap-4">
            <BrainCircuit className="text-violet-500" size={36} />
            QWEN PRODUCTION ENGINE
          </h1>
          <div className="flex items-center gap-3">
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
          <button 
            onClick={processWithQwen}
            disabled={isProcessing || !script.trim()}
            className="absolute bottom-6 right-6 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 text-white px-6 py-3 rounded-xl flex items-center gap-3 shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all font-black tracking-widest text-sm"
          >
            {isProcessing ? (
              <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> ANALIZANDO...</>
            ) : (
              <><BrainCircuit size={20}/> PROCESAR GUION</>
            )}
          </button>
        </div>

        {/* GENERATED PANELS LIST */}
        {panels.length > 0 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {panels.map((p: QwenPanel, index: number) => (
              <div key={index} className="flex flex-col lg:flex-row bg-slate-900/60 rounded-[2rem] border border-white/5 overflow-hidden shadow-2xl group hover:border-violet-500/30 transition-all duration-500">
                {/* Visual Area (Left) */}
                <div className="w-full lg:w-1/2 aspect-video bg-black flex flex-col items-center justify-center border-b lg:border-b-0 lg:border-r border-white/5 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-transparent pointer-events-none" />
                  
                  {/* Grid Lines for reference */}
                  <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

                  <ImagePlus size={48} className="text-slate-700 group-hover:text-violet-400 group-hover:scale-110 transition-all duration-500 relative z-10" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-4 relative z-10">Blueprint Placeholder</span>
                </div>

                {/* Metadata Area (Right) */}
                <div className="w-full lg:w-1/2 flex flex-col bg-slate-950/40">
                  {/* Header */}
                  <div className="grid grid-cols-3 bg-white/5 border-b border-white/5 text-[11px] font-black text-slate-400">
                    <div className="p-4 border-r border-white/5 flex items-center justify-center text-slate-300">SCENE {p.scene || 1}</div>
                    <div className="p-4 border-r border-white/5 flex items-center justify-center">SHOT {index + 1}a</div>
                    <div className="p-4 flex justify-between items-center text-emerald-400">
                      <span>PANEL {index + 1}</span>
                      <CheckCircle size={14} className="opacity-50" />
                    </div>
                  </div>
                  
                  {/* Description */}
                  <div className="p-8 flex-grow flex items-center">
                    <p className="text-slate-300 text-lg leading-relaxed italic font-serif opacity-90 group-hover:opacity-100 transition-opacity">
                      "{p.description}"
                    </p>
                  </div>

                  {/* Tech Specs */}
                  <div className="p-6 bg-black/40 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-[11px] border-t border-white/5">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-slate-500 font-bold uppercase tracking-widest text-[9px]">Optics</span>
                      <span className="text-violet-300 font-mono bg-violet-500/10 px-2 py-1 rounded inline-block w-fit border border-violet-500/20">{p.optics || "8K / 100mm Macro"}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-slate-500 font-bold uppercase tracking-widest text-[9px]">Physics</span>
                      <span className="text-slate-300 font-mono truncate" title={p.physics}>{p.physics || "Standard Dynamic"}</span>
                    </div>
                    <div className="flex flex-col gap-1.5 md:col-span-2 lg:col-span-1 md:text-right lg:text-left">
                      <span className="text-slate-500 font-bold uppercase tracking-widest text-[9px]">Timeline</span>
                      <span className="text-amber-400 font-mono text-sm bg-amber-500/10 px-2 py-1 rounded inline-block w-fit md:ml-auto lg:ml-0 border border-amber-500/20">{p.timing || "0-2s Start"}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
