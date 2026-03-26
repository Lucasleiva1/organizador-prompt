import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Copy, 
  Trash2, 
  Plus, 
  ArrowRightLeft, 
  Maximize2,
  Upload, 
  Camera, 
  Lightbulb,
  Music,
  Zap,
  Trash,
  Minimize2
} from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Scene } from "../types";
import { AssetManager } from "../utils/AssetManager";

// Metadata interface for better typing
interface ParsedMetadata {
  mainPrompt: string;
  metadata: Record<string, string>;
  optics: string;
  lighting: string;
  audio: string;
  dynamics: string;
  vfx: string;
  vfxDetail: string;
  sound: string;
  cameraChoreography: string;
}

// Helper for parsing script text into prompt and metadata
const parseScriptText = (text: string): ParsedMetadata => {
  const metadata: Record<string, string> = {};
  
  const getField = (keys: string[]) => {
    for (const key of keys) {
      const regex = new RegExp(`(?:${key}):\\s*(.*?)(?=\\n|\\*\\*|$)`, 'i');
      const match = text.match(regex);
      if (match) return match[1].trim();
    }
    return "";
  };

  const optics = getField(['Óptica & Sensor', 'Óptica', 'Cámara', 'Lente', 'Visual Prompt']);
  const lighting = getField(['Iluminación & Atmósfera', 'Iluminación', 'Luz', 'Atmósfera']);
  const sound = getField(['Sound Design', 'Sonido', 'Audio', 'Música & Audio']);
  const vfx = getField(['VFX & Post', 'VFX', 'Post-producción', 'Efectos']);
  const audio = getField(['Audio', 'Música']);
  const dynamics = getField(['Cinematic Action', 'Acción', 'Efecto & Dinámica', 'Dinámica']);
  const cameraChoreography = getField(['Camera Choreography', 'Movimiento de Cámara', 'Cámara']);

  let mainPrompt = "";
  const fieldNames = ['Visual', 'Descripción', 'Óptica', 'Cámara', 'Lente', 'Iluminación', 'Luz', 'Atmósfera', 'Sound', 'Sonido', 'Audio', 'Cinematic', 'Acción', 'Efecto', 'Dynamics', 'VFX', 'Post', 'Movimiento'];
  const fieldsRegex = new RegExp(`(?:\\n|^)\\s*(?:\\d+[\\.\\)]\\s*)?(?:${fieldNames.join('|')}):\\s*`, 'i');
  const firstFieldMatch = text.match(fieldsRegex);
  
  const headerText = firstFieldMatch ? text.substring(0, firstFieldMatch.index).trim() : "";
  const visualMatch = text.match(/(?:^|\n)\s*(?:\d+[\.\)]\s*)?(?:Visual Prompt \(Video Core\)|Visual Instruction|Visual|Descripción):\s*(.*?)(?=\n|(?:\s*\d+[\.\)]\s*)?(?:Visual|Descripción|Óptica|Cámara|Lente|Iluminación|Luz|Atmósfera|Sound|Sonido|Audio|Cinematic|Acción|Efecto|Dynamics|VFX|Post|Movimiento)|\*\*|$)/is);
  
  if (visualMatch) {
    mainPrompt = (headerText ? headerText + "\n" : "") + visualMatch[1].trim();
  } else {
    // Fallback cleaning
    const baseText = headerText || text;
    const lines = baseText
      .replace(/##+.*?\n/g, '')
      .split('\n');
    
    // Only filter out lines with colons if there ARE lines without colons
    // and those lines are descriptive prompts.
    const descriptiveLines = lines.filter(line => !line.includes(':') && line.trim().length > 0);
    if (descriptiveLines.length > 0) {
       mainPrompt = (headerText ? headerText + "\n" : "") + descriptiveLines.join(' ').trim();
    } else {
       mainPrompt = (headerText ? headerText + "\n" : "") + lines.join(' ').trim();
    }
  }
  
  return { mainPrompt, metadata, optics, lighting, audio, dynamics, vfx: "", sound, cameraChoreography, vfxDetail: vfx };
};

