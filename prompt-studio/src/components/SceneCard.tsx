import React, { useState, useRef, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
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
  CheckCircle2,
  Trash
} from "lucide-react";
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
}

// Helper for parsing script text into prompt and metadata
const parseScriptText = (text: string): ParsedMetadata => {
  const metadata: Record<string, string> = {};
  let optics = "";
  let lighting = "";
  let audio = "";
  let dynamics = "";
  let mainPrompt = text;
  
  const rules = [
    { key: 'Óptica & Sensor', field: 'optics' as const, regex: /(?:Óptica & Sensor|Óptica|Cámara|Lente):\s*(.*?)(?=\n|$)/i },
    { key: 'Iluminación & Atmósfera', field: 'lighting' as const, regex: /(?:Iluminación & Atmósfera|Iluminación|Luz|Atmósfera):\s*(.*?)(?=\n|$)/i },
    { key: 'Música & Audio', field: 'audio' as const, regex: /(?:Música & Sonido|Música|Audio):\s*(.*?)(?=\n|$)/i },
    { key: 'Efecto & Dinámica', field: 'dynamics' as const, regex: /(?:Efecto & Física|Efecto|Efectos|Física|Dinámica):\s*(.*?)(?=\n|$)/i },
  ];

  rules.forEach(({key, field, regex}) => {
    const match = text.match(regex);
    if (match) {
       metadata[key] = match[1];
       if (field === 'optics') optics = match[1];
       if (field === 'lighting') lighting = match[1];
       if (field === 'audio') audio = match[1];
       if (field === 'dynamics') dynamics = match[1];
    }
  });

  const visualMatch = text.match(/(?:Visual Instruction|Visual):\s*(.*?)(?=\n\n|\n[A-ZÁÉÍÓÚÑa-z]+[a-zA-Z\s&]*:|$)/s);
  if (visualMatch) {
    mainPrompt = visualMatch[1].trim();
  } else {
    let temp = text;
    rules.forEach(({regex}) => { temp = temp.replace(new RegExp(regex.source, 'gi'), ''); });
    temp = temp.replace(/SECCIÓN.*?\n/g, '').replace(/PLANO.*?\n/g, '').replace(/###.*?\n/g, '').replace(/##.*?\n/g, '');
    mainPrompt = temp.trim();
  }
  
  return { mainPrompt, metadata, optics, lighting, audio, dynamics };
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
  

  const fileInputRefFront = useRef<HTMLInputElement>(null);
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

  const assetUrl = useMemo(() => {
    if (!scene.asset) return undefined;
    if (scene.asset.startsWith('http') || scene.asset.startsWith('data:')) return scene.asset;
    return `asset://${scene.asset}`;
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
          <header className="flex justify-between items-center mb-2 shrink-0 px-1">
            <div className="text-white font-bold tracking-widest text-sm uppercase flex items-center gap-2">
              ESCENA #{index + 1}
              {showTranslateImage && <span className="text-[#D4AF37] text-[9px] border border-[#D4AF37]/50 rounded px-1">(EN)</span>}
            </div>
            
            <div className="flex items-center gap-3">
              {scene.asset && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-bold rounded uppercase tracking-widest bg-[#D4AF37] text-black">
                  <CheckCircle2 size={10} /> DISEÑADA
                </div>
              )}
            </div>
          </header>

          <div className="flex items-center justify-between mb-3 shrink-0 px-1">
             <div className="flex bg-black rounded-md p-0.5 border border-[#333]">
                <button onClick={() => setShowTranslateImage(false)} className={`px-2 py-0.5 text-[9px] font-bold rounded transition-all ${!showTranslateImage ? 'bg-[#222] text-white' : 'text-slate-500 hover:text-white'}`}>ES</button>
                <button onClick={() => { setShowTranslateImage(true); if (!scene.translatedImageText) onTranslate(scene.id, "image"); }} className={`px-2 py-0.5 text-[9px] font-bold rounded transition-all ${showTranslateImage ? 'bg-[#222] text-white' : 'text-slate-500 hover:text-white'}`}>EN</button>
              </div>
              <div className="flex gap-1 bg-black p-1 rounded-lg border border-[#333] items-center">
                <CardAction icon={Plus} onClick={() => duplicateScene(scene.id)} color="gold" tooltip="Nueva Escena" />
                <CardAction icon={ArrowRightLeft} onClick={handleFlip} color="violet" tooltip="Cambiar a Video" />
                <CardAction icon={Trash} onDoubleClick={() => deleteScene(scene.id)} color="red" tooltip="Borrar (2x click)" />
              </div>
          </div>

          <div className="flex flex-1 min-h-0 bg-[#0a0a0a] rounded-lg p-3 border border-[#222] gap-4 overflow-hidden">
            <div className="flex-[1.5] flex flex-col min-w-0">

               <div className={`relative shrink-0 mb-3 rounded-md overflow-hidden border border-[#222] transition-all bg-[#0a0a0a] ${isFrontExpanded ? 'h-40' : 'h-24'}`}>
                 {scene.asset ? (
                   <img src={assetUrl} alt="Ref" className="w-full h-full object-contain" />
                 ) : (
                    <div onClick={() => fileInputRefFront.current?.click()} className="w-full h-full flex items-center justify-center cursor-pointer hover:bg-[#111] transition-colors border-2 border-dashed border-[#222]">
                       <Upload size={14} className="text-[#D4AF37] opacity-50" />
                    </div>
                 )}
                 <input type="file" ref={fileInputRefFront} className="hidden" accept="image/*" onChange={handleFileSelect} />
                 {scene.asset && (
                    <div className="absolute bottom-2 right-2 flex gap-1">
                       <button onClick={() => setIsFrontExpanded(!isFrontExpanded)} className="p-1 bg-black/60 rounded text-white/50 hover:text-white"><Maximize2 size={12}/></button>
                       <button onClick={() => updateScene(scene.id, { asset: undefined })} className="p-1 bg-black/60 rounded text-red-400/50 hover:text-red-400"><Trash2 size={12}/></button>
                    </div>
                 )}
               </div>
               
               <div className={`relative flex-1 group/textarea min-h-[100px] ${!isEditingImage ? 'cursor-text' : ''}`} onDoubleClick={() => setIsEditingImage(true)}>
                  <textarea
                    className={`w-full h-full bg-[#111] border border-[#222] rounded p-3 text-xs leading-relaxed text-slate-300 outline-none resize-none custom-scrollbar ${!isEditingImage ? 'pointer-events-none' : 'focus:border-[#D4AF37]/50'}`}
                    value={showTranslateImage ? (scene.translatedImageText || "Traduciendo...") : scene.imageText}
                    onChange={(e) => updateScene(scene.id, showTranslateImage ? { translatedImageText: e.target.value } : { imageText: e.target.value })}
                    onBlur={() => setIsEditingImage(false)}
                    ref={textareaRefImage}
                  />
                  <button 
                    onClick={() => { navigator.clipboard.writeText(parsedFront.mainPrompt); alert("Prompt visual copiado."); }}
                    className="absolute top-2 right-2 p-1.5 opacity-0 group-hover/textarea:opacity-100 transition-opacity bg-black border border-[#222] rounded hover:bg-[#222]"
                  >
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

                  {(parsedFront.audio || parsedFront.dynamics) && (
                    <div className="technical-box opacity-60">
                       <div className="flex items-center gap-2 mb-1.5 border-t border-[#222] pt-3">
                        <Music size={12} className="text-slate-500" />
                        <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">DETALLES EXTRA</span>
                      </div>
                      <p className="text-[9px] text-slate-500 italic px-3">{parsedFront.audio} {parsedFront.dynamics}</p>
                    </div>
                  )}
               </div>
            </div>
          </div>
        </div>

        {/* BACK: VIDEO MODE */}
        <div className={`absolute inset-0 backface-hidden rotate-y-180 rounded-xl border-2 bg-[#111] p-3 flex flex-col transition-all duration-300
            ${!isVideo ? "border-transparent opacity-0 pointer-events-none" : "border-violet-500 hover:shadow-[0_0_15px_rgba(139,92,246,0.1)] opacity-100"}`}
        >
          <header className="flex justify-between items-center mb-2 shrink-0 px-1">
            <div className="text-white font-bold tracking-widest text-sm uppercase flex items-center gap-2">
              ESCENA #{index + 1}
              {showTranslateVideo && <span className="text-violet-400 text-[9px] border border-violet-500/50 rounded px-1">(EN)</span>}
            </div>

            <div className="flex items-center gap-3">
               {scene.asset && <div className="px-2 py-0.5 text-[9px] font-bold rounded uppercase tracking-widest bg-violet-600 text-white">READY</div>}

            </div>
          </header>

          <div className="flex items-center justify-between mb-3 shrink-0 px-1">
             <div className="flex bg-black rounded-md p-0.5 border border-[#333]">
                <button onClick={() => setShowTranslateVideo(false)} className={`px-2 py-0.5 text-[9px] font-bold rounded transition-all ${!showTranslateVideo ? 'bg-[#222] text-white' : 'text-slate-500 hover:text-white'}`}>ES</button>
                <button onClick={() => { setShowTranslateVideo(true); if (!scene.translatedVideoText) onTranslate(scene.id, "video"); }} className={`px-2 py-0.5 text-[9px] font-bold rounded transition-all ${showTranslateVideo ? 'bg-[#222] text-white' : 'text-slate-500 hover:text-white'}`}>EN</button>
              </div>
              <div className="flex gap-1 bg-black p-1 rounded-lg border border-[#333] items-center">
                <CardAction icon={Plus} onClick={() => duplicateScene(scene.id)} color="gold" tooltip="Nueva Escena" />
                <CardAction icon={ArrowRightLeft} onClick={handleFlip} color="violet" tooltip="Cambiar a Imagen" />
                <CardAction icon={Trash} onDoubleClick={() => deleteScene(scene.id)} color="red" tooltip="Borrar (2x click)" />
              </div>
          </div>

          <div className="flex flex-1 min-h-0 bg-[#0a0a0a] rounded-lg p-3 border border-[#222] gap-4">
             <div className="flex-[1.5] flex flex-col min-w-0">
                <div className="text-[10px] text-violet-400 font-bold uppercase tracking-widest mb-2 opacity-70">VIDEO PROMPT</div>
                <div className={`relative flex-1 group/textarea min-h-[120px] ${!isEditingVideo ? 'cursor-text' : ''}`} onDoubleClick={() => setIsEditingVideo(true)}>
                    <textarea
                      className={`w-full h-full bg-[#111] border border-[#222] rounded p-3 text-xs leading-relaxed text-slate-300 outline-none resize-none custom-scrollbar ${!isEditingVideo ? 'pointer-events-none' : 'focus:border-violet-500/50'}`}
                      value={showTranslateVideo ? (scene.translatedVideoText || "Traduciendo...") : scene.videoText}
                      onChange={(e) => updateScene(scene.id, showTranslateVideo ? { translatedVideoText: e.target.value } : { videoText: e.target.value })}
                      onBlur={() => setIsEditingVideo(false)}
                      ref={textareaRefVideo}
                    />
                    <button 
                      onClick={() => { navigator.clipboard.writeText(parsedBack.mainPrompt); alert("Video prompt copiado."); }}
                      className="absolute top-2 right-2 p-1.5 opacity-0 group-hover/textarea:opacity-100 transition-opacity bg-black border border-[#222] rounded hover:bg-[#222]"
                    >
                      <Copy size={12} className="text-violet-400" />
                    </button>
                </div>
             </div>
             
             <div className="flex-1 border-l border-[#222] pl-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar shrink-0">
                <div className="technical-box">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Camera size={12} className="text-violet-400" />
                    <span className="text-[9px] text-violet-400 font-bold uppercase tracking-widest">ÓPTICA & SENSOR</span>
                  </div>
                  <ul className="text-[10px] text-slate-400 space-y-1 list-none">
                      {(parsedBack.optics || scene.optics || 'Configurar...').split(',').map((o: string, i: number) => (
                        <li key={i} className="flex gap-2"><span className="text-violet-400/40">•</span> {o.trim()}</li>
                      ))}
                  </ul>
                </div>
                
                <div className="technical-box">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Zap size={12} className="text-violet-400" />
                    <span className="text-[9px] text-violet-400 font-bold uppercase tracking-widest">DINÁMICA</span>
                  </div>
                  <ul className="text-[10px] text-slate-400 space-y-1 list-none">
                      {(parsedBack.lighting || scene.physics || 'Flow cinematic').split(',').map((l: string, i: number) => (
                        <li key={i} className="flex gap-2"><span className="text-violet-400/40">•</span> {l.trim()}</li>
                      ))}
                  </ul>
                </div>
             </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
