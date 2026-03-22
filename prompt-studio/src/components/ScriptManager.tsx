import { useState, useRef, useMemo, useEffect } from "react";
import { Reorder, motion, AnimatePresence, useDragControls } from "framer-motion";
import { X, Plus, Trash2, GripHorizontal, GripVertical, Upload, FileDown, Folder, Edit3, Copy, Check, Save, FolderOpen } from "lucide-react";
import { Script } from "../types";
import { SceneCard } from "./SceneCard";
import jsPDF from "jspdf";
import { documentDir, join } from "@tauri-apps/api/path";
import { writeFile, mkdir, writeTextFile } from "@tauri-apps/plugin-fs";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import * as pdfjsLib from 'pdfjs-dist';

// Configuración del worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface ScriptManagerProps {
  scripts: Script[];
  saveScripts: (scripts: Script[]) => void;
  onClose: () => void;
}

const ScriptCard = ({ script, idx, updateScript, deleteScript, exportToPDF }: any) => {
  const dragControls = useDragControls();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingContent, setIsEditingContent] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!script.content) return;
    try {
      await navigator.clipboard.writeText(script.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Error al copiar:", err);
    }
  };

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) titleInputRef.current.focus();
  }, [isEditingTitle]);

  useEffect(() => {
    if (isEditingContent && contentTextareaRef.current) contentTextareaRef.current.focus();
  }, [isEditingContent]);

  return (
    <Reorder.Item
      value={script}
      id={script.id}
      dragListener={false}
      dragControls={dragControls}
      className="flex-shrink-0 w-[400px] h-full flex flex-col bg-slate-800/40 rounded-[2.5rem] border border-white/5 p-8 group/card hover:border-emerald-500/20 transition-all shadow-2xl list-none relative overflow-hidden backdrop-blur-sm"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div 
            onPointerDown={(e) => dragControls.start(e)}
            className="p-2 cursor-grab active:cursor-grabbing text-slate-500 hover:text-emerald-400 bg-white/5 rounded-xl transition-all touch-none"
            title="Arrastrar para reordenar"
          >
            <GripVertical size={18} />
          </div>
          <span className="text-[10px] font-black text-slate-500 tracking-[0.3em] uppercase opacity-70">GUIÓN #{idx + 1}</span>
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover/card:opacity-100 transition-all duration-300">
          <button 
            onClick={() => exportToPDF(script)}
            className="p-2.5 hover:bg-emerald-500/20 text-emerald-400 rounded-xl transition-all bg-black/40 border border-white/5"
            title="Exportar a PDF"
          >
            <FileDown size={14} />
          </button>
          <button 
            onClick={handleCopy}
            className={`p-2.5 transition-all rounded-xl border border-white/5 ${copied ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-blue-500/20 text-blue-400 bg-black/40'}`}
            title={copied ? "¡Copiado!" : "Copiar texto"}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button 
            onClick={() => deleteScript(script.id)}
            className="p-2.5 hover:bg-red-500/20 text-red-400 rounded-xl transition-all bg-black/40 border border-white/5"
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="relative group/title mb-6" onDoubleClick={() => setIsEditingTitle(true)}>
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            value={script.title}
            onChange={(e) => updateScript(script.id, { title: e.target.value })}
            onBlur={() => setIsEditingTitle(false)}
            onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
            className="bg-slate-950/50 border border-emerald-500/30 rounded-xl px-3 py-2 text-xl font-black text-white focus:ring-0 w-full placeholder:text-slate-700 tracking-tight"
            placeholder="Título del guión..."
          />
        ) : (
          <div className="flex items-center gap-2 min-h-[40px] px-1">
            <h3 className={`text-xl font-black text-white tracking-tight ${!script.title && 'text-slate-700'}`}>
              {script.title || "Sin título..."}
            </h3>
            <Edit3 size={12} className="text-emerald-500/0 group-hover/title:text-emerald-500/40 transition-all ml-auto" />
          </div>
        )}
      </div>

      <div 
        className={`flex-1 relative group/content rounded-3xl overflow-hidden border border-white/5 transition-all ${isEditingContent ? 'border-emerald-500/30' : 'bg-slate-900/40 hover:bg-slate-900/60'}`}
        onDoubleClick={() => setIsEditingContent(true)}
      >
        {isEditingContent ? (
          <textarea
            ref={contentTextareaRef}
            value={script.content}
            onChange={(e) => updateScript(script.id, { content: e.target.value })}
            onBlur={() => setIsEditingContent(false)}
            className="w-full h-full bg-slate-950/50 p-6 text-slate-200 text-sm resize-none focus:ring-0 outline-none custom-scrollbar font-medium leading-relaxed"
            placeholder="Escribe tu historia aquí..."
          />
        ) : (
          <div className="w-full h-full p-6 text-slate-400 text-sm leading-relaxed overflow-y-auto custom-scrollbar font-medium select-none">
            {script.content ? (
              <div className="whitespace-pre-wrap">{script.content}</div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2 italic">
                <Edit3 size={20} className="opacity-20" />
                Doble click para escribir...
              </div>
            )}
            <div className="absolute top-4 right-4 opacity-0 group-hover/content:opacity-40 transition-all">
               <Edit3 size={14} className="text-emerald-500" />
            </div>
          </div>
        )}
      </div>
    </Reorder.Item>
  );
};

