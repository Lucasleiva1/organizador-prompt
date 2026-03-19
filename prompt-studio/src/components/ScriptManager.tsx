import { useEffect } from "react";
import { motion, Reorder, useDragControls } from "framer-motion";
import { X, Plus, Trash2, GripHorizontal, GripVertical, Upload, FileDown, Folder } from "lucide-react";
import { Script } from "../types";
import jsPDF from "jspdf";
import { documentDir, join } from "@tauri-apps/api/path";
import { writeFile, mkdir } from "@tauri-apps/plugin-fs";
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

  return (
    <Reorder.Item
      value={script}
      id={script.id}
      dragListener={false}
      dragControls={dragControls}
      className="flex-shrink-0 w-[400px] h-full flex flex-col bg-slate-800/40 rounded-[2rem] border border-white/5 p-6 group/card hover:border-emerald-500/20 transition-all shadow-xl list-none"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div 
            onPointerDown={(e) => dragControls.start(e)}
            className="p-1 cursor-grab active:cursor-grabbing text-slate-600 hover:text-emerald-400 transition-colors"
            title="Arrastrar para reordenar"
          >
            <GripVertical size={16} />
          </div>
          <span className="text-[10px] font-black text-slate-600 tracking-[0.2em] uppercase">GUIÓN #{idx + 1}</span>
        </div>
        <div className="flex items-center gap-1 opacity-40 group-hover/card:opacity-100 transition-all">
          <button 
            onClick={() => exportToPDF(script)}
            className="p-2 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-all"
            title="Exportar a PDF"
          >
            <FileDown size={14} />
          </button>
          <button 
            onClick={() => deleteScript(script.id)}
            className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-all"
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <input
        type="text"
        value={script.title}
        onChange={(e) => updateScript(script.id, { title: e.target.value })}
        className="bg-transparent border-none text-xl font-black text-white focus:ring-0 w-full mb-4 placeholder:text-slate-700 tracking-tight"
        placeholder="Título del guión..."
      />

      <textarea
        value={script.content}
        onChange={(e) => updateScript(script.id, { content: e.target.value })}
        className="flex-1 bg-slate-900/40 border border-white/5 rounded-2xl p-4 text-slate-300 text-sm resize-none focus:ring-1 focus:ring-emerald-500/30 outline-none custom-scrollbar font-medium"
        placeholder="Escribe tu historia aquí..."
      />
    </Reorder.Item>
  );
};

export default function ScriptManager({ scripts, saveScripts, onClose }: ScriptManagerProps) {
  const windowDragControls = useDragControls();

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

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
      className="fixed top-32 left-10 z-[100] w-[90vw] max-w-[1200px] h-[600px] bg-slate-900/80 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden"
    >
      <div 
        onPointerDown={(e) => windowDragControls.start(e)}
        className="flex items-center justify-between p-6 border-b border-white/5 cursor-grab active:cursor-grabbing group"
      >
        <div className="flex items-center gap-4">
          <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
            <GripHorizontal size={20} />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tighter text-white">GESTOR DE GUIONES</h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{scripts.length} / 20 GUIONES</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={openFolder}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-all font-black"
          >
            <Folder size={14} /> VER CARPETA
          </button>

          <label className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400 text-xs font-bold hover:bg-blue-500/20 transition-all cursor-pointer font-black">
            <Upload size={14} /> IMPORTAR .MD / .PDF
            <input 
              type="file" 
              accept=".md,.txt,.pdf" 
              className="hidden" 
              onChange={handleFileImport}
            />
          </label>

          <button 
            onClick={() => addScript(false)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-all font-black"
          >
            <Plus size={14} /> NUEVO GUION
          </button>
          
          <button 
            onClick={onClose}
            className="p-2 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl transition-all"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-hidden p-8">
        {scripts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40">
            <Plus size={40} className="text-slate-500 mb-4" />
            <p className="text-sm font-bold tracking-widest text-slate-400 uppercase">Sin guiones cargados</p>
            <button 
              onClick={() => addScript()}
              className="mt-4 px-6 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs font-black tracking-widest hover:bg-emerald-500/20 transition-all"
            >
              CREAR PRIMER GUIÓN
            </button>
          </div>
        ) : (
          <Reorder.Group 
            axis="x" 
            values={scripts} 
            onReorder={saveScripts} 
            className="flex gap-6 h-full overflow-x-auto pb-4 custom-scrollbar scroll-smooth"
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
              className="flex-shrink-0 w-20 flex flex-col items-center justify-center bg-slate-800/20 border border-dashed border-white/10 rounded-[2rem] hover:bg-emerald-500/5 hover:border-emerald-500/20 text-slate-600 hover:text-emerald-500 transition-all group"
            >
              <Plus size={32} className="group-hover:scale-125 transition-transform" />
            </button>
          </Reorder.Group>
        )}
      </div>
    </motion.div>
  );
}
