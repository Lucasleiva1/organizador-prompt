import { useEffect } from "react";
import { motion } from "framer-motion";
import { X, Plus, Trash2, GripHorizontal, Upload, FileDown, Folder } from "lucide-react";
import { Script } from "../types";
import jsPDF from "jspdf";
import { documentDir, join } from "@tauri-apps/api/path";
import { writeFile, mkdir } from "@tauri-apps/plugin-fs";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import * as pdfjsLib from 'pdfjs-dist';

// Configuración del worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs`;

interface ScriptManagerProps {
  scripts: Script[];
  saveScripts: (scripts: Script[]) => void;
  onClose: () => void;
}

export default function ScriptManager({ scripts, saveScripts, onClose }: ScriptManagerProps) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  const addScript = (atEnd = true) => {
    if (scripts.length >= 20) {
      alert("Máximo 20 guiones permitidos.");
      return;
    }
    const newScript: Script = {
      id: crypto.randomUUID(),
      title: `Nuevo Guión ${scripts.length + 1}`,
      content: ""
    };
    if (atEnd) {
      saveScripts([...scripts, newScript]);
    } else {
      saveScripts([newScript, ...scripts]);
    }
  };

  const updateScript = (id: string, data: Partial<Script>) => {
    saveScripts(scripts.map(s => s.id === id ? { ...s, ...data } : s));
  };

  const deleteScript = (id: string) => {
    if (confirm("¿Eliminar este guión?")) {
      saveScripts(scripts.filter(s => s.id !== id));
    }
  };

  const openFolder = async () => {
    try {
      const docPath = await documentDir();
      const targetFolder = await join(docPath, 'Prompt Studio', 'guiones');
      await mkdir(targetFolder, { recursive: true });
      
      // Fallback: Intentar reveal primero, luego openPath
      try {
        await revealItemInDir(targetFolder);
      } catch (e) {
        await openPath(targetFolder);
      }
    } catch (error) {
      console.error("Error opening folder:", error);
      alert("No se pudo abrir la carpeta. Comprueba los permisos de Windows.");
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === "application/pdf") {
      try {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          try {
            const typedArray = new Uint8Array(ev.target?.result as ArrayBuffer);
            const pdf = await pdfjsLib.getDocument(typedArray).promise;
            let fullText = "";
            
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              const pageText = textContent.items
                .map((item: any) => item.str)
                .join(" ");
              fullText += pageText + "\n\n";
            }

            const newScript: Script = {
              id: crypto.randomUUID(),
              title: file.name.replace(/\.[^/.]+$/, ""),
              content: fullText.trim()
            };
            saveScripts([...scripts, newScript]);
          } catch (err) {
            console.error("Error parsing PDF:", err);
            alert("No se pudo extraer el texto del PDF.");
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        console.error("FileReader error:", err);
      }
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        const newScript: Script = {
          id: crypto.randomUUID(),
          title: file.name.replace(/\.[^/.]+$/, ""),
          content: content
        };
        saveScripts([...scripts, newScript]);
      };
      reader.readAsText(file);
    }
    // Limpiar el input para permitir re-subir el mismo archivo
    e.target.value = "";
  };

  const exportToPDF = async (script: Script) => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const margin = 20;
      let yPos = 30;

      // Header
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text(script.title.toUpperCase(), 105, yPos, { align: 'center' });
      
      yPos += 20;
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      
      // Content with word wrap
      const splitText = doc.splitTextToSize(script.content, 170);
      
      splitText.forEach((line: string) => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(line, margin, yPos);
        yPos += 7;
      });

      // Export using Tauri
      const pdfOutput = doc.output('arraybuffer');
      const docPath = await documentDir();
      
      // Crear carpeta Prompt Studio/guiones si no existe
      const targetFolder = await join(docPath, 'Prompt Studio', 'guiones');
      await mkdir(targetFolder, { recursive: true });

      const defaultFileName = `${script.title.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
      const defaultPath = await join(targetFolder, defaultFileName);

      const fullPath = await saveDialog({
        title: "Guardar Guión PDF",
        defaultPath: defaultPath,
        filters: [{ name: "PDF", extensions: ["pdf"] }]
      });

      if (!fullPath) return; // User cancelled
      
      await writeFile(fullPath, new Uint8Array(pdfOutput));
      alert(`Script exportado con éxito a:\n${fullPath}`);
    } catch (error) {
      console.error("PDF Export Error:", error);
      alert("Error al exportar el PDF.");
    }
  };

  return (
    <motion.div
      drag
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      className="fixed top-32 left-10 z-[100] w-[90vw] max-w-[1200px] h-[600px] bg-slate-900/80 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden"
    >
      {/* Draggable Header */}
      <div className="flex items-center justify-between p-6 border-b border-white/5 cursor-grab active:cursor-grabbing group">
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

      {/* Script List */}
      <div className="flex-1 overflow-x-auto flex gap-6 p-8 custom-scrollbar scroll-smooth">
        {scripts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center opacity-40">
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
          <>
            {scripts.map((script, idx) => (
              <motion.div
                key={script.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex-shrink-0 w-[400px] h-full flex flex-col bg-slate-800/40 rounded-[2rem] border border-white/5 p-6 group/card hover:border-emerald-500/20 transition-all shadow-xl"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-black text-slate-600 tracking-[0.2em] uppercase">GUIÓN #{idx + 1}</span>
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
              </motion.div>
            ))}
            
            {/* Quick Add at the end */}
            <button 
              onClick={() => addScript()}
              className="flex-shrink-0 w-20 flex flex-col items-center justify-center bg-slate-800/20 border border-dashed border-white/10 rounded-[2rem] hover:bg-emerald-500/5 hover:border-emerald-500/20 text-slate-600 hover:text-emerald-500 transition-all group"
            >
              <Plus size={32} className="group-hover:scale-125 transition-transform" />
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}
