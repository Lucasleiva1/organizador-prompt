import React, { useState } from 'react';
import { 
  BrainCircuit, 
  ImagePlus, 
  FileDown, 
  Plus, 
  Trash2, 
  Copy, 
  FolderOpen, 
  LayoutGrid, 
  LayoutList, 
  View,
  Maximize2,
  X,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import { documentDir, join } from '@tauri-apps/api/path';
import { writeFile, mkdir, readDir, readFile, remove } from '@tauri-apps/plugin-fs';
import { save as saveDialog, open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';

interface QwenPanel {
  scene: number;
  description: string;
  optics: string;
  physics: string;
  timing: string;
  imageUrl?: string;
}

interface QwenEngineProps {
  onAddGeneratedScenes?: (panels: QwenPanel[]) => void;
}

export const QwenEngine: React.FC<QwenEngineProps> = ({ onAddGeneratedScenes }) => {
  const [script, setScript] = useState("");
  const [panels, setPanels] = useState<QwenPanel[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [projectName, setProjectName] = useState("Sin_Nombre");
  const [projectImages, setProjectImages] = useState<Record<number, string>>({});
  const [lastScanCount, setLastScanCount] = useState<number | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});
  const [viewMode, setViewMode] = useState<'grid' | 'vertical' | 'carousel'>('grid');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Auto-escaneo cuando cambia el nombre o hay nuevos paneles
  React.useEffect(() => {
    const timer = setTimeout(scanProjectImages, 1500);
    return () => clearTimeout(timer);
  }, [projectName, panels.length]);

  // Reference for Framer Motion drag constraints
  const carouselOuterRef = React.useRef<HTMLDivElement>(null);
  const carouselInnerRef = React.useRef<HTMLDivElement>(null);
  const [carouselWidth, setCarouselWidth] = useState(0);

  React.useEffect(() => {
    if (carouselOuterRef.current && carouselInnerRef.current && viewMode === 'carousel') {
      const width = carouselInnerRef.current.scrollWidth - carouselOuterRef.current.offsetWidth;
      setCarouselWidth(width > 0 ? width : 0);
    }
  }, [panels, viewMode]);


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
    const camera = getVal("Cámara") || getVal("Lente") || getVal("Movimiento") || getVal("Slide") || getVal("Vibración") || "N/A";
    const physics = getVal("Iluminación") || getVal("Atmósfera") || getVal("Efecto") || getVal("Física") || getVal("VFX") || getVal("Laboratorio") || getVal("Color") || getVal("Luz") || getVal("Audio") || getVal("Sonido") || "N/A";

    if (comp || action || camera !== "N/A" || physics !== "N/A") {
      // Consolidamos TODA la información en el campo finalDesc (Acción) para copia rápida
      let finalDesc = "";
      if (comp && comp !== "N/A") finalDesc += `[${comp.toUpperCase()}] `;
      if (action) finalDesc += `${action}. `;
      if (camera && camera !== "N/A") finalDesc += `CÁMARA: ${camera}. `;
      if (physics && physics !== "N/A") finalDesc += `EFECTO/LUZ: ${physics}.`;
      
      // Lógica específica para CSV (si el texto tiene comas y comillas pero no etiquetas)
      const csvCols = text.includes(",") && text.includes('"') ? parseCSVLine(text) : [];
      if (csvCols.length >= 4) {
        const csvComp = csvCols[2] || "N/A";
        const csvAction = csvCols[3] || csvCols[1] || "Sin descripción";
        const csvPhysics = csvCols[4] || "N/A";
        return {
          scene: fallbackScene,
          description: `[${csvComp}] ${csvAction}. EFECTO: ${csvPhysics}`,
          optics: csvComp,
          physics: csvPhysics,
          timing: "3s"
        };
      }

      return {
        scene: fallbackScene,
        description: finalDesc.trim() || action || "Panel técnico",
        optics: camera,
        physics: physics,
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
      
      const systemPrompt = `Actúa como un storyboarder experto. REGLAS: 
      1. Genera un objeto JSON.
      2. El campo 'description' (Acción) DEBE integrar toda la información técnica: [Encuadre] + Acción + Cámara + Iluminación. 
      3. Mantén 'optics' (Cámara) y 'physics' (Efecto) como campos separados solo para referencia visual.
      Salida: SOLO JSON {}`.trim();

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
              model: "qwen2.5:3b",
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
              // Consolidamos en el push de la IA también por si la IA no lo hizo perfecto
              const consolidatedDesc = panel.description?.includes(panel.optics) 
                ? panel.description 
                : `[${panel.optics || 'N/A'}] ${panel.description}. CÁMARA: ${panel.optics || 'N/A'}. EFECTO: ${panel.physics || 'N/A'}`;

              allPanels.push({
                scene: i + 1,
                description: consolidatedDesc,
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
      setIsModalOpen(false);
    } catch (globalError) {
      console.error("ERROR CRÍTICO EN PROCESO:", globalError);
      alert("Error inesperado en el motor. Por favor revisa la consola.");
    } finally {
      setIsProcessing(false);
      setProgress({ current: 0, total: 0 });
      // Escaneamos imágenes después de procesar
      setTimeout(scanProjectImages, 500);
    }
  };

  const scanProjectImages = async () => {
    try {
      const docPath = await documentDir();
      const baseDir = await join(docPath, 'Prompt Studio', 'images-storyboard');
      const projectDir = await join(baseDir, projectName.trim() || "Sin_Nombre");
      
      // Aseguramos que la carpeta existe
      await mkdir(projectDir, { recursive: true });
      
      const entries = await readDir(projectDir);
      const newImages: Record<number, string> = {};
      
      for (const entry of entries) {
        if (!entry.isFile) continue;
        const name = entry.name.toLowerCase();
        if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')) {
          // Intentamos extraer el número del nombre (ej: "1.png" o "shot_1.png")
          const numMatch = name.match(/(\d+)/);
          if (numMatch) {
            const num = parseInt(numMatch[1]);
            const fullPath = await join(projectDir, entry.name);
            const src = convertFileSrc(fullPath);
            newImages[num] = src;
            console.log(`[STORYBOARD] Imagen detectada: Panel ${num} -> ${src}`);
          }
        }
      }
      setProjectImages(newImages);
      setLastScanCount(Object.keys(newImages).length);
      setImageErrors({}); // Limpiamos errores previos al refrescar
      
      // Feedback opcional por consola
      console.log(`[SCAN] ${Object.keys(newImages).length} imágenes encontradas para el proyecto ${projectName}`);
    } catch (e) {
      console.warn("Error escaneando imágenes:", e);
      setLastScanCount(0);
    }
  };

  const openProjectFolder = async () => {
    try {
      const docPath = await documentDir();
      const baseDir = await join(docPath, 'Prompt Studio', 'images-storyboard');
      const projectDir = await join(baseDir, projectName.trim() || "Sin_Nombre");
      await mkdir(projectDir, { recursive: true });
      await revealItemInDir(projectDir);
    } catch (e) {
      console.warn("Error al abrir la carpeta:", e);
    }
  };

  const uploadImageForPanel = async (sceneNum: number) => {
    try {
      const selected = await openFileDialog({
        multiple: false,
        filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      });

      if (!selected || typeof selected !== 'string') return;

      const docPath = await documentDir();
      const baseDir = await join(docPath, 'Prompt Studio', 'images-storyboard');
      const projectDir = await join(baseDir, projectName.trim() || "Sin_Nombre");
      await mkdir(projectDir, { recursive: true });

      // Leemos el archivo original
      const data = await readFile(selected);
      
      // Mantenemos la extensión original
      const ext = selected.split('.').pop() || 'png';
      const fileName = `${sceneNum}.${ext}`;
      const targetPath = await join(projectDir, fileName);

      // Guardamos el archivo en la carpeta de storyboard
      await writeFile(targetPath, data);

      // Actualizamos el mapa de imágenes localmente
      const src = convertFileSrc(targetPath);
      console.log(`[STORYBOARD] Nueva imagen subida: Panel ${sceneNum} -> ${src}`);
      setProjectImages(prev => ({ ...prev, [sceneNum]: src }));
      setImageErrors(prev => ({ ...prev, [sceneNum]: false })); // Reset error si existía
      
    } catch (e) {
      console.error("Error al subir imagen:", e);
      alert("Error al subir la imagen. Revisa los permisos.");
    }
  };

  const removeImageForPanel = async (sceneNum: number) => {
    try {
      const docPath = await documentDir();
      const baseDir = await join(docPath, 'Prompt Studio', 'images-storyboard');
      const projectDir = await join(baseDir, projectName.trim() || "Sin_Nombre");
      
      const entries = await readDir(projectDir);
      for (const entry of entries) {
        if (entry.isFile && entry.name.split('.')[0] === sceneNum.toString()) {
          const targetPath = await join(projectDir, entry.name);
          await remove(targetPath);
          console.log(`[STORYBOARD] Imagen eliminada: ${entry.name}`);
        }
      }

      setProjectImages(prev => {
        const next = { ...prev };
        delete next[sceneNum];
        return next;
      });
      setImageErrors(prev => ({ ...prev, [sceneNum]: false }));
    } catch (e) {
      console.error("Error al eliminar imagen:", e);
    }
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
        
        doc.text(`• Cámara: ${p.optics || "8K RAW / 100mm Macro"}`, xMeta, yPos + 22);
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

  const handleAddToWorkspace = () => {
    if (onAddGeneratedScenes && panels.length > 0) {
      onAddGeneratedScenes(panels);
    } else if (panels.length === 0) {
      alert("No hay paneles generados para añadir.");
    } else {
      alert("Error: La conexión con el Espacio de Trabajo no está activa.");
    }
  };

  return (
    <div className="py-10">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        
        {/* HEADER SECTION */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 border-b border-white/10 pb-8 gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl lg:text-4xl font-extrabold text-white tracking-tighter italic flex items-center gap-4 uppercase">
              <div className="relative">
                <BrainCircuit className="text-violet-500" size={36} />
              </div>
              Storyboard IA
            </h1>
            <p className="text-slate-500 text-[10px] font-bold tracking-[0.3em] uppercase ml-14">Orquestador de Guiones Visuales</p>
          </div>

          <div className="flex flex-wrap items-center gap-4 bg-[#0a0a0a] p-2.5 rounded-2xl border border-[#222]">
            {/* Proyecto Selector */}
            <div className="flex flex-col px-4 border-r border-[#333]">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Proyecto Activo</span>
              <input 
                type="text" 
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="bg-transparent text-white font-semibold text-sm outline-none border-none focus:ring-0 transition-colors w-32"
                placeholder="PROYECTO_ALPHA"
              />
            </div>

            {/* View Mode Selectors */}
            <div className="flex items-center gap-1 bg-black p-1 rounded border border-[#222]">
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-sm transition-all ${viewMode === 'grid' ? 'bg-[#222] text-violet-400' : 'text-slate-500 hover:text-slate-300'}`}
                title="Vista en Rejilla"
              >
                <LayoutGrid size={16} />
              </button>
              <button 
                onClick={() => setViewMode('vertical')}
                className={`p-2 rounded-sm transition-all ${viewMode === 'vertical' ? 'bg-[#222] text-violet-400' : 'text-slate-500 hover:text-slate-300'}`}
                title="Vista Vertical"
              >
                <LayoutList size={16} />
              </button>
              <button 
                onClick={() => setViewMode('carousel')}
                className={`p-2 rounded-sm transition-all ${viewMode === 'carousel' ? 'bg-[#222] text-violet-400' : 'text-slate-500 hover:text-slate-300'}`}
                title="Vista Carrusel"
              >
                <View size={16} />
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button 
                onClick={scanProjectImages}
                className="flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#222] text-slate-300 px-4 py-2.5 rounded font-bold transition-all border border-[#333] group/refresh"
                title="Escanear archivos locales"
              >
                <ImagePlus size={16} className="group-hover/refresh:rotate-12 transition-transform" />
                <span className="text-[10px] uppercase font-bold tracking-widest hidden sm:block">Escanear</span>
                {lastScanCount !== null && (
                  <span className="bg-emerald-500/20 text-emerald-400 text-[8px] px-1.5 py-0.5 rounded-sm border border-emerald-500/30 ml-1">
                    {lastScanCount}
                  </span>
                )}
              </button>
              <button 
                onClick={openProjectFolder}
                className="p-2.5 bg-[#1a1a1a] hover:bg-[#222] text-slate-400 hover:text-white rounded transition-all border border-[#333]"
                title="Abrir carpeta raíz"
              >
                <FolderOpen size={18} />
              </button>
            </div>

            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-6 py-2.5 rounded font-bold transition-all group/new border border-violet-400/20"
            >
              <Plus size={18} className="group-hover/new:rotate-90 transition-transform duration-300" />
              <span className="text-[10px] uppercase font-bold tracking-widest">Nuevo Guion</span>
            </button>

            <button 
              onClick={exportToPDF}
              disabled={panels.length === 0 || isProcessing}
              className="flex items-center gap-2 bg-[#222] border border-[#333] hover:bg-[#333] hover:text-emerald-400 disabled:bg-[#111] disabled:text-slate-600 text-slate-300 px-6 py-2.5 rounded font-bold transition-all group/export cursor-pointer disabled:cursor-not-allowed"
            >
              <FileDown size={18} className="group-hover/export:-translate-y-0.5 transition-transform duration-300" />
              <span className="text-[10px] uppercase font-bold tracking-widest">Exportar PDF</span>
            </button>
          </div>
        </div>

        {/* EMPTY STATE OR MAIN CONTENT */}
        {panels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 bg-slate-900/20 border-2 border-dashed border-white/5 rounded-[3rem] group hover:border-violet-500/20 transition-all duration-700">
            <div className="relative mb-8">
              <div className="absolute -inset-4 bg-violet-500/10 blur-2xl rounded-full scale-150 animate-pulse" />
              <BrainCircuit className="text-slate-700 relative z-10" size={64} />
            </div>
            <h3 className="text-2xl font-bold text-slate-400 mb-2">Motor de IA Inactivo</h3>
            <p className="text-slate-500 text-sm mb-8 text-center max-w-md">
              Crea un nuevo guion o importa uno existente para que Qwen genere el storyboard técnico automáticamente.
            </p>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-3 bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-2xl font-black text-xs tracking-[0.2em] uppercase border border-white/10 transition-all hover:scale-105 active:scale-95 shadow-2xl"
            >
              <Sparkles size={18} className="text-violet-400" /> Comenzar Ahora
            </button>
          </div>
        ) : (
          <div className="space-y-12">
            
            {/* VIEW MODES RENDERING */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">
                {panels.map((p, index) => (
                  <PanelCard 
                    key={index} 
                    panel={p} 
                    index={index} 
                    image={projectImages[p.scene]}
                    hasError={imageErrors[p.scene]}
                    onUpload={uploadImageForPanel}
                    onRemove={removeImageForPanel}
                    onError={() => setImageErrors(prev => ({ ...prev, [p.scene]: true }))}
                  />
                ))}
                <AddNewSlot onClick={() => setIsModalOpen(true)} />
              </div>
            )}

            {viewMode === 'vertical' && (
              <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20 max-w-5xl mx-auto">
                {panels.map((p, index) => (
                  <PanelCard 
                    key={index} 
                    panel={p} 
                    index={index} 
                    image={projectImages[p.scene]}
                    hasError={imageErrors[p.scene]}
                    onUpload={uploadImageForPanel}
                    onRemove={removeImageForPanel}
                    onError={() => setImageErrors(prev => ({ ...prev, [p.scene]: true }))}
                    isVertical
                  />
                ))}
                <AddNewSlot onClick={() => setIsModalOpen(true)} isVertical />
              </div>
            )}

            {viewMode === 'carousel' && (
              <div 
                ref={carouselOuterRef}
                className="w-full overflow-hidden cursor-grab active:cursor-grabbing pb-8 pt-4 px-2"
              >
                <motion.div 
                  ref={carouselInnerRef}
                  drag="x"
                  dragConstraints={{ right: 0, left: -carouselWidth }}
                  dragElastic={0.05}
                  className="flex flex-row gap-6 w-max px-4"
                >
                  {panels.map((p, index) => (
                    <div key={index} className="min-w-[320px] w-[320px] relative group flex-shrink-0 flex">
                      <PanelCard 
                        panel={p} 
                        index={index} 
                        image={projectImages[p.scene]}
                        hasError={imageErrors[p.scene]}
                        onUpload={uploadImageForPanel}
                        onRemove={removeImageForPanel}
                        onError={() => setImageErrors(prev => ({ ...prev, [p.scene]: true }))}
                      />
                    </div>
                  ))}
                </motion.div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* INPUT MODAL DIALOG */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-10">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isProcessing && setIsModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md" 
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative w-full max-w-4xl bg-[#111] border border-[#222] rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center p-8 border-b border-[#222] bg-[#0a0a0a]">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-[#1a1a1a] border border-[#333] rounded-xl shadow-none">
                    <BrainCircuit size={24} className="text-violet-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white tracking-tight uppercase italic">Nuevo Storyboard</h2>
                    <p className="text-slate-500 text-[10px] font-bold tracking-widest uppercase">Procesador de Inteligencia Artificial</p>
                  </div>
                </div>
                {!isProcessing && (
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className="p-3 bg-[#1a1a1a] border border-[#222] hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded-xl transition-all"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>

              {/* Modal Body */}
              <div className="p-8 flex flex-col gap-6">
                <div className="relative group">
                  <textarea 
                    autoFocus
                    className="relative w-full h-80 bg-black border border-[#222] focus:border-[#444] rounded-xl p-8 text-slate-300 text-lg outline-none backdrop-blur-none resize-none custom-scrollbar transition-colors"
                    placeholder="Escribe o pega tu guion aquí... Qwen se encargará del resto."
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    disabled={isProcessing}
                  />
                  
                  {isProcessing && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center p-12 text-center">
                      <div className="w-16 h-16 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin mb-6" />
                      <h4 className="text-xl font-bold text-white mb-2 tracking-tight">Procesando Guion...</h4>
                      <p className="text-slate-400 text-sm mb-8">Qwen está analizando la cinematografía y secuenciando los paneles.</p>
                      
                      {progress.total > 0 && (
                        <div className="w-full max-w-xs space-y-2">
                          <div className="flex justify-between text-[10px] font-bold text-violet-400 uppercase tracking-widest">
                            <span>Panel {progress.current} de {progress.total}</span>
                            <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <motion.div 
                              className="h-full bg-gradient-to-r from-violet-500 to-emerald-500"
                              initial={{ width: 0 }}
                              animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                              transition={{ duration: 0.5 }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-8 bg-[#0a0a0a] border-t border-[#222] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setScript("")}
                    className="px-6 py-3 bg-[#1a1a1a] border border-[#333] hover:bg-[#222] text-slate-400 rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
                  >
                    Limpiar
                  </button>
                </div>
                
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleAddToWorkspace}
                    disabled={panels.length === 0 || isProcessing}
                    className="px-6 py-4 bg-white text-black hover:bg-slate-200 rounded-xl font-bold text-xs uppercase tracking-widest transition-all disabled:opacity-30 border border-white flex items-center gap-2"
                  >
                    <Plus size={16} /> Añadir al Workspace
                  </button>
                  <button 
                    onClick={async () => {
                      await processWithQwen();
                      if (panels.length > 0) setIsModalOpen(false);
                    }}
                    disabled={!script.trim() || isProcessing}
                    className="px-8 py-4 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-3 shadow-none border border-violet-500/50"
                  >
                    <BrainCircuit size={18} /> Procesar Guion
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

// COMPONENT HELPERS
const PanelCard = ({ panel, index, image, hasError, onUpload, onRemove, onError, isVertical, isCarousel }: any) => {
  return (
    <div className={`flex flex-col bg-[#0a0a0a] rounded-2xl border border-[#222] overflow-hidden shadow-xl hover:border-violet-500/30 transition-all duration-300 group ${isVertical ? 'flex-row min-h-[300px]' : 'h-full w-full'}`}>
      
      {/* Image Area */}
      <div className={`relative bg-black group-hover:bg-slate-950 transition-colors ${isVertical ? 'w-1/3' : 'aspect-video'} ${isCarousel ? 'h-[350px]' : ''}`}>
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          {(image && !hasError) ? (
            <img 
              src={image} 
              alt={`Shot ${index + 1}`} 
              onError={onError}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            />
          ) : (
            <>
              <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.2) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
              <div className="flex flex-col items-center gap-3 opacity-20 group-hover:opacity-40 transition-opacity">
                <ImagePlus size={48} className="text-white" />
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white">Sin Arte</span>
              </div>
            </>
          )}
        </div>
        
        {/* Info Tags */}
        <div className="absolute top-6 left-6 flex flex-col gap-2 z-10">
          <motion.span 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="bg-[#222] text-violet-400 border border-[#333] text-[10px] font-bold px-4 py-1.5 rounded-full shadow-lg uppercase tracking-widest"
          >
            Escena {panel.scene}
          </motion.span>
          <span className="bg-black/80 backdrop-blur-md text-white/50 text-[9px] font-bold px-4 py-1.5 rounded-full border border-white/5 uppercase tracking-widest">
            Shot {index + 1}
          </span>
        </div>

        {/* Floating Actions */}
        <div className="absolute top-6 right-6 flex items-center gap-2 z-10 translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300">
          <button 
            onClick={() => onUpload(panel.scene)}
            className="p-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl shadow-lg transition-all"
            title="Actualizar imagen"
          >
            <ImagePlus size={18} />
          </button>
          {image && (
            <button 
              onClick={() => onRemove(panel.scene)}
              className="p-3 bg-red-600 hover:bg-red-500 text-white rounded-xl shadow-lg transition-all"
              title="Borrar imagen"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>

        {/* Fullscreen Button Placeholder */}
        <div className="absolute bottom-6 left-6 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
           <button className="p-2.5 bg-black/40 hover:bg-black/80 backdrop-blur-md text-white/60 hover:text-white rounded-xl border border-white/10">
              <Maximize2 size={16} />
           </button>
        </div>
      </div>

      {/* Content Area */}
      <div className={`p-8 flex flex-col gap-6 flex-1 ${isVertical ? 'w-2/3 justify-center' : ''}`}>
        <div className="flex flex-col gap-2 flex-grow group/field">
          <div className="flex justify-between items-center flex-shrink-0">
            <span className="text-[10px] font-bold text-violet-400/80 uppercase tracking-[0.2em]">Acción / Prompt</span>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(panel.description);
                alert("Prompt copiado");
              }}
              className="p-1.5 text-slate-600 hover:text-violet-400 transition-colors"
            >
              <Copy size={12} />
            </button>
          </div>
          <div className="pb-2">
            <p className="text-slate-300 text-sm leading-relaxed font-medium italic font-serif">
              "{panel.description}"
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 flex-shrink-0 mt-auto">
          <div className="bg-[#111] px-4 py-3 rounded-xl border border-[#333] flex flex-col">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 flex-shrink-0">Cámara</span>
            <div>
              <span className="text-violet-300 font-mono text-[10px] leading-relaxed">{panel.optics || "N/A"}</span>
            </div>
          </div>
          <div className="bg-[#111] px-4 py-3 rounded-xl border border-[#333] flex flex-col">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 flex-shrink-0">Física</span>
            <div>
              <span className="text-emerald-400 font-mono text-[10px] leading-relaxed">{panel.physics || "Standard"}</span>
            </div>
          </div>
          {isVertical && (
            <div className="bg-[#111] px-4 py-3 rounded-xl border border-[#333] flex flex-col">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 flex-shrink-0">Tiempo</span>
              <div>
                <span className="text-amber-500 font-mono text-[10px] leading-relaxed">{panel.timing || "3s"}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AddNewSlot = ({ onClick, isVertical }: any) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center p-12 bg-[#050505] border-2 border-dashed border-[#222] rounded-3xl opacity-50 hover:opacity-100 hover:bg-[#111] hover:border-violet-400/20 transition-all group ${isVertical ? 'w-full min-h-[300px]' : ''}`}
  >
    <div className="p-6 bg-[#1a1a1a] border border-[#333] rounded-2xl mb-6 group-hover:scale-110 group-hover:border-violet-500/50 transition-all duration-500 shadow-none">
      <Plus size={40} className="text-slate-600 group-hover:text-violet-400 transition-colors" />
    </div>
    <span className="text-xs font-bold text-slate-500 uppercase tracking-[0.3em] group-hover:text-violet-400 transition-colors">Generar Nuevo Panel</span>
  </button>
);
