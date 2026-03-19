import { useState, useRef, useEffect } from "react";
import { Plus, User, Trash2, ChevronLeft, ChevronRight, Copy, Check, MousePointer2, X, FolderOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Character } from "../types";
import { AssetManager } from "../utils/AssetManager";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { documentDir, join } from "@tauri-apps/api/path";

interface CharacterBarProps {
  characters: Character[];
  addCharacter: (file: File) => Promise<void>;
  deleteCharacter: (id: string) => void;
}

// Helper: converts any image URL into a pure, standard image/png Blob via Canvas.
// Essential for the single-copy feature to maintain maximum compatibility.
const getCleanPngBlob = async (url: string): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject("No canvas 2d context");
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject("Failed to create blob");
      }, "image/png");
    };
    img.onerror = reject;
    img.src = url;
  });
};

export const CharacterBar = ({ characters, addCharacter, deleteCharacter }: CharacterBarProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await addCharacter(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === characters.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(characters.map((c) => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleOpenFolder = async () => {
    try {
      const selectedChars = characters.filter((c) => selectedIds.has(c.id));
      const paths: string[] = [];
      
      for (const char of selectedChars) {
        const absPath = await AssetManager.getAssetAbsolutePath(char.asset);
        if (absPath) {
          paths.push(absPath);
        }
      }

      if (paths.length > 0) {
        await revealItemInDir(paths);
      } else {
        const docPath = await documentDir();
        const folderPath = await join(docPath, 'Prompt Studio', 'personajes');
        await revealItemInDir([folderPath]);
      }
      
      // We keep the selection so they know what they were trying to copy
    } catch (err) {
      console.error("Failed to open folder:", err);
      alert("No se pudo abrir la carpeta. Asegúrate de haber guardado al menos un personaje para que se cree la ruta en Mis Documentos.");
    }
  };

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 300;
      scrollRef.current.scrollBy({ 
        left: direction === "left" ? -scrollAmount : scrollAmount, 
        behavior: "smooth" 
      });
    }
  };

  return (
    <div className="sticky top-[88px] lg:top-[104px] z-[55] w-full bg-[#020617]/80 backdrop-blur-xl border-y border-white/5 py-3 shadow-2xl overflow-hidden">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 flex items-center gap-4">
        
        {/* Left Control Area */}
        <div className="flex items-center gap-3 pr-4 border-r border-white/10 shrink-0 min-w-[200px] min-h-[56px]">
          <AnimatePresence mode="wait">
            {selectedIds.size > 0 ? (
              <motion.div 
                key="batch-actions"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex items-center gap-2"
              >
                <button 
                  onClick={handleOpenFolder}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black tracking-wider uppercase transition-all bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 active:scale-95"
                >
                  <FolderOpen size={14} /> ABRIR CARPETA ({selectedIds.size})
                </button>
                <button 
                  onClick={() => setSelectedIds(new Set())}
                  className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white"
                  title="Cancelar selección"
                >
                  <X size={14} />
                </button>
              </motion.div>
            ) : (
              <motion.div 
                key="default-actions"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex items-center gap-3"
              >
                <div className="flex flex-col">
                  <span className="text-[10px] font-black tracking-[0.2em] text-violet-400 uppercase">PERSONAJES</span>
                  <span className="text-[9px] text-slate-500 font-medium whitespace-nowrap">MIS DOCUMENTOS</span>
                </div>
                <div className="flex gap-1.5">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-9 h-9 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 hover:bg-violet-500/20 hover:scale-110 transition-all shadow-lg"
                    title="Añadir personaje"
                  >
                    <Plus size={16} />
                  </button>
                  {characters.length > 0 && (
                    <button 
                      onClick={toggleSelectAll}
                      className="w-9 h-9 rounded-full bg-slate-800/50 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:border-white/20 transition-all"
                      title="Seleccionar todos"
                    >
                      <MousePointer2 size={14} />
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept="image/*" 
          />
        </div>

        {/* Scrollable Gallery */}
        <div className="relative flex-1 flex items-center overflow-hidden">
          <button onClick={() => scroll("left")} className="absolute left-0 z-10 p-1 bg-slate-900/80 rounded-full border border-white/10 text-white opacity-0 hover:opacity-100 transition-opacity">
            <ChevronLeft size={16} />
          </button>
          
          <div 
            ref={scrollRef}
            className="flex items-center gap-3 overflow-x-auto no-scrollbar py-1 px-8 lg:px-10"
          >
            <AnimatePresence>
              {characters.map((char) => (
                <CharacterThumb 
                  key={char.id} 
                  character={char} 
                  isSelected={selectedIds.has(char.id)}
                  onSelect={() => toggleSelect(char.id)}
                  onDelete={() => deleteCharacter(char.id)} 
                />
              ))}
            </AnimatePresence>
            
            {characters.length === 0 && (
              <div className="text-slate-600 text-[11px] italic font-medium px-4">
                Sube las fotos de tus personajes para tenerlas siempre a mano...
              </div>
            )}
          </div>

          <button onClick={() => scroll("right")} className="absolute right-0 z-10 p-1 bg-slate-900/80 rounded-full border border-white/10 text-white opacity-0 hover:opacity-100 transition-opacity">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

interface CharacterThumbProps {
  character: Character;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

const CharacterThumb = ({ character, isSelected, onSelect, onDelete }: CharacterThumbProps) => {
  const [assetUrl, setAssetUrl] = useState<string>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    AssetManager.resolveAssetUrl(character.asset).then(setAssetUrl);
  }, [character.asset]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!assetUrl) return;
    try {
      // Create clean binary payload of the image to satisfy strict clipboards (like Gemini's paste interceptor)
      const blob = await getCleanPngBlob(assetUrl);
      const textBlob = new Blob([character.name + "\n" + character.asset], { type: "text/plain" });
      const item = new ClipboardItem({ 
        "image/png": blob,
        "text/plain": textBlob
      });
      await navigator.clipboard.write([item]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy image:", err);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      whileHover={{ scale: 1.05 }}
      className="relative group shrink-0"
    >
      <div 
        draggable
        onClick={onSelect}
        onDragStart={(e) => {
          e.dataTransfer.setData("characterAsset", character.asset);
          if (assetUrl) {
            e.dataTransfer.setData("text/uri-list", assetUrl);
            e.dataTransfer.setData("text/plain", character.name + "\n" + character.asset);
            const htmlPayload = `<img src="${assetUrl}" alt="${character.name}" />`;
            e.dataTransfer.setData("text/html", htmlPayload);
            const fileName = character.asset.split("_").pop() || "character.png";
            e.dataTransfer.setData("DownloadURL", `image/png:${fileName}:${assetUrl}`);
            e.dataTransfer.effectAllowed = "copy";
          }
        }}
        className={`w-20 h-20 lg:w-24 lg:h-24 rounded-2xl overflow-hidden border-2 shadow-xl cursor-pointer active:scale-95 transition-all relative ${
          isSelected 
          ? "border-emerald-400 ring-4 ring-emerald-500/30" 
          : "border-white/10 bg-slate-800"
        }`}
      >
        {assetUrl ? (
          <img 
            src={assetUrl} 
            alt={character.name} 
            className={`w-full h-full object-cover pointer-events-none transition-transform ${isSelected ? "scale-110" : ""}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600">
            <User size={24} />
          </div>
        )}

        {/* Selection Checkmark */}
        {isSelected && (
          <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
            <div className="bg-emerald-500 rounded-full p-2 shadow-lg transform scale-110">
              <Check size={14} className="text-white" strokeWidth={4} />
            </div>
          </div>
        )}
      </div>
      
      {/* Actions Overlay */}
      {!isSelected && (
        <div className="absolute -top-2 -right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all z-10">
          <button 
            onClick={handleCopy}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-white shadow-xl transition-all hover:scale-110 ${copied ? "bg-green-500" : "bg-slate-700/90 hover:bg-slate-600"}`}
            title="Copiar imagen"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="w-8 h-8 border border-white/20 bg-red-500/90 hover:bg-red-500 rounded-full flex items-center justify-center text-white transition-all hover:scale-110 shadow-xl"
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </motion.div>
  );
};
