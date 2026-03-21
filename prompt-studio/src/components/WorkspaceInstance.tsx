import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { FolderPlus, Upload, FileText, Image as ImageIcon, Clapperboard, Hash, Plus, Sparkles, Trash2, ChevronDown, ChevronRight, LayoutGrid, LayoutList, View, FileDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Scene, Workspace } from "../types";
import { parseMarkdownTable, parseSimpleText } from "../utils/parser";
import { WorkspaceSection } from "./WorkspaceSection";
import { SceneCard } from "./SceneCard";
import { AssetManager } from "../utils/AssetManager";
import jsPDF from 'jspdf';
import { documentDir, join } from '@tauri-apps/api/path';
import { writeFile, mkdir } from '@tauri-apps/plugin-fs';
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
interface WorkspaceInstanceProps {
  index: number;
  workspace: Workspace;
  scenes: Scene[];
  search: string;
  saveScenes: (newScenes: Scene[]) => void;
  updateScene: (id: string, data: Partial<Scene>) => void;
  deleteScene: (id: string) => void;
  duplicateScene: (id: string) => void;
  handleTranslate: (id: string, mode: "image" | "video") => void;
  updateWorkspaceName: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => void;
}

export const WorkspaceInstance = ({
  index,
  workspace,
  scenes,
  search,
  saveScenes,
  updateScene,
  deleteScene,
  duplicateScene,
  handleTranslate,
  updateWorkspaceName,
  deleteWorkspace
}: WorkspaceInstanceProps) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [imageMarkdown, setImageMarkdown] = useState("");
  const [videoMarkdown, setVideoMarkdown] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'vertical' | 'carousel'>('grid');
  
  // Reference for Framer Motion drag constraints
  const carouselOuterRef = useRef<HTMLDivElement>(null);
  const carouselInnerRef = useRef<HTMLDivElement>(null);
  const [carouselWidth, setCarouselWidth] = useState(0);

  useEffect(() => {
    if (carouselOuterRef.current && carouselInnerRef.current && viewMode === 'carousel') {
      // Calculate how far left we can drag by subtracting outer container width from the inner content width
      const width = carouselInnerRef.current.scrollWidth - carouselOuterRef.current.offsetWidth;
      setCarouselWidth(width > 0 ? width : 0);
    }
  }, [scenes, search, viewMode]);



  // Filter global scenes to just this workspace
  const localScenes = useMemo(() => scenes.filter(s => (s.groupId || 'default') === workspace.id), [scenes, workspace.id]);
  
  const filteredLocalScenes = useMemo(() => {
    if (!search.trim()) return localScenes;
    const q = search.toLowerCase();
    return localScenes.filter(s => 
      s.imageText.toLowerCase().includes(q) || 
      s.videoText.toLowerCase().includes(q) ||
      (s.translatedImageText || '').toLowerCase().includes(q) ||
      (s.translatedVideoText || '').toLowerCase().includes(q)
    );
  }, [localScenes, search]);


  const addPromptsToScenes = (rawText: string, mode: 'image' | 'video') => {
    if (!rawText.trim()) return;
    
    const hasTable = rawText.includes('|') && (rawText.match(/\|/g) || []).length > 5;
    
    let parsedRawScenes: Scene[];
    if (hasTable) {
      parsedRawScenes = parseMarkdownTable(rawText, mode);
    } else {
      parsedRawScenes = parseSimpleText(rawText, mode);
    }
    
    const newPrompts = parsedRawScenes.map(s => mode === 'image' ? (s.imageText || s.videoText || s.id) : (s.videoText || s.imageText || s.id));
    
    const updatedScenes = [...scenes]; // We update the GLOBAL scenes array!
    
    newPrompts.forEach((prompt, index) => {
      // Because we edit the global array by matching existing scenes locally, we find the global indices.
      // But adding prompts iteratively usually meant "update scenes at index X".
      // Since scenes are global, appending to 'updatedScenes[index]' from local index is wrong!
      // We must map it the local scene at that index.
      const localScene = localScenes[index];
      if (localScene) {
        const globalIdx = updatedScenes.findIndex(s => s.id === localScene.id);
        if (globalIdx !== -1) {
            if (mode === 'image') updatedScenes[globalIdx].imageText = prompt;
            if (mode === 'video') updatedScenes[globalIdx].videoText = prompt;
        }
      } else {
        updatedScenes.push({
          id: crypto.randomUUID(),
          imageText: mode === 'image' ? prompt : '',
          videoText: mode === 'video' ? prompt : '',
          mode: mode,
          asset: null,
          groupId: workspace.id,
          theme: workspace.theme
        });
      }
    });

    saveScenes(updatedScenes);
    if (mode === 'image') setImageMarkdown('');
    if (mode === 'video') setVideoMarkdown('');
  };

  const importMarkdown = (rawText: string) => {
    if (!rawText.trim()) return;

    const hasTable = rawText.includes('|') && (rawText.match(/\|/g) || []).length > 5;
    let parsedRawScenes: Scene[];
    
    if (hasTable) {
      parsedRawScenes = parseMarkdownTable(rawText);
    } else {
      const hasImageSection = /im[aá]gen|est[aá]tic|📸/i.test(rawText);
      const hasVideoSection = /video|movimiento|🎥/i.test(rawText);
      if (hasImageSection && hasVideoSection) {
        const videoSplit = rawText.split(/(?=##\s*🎥|(?:^|\n).*video.*prompts?)/i);
        const imagePart = videoSplit[0] || '';
        const videoPart = videoSplit.slice(1).join('\n') || '';
        parsedRawScenes = [ ...parseSimpleText(imagePart, 'image'), ...parseSimpleText(videoPart, 'video') ];
      } else {
        parsedRawScenes = parseSimpleText(rawText, 'image');
      }
    }

    const imagePrompts = parsedRawScenes.filter(s => s.mode === 'image').map(s => s.imageText);
    const videoPrompts = parsedRawScenes.filter(s => s.mode === 'video').map(s => s.videoText);

    let newScenes: Scene[] = [];
    const maxLength = Math.max(imagePrompts.length, videoPrompts.length);

    if (maxLength === 0) {
      newScenes = [{
        id: crypto.randomUUID(),
        imageText: rawText.trim(),
        videoText: '',
        mode: 'image',
        asset: null,
        groupId: workspace.id,
        theme: workspace.theme
      }];
    } else {
      for (let i = 0; i < maxLength; i++) {
        newScenes.push({
          id: crypto.randomUUID(),
          imageText: imagePrompts[i] || '',
          videoText: videoPrompts[i] || '',
          mode: imagePrompts[i] ? 'image' : 'video',
          asset: null,
          groupId: workspace.id,
          theme: workspace.theme
        });
      }
    }

    saveScenes([...scenes, ...newScenes]);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) importMarkdown(text);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleImageRef = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/"));
    if (files.length === 0) return;

    const newScenes = [...scenes];
    for (const file of files) {
      try {
        const fileName = await AssetManager.saveAsset(file, 'scene');
        newScenes.push({
          id: crypto.randomUUID(),
          imageText: "",
          videoText: "",
          mode: "image",
          asset: fileName,
          groupId: workspace.id,
          theme: workspace.theme
        });
      } catch (err) {
        console.error("Error saving asset:", err);
        alert("Error al guardar la imagen. Verifica los permisos del sistema.");
      }
    }
    
    saveScenes(newScenes);
    e.target.value = "";
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    
    // 1. Check if it's a character from our bar
    const charAsset = e.dataTransfer.getData("characterAsset");
    if (charAsset) {
      saveScenes([...scenes, {
        id: crypto.randomUUID(),
        imageText: "",
        videoText: "",
        mode: "image",
        asset: charAsset,
        groupId: workspace.id,
        theme: workspace.theme
      }]);
      return;
    }

    // 2. Otherwise check for files
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length === 0) return;

    const newScenes = [...scenes];
    for (const file of files) {
      try {
        const fileName = await AssetManager.saveAsset(file, 'scene');
        newScenes.push({
          id: crypto.randomUUID(),
          imageText: "",
          videoText: "",
          mode: "image",
          asset: fileName,
          groupId: workspace.id,
          theme: workspace.theme
        });
      } catch (err) {
        console.error("Error saving asset:", err);
        alert("Error al soltar la imagen. Inténtalo de nuevo.");
      }
    }
    
    saveScenes(newScenes);
  }, [scenes, saveScenes, workspace.id, workspace.theme]);

  const exportToPDF = async () => {
    if (localScenes.length === 0) {
      alert("No hay escenas para exportar.");
      return;
    }
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const title = workspace.name || "Sección Sin Nombre";
      let yPos = 20;

      // Header
      doc.setFillColor(15, 23, 42); 
      doc.rect(0, 0, 210, 35, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text(title.toUpperCase(), 105, 18, { align: 'center' });
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("PROMPT STUDIO - PRODUCCIÓN FINAL", 105, 26, { align: 'center' });
      
      yPos = 45;

      for (let i = 0; i < localScenes.length; i++) {
        const scene = localScenes[i];
        
        const maxTextWidth = scene.asset ? 95 : 180;
        doc.setFontSize(8);
        const splitImage = doc.splitTextToSize(scene.imageText || "(Vacío)", maxTextWidth);
        const splitVideo = doc.splitTextToSize(scene.videoText || "(Vacío)", maxTextWidth);
        const textBlockHeight = 5 + (splitImage.length * 3.5) + 8 + (splitVideo.length * 3.5);
        
        const imageBlockHeight = scene.asset ? 45 : 0; 
        const requiredSpace = 15 + Math.max(textBlockHeight, imageBlockHeight) + 5;

        // Bottom margin check
        if (yPos + requiredSpace > 285) {
          doc.addPage();
          yPos = 20;
        }

        // Outer box
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.1);
        doc.rect(10, yPos, 190, requiredSpace);

        // Header Scene
        doc.setFillColor(10, 10, 10);
        doc.rect(10, yPos, 190, 8, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(`ESCENA #${i + 1} | ESTADO: ${scene.asset ? 'APROBADA' : 'BORRADOR'}`, 15, yPos + 5.5);

        const contentY = yPos + 12;

        if (scene.asset) {
          try {
             const imgUrl = await AssetManager.resolveAssetUrl(scene.asset);
             const response = await fetch(imgUrl);
             const blob = await response.blob();
             const reader = new FileReader();
             const base64Promise = new Promise<string>((resolve) => {
               reader.onloadend = () => resolve(reader.result as string);
               reader.readAsDataURL(blob);
             });
             const base64data = await base64Promise;
             const format = scene.asset.toLowerCase().endsWith('.png') ? 'PNG' : 
                            scene.asset.toLowerCase().endsWith('.webp') ? 'WEBP' : 'JPEG';
             doc.addImage(base64data, format, 15, contentY, 80, 45);
          } catch(e) {
             console.warn("No se pudo cargar img", e);
             doc.setTextColor(255, 0, 0);
             doc.text("[Error cargando imagen]", 15, contentY + 5);
          }
        }

        doc.setTextColor(30, 41, 59);
        const textX = scene.asset ? 100 : 15;

        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("IMAGEN PROMPT:", textX, contentY + 2);
        
        doc.setFont("helvetica", "normal");
        doc.text(splitImage, textX, contentY + 6);
        
        const videoY = contentY + 6 + (splitImage.length * 3.5) + 3;
        doc.setFont("helvetica", "bold");
        doc.text("VIDEO PROMPT:", textX, videoY);
        
        doc.setFont("helvetica", "normal");
        doc.text(splitVideo, textX, videoY + 4);

        yPos += requiredSpace + 5; 
      }

      const pdfOutput = doc.output('arraybuffer');
      const sysDocPath = await documentDir();
      const targetFolder = await join(sysDocPath, 'Prompt Studio', 'exportaciones');
      await mkdir(targetFolder, { recursive: true });

      const defaultPath = await join(targetFolder, `${title.replace(/[^a-z0-9]/gi, '_')}.pdf`);
      const fullPath = await saveDialog({
        title: "Exportar Sección a PDF",
        defaultPath: defaultPath,
        filters: [{ name: "PDF", extensions: ["pdf"] }]
      });

      if (!fullPath) return; 
      
      await writeFile(fullPath, new Uint8Array(pdfOutput));
      alert(`PDF exportado con éxito a:\n${fullPath}`);
      
    } catch (error) {
      console.error("Error exporting PDF:", error);
      alert("Error al intentar exportar el PDF.");
    }
  };

  // Golden theme styling applied at boundary
  const containerClasses = workspace.theme === 'golden' 
    ? 'bg-amber-500/5 !border-amber-500/20 p-6 rounded-[2rem] border-[3px] border-dashed shadow-[0_0_50px_rgba(245,158,11,0.05)]' 
    : 'border-b-[4px] border-dashed border-white/5 pb-12';

  // When collapsed, show just a thin clickable row
  if (isCollapsed) {
    return (
      <motion.div
        initial={{ opacity: 0, scaleY: 0.8 }}
        animate={{ opacity: 1, scaleY: 1 }}
        className="col-span-full mb-4 flex items-center justify-between bg-slate-900/40 backdrop-blur-xl border border-white/5 px-5 py-3 rounded-2xl shadow-lg cursor-pointer hover:border-emerald-500/30 transition-all group"
        onClick={() => setIsCollapsed(false)}
      >
        <div className="flex items-center gap-3">
          <div className="px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <span className="text-emerald-400 font-black tracking-tighter text-xs">SECCIÓN #{index + 1}</span>
          </div>
          {workspace.name && (
            <span className="text-slate-300 font-black text-sm uppercase tracking-wider">{workspace.name}</span>
          )}
          <span className="text-[10px] text-slate-500 font-medium">{localScenes.length} escena{localScenes.length !== 1 ? 's' : ''}</span>
        </div>
        <ChevronRight size={16} className="text-slate-500 group-hover:text-emerald-400 transition-colors" />
      </motion.div>
    );
  }

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-4 gap-6 mb-16 ${containerClasses}`} onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
      
      {/* Section Header */}
      <div className="col-span-1 lg:col-span-4 flex items-center justify-between mb-2 bg-[#0a0a0a] border border-[#222] p-4 rounded-2xl shadow-xl">
        <div className="flex items-center gap-4">
          <div className="px-5 py-2.5 bg-[#111] border border-[#333] rounded-xl flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            <span className="text-emerald-500 font-semibold tracking-tighter text-sm">SECCIÓN #{index + 1}</span>
          </div>
          <div className="h-8 w-px bg-[#222]" />
          <input 
            value={workspace.name || ""} 
            onChange={(e) => updateWorkspaceName(workspace.id, e.target.value)}
            placeholder="Nombre de la sección (opcional)..."
            className="bg-transparent border-none outline-none text-slate-300 font-semibold text-sm placeholder:text-slate-600 focus:ring-0 w-64 uppercase tracking-wider"
          />
        </div>
        
        <div className="flex items-center gap-1.5">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-black p-1 rounded-xl border border-[#222] mr-2">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-2.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-[#222] text-violet-400' : 'text-slate-500 hover:text-slate-300'}`}
              title="Vista Rejilla"
            >
              <LayoutGrid size={18} />
            </button>
            <button 
              onClick={() => setViewMode('vertical')}
              className={`p-2.5 rounded-lg transition-all ${viewMode === 'vertical' ? 'bg-[#222] text-violet-400' : 'text-slate-500 hover:text-slate-300'}`}
              title="Vista Vertical"
            >
              <LayoutList size={18} />
            </button>
            <button 
              onClick={() => {
                setViewMode('carousel');
              }}
              className={`p-2.5 rounded-lg transition-all ${viewMode === 'carousel' ? 'bg-[#222] text-violet-400' : 'text-slate-500 hover:text-slate-300'}`}
              title="Vista Enfoque (Carrusel)"
            >
              <View size={18} />
            </button>
          </div>
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-2.5 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all flex items-center justify-center"
            title="Colapsar sección"
          >
            <ChevronDown size={18} />
          </button>
          <button 
            onClick={() => setShowDeleteConfirm(true)}
            className="p-2.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all flex items-center justify-center"
            title="Eliminar Sección"
          >
            <Trash2 size={18} />
          </button>
          <div className="w-px h-5 bg-[#333] mx-1" />
          <button 
            onClick={exportToPDF}
            className="p-2.5 text-[#D4AF37]/60 hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-xl transition-all flex items-center justify-center border border-transparent hover:border-[#D4AF37]/20"
            title="Exportar Escenas a PDF"
          >
            <FileDown size={18} />
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-[#111] border border-[#222] p-10 rounded-3xl shadow-2xl max-w-md w-full text-center"
            >
              <div className="w-20 h-20 bg-[#1a1a1a] rounded-2xl flex items-center justify-center mx-auto mb-8 border border-[#333]">
                <Trash2 className="text-red-500" size={32} />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3 tracking-tighter">¿ELIMINAR ESTA SECCIÓN?</h3>
              <p className="text-slate-400 text-sm mb-10 font-medium leading-relaxed">
                Se borrarán todas las escenas asociadas. Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-4 rounded-2xl bg-slate-800 text-slate-400 font-black text-[11px] uppercase tracking-widest hover:bg-slate-700 transition-all border border-white/5"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => { deleteWorkspace(workspace.id); setShowDeleteConfirm(false); }}
                  className="flex-1 py-4 rounded-2xl bg-red-500 text-white font-black text-[11px] uppercase tracking-widest hover:bg-red-600 shadow-2xl shadow-red-500/20 transition-all"
                >
                  Sí, eliminar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hidden file inputs local to this workspace */}
      <input ref={fileInputRef} type="file" accept=".txt,.md,.csv" className="hidden" onChange={handleFileImport} />
      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageRef} />
      
      <aside className="lg:sticky lg:top-32 h-fit space-y-5">
        
        {workspace.theme === 'golden' && (
          <h3 className="text-amber-500 font-bold tracking-[0.2em] text-sm mb-4 flex items-center gap-2">
            <Sparkles size={16} /> SECCIÓN ESPECIAL DORADA
          </h3>
        )}

        <div className={`bg-[#0a0a0a] rounded-2xl p-5 border ${workspace.theme === 'golden' ? 'border-amber-500/20' : 'border-[#222]'}`}>
          <h2 className="text-xs font-bold mb-3 flex items-center gap-3 text-slate-300">
            <FileText size={16} /> IMPORTAR MARKDOWN
          </h2>
          <p className="text-[10px] text-slate-500 mb-3">Las escenas importadas aquí pertenecen solo a esta sección.</p>
          <div className="flex flex-col gap-2 mb-3">
            <h3 className="text-[9px] font-bold text-slate-500 mb-1 flex items-center gap-1"><ImageIcon size={10}/> LISTA / TABLA IMÁGENES</h3>
            <textarea
              className="w-full h-20 bg-black rounded-lg p-3 text-sm text-slate-300 placeholder-slate-600 outline-none border border-[#222] focus:border-[#444] transition-all resize-none font-mono text-[10px]"
              placeholder="Pega texto..."
              value={imageMarkdown}
              onChange={(e) => setImageMarkdown(e.target.value)}
            />
            <button 
              onClick={() => addPromptsToScenes(imageMarkdown, 'image')} 
              className="w-full py-2 rounded-lg font-bold text-[10px] tracking-[0.2em] uppercase text-slate-400 bg-[#111] hover:bg-[#222] hover:text-slate-300 border border-[#222] transition-all"
            >
              + AGREGAR IMÁGENES
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-[9px] font-bold text-slate-500 mb-1 flex items-center gap-1"><Clapperboard size={10}/> LISTA / TABLA VIDEOS</h3>
            <textarea
              className="w-full h-20 bg-black rounded-lg p-3 text-sm text-slate-300 placeholder-slate-600 outline-none border border-[#222] focus:border-[#444] transition-all resize-none font-mono text-[10px]"
              placeholder="Pega texto..."
              value={videoMarkdown}
              onChange={(e) => setVideoMarkdown(e.target.value)}
            />
            <button 
              onClick={() => addPromptsToScenes(videoMarkdown, 'video')} 
              className="w-full py-2 rounded-lg font-bold text-[10px] tracking-[0.2em] uppercase text-slate-400 bg-[#111] hover:bg-[#222] hover:text-slate-300 border border-[#222] transition-all"
            >
              + AGREGAR VIDEOS
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-[#0a0a0a] rounded-2xl p-5 border border-[#222]">
          <h3 className="text-[10px] font-bold text-slate-500 md:text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
            <Hash size={12} /> ESTADÍSTICAS
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#0f0f0f] border border-[#222] rounded-xl p-3 text-center">
              <div className="text-xl font-semibold text-slate-300">{filteredLocalScenes.filter(s => s.imageText.trim()).length}</div>
              <div className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider mt-1">Imágenes</div>
            </div>
            <div className="bg-[#0f0f0f] border border-[#222] rounded-xl p-3 text-center">
              <div className="text-xl font-semibold text-slate-300">{filteredLocalScenes.filter(s => s.videoText.trim()).length}</div>
              <div className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider mt-1">Videos</div>
            </div>
          </div>
          <div className="mt-4 text-center border-t border-[#222] pt-4">
            <div className="text-sm font-semibold text-slate-300">{filteredLocalScenes.length}</div>
            <div className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider">Total Escenas</div>
          </div>
        </div>
      </aside>

      {/* Main Content Area for this Workspace */}
      <main className="lg:col-span-3">
        <AnimatePresence mode="popLayout">
          {filteredLocalScenes.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center h-[500px] rounded-3xl border border-[#222] bg-[#0a0a0a]"
            >
              <div className="w-20 h-20 rounded-2xl bg-[#131313] flex items-center justify-center mb-6 border border-[#222]">
                <Plus className="text-slate-600" size={36} />
              </div>
              <h3 className="text-xl font-bold text-slate-300 mb-2 tracking-tight">Comienza la magia</h3>
              <p className="text-slate-500 text-sm font-medium mb-6">Pega texto o arrastra imágenes</p>
              <div className="flex gap-3">
                <button onClick={() => fileInputRef.current?.click()} className="px-5 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-all">
                  <FolderPlus size={14} className="inline mr-2" /> Importar
                </button>
                <button onClick={() => imageInputRef.current?.click()} className="px-5 py-2.5 bg-violet-500/10 border border-violet-500/20 rounded-xl text-violet-400 text-xs font-bold hover:bg-violet-500/20 transition-all">
                  <Upload size={14} className="inline mr-2" /> Subir
                </button>
              </div>
            </motion.div>
          ) : viewMode === 'carousel' ? (
              <div 
                ref={carouselOuterRef} 
                className="w-full h-[500px] overflow-hidden cursor-grab active:cursor-grabbing pb-8 pt-4 px-2"
              >
                <motion.div 
                  ref={carouselInnerRef}
                  drag="x"
                  dragConstraints={{ right: 0, left: -carouselWidth }}
                  dragElastic={0.05}
                  className="flex flex-row gap-6 w-max px-4"
                >
                  {filteredLocalScenes.map((scene, i) => (
                    <div key={scene.id} className="min-w-[350px] w-[350px] md:w-[400px] md:min-w-[400px] relative group flex-shrink-0">
                      <SceneCard 
                        scene={scene} 
                        index={i}
                        updateScene={updateScene} 
                        deleteScene={deleteScene} 
                        duplicateScene={duplicateScene}
                        onTranslate={handleTranslate}
                        isCarousel={true}
                      />
                    </div>
                  ))}
                </motion.div>
              </div>
          ) : (
            <WorkspaceSection 
              items={filteredLocalScenes}
              viewMode={viewMode}
              onReorder={(newOrder: Scene[]) => {
                if (!search.trim()) {
                  const updatedScenes = [...scenes];
                  const localIndices = scenes.map((s, i) => (s.groupId || 'default') === workspace.id ? i : -1).filter(i => i !== -1);
                  newOrder.forEach((scene, idx) => {
                    updatedScenes[localIndices[idx]] = scene;
                  });
                  saveScenes(updatedScenes);
                } else {
                  const newFullList = [...scenes];
                  const filteredIds = filteredLocalScenes.map(s => s.id);
                  let filteredCount = 0;
                  const result = newFullList.map(s => {
                    if (filteredIds.includes(s.id)) return newOrder[filteredCount++];
                    return s;
                  });
                  saveScenes(result);
                }
              }}
              renderItem={(scene: Scene, localIndex: number) => {
                return (
                  <SceneCard 
                    key={scene.id} 
                    scene={scene} 
                    index={localIndex} 
                    updateScene={updateScene} 
                    deleteScene={deleteScene} 
                    duplicateScene={duplicateScene}
                    onTranslate={handleTranslate} 
                    isVertical={viewMode === 'vertical'}
                  />
                );
              }}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};
