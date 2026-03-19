import { useState, useRef, useMemo, useCallback } from "react";
import { FolderPlus, Upload, FileText, Image as ImageIcon, Clapperboard, Hash, Plus, Sparkles, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Scene, Workspace } from "../types";
import { parseMarkdownTable, parseSimpleText } from "../utils/parser";
import { WorkspaceSection } from "./WorkspaceSection";
import { SceneCard } from "./SceneCard";
import { AssetManager } from "../utils/AssetManager";

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

  // Filter global scenes to just this workspace
  const localScenes = useMemo(() => scenes.filter(s => (s.groupId || 'default') === workspace.id), [scenes, workspace.id]);
  
  const filteredLocalScenes = useMemo(() => {
    return !search.trim() ? localScenes : localScenes.filter(s => 
      s.imageText.toLowerCase().includes(search.toLowerCase()) || 
      s.videoText.toLowerCase().includes(search.toLowerCase())
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
      <div className="col-span-1 lg:col-span-4 flex items-center justify-between mb-2 bg-slate-900/40 backdrop-blur-xl border border-white/5 p-4 rounded-3xl shadow-xl">
        <div className="flex items-center gap-4">
          <div className="px-5 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
            <span className="text-emerald-400 font-black tracking-tighter text-sm">SECCIÓN #{index + 1}</span>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <input 
            value={workspace.name || ""} 
            onChange={(e) => updateWorkspaceName(workspace.id, e.target.value)}
            placeholder="Nombre de la sección (opcional)..."
            className="bg-transparent border-none outline-none text-slate-300 font-black text-sm placeholder:text-slate-600 focus:ring-0 w-64 uppercase tracking-wider"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-3 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-2xl transition-all flex items-center gap-2 group"
            title="Colapsar sección"
          >
            <span className="text-[10px] font-black opacity-0 group-hover:opacity-100 transition-all uppercase tracking-widest">Colapsar</span>
            <ChevronDown size={18} />
          </button>
          <button 
            onClick={() => setShowDeleteConfirm(true)}
            className="p-3 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-2xl transition-all flex items-center gap-2 group"
            title="Eliminar Sección"
          >
            <span className="text-[10px] font-black opacity-0 group-hover:opacity-100 transition-all uppercase tracking-widest">Eliminar</span>
            <Trash2 size={18} />
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
              className="relative bg-slate-900 border border-white/10 p-10 rounded-[3rem] shadow-[0_0_100px_rgba(0,0,0,0.5)] max-w-md w-full text-center"
            >
              <div className="w-20 h-20 bg-red-500/10 rounded-[2rem] flex items-center justify-center mx-auto mb-8">
                <Trash2 className="text-red-500" size={32} />
              </div>
              <h3 className="text-2xl font-black text-white mb-3 tracking-tighter">¿ELIMINAR ESTA SECCIÓN?</h3>
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
          <h3 className="text-amber-400 font-black tracking-[0.2em] text-sm mb-4 flex items-center gap-2">
            <Sparkles size={16} /> SECCIÓN ESPECIAL DORADA
          </h3>
        )}

        <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl p-5 border-2 border-amber-500/20">
          <h2 className="text-xs font-black mb-3 flex items-center gap-3 text-amber-400">
            <FileText size={16} /> IMPORTAR MARKDOWN
          </h2>
          <p className="text-[10px] text-slate-500 mb-3">Las escenas importadas aquí pertenecen solo a esta sección.</p>
          <div className="flex flex-col gap-2 mb-3">
            <h3 className="text-[9px] font-bold text-emerald-400 mb-1 flex items-center gap-1"><ImageIcon size={10}/> LISTA / TABLA IMÁGENES</h3>
            <textarea
              className="w-full h-20 bg-slate-950/40 rounded-xl p-3 text-sm text-slate-300 placeholder-slate-600 outline-none border border-emerald-500/20 focus:ring-1 focus:ring-emerald-500/20 transition-all resize-none font-mono text-[10px]"
              placeholder="Pega texto..."
              value={imageMarkdown}
              onChange={(e) => setImageMarkdown(e.target.value)}
            />
            <button 
              onClick={() => addPromptsToScenes(imageMarkdown, 'image')} 
              className="w-full py-2 rounded-xl font-black text-[10px] tracking-[0.2em] uppercase text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 shadow-lg transition-all"
            >
              + AGREGAR IMÁGENES
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-[9px] font-bold text-violet-400 mb-1 flex items-center gap-1"><Clapperboard size={10}/> LISTA / TABLA VIDEOS</h3>
            <textarea
              className="w-full h-20 bg-slate-950/40 rounded-xl p-3 text-sm text-slate-300 placeholder-slate-600 outline-none border border-violet-500/20 focus:ring-1 focus:ring-violet-500/20 transition-all resize-none font-mono text-[10px]"
              placeholder="Pega texto..."
              value={videoMarkdown}
              onChange={(e) => setVideoMarkdown(e.target.value)}
            />
            <button 
              onClick={() => addPromptsToScenes(videoMarkdown, 'video')} 
              className="w-full py-2 rounded-xl font-black text-[10px] tracking-[0.2em] uppercase text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 shadow-lg transition-all"
            >
              + AGREGAR VIDEOS
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl p-5 border border-white/5">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Hash size={12} /> ESTADÍSTICAS LOCALES
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-emerald-400">{filteredLocalScenes.filter(s => s.imageText.trim()).length}</div>
              <div className="text-[9px] text-emerald-400/50 font-bold uppercase tracking-wider">Imágenes</div>
            </div>
            <div className="bg-violet-500/5 border border-violet-500/10 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-violet-400">{filteredLocalScenes.filter(s => s.videoText.trim()).length}</div>
              <div className="text-[9px] text-violet-400/50 font-bold uppercase tracking-wider">Videos</div>
            </div>
          </div>
          <div className="mt-3 text-center">
            <div className="text-sm font-black text-slate-300">{filteredLocalScenes.length}</div>
            <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Total Escenas</div>
          </div>
        </div>
      </aside>

      {/* Main Content Area for this Workspace */}
      <main className="lg:col-span-3">
        <AnimatePresence mode="popLayout">
          {filteredLocalScenes.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center h-[500px] rounded-[3rem] border-2 border-dashed border-white/5 bg-slate-900/20 backdrop-blur-sm">
              <div className="w-20 h-20 rounded-2xl bg-slate-800/40 flex items-center justify-center mb-6 shadow-2xl">
                <Plus className="text-slate-600 animate-pulse" size={36} />
              </div>
              <h3 className="text-xl font-black text-slate-300 mb-2 tracking-tight">Comienza la magia</h3>
              <p className="text-slate-500 text-sm font-medium mb-6">Pega texto en el panel lateral o arrastra imágenes</p>
              <div className="flex gap-3">
                <button onClick={() => fileInputRef.current?.click()} className="px-5 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-all">
                  <FolderPlus size={14} className="inline mr-2" /> Importar Archivo
                </button>
                <button onClick={() => imageInputRef.current?.click()} className="px-5 py-2.5 bg-violet-500/10 border border-violet-500/20 rounded-xl text-violet-400 text-xs font-bold hover:bg-violet-500/20 transition-all">
                  <Upload size={14} className="inline mr-2" /> Subir Imagen
                </button>
              </div>
            </motion.div>
          ) : (
            <WorkspaceSection 
              items={filteredLocalScenes}
              onReorder={(newOrder: Scene[]) => {
                if (!search.trim()) {
                  // Reorder within global array
                  const updatedScenes = [...scenes];
                  const localIndices = scenes.map((s, i) => (s.groupId || 'default') === workspace.id ? i : -1).filter(i => i !== -1);
                  newOrder.forEach((scene, idx) => {
                    updatedScenes[localIndices[idx]] = scene;
                  });
                  saveScenes(updatedScenes);
                } else {
                  // Search active -- avoid destructive reorder or do partial
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