export const CardAction = ({ icon: Icon, onClick, onDoubleClick, disabled, color, tooltip }: any) => {
  const colors: any = {
    emerald: "hover:bg-emerald-500/10 text-emerald-400/70 hover:text-emerald-400",
    violet: "hover:bg-violet-500/10 text-violet-400/70 hover:text-violet-400",
    red: "hover:bg-red-500/10 text-red-400/70 hover:text-red-400",
    gold: "hover:bg-[#D4AF37]/10 text-[#D4AF37]/70 hover:text-[#D4AF37]"
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
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [isEditingVideo, setIsEditingVideo] = useState(false);
  const [isFrontExpanded, setIsFrontExpanded] = useState(false);
  const [isBackExpanded, setIsBackExpanded] = useState(false);
  const [copiedFront, setCopiedFront] = useState(false);
  const [copiedBack, setCopiedBack] = useState(false);
  
  const fileInputRefFront = useRef<HTMLInputElement>(null);
  const fileInputRefBack = useRef<HTMLInputElement>(null);
  const textareaRefImage = useRef<HTMLTextAreaElement>(null);
  const textareaRefVideo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditingImage && textareaRefImage.current) {
      textareaRefImage.current.focus();
    }
  }, [isEditingImage]);

  useEffect(() => {
    if (isEditingVideo && textareaRefVideo.current) {
      textareaRefVideo.current.focus();
    }
  }, [isEditingVideo]);

  const [assetUrl, setAssetUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (scene.asset) {
      if (scene.asset.startsWith('http') || scene.asset.startsWith('data:') || scene.asset.startsWith('blob:')) {
        setAssetUrl(scene.asset);
      } else if (scene.asset.includes(':/') || scene.asset.includes(':\\') || scene.asset.startsWith('/')) {
        setAssetUrl(convertFileSrc(scene.asset));
      } else {
        AssetManager.resolveAssetUrl(scene.asset).then(setAssetUrl);
      }
    } else {
      setAssetUrl(undefined);
    }
  }, [scene.asset]);

  const parsedFront = parseScriptText(showTranslateImage ? (scene.translatedImageText || "Traduciendo...") : scene.imageText);
  const parsedBack = parseScriptText(showTranslateVideo ? (scene.translatedVideoText || "Traduciendo...") : scene.videoText);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.type.startsWith("image/") || file.type.startsWith("video/"))) {
      try {
        if (scene.asset) await AssetManager.deleteAsset(scene.asset);
        const fileName = await AssetManager.saveAsset(file, 'scene');
        updateScene(scene.id, { asset: fileName });
      } catch (err) { console.error(err); }
    }
  };

  const handleFlip = () => {
    updateScene(scene.id, { mode: isVideo ? "image" : "video" });
  };

  const containerClasses = isCarousel 
    ? "min-w-[350px] w-[350px] md:w-[450px] md:min-w-[450px] h-[400px] flex-shrink-0"
    : isVertical 
      ? "w-full min-h-[400px]" 
      : "w-full h-[400px]";

  return (
    <div
      id={scene.id}
      className={`group relative perspective-1000 ${containerClasses}`}
    >
      <motion.div
        className="w-full h-full relative preserve-3d transition-transform duration-700"
        style={{ rotateY: isVideo ? 180 : 0 }}
      >
        {/* FRONT: IMAGE MODE */}
        <div className={`absolute inset-0 backface-hidden rounded-xl border-2 bg-[#111] p-3 flex flex-col transition-all duration-300
            ${isVideo ? "border-transparent opacity-0 pointer-events-none" : "border-[#D4AF37] hover:shadow-[0_0_15px_rgba(212,175,55,0.1)] opacity-100"}`}
        >
          <header className="flex justify-between items-center mb-4 shrink-0 px-1">
            <div className="flex items-center gap-4">
              <div className="text-white font-bold tracking-widest text-[11px] uppercase flex items-center gap-2">
                PLANO #{index + 1}
                {showTranslateImage && <span className="text-[#D4AF37] text-[9px] border border-[#D4AF37]/50 rounded px-1">(EN)</span>}
              </div>
            </div>
            
            <div className="flex items-center gap-2.5">
               <div className="flex bg-black/60 rounded-lg p-0.5 border border-white/5">
                  <button onClick={() => setShowTranslateImage(false)} className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${!showTranslateImage ? 'bg-white/10 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>ES</button>
                  <button onClick={() => { setShowTranslateImage(true); if (!scene.translatedImageText) onTranslate(scene.id, "image"); }} className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${showTranslateImage ? 'bg-white/10 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>EN</button>
               </div>
                <div className="flex gap-1 bg-black/60 p-1 rounded-lg border border-white/5 items-center">
                   <CardAction icon={Plus} onClick={() => duplicateScene(scene.id)} color="gold" tooltip="Nuevo Plano" />
                   <CardAction icon={ArrowRightLeft} onClick={handleFlip} color="violet" tooltip="Cambiar a Video" />
                   <CardAction icon={Trash} onDoubleClick={() => deleteScene(scene.id)} color="red" tooltip="Borrar (2x click)" />
                </div>
            </div>
          </header>

          <div className="flex flex-1 min-h-0 bg-[#0a0a0a] rounded-lg p-3 border border-[#222] gap-4 overflow-hidden">
            <div className="flex-[1.5] flex flex-col min-w-0">

               <div className={`relative shrink-0 mb-3 rounded-md overflow-hidden border border-[#222] transition-all bg-[#0a0a0a] h-24 group/img`}>
                 {scene.asset ? (
                   <img src={assetUrl} alt="Ref" className="w-full h-full object-contain" />
                 ) : (
                    <div className="w-full h-full flex items-center justify-center hover:bg-[#111] transition-colors border-2 border-dashed border-[#222]">
                       <Upload size={14} className="text-[#D4AF37] opacity-50" />
                    </div>
                 )}
                 <input type="file" ref={fileInputRefFront} className="hidden" accept="image/*" onChange={handleFileSelect} />
                 
                 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex flex-col justify-between p-1.5 pointer-events-none">
                    <div className="flex justify-end gap-1.5 pointer-events-auto">
                      <button onClick={() => fileInputRefFront.current?.click()} className="p-1 px-1.5 bg-black/80 rounded text-slate-400 border border-white/10 hover:text-white transition-all shadow-xl" title="Subir Imagen"><Upload size={12}/></button>
                      {scene.asset && (
                        <button onDoubleClick={() => updateScene(scene.id, { asset: undefined })} className="p-1 px-1.5 bg-black/80 rounded text-slate-400 border border-white/10 hover:text-red-400 transition-all shadow-xl" title="Borrar Imagen (2x click)"><Trash2 size={12}/></button>
                      )}
                    </div>
                    {scene.asset && (
                      <div className="flex justify-start pointer-events-auto">
                        <button onClick={() => setIsFrontExpanded(true)} className="p-1 px-1.5 bg-black/80 rounded text-slate-400 border border-white/10 hover:text-white transition-all shadow-xl" title="Expandir"><Maximize2 size={12}/></button>
                      </div>
                    )}
                 </div>
               </div>

               <AnimatePresence>
                 {isFrontExpanded && scene.asset && (
                   <motion.div 
                     initial={{ opacity: 0, scale: 0.9 }}
                     animate={{ opacity: 1, scale: 1 }}
                     exit={{ opacity: 0, scale: 0.9 }}
                     className="absolute inset-0 z-50 bg-[#050505] rounded-xl flex flex-col p-4 border-2 border-[#D4AF37]/30 shadow-[0_0_50px_rgba(0,0,0,0.8)]"
                   >
                     <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                        <div className="text-[10px] text-[#D4AF37] font-black uppercase tracking-[.3em]">PREVISUALIZACIÓN DE PLANO</div>
                        <button 
                          onClick={() => setIsFrontExpanded(false)}
                          className="p-1.5 bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 rounded-lg hover:bg-[#D4AF37]/20 transition-all"
                        >
                          <Minimize2 size={14} />
                        </button>
                     </div>
                     <div className="flex-1 relative overflow-hidden rounded-lg bg-black/40 border border-white/5">
                        <img 
                          src={assetUrl} 
                          alt="Expanded View" 
                          className="w-full h-full object-contain drop-shadow-[0_0_20px_rgba(212,175,55,0.1)]"
                        />
                     </div>
                   </motion.div>
                 )}
               </AnimatePresence>
               
               <div className={`relative flex-1 group/textarea min-h-[100px] ${!isEditingImage ? 'cursor-text' : ''}`} onDoubleClick={() => setIsEditingImage(true)}>
                  <textarea
                    className={`w-full h-full bg-[#111] border border-[#222] rounded p-3 text-xs leading-relaxed text-slate-300 outline-none resize-none custom-scrollbar ${!isEditingImage ? 'pointer-events-none' : 'focus:border-[#D4AF37]/50'}`}
                    value={(showTranslateImage ? (scene.translatedImageText || "Traduciendo...") : scene.imageText).replace(/^(PLANO\s*)\d+/i, `$1${index + 1}`)}
                    onChange={(e) => updateScene(scene.id, showTranslateImage ? { translatedImageText: e.target.value } : { imageText: e.target.value })}
                    onBlur={() => setIsEditingImage(false)}
                    ref={textareaRefImage}
                  />
                  <button 
                    onClick={async () => { 
                      try {
                        const textToCopy = parsedFront.mainPrompt || scene.imageText;
                        await navigator.clipboard.writeText(textToCopy); 
                        setCopiedFront(true);
                        setTimeout(() => setCopiedFront(false), 2000);
                      } catch (err) {
                        console.error("Failed to copy:", err);
                      }
                    }}
                    className="absolute top-2 right-2 p-1.5 opacity-0 group-hover/textarea:opacity-100 transition-opacity bg-black border border-[#222] rounded hover:bg-[#222] flex items-center gap-2"
                  >
                    <AnimatePresence>
                      {copiedFront && (
                        <motion.span 
                          initial={{ opacity: 0, x: 5 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 5 }}
                          className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20"
                        >
                          Copiado
                        </motion.span>
                      )}
                    </AnimatePresence>
                    <Copy size={12} className="text-[#D4AF37]" />
                  </button>
               </div>
            </div>

            <div className="flex-1 border-l border-[#222] pl-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar shrink-0 bg-[#0c0c0c]/50">
               <div className="space-y-4 pt-1">
                  <div className="technical-box">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Camera size={12} className="text-[#D4AF37]" />
                      <span className="text-[9px] text-[#D4AF37] font-black uppercase tracking-widest">ÓPTICA & SENSOR</span>
                    </div>
                    <ul className="text-[10px] text-slate-400 space-y-1 list-none">
                      {(parsedFront.optics || scene.optics || 'Configurar en guion').split(',').map((o: string, i: number) => (
                        <li key={i} className="flex gap-2"><span className="text-[#D4AF37]/40">•</span> {o.trim()}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="technical-box">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Lightbulb size={12} className="text-[#D4AF37]" />
                      <span className="text-[9px] text-[#D4AF37] font-black uppercase tracking-widest">ILUMINACIÓN & ATMÓSFERA</span>
                    </div>
                    <ul className="text-[10px] text-slate-400 space-y-1 list-none">
                      {(parsedFront.lighting || scene.physics || 'Cinemática').split(',').map((l: string, i: number) => (
                        <li key={i} className="flex gap-2"><span className="text-[#D4AF37]/40">•</span> {l.trim()}</li>
                      ))}
                    </ul>
                  </div>
               </div>
            </div>
          </div>
        </div>

        {/* BACK: VIDEO MODE */}
        <div className={`absolute inset-0 backface-hidden rotate-y-180 rounded-xl border-2 bg-[#111] p-3 flex flex-col transition-all duration-300
            ${!isVideo ? "border-transparent opacity-0 pointer-events-none" : "border-violet-500 hover:shadow-[0_0_15px_rgba(139,92,246,0.1)] opacity-100"}`}
        >
          <header className="flex justify-between items-center mb-4 shrink-0 px-1">
            <div className="flex items-center gap-4">
              <div className="text-white font-bold tracking-widest text-[11px] uppercase flex items-center gap-2">
                PLANO #{index + 1}
                {showTranslateVideo && <span className="text-violet-400 text-[9px] border border-violet-500/50 rounded px-1">(EN)</span>}
              </div>
            </div>
            
            <div className="flex items-center gap-2.5">
               <div className="flex bg-black/60 rounded-lg p-0.5 border border-white/5">
                  <button onClick={() => setShowTranslateVideo(false)} className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${!showTranslateVideo ? 'bg-white/10 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>ES</button>
                  <button onClick={() => { setShowTranslateVideo(true); if (!scene.translatedVideoText) onTranslate(scene.id, "video"); }} className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${showTranslateVideo ? 'bg-white/10 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>EN</button>
               </div>
                <div className="flex gap-1 bg-black/60 p-1 rounded-lg border border-white/5 items-center">
                   <CardAction icon={Plus} onClick={() => duplicateScene(scene.id)} color="gold" tooltip="Nuevo Plano" />
                   <CardAction icon={ArrowRightLeft} onClick={handleFlip} color="violet" tooltip="Cambiar a Imagen" />
                   <CardAction icon={Trash} onDoubleClick={() => deleteScene(scene.id)} color="red" tooltip="Borrar (2x click)" />
                </div>
            </div>
          </header>

          <div className="flex flex-1 min-h-0 bg-[#0a0a0a] rounded-lg p-3 border border-[#222] gap-4 overflow-hidden">
            <div className="flex-[1.5] flex flex-col min-w-0">
               <div className={`relative shrink-0 mb-3 rounded-md overflow-hidden border border-[#222] transition-all bg-[#0a0a0a] h-24 group/img-back`}>
                 {scene.asset ? (
                   <img src={assetUrl} alt="Ref" className="w-full h-full object-contain" />
                 ) : (
                    <div className="w-full h-full flex items-center justify-center hover:bg-[#111] transition-colors border-2 border-dashed border-[#222]">
                       <Upload size={14} className="text-violet-400 opacity-50" />
                    </div>
                 )}
                 <input type="file" ref={fileInputRefBack} className="hidden" accept="image/*" onChange={handleFileSelect} />
                 
                 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img-back:opacity-100 transition-opacity flex flex-col justify-between p-1.5 pointer-events-none">
                    <div className="flex justify-end gap-1.5 pointer-events-auto">
                      <button onClick={() => fileInputRefBack.current?.click()} className="p-1 px-1.5 bg-black/80 rounded text-slate-400 border border-white/10 hover:text-white transition-all shadow-xl" title="Subir Imagen"><Upload size={12}/></button>
                      {scene.asset && (
                        <button onDoubleClick={() => updateScene(scene.id, { asset: undefined })} className="p-1 px-1.5 bg-black/80 rounded text-slate-400 border border-white/10 hover:text-red-400 transition-all shadow-xl" title="Borrar Imagen (2x click)"><Trash2 size={12}/></button>
                      )}
                    </div>
                    {scene.asset && (
                      <div className="flex justify-start pointer-events-auto">
                        <button onClick={() => setIsBackExpanded(true)} className="p-1 px-1.5 bg-black/80 rounded text-slate-400 border border-white/10 hover:text-white transition-all shadow-xl" title="Expandir"><Maximize2 size={12}/></button>
                      </div>
                    )}
                 </div>
               </div>

               <AnimatePresence>
                 {isBackExpanded && scene.asset && (
                   <motion.div 
                     initial={{ opacity: 0, scale: 0.9 }}
                     animate={{ opacity: 1, scale: 1 }}
                     exit={{ opacity: 0, scale: 0.9 }}
                     className="absolute inset-0 z-50 bg-[#050505] rounded-xl flex flex-col p-4 border-2 border-violet-500/30 shadow-[0_0_50px_rgba(0,0,0,0.8)]"
                   >
                     <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                        <div className="text-[10px] text-violet-400 font-black uppercase tracking-[.3em]">PREVISUALIZACIÓN DE VIDEO</div>
                        <button 
                          onClick={() => setIsBackExpanded(false)}
                          className="p-1.5 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-lg hover:bg-violet-500/20 transition-all"
                        >
                          <Minimize2 size={14} />
                        </button>
                     </div>
                     <div className="flex-1 relative overflow-hidden rounded-lg bg-black/40 border border-white/5">
                        <img 
                          src={assetUrl} 
                          alt="Expanded View" 
                          className="w-full h-full object-contain drop-shadow-[0_0_20px_rgba(139,92,246,0.1)]"
                        />
                     </div>
                   </motion.div>
                 )}
               </AnimatePresence>
               
               <div className={`relative flex-1 group/textarea min-h-[100px] ${!isEditingVideo ? 'cursor-text' : ''}`} onDoubleClick={() => setIsEditingVideo(true)}>
                  <textarea
                    className={`w-full h-full bg-[#111] border border-[#222] rounded p-3 text-xs leading-relaxed text-slate-300 outline-none resize-none custom-scrollbar ${!isEditingVideo ? 'pointer-events-none' : 'focus:border-violet-500/50'}`}
                    value={(showTranslateVideo ? (scene.translatedVideoText || "Traduciendo...") : scene.videoText).replace(/^(PLANO\s*)\d+/i, `$1${index + 1}`)}
                    onChange={(e) => updateScene(scene.id, showTranslateVideo ? { translatedVideoText: e.target.value } : { videoText: e.target.value })}
                    onBlur={() => setIsEditingVideo(false)}
                    ref={textareaRefVideo}
                  />
                  <button 
                    onClick={async () => { 
                      try {
                        const textToCopy = parsedBack.mainPrompt || scene.videoText;
                        await navigator.clipboard.writeText(textToCopy); 
                        setCopiedBack(true);
                        setTimeout(() => setCopiedBack(false), 2000);
                      } catch (err) {
                        console.error("Failed to copy:", err);
                      }
                    }}
                    className="absolute top-2 right-2 p-1.5 opacity-0 group-hover/textarea:opacity-100 transition-opacity bg-black border border-[#222] rounded hover:bg-[#222] flex items-center gap-2"
                  >
                    <AnimatePresence>
                      {copiedBack && (
                        <motion.span 
                          initial={{ opacity: 0, x: 5 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 5 }}
                          className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20"
                        >
                          Copiado
                        </motion.span>
                      )}
                    </AnimatePresence>
                    <Copy size={12} className="text-violet-400" />
                  </button>
               </div>
            </div>

            <div className="flex-1 border-l border-[#222] pl-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar shrink-0 bg-[#0c0c0c]/50">
               <div className="space-y-4 pt-1">
                  <div className="technical-box">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Camera size={12} className="text-violet-400" />
                      <span className="text-[9px] text-violet-400 font-black uppercase tracking-widest">CÁMARA & MOV.</span>
                    </div>
                    <ul className="text-[10px] text-slate-400 space-y-1 list-none">
                      {(parsedBack.cameraChoreography || scene.optics || 'Configurar...').split(',').map((o: string, i: number) => (
                        <li key={i} className="flex gap-2"><span className="text-violet-400/40">•</span> {o.trim()}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="technical-box">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Zap size={12} className="text-violet-400" />
                      <span className="text-[9px] text-violet-400 font-black uppercase tracking-widest">ACCIÓN / VFX</span>
                    </div>
                    <ul className="text-[10px] text-slate-400 space-y-1 list-none">
                      {((parsedBack.dynamics || parsedBack.vfx) || (scene.physics || 'Cinemática')).split(',').map((l: string, i: number) => (
                        <li key={i} className="flex gap-2"><span className="text-violet-400/40">•</span> {l.trim()}</li>
                      ))}
                      {parsedBack.vfxDetail && (
                        <li className="flex gap-2 border-t border-white/5 pt-1 mt-1 opacity-80 italic">
                          <span className="text-violet-400/40">+</span> {parsedBack.vfxDetail.trim()}
                        </li>
                      )}
                    </ul>
                  </div>

                  <div className="technical-box">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Music size={12} className="text-violet-400" />
                      <span className="text-[9px] text-violet-400 font-black uppercase tracking-widest">ATMÓSFERA SONORA</span>
                    </div>
                    <ul className="text-[10px] text-slate-400 space-y-1 list-none">
                      {(parsedBack.sound || 'Ambiente sordo').split(',').map((s: string, i: number) => (
                        <li key={i} className="flex gap-2"><span className="text-violet-400/40">•</span> {s.trim()}</li>
                      ))}
                    </ul>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