export default function ScriptManager({ scripts, saveScripts, onClose }: ScriptManagerProps) {
  const windowDragControls = useDragControls();
  const carouselOuterRef = useRef<HTMLDivElement>(null);
  const carouselInnerRef = useRef<HTMLDivElement>(null);
  const [carouselWidth, setCarouselWidth] = useState(0);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  useEffect(() => {
    if (carouselInnerRef.current && carouselOuterRef.current) {
        setCarouselWidth(carouselInnerRef.current.scrollWidth - carouselOuterRef.current.offsetWidth + 200);
    }
  }, [scripts]);

  const addScript = (empty = true) => {
    const newScript: Script = {
      id: crypto.randomUUID(),
      title: empty ? "" : "Nuevo Guión",
      content: "",
    };
    saveScripts([...scripts, newScript]);
  };

  const deleteScript = (id: string) => {
    if (confirm("¿Eliminar este guión?")) {
      saveScripts(scripts.filter(s => s.id !== id));
    }
  };

  const updateScript = (id: string, data: Partial<Script>) => {
    saveScripts(scripts.map(s => s.id === id ? { ...s, ...data } : s));
  };

  const openFolder = async () => {
    try {
      const docPath = await documentDir();
      const targetFolder = await join(docPath, 'Prompt Studio', 'guiones');
      await mkdir(targetFolder, { recursive: true });
      
      try {
        await revealItemInDir(targetFolder);
      } catch (e) {
        await openPath(targetFolder);
      }
    } catch (err) {
      console.error("Error opening folder:", err);
      alert("No se pudo abrir la carpeta. Asegúrate de tener permisos.");
    }
  };

  const exportToPDF = async (script: Script) => {
    if (!script.content.trim()) {
      alert("El guión está vacío.");
      return;
    }

    try {
      const doc = new jsPDF();
      doc.setFontSize(22);
      doc.text(script.title || "Sin título", 20, 20);
      doc.setFontSize(12);
      
      const splitContent = doc.splitTextToSize(script.content, 170);
      doc.text(splitContent, 20, 40);

      const pdfOutput = doc.output('arraybuffer');
      const docPath = await documentDir();
      
      const targetFolder = await join(docPath, 'Prompt Studio', 'guiones');
      await mkdir(targetFolder, { recursive: true });

      const defaultFileName = `${script.title.replace(/\s+/g, '_') || 'Sin_titulo'}_${Date.now()}.pdf`;
      const defaultPath = await join(targetFolder, defaultFileName);

      const fullPath = await saveDialog({
        title: "Guardar Guión PDF",
        defaultPath: defaultPath,
        filters: [{ name: "PDF", extensions: ["pdf"] }]
      });

      if (!fullPath) return; 
      
      await writeFile(fullPath, new Uint8Array(pdfOutput));
      alert(`Script exportado con éxito a:\n${fullPath}`);
    } catch (err) {
      console.error("Error exporting PDF:", err);
      alert("Error al exportar el PDF.");
    }
  };

  const exportScriptsJSON = async () => {
    try {
      const suggestedName = `scripts_${new Date().toISOString().split('T')[0]}.json`;
      const fullPath = await saveDialog({
        title: "Exportar Guiones (JSON)",
        defaultPath: suggestedName,
        filters: [{
          name: 'JSON File',
          extensions: ['json']
        }]
      });

      if (!fullPath) return; 

      await writeTextFile(fullPath, JSON.stringify(scripts, null, 2));
      alert(`Guiones exportados con éxito a:\n${fullPath}`);
    } catch (err) {
      console.error("Error exporting scripts:", err);
      alert("Error al exportar los guiones.");
    }
  };

  const importScriptsJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const imported = JSON.parse(reader.result as string);
        if (Array.isArray(imported)) {
          const newScripts = imported.map((s: Script) => ({
            ...s,
            id: crypto.randomUUID()
          }));
          saveScripts([...scripts, ...newScripts]);
          alert(`Importados ${newScripts.length} guiones.`);
        }
      } catch (err) {
        console.error("Error importing scripts:", err);
        alert("Error al cargar el archivo JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.pdf')) {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const typedarray = new Uint8Array(reader.result as ArrayBuffer);
          const pdf = await pdfjsLib.getDocument(typedarray).promise;
          let fullText = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const strings = content.items.map((item: any) => item.str);
            fullText += strings.join(" ") + "\n\n";
          }
          const newScript: Script = {
            id: crypto.randomUUID(),
            title: file.name.replace('.pdf', ''),
            content: fullText.trim(),
          };
          saveScripts([...scripts, newScript]);
        } catch (err) {
          console.error("Error parsing PDF:", err);
          alert("Error al leer el archivo PDF.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const newScript: Script = {
          id: crypto.randomUUID(),
          title: file.name.replace('.md', '').replace('.txt', ''),
          content,
        };
        saveScripts([...scripts, newScript]);
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  return (
    <motion.div
      drag
      dragControls={windowDragControls}
      dragListener={false}
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      className="fixed top-32 left-10 z-[100] w-[90vw] max-w-[1240px] h-[700px] bg-slate-900/80 backdrop-blur-3xl border border-white/10 rounded-[3rem] shadow-[0_0_80px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden"
    >
      <div 
        onPointerDown={(e) => windowDragControls.start(e)}
        className="flex items-center justify-between p-8 border-b border-white/5 cursor-grab active:cursor-grabbing group"
      >
        <div className="flex items-center gap-5">
          <div className="p-3 bg-emerald-500/20 rounded-2xl text-emerald-400 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
            <GripHorizontal size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-white mb-0.5">GESTOR DE GUIONES</h2>
            <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black">{scripts.length} / 20 GUIONES</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={openFolder}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400 text-xs font-black hover:bg-amber-500/20 transition-all tracking-tight"
          >
            <Folder size={16} /> VER CARPETA
          </button>

          <label className="flex items-center gap-2 px-5 py-2.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-blue-400 text-xs font-black hover:bg-blue-500/20 transition-all cursor-pointer tracking-tight">
            <Upload size={16} /> IMPORTAR .MD / .PDF
            <input 
              type="file" 
              accept=".md,.txt,.pdf" 
              className="hidden" 
              onChange={handleFileImport}
            />
          </label>

          <button 
            onClick={() => addScript(false)}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs font-black hover:bg-emerald-500/20 transition-all tracking-tight"
          >
            <Plus size={16} /> NUEVO GUION
          </button>

          <div className="flex items-center gap-1.5 border-l border-white/5 pl-3">
             <button 
               onClick={exportScriptsJSON}
               className="p-2.5 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-2xl hover:bg-violet-500/20 transition-all"
               title="Exportar Guiones (JSON)"
             >
               <Save size={18} />
             </button>

             <label className="p-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-2xl hover:bg-blue-500/20 transition-all cursor-pointer">
                <FolderOpen size={18} />
                <input 
                  type="file" 
                  accept=".json" 
                  className="hidden" 
                  onChange={importScriptsJSON} 
                />
             </label>
          </div>
          
          <div className="w-px h-8 bg-white/5 mx-1" />
          
          <button 
            onClick={onClose}
            className="p-2.5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded-2xl transition-all"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      <div 
        ref={carouselOuterRef}
        className="flex-1 overflow-hidden p-10 cursor-grab active:cursor-grabbing"
      >
        {scripts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40">
            <Plus size={48} className="text-slate-500 mb-6" />
            <p className="text-sm font-black tracking-[0.3em] text-slate-400 uppercase">Sin guiones cargados</p>
            <button 
              onClick={() => addScript()}
              className="mt-6 px-8 py-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs font-black tracking-[0.2em] hover:bg-emerald-500/20 transition-all shadow-lg"
            >
              CREAR PRIMER GUIÓN
            </button>
          </div>
        ) : (
          <motion.div
            ref={carouselInnerRef}
            drag="x"
            dragConstraints={{ right: 0, left: -carouselWidth }}
            dragElastic={0.05}
            className="w-max h-full"
          >
            <Reorder.Group 
                axis="x" 
                values={scripts} 
                onReorder={saveScripts} 
                className="flex gap-8 h-full px-10"
            >
                {scripts.map((script, idx) => (
                    <ScriptCard 
                        key={script.id} 
                        script={script} 
                        idx={idx} 
                        updateScript={updateScript} 
                        deleteScript={deleteScript} 
                        exportToPDF={exportToPDF} 
                    />
                ))}
            
                <button 
                    onClick={() => addScript()}
                    className="flex-shrink-0 w-24 flex flex-col items-center justify-center bg-slate-800/20 border-2 border-dashed border-white/5 rounded-[3rem] hover:bg-emerald-500/5 hover:border-emerald-500/20 text-slate-700 hover:text-emerald-500 transition-all group shadow-inner"
                >
                    <Plus size={40} className="group-hover:scale-125 transition-transform duration-500" />
                </button>
            </Reorder.Group>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
