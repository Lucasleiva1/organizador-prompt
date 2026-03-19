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
}: {
  scene: Scene;
  index: number;
  updateScene: (id: string, data: Partial<Scene>) => void;
  deleteScene: (id: string) => void;
  duplicateScene: (id: string) => void;
  onTranslate: (id: string, mode: "image" | "video") => void;
}) => {
  const isVideo = scene.mode === "video";
  const [showTranslateImage, setShowTranslateImage] = useState(false);
  const [showTranslateVideo, setShowTranslateVideo] = useState(false);
  const [assetUrl, setAssetUrl] = useState<string | undefined>(undefined);

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

    // 1. Check if it's a character from our bar
    const charAsset = e.dataTransfer.getData("characterAsset");
    if (charAsset) {
      updateScene(scene.id, { asset: charAsset });
      return;
    }

    // 2. Otherwise check for files
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

  return (
    <Reorder.Item
      value={scene}
      id={String(scene.id)}
      dragListener={false}
      className="relative w-full h-[400px] cursor-default list-none group perspective-2000"
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
          className={`absolute inset-0 backface-hidden rounded-[2.5rem] border-2 bg-slate-900/60 backdrop-blur-2xl p-6 flex flex-col transition-all duration-500
            ${isVideo ? "border-transparent opacity-0 pointer-events-none" : "border-emerald-500/40 shadow-[0_0_50px_-12px_rgba(16,185,129,0.2)] opacity-100"}`}
        >
          <header className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-black text-sm ring-1 ring-emerald-500/30">
                {index + 1}
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400/80">
                  IMAGEN {showTranslateImage && <span className="text-emerald-300 ml-1">(TRADUCCIÓN)</span>}
                </span>
                <span className="text-[9px] text-emerald-400/40 font-bold">ID: {String(scene.id).slice(0, 8)}</span>
              </div>
            </div>
            <div className="flex gap-1 bg-slate-800/40 p-1 rounded-xl border border-white/5 items-center">
              <div className="flex mr-2 bg-slate-900/50 rounded-lg p-0.5 border border-white/5">
                <button onClick={() => setShowTranslateImage(false)} className={`px-2 py-0.5 text-[9px] font-black tracking-widest rounded transition-all ${!showTranslateImage ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-white'}`}>ES</button>
                <button onClick={() => { setShowTranslateImage(true); if (!scene.translatedImageText) onTranslate(scene.id, "image"); }} className={`px-2 py-0.5 text-[9px] font-black tracking-widest rounded transition-all ${showTranslateImage ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-white'}`}>EN</button>
              </div>
              <CardAction icon={Plus} onClick={() => duplicateScene(scene.id)} color="emerald" tooltip="Insertar Vacía" />
              <CardAction icon={ArrowRightLeft} onClick={handleFlip} color="emerald" tooltip="Girar a Video" />
              <CardAction icon={Trash2} onDoubleClick={() => deleteScene(scene.id)} color="red" tooltip="Borrar (2x click)" />
            </div>
          </header>

          <div className="flex-1 relative group/textarea">
            <textarea
              className="w-full h-full bg-slate-950/40 rounded-2xl p-4 text-sm text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-emerald-500/40 outline-none border border-emerald-500/30 resize-none transition-all"
              value={showTranslateImage ? (scene.translatedImageText || "Traduciendo...") : scene.imageText}
              placeholder="Prompt de imagen..."
              onChange={(e) => updateScene(scene.id, showTranslateImage ? { translatedImageText: e.target.value } : { imageText: e.target.value })}
            />
            <div className="absolute top-3 right-3 opacity-0 group-hover/textarea:opacity-100 transition-opacity">
               <Copy size={14} className="text-slate-500 cursor-pointer hover:text-emerald-400" onClick={() => navigator.clipboard.writeText(showTranslateImage ? (scene.translatedImageText||"") : scene.imageText)} />
            </div>
          </div>

          {scene.asset && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 relative rounded-xl overflow-hidden h-24 group/img border border-white/10">
              <img src={assetUrl || scene.asset} alt="Ref" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-sm">
                <button onClick={async () => {
                  if (scene.asset) await AssetManager.deleteAsset(scene.asset);
                  updateScene(scene.id, { asset: undefined });
                }} className="p-2 bg-red-500 hover:bg-red-600 rounded-xl text-white shadow-xl transition-transform hover:scale-110">
                  <Trash2 size={14} />
                </button>
              </div>
            </motion.div>
          )}
        </div>

        {/* BACK: VIDEO MODE */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={`absolute inset-0 backface-hidden rotate-y-180 rounded-[2.5rem] border-2 bg-slate-900/80 backdrop-blur-2xl p-6 flex flex-col transition-all duration-500
            ${!isVideo ? "border-transparent opacity-0 pointer-events-none" : "border-violet-500/40 shadow-[0_0_50px_-12px_rgba(139,92,246,0.2)] opacity-100"}`}
        >
          <header className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-400 font-black text-sm ring-1 ring-violet-500/30">
                {index + 1}
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase tracking-[0.25em] text-violet-400/80">
                  VIDEO {showTranslateVideo && <span className="text-violet-300 ml-1">(TRADUCCIÓN)</span>}
                </span>
                <span className="text-[9px] text-violet-400/40 font-bold">ID: {String(scene.id).slice(0, 8)}</span>
              </div>
            </div>
            <div className="flex gap-1 bg-slate-800/40 p-1 rounded-xl border border-white/5 items-center">
              <div className="flex mr-2 bg-slate-900/50 rounded-lg p-0.5 border border-white/5">
                <button onClick={() => setShowTranslateVideo(false)} className={`px-2 py-0.5 text-[9px] font-black tracking-widest rounded transition-all ${!showTranslateVideo ? 'bg-violet-500/20 text-violet-400' : 'text-slate-500 hover:text-white'}`}>ES</button>
                <button onClick={() => { setShowTranslateVideo(true); if (!scene.translatedVideoText) onTranslate(scene.id, "video"); }} className={`px-2 py-0.5 text-[9px] font-black tracking-widest rounded transition-all ${showTranslateVideo ? 'bg-violet-500/20 text-violet-400' : 'text-slate-500 hover:text-white'}`}>EN</button>
              </div>
              <CardAction icon={Plus} onClick={() => duplicateScene(scene.id)} color="violet" tooltip="Insertar Vacía" />
              <CardAction icon={ArrowRightLeft} onClick={handleFlip} color="violet" tooltip="Girar a Imagen" />
              <CardAction icon={Trash2} onDoubleClick={() => deleteScene(scene.id)} color="red" tooltip="Borrar (2x click)" />
            </div>
          </header>

          <div className="flex-1 relative group/textarea">
            <textarea
              className="w-full h-full bg-slate-950/60 rounded-2xl p-4 text-sm text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-violet-500/40 outline-none border border-violet-500/30 resize-none transition-all"
              value={showTranslateVideo ? (scene.translatedVideoText || "Traduciendo...") : scene.videoText}
              placeholder="Prompt de video..."
              onChange={(e) => updateScene(scene.id, showTranslateVideo ? { translatedVideoText: e.target.value } : { videoText: e.target.value })}
            />
            <div className="absolute top-3 right-3 opacity-0 group-hover/textarea:opacity-100 transition-opacity">
               <Copy size={14} className="text-slate-500 cursor-pointer hover:text-violet-400" onClick={() => navigator.clipboard.writeText(showTranslateVideo ? (scene.translatedVideoText||"") : scene.videoText)} />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center h-20 border-2 border-dashed border-violet-500/20 rounded-xl bg-violet-500/5 group/preview overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-violet-500/5 to-transparent opacity-0 group-hover/preview:opacity-100 transition-opacity" />
            <Play className="text-violet-500/50 group-hover:text-violet-400 transform transition-all group-hover:scale-125" size={18} />
            <span className="ml-3 text-[10px] uppercase font-black text-violet-400/40 tracking-[0.2em] group-hover:text-violet-400/60 transition-colors">Preview</span>
          </div>
        </div>
      </motion.div>
    </Reorder.Item>
  );
};
