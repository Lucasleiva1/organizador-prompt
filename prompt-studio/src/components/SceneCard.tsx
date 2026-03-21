import { useState, useEffect } from "react";
import { Reorder, motion } from "framer-motion";
import { Copy, Trash2, Plus, ArrowRightLeft, Play } from "lucide-react";
import { Scene } from "../types";
import { AssetManager } from "../utils/AssetManager";

export const CardAction = ({ icon: Icon, onClick, onDoubleClick, disabled, color, tooltip }: any) => {
  const colors: any = {
    emerald: "hover:bg-emerald-500/10 text-emerald-400/70 hover:text-emerald-400",
    violet: "hover:bg-violet-500/10 text-violet-400/70 hover:text-violet-400",
    red: "hover:bg-red-500/10 text-red-400/70 hover:text-red-400",
  };

  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      disabled={disabled}
      className={`p-1.5 rounded-lg transition-all duration-300 ${colors[color]} outline-none disabled:opacity-30`}
      title={tooltip}
    >
      <Icon size={13} />
    </button>
  );
};

export const SceneCard = ({
  scene,
  index,
  updateScene,
  deleteScene,
  duplicateScene,
  onTranslate,
  isVertical = false,
  isCarousel = false,
}: {
  scene: Scene;
  index: number;
  updateScene: (id: string, data: Partial<Scene>) => void;
  deleteScene: (id: string) => void;
  duplicateScene: (id: string) => void;
  onTranslate: (id: string, mode: "image" | "video") => void;
  isVertical?: boolean;
  isCarousel?: boolean;
}) => {
  const isVideo = scene.mode === "video";
  const [showTranslateImage, setShowTranslateImage] = useState(false);
  const [showTranslateVideo, setShowTranslateVideo] = useState(false);
  const [assetUrl, setAssetUrl] = useState<string | undefined>(undefined);
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [isEditingVideo, setIsEditingVideo] = useState(false);

  // Resolve asset URL
  useEffect(() => {
    if (scene.asset) {
      AssetManager.resolveAssetUrl(scene.asset).then(setAssetUrl);
    } else {
      setAssetUrl(undefined);
    }
  }, [scene.asset]);

  // Auto-translate on typing stop
  useEffect(() => {
    if (!scene.imageText.trim() || showTranslateImage) return;
    const timer = setTimeout(() => {
      onTranslate(scene.id, "image");
    }, 1500);
    return () => clearTimeout(timer);
  }, [scene.imageText, scene.id, showTranslateImage, onTranslate]);

  useEffect(() => {
    if (!scene.videoText.trim() || showTranslateVideo) return;
    const timer = setTimeout(() => {
      onTranslate(scene.id, "video");
    }, 1500);
    return () => clearTimeout(timer);
  }, [scene.videoText, scene.id, showTranslateVideo, onTranslate]);

  const handleFlip = () => {
    updateScene(scene.id, { mode: isVideo ? "image" : "video" });
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const charAsset = e.dataTransfer.getData("characterAsset");
    if (charAsset) {
      updateScene(scene.id, { asset: charAsset });
      return;
    }

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      try {
        if (scene.asset) {
          await AssetManager.deleteAsset(scene.asset);
        }
        const fileName = await AssetManager.saveAsset(file, 'scene');
        updateScene(scene.id, { asset: fileName });
      } catch (err) {
        console.error("Error saving asset:", err);
        alert("Error al guardar la imagen.");
      }
    }
  };

  const Root: any = isCarousel ? motion.div : Reorder.Item;

  return (
    <Root
      {...(!isCarousel ? { value: scene, id: String(scene.id) } : {})}
      dragListener={false}
      className={`relative w-full cursor-default list-none group perspective-2000 transition-all duration-500 ${isVertical ? 'h-[320px]' : 'h-[440px]'}`}
    >
      <motion.div
        animate={{ rotateY: isVideo ? 180 : 0 }}
        transition={{ duration: 0.7, type: "spring", stiffness: 120, damping: 20 }}
        className="relative w-full h-full preserve-3d"
      >
        {/* FRONT: IMAGE MODE */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={`absolute inset-0 backface-hidden rounded-xl border-2 bg-[#111] p-3 flex transition-all duration-300
            ${isVideo ? "border-transparent opacity-0 pointer-events-none" : "border-[#D4AF37] hover:border-[#D4AF37] hover:shadow-[0_0_10px_rgba(212,175,55,0.15)] opacity-100"}
            ${isVertical ? 'flex-row gap-4' : 'flex-col'}`}
        >
          {isVertical && scene.asset && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="w-1/3 h-full relative rounded-lg overflow-hidden group/img border border-[#333] shrink-0">
              <img src={assetUrl || scene.asset} alt="Ref" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-sm">
                <button onClick={async () => {
                  if (scene.asset) await AssetManager.deleteAsset(scene.asset);
                  updateScene(scene.id, { asset: undefined });
                }} className="p-2.5 bg-red-500 hover:bg-red-600 rounded-lg text-white shadow-xl">
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          )}

          <div className="flex-1 flex flex-col min-w-0">
            <header className="flex justify-between items-center mb-2 shrink-0 px-1">
              <div className="text-white font-bold tracking-widest text-sm uppercase flex items-center gap-2">
                ESCENA #{index + 1}
                {showTranslateImage && <span className="text-[#D4AF37] text-[9px] tracking-normal border border-[#D4AF37]/50 rounded px-1">(EN)</span>}
              </div>
              {scene.asset && (
                <div className="px-2 py-0.5 text-[9px] font-bold rounded uppercase tracking-widest bg-[#D4AF37] text-black shadow-none">
                  APROBADA
                </div>
              )}
            </header>

            {/* Toolbar row */}
            <div className="flex items-center justify-between mb-3 shrink-0 px-1">
               <div className="flex mr-2 bg-black rounded-md p-0.5 border border-[#333]">
                  <button onClick={() => setShowTranslateImage(false)} className={`px-2 py-0.5 text-[9px] font-bold tracking-widest rounded transition-all ${!showTranslateImage ? 'bg-[#222] text-white' : 'text-slate-500 hover:text-white'}`}>ES</button>
                  <button onClick={() => { setShowTranslateImage(true); if (!scene.translatedImageText) onTranslate(scene.id, "image"); }} className={`px-2 py-0.5 text-[9px] font-bold tracking-widest rounded transition-all ${showTranslateImage ? 'bg-[#222] text-white' : 'text-slate-500 hover:text-white'}`}>EN</button>
                </div>
                <div className="flex gap-1 bg-black p-1 rounded-lg border border-[#333] items-center">
                  <CardAction icon={Plus} onClick={() => duplicateScene(scene.id)} color="emerald" tooltip="Insertar Vacía" />
                  <CardAction icon={ArrowRightLeft} onClick={handleFlip} color="violet" tooltip="Girar a Video" />
                  <CardAction icon={Trash2} onDoubleClick={() => deleteScene(scene.id)} color="red" tooltip="Borrar (2x click)" />
                </div>
            </div>

            {!isVertical && scene.asset && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mb-3 relative rounded-lg overflow-hidden flex-1 group/img border border-[#333] shrink-0">
                <img src={assetUrl || scene.asset} alt="Ref" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-sm">
                  <button onClick={async () => {
                    if (scene.asset) await AssetManager.deleteAsset(scene.asset);
                    updateScene(scene.id, { asset: undefined });
                  }} className="p-2.5 bg-black hover:bg-red-900/50 rounded-xl text-red-500 hover:text-red-400 border border-[#333] hover:border-red-500/50 transition-all">
                    <Trash2 size={16} />
                  </button>
                </div>
              </motion.div>
            )}

            <div 
              className={`relative group/textarea min-h-0 ${(!isVertical && scene.asset) ? 'h-16 shrink-0' : 'flex-1'} ${!isEditingImage ? 'cursor-grab' : ''}`}
              onDoubleClick={() => setIsEditingImage(true)}
            >
              <textarea
                className={`w-full h-full bg-black rounded-xl p-3 text-xs text-slate-300 placeholder-slate-600 focus:ring-1 focus:ring-[#D4AF37]/50 outline-none border border-[#333] resize-none transition-all custom-scrollbar ${!isEditingImage ? 'pointer-events-none select-none' : ''}`}
                value={showTranslateImage ? (scene.translatedImageText || "Traduciendo...") : scene.imageText}
                placeholder={isEditingImage ? "Prompt de imagen..." : "Doble click para editar prompt..."}
                onChange={(e) => updateScene(scene.id, showTranslateImage ? { translatedImageText: e.target.value } : { imageText: e.target.value })}
                onBlur={() => setIsEditingImage(false)}
                ref={(el) => { if (isEditingImage && el) el.focus(); }}
              />
              <div className="absolute top-2 right-2 opacity-0 group-hover/textarea:opacity-100 transition-opacity z-10">
                 <button 
                   onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(showTranslateImage ? (scene.translatedImageText||"") : scene.imageText); }} 
                   className="p-1.5 hover:bg-[#222] rounded bg-black/50 backdrop-blur-sm transition-colors cursor-pointer pointer-events-auto"
                   title="Copiar prompt"
                 >
                   <Copy size={13} className="text-slate-400 hover:text-[#D4AF37]" />
                 </button>
              </div>
            </div>
          </div>
        </div>

        {/* BACK: VIDEO MODE */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={`absolute inset-0 backface-hidden rotate-y-180 rounded-xl border-2 bg-[#111] p-3 flex transition-all duration-300
            ${!isVideo ? "border-transparent opacity-0 pointer-events-none" : "border-violet-500 hover:border-violet-500 hover:shadow-[0_0_10px_rgba(139,92,246,0.15)] opacity-100"}
            ${isVertical ? 'flex-row gap-4' : 'flex-col'}`}
        >
          {isVertical && scene.asset && (
            <div className="w-1/3 h-full relative rounded-lg overflow-hidden group/img border border-[#333] shrink-0">
              <img src={assetUrl || scene.asset} alt="Ref" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[2px]">
                 <Play className="text-white/40" size={32} />
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col min-w-0">
            <header className="flex justify-between items-center mb-2 shrink-0 px-1">
              <div className="text-white font-bold tracking-widest text-sm uppercase flex items-center gap-2">
                ESCENA #{index + 1}
                {showTranslateVideo && <span className="text-violet-400 text-[9px] tracking-normal border border-violet-500/50 rounded px-1">(EN)</span>}
              </div>
              {scene.asset && (
                <div className="px-2 py-0.5 text-[9px] font-bold rounded uppercase tracking-widest bg-violet-600 text-white shadow-none">
                  APROBADA
                </div>
              )}
            </header>

            {/* Toolbar row */}
            <div className="flex items-center justify-between mb-3 shrink-0 px-1">
               <div className="flex mr-2 bg-black rounded-md p-0.5 border border-[#333]">
                  <button onClick={() => setShowTranslateVideo(false)} className={`px-2 py-0.5 text-[9px] font-bold tracking-widest rounded transition-all ${!showTranslateVideo ? 'bg-[#222] text-white' : 'text-slate-500 hover:text-white'}`}>ES</button>
                  <button onClick={() => { setShowTranslateVideo(true); if (!scene.translatedVideoText) onTranslate(scene.id, "video"); }} className={`px-2 py-0.5 text-[9px] font-bold tracking-widest rounded transition-all ${showTranslateVideo ? 'bg-[#222] text-white' : 'text-slate-500 hover:text-white'}`}>EN</button>
                </div>
                <div className="flex gap-1 bg-black p-1 rounded-lg border border-[#333] items-center">
                  <CardAction icon={Plus} onClick={() => duplicateScene(scene.id)} color="violet" tooltip="Insertar Vacía" />
                  <CardAction icon={ArrowRightLeft} onClick={handleFlip} color="violet" tooltip="Girar a Imagen" />
                  <CardAction icon={Trash2} onDoubleClick={() => deleteScene(scene.id)} color="red" tooltip="Borrar (2x click)" />
                </div>
            </div>

            <div 
              className={`relative group/textarea min-h-0 ${(!isVertical && scene.asset) ? 'h-16 shrink-0' : 'flex-1'} ${!isEditingVideo ? 'cursor-grab' : ''}`}
              onDoubleClick={() => setIsEditingVideo(true)}
            >
              <textarea
                className={`w-full h-full bg-black rounded-xl p-3 text-xs text-slate-300 placeholder-slate-600 focus:ring-1 focus:ring-violet-500/50 outline-none border border-[#333] resize-none transition-all custom-scrollbar ${!isEditingVideo ? 'pointer-events-none select-none' : ''}`}
                value={showTranslateVideo ? (scene.translatedVideoText || "Traduciendo...") : scene.videoText}
                placeholder={isEditingVideo ? "Prompt de video..." : "Doble click para editar prompt..."}
                onChange={(e) => updateScene(scene.id, showTranslateVideo ? { translatedVideoText: e.target.value } : { videoText: e.target.value })}
                onBlur={() => setIsEditingVideo(false)}
                ref={(el) => { if (isEditingVideo && el) el.focus(); }}
              />
              <div className="absolute top-2 right-2 opacity-0 group-hover/textarea:opacity-100 transition-opacity z-10">
                 <button 
                   onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(showTranslateVideo ? (scene.translatedVideoText||"") : scene.videoText); }} 
                   className="p-1.5 hover:bg-[#222] rounded bg-black/50 backdrop-blur-sm transition-colors cursor-pointer pointer-events-auto"
                   title="Copiar prompt"
                 >
                   <Copy size={13} className="text-slate-400 hover:text-violet-400" />
                 </button>
              </div>
            </div>

            {!isVertical && scene.asset && (
              <div className={`mt-3 flex items-center justify-center border border-dashed border-violet-500/30 rounded-lg bg-black group/preview overflow-hidden relative shrink-0 ${isVertical ? 'h-16' : 'h-24'}`}>
                <div className="absolute inset-0 bg-gradient-to-tr from-violet-500/10 to-transparent opacity-0 group-hover/preview:opacity-100 transition-opacity" />
                <Play className="text-violet-500/50 group-hover:text-violet-400 transform transition-all group-hover:scale-125" size={18} />
                <span className="ml-3 text-[10px] uppercase font-bold text-violet-400/50 tracking-[0.2em] group-hover:text-violet-400 transition-colors">Preview de Video</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </Root>
  );
};
