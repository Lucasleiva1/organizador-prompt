import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  Copy,
  Trash2,
  FolderPlus,
  Languages,
  Upload,
  Play,
  Image as ImageIcon,
  FileText,
  ArrowRightLeft,
  Clapperboard,
  Moon,
  Monitor,
  Sun,
  Plus,
  Sparkles,
  Search,
  LayoutGrid,
  MonitorPlay,
  Wand2,
  Bot,
  Loader2,
  Undo2,
  Redo2,
  Hash,
} from "lucide-react";
import { load } from "@tauri-apps/plugin-store";
import "./App.css";

interface Scene {
  id: string;
  imageText: string;
  videoText: string;
  translatedImageText?: string;
  translatedVideoText?: string;
  mode: "image" | "video";
  asset: string | null;
}

// --- Custom Hooks ---

const PROTECTED_TERMS = [
  "slow motion", "dolly zoom", "dolly", "tracking shot", "pan", "tilt", 
  "pedestal", "drone", "fpv", "bokeh", "cinematic", "film", "grain", 
  "lens", "focal length", "close up", "wide angle", "hyperlapse", 
  "timelapse", "fps", "glitch", "vfx", "dolpy", "cgi", "rendering", 
  "unreal engine", "octane render", "zoom", "blur", "focus", "tracking",
  "steadycam", "gimbal"
];

const useTranslate = () => {
  const [translating, setTranslating] = useState(false);

  const translate = async (text: string, toEnglish: boolean): Promise<string> => {
    if (!text.trim()) return text;
    setTranslating(true);
    try {
      let processText = text;
      const map: Record<string, string> = {};
      let counter = 0;

      // Protect technical terms (case-insensitive)
      PROTECTED_TERMS.forEach(term => {
        const regex = new RegExp(`\\b${term}\\b`, 'gi');
        processText = processText.replace(regex, (match) => {
          const placeholder = `__PT${counter}__`;
          map[placeholder] = match;
          counter++;
          return placeholder;
        });
      });

      const sourceLang = toEnglish ? "es" : "en";
      const targetLang = toEnglish ? "en" : "es";
      const response = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(processText)}`
      );
      const data = await response.json();
      let finalTranslation = data[0].map((item: any) => item[0]).join('');

      // Restore technical terms
      Object.keys(map).forEach(placeholder => {
        finalTranslation = finalTranslation.replace(new RegExp(placeholder, 'gi'), map[placeholder]);
      });

      return finalTranslation;
    } catch (error) {
      console.error("Translation error:", error);
      return text;
    } finally {
      setTranslating(false);
    }
  };

  return { translate, translating };
};

const useSceneStore = () => {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    const initStore = async () => {
      const timeout = setTimeout(() => {
        if (mounted && loading) {
          console.warn("PROMPT_STUDIO: Store timeout, starting empty.");
          setLoading(false);
        }
      }, 3000);

      try {
        const s = await load("scenes.json", { autoSave: false, defaults: { scenes: [] } });
        if (!mounted) return;
        setStore(s);
        const saved = await s.get<Scene[]>("scenes");
        if (mounted && saved && Array.isArray(saved)) {
          setScenes(saved);
        }
      } catch (e) {
        console.error("PROMPT_STUDIO: Error loading scenes:", e);
      } finally {
        if (mounted) {
          clearTimeout(timeout);
          setLoading(false);
        }
      }
    };
    initStore();
    return () => { mounted = false; };
  }, []);

  const saveScenes = async (newScenes: Scene[]) => {
    setScenes(newScenes);
    if (store) {
      try {
        await store.set("scenes", newScenes);
        await store.save();
      } catch (e) {
        console.error("PROMPT_STUDIO: Error saving scenes:", e);
      }
    }
  };

  return { scenes, saveScenes, loading };
};

// --- Undo/Redo Hook ---

const useUndoRedo = (scenes: Scene[], saveScenes: (s: Scene[]) => void) => {
  const historyRef = useRef<Scene[][]>([]);
  const futureRef = useRef<Scene[][]>([]);
  const skipRef = useRef(false);

  const pushHistory = (currentScenes: Scene[]) => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    historyRef.current = [...historyRef.current.slice(-20), currentScenes];
    futureRef.current = [];
  };

  const undo = () => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current.pop()!;
    futureRef.current.push([...scenes]);
    skipRef.current = true;
    saveScenes(prev);
  };

  const redo = () => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.pop()!;
    historyRef.current.push([...scenes]);
    skipRef.current = true;
    saveScenes(next);
  };

  return { pushHistory, undo, redo, canUndo: historyRef.current.length > 0, canRedo: futureRef.current.length > 0 };
};

// --- AI Ordering Hook (Qwen 3 Local via Ollama) ---

const OLLAMA_URL = "http://127.0.0.1:11434";

const useAIOrder = () => {
  const [ordering, setOrdering] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);

  const checkOllama = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  };

  const orderScenes = async (scenes: Scene[]): Promise<Scene[] | null> => {
    if (scenes.length < 2) {
      setAiStatus("⚠ Necesitás al menos 2 escenas para ordenar");
      setTimeout(() => setAiStatus(null), 3000);
      return null;
    }

    setOrdering(true);
    setAiStatus("Verificando Ollama...");

    try {
      const isAvailable = await checkOllama();
      if (!isAvailable) {
        throw new Error("Ollama no está corriendo. Abrí Ollama primero.");
      }

      setAiStatus("Enviando escenas a Qwen 3...");

      // Build scene summaries for the AI
      const sceneSummaries = scenes.map((s, i) => {
        const img = s.imageText ? s.imageText.slice(0, 150).replace(/\n/g, " ") : "(vacío)";
        const vid = s.videoText ? s.videoText.slice(0, 150).replace(/\n/g, " ") : "(vacío)";
        return `[${i}] IMG: "${img}" | VID: "${vid}"`;
      }).join("\n");

      const systemPrompt = `You are a scene ordering assistant. You ONLY return comma-separated index numbers. No explanations, no text, no markdown. Example output: 2,0,3,1,4`;

      const userPrompt = `Order these ${scenes.length} scenes in optimal narrative sequence. Return ONLY the indices as comma-separated numbers.\n\n${sceneSummaries}\n\nOrder:`;

      setAiStatus("Analizando con IA local...");

      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen3:0.6b",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          stream: false,
          options: { temperature: 0.1, num_predict: 200 },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Ollama respondió con error: ${errText.slice(0, 100)}`);
      }

      const data = await response.json();
      let rawResponse = data.message?.content?.trim() || "";
      
      console.log("AI raw response:", rawResponse);

      // Clean thinking tags if present (Qwen 3 sometimes wraps in <think>)
      rawResponse = rawResponse.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      
      // Extract all numbers from the response
      const allNumbers = rawResponse.match(/\d+/g);
      if (!allNumbers || allNumbers.length === 0) {
        throw new Error("La IA no devolvió índices válidos");
      }

      const indices = allNumbers.map(Number);
      
      // Validate and deduplicate
      const validIndices = indices.filter((i: number) => i >= 0 && i < scenes.length);
      const uniqueIndices: number[] = [];
      const seen = new Set<number>();
      for (const idx of validIndices) {
        if (!seen.has(idx)) {
          seen.add(idx);
          uniqueIndices.push(idx);
        }
      }

      // Fill in any missing indices
      if (uniqueIndices.length < scenes.length) {
        for (let i = 0; i < scenes.length; i++) {
          if (!seen.has(i)) {
            uniqueIndices.push(i);
          }
        }
      }

      // Reorder WITHOUT modifying content
      const reordered = uniqueIndices.slice(0, scenes.length).map(i => scenes[i]);

      setAiStatus(`✓ ${scenes.length} escenas reordenadas por IA`);
      setTimeout(() => setAiStatus(null), 4000);

      return reordered;
    } catch (error: any) {
      console.error("AI Order error:", error);
      setAiStatus(`✗ Error: ${error.message}`);
      setTimeout(() => setAiStatus(null), 5000);
      return null;
    } finally {
      setOrdering(false);
    }
  };

  return { orderScenes, ordering, aiStatus };
};

// --- Components ---

const SceneCard = ({
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
              <img src={scene.asset} alt="Ref" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-sm">
                <button onClick={() => updateScene(scene.id, { asset: undefined })} className="p-2 bg-red-500 hover:bg-red-600 rounded-xl text-white shadow-xl transition-transform hover:scale-110">
                  <Trash2 size={14} />
                </button>
              </div>
            </motion.div>
          )}
        </div>

        {/* BACK: VIDEO MODE */}
        <div
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

const CardAction = ({ icon: Icon, onClick, onDoubleClick, disabled, color, tooltip }: any) => {
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

// --- Main Application ---

function App() {
  const { scenes, saveScenes, loading } = useSceneStore();
  const [theme, setTheme] = useState<'dark' | 'inter' | 'light'>(() => {
    return (localStorage.getItem('ps-theme') as any) || 'inter';
  });
  useEffect(() => { localStorage.setItem('ps-theme', theme); }, [theme]);
  const [imageMarkdown, setImageMarkdown] = useState("");
  const [videoMarkdown, setVideoMarkdown] = useState("");

  const [isTranslateEn, setIsTranslateEn] = useState(false);
  const [search, setSearch] = useState("");
  const [globalMode, setGlobalMode] = useState<"image" | "video" | null>(null);
  const { translate } = useTranslate();
  const { orderScenes, ordering, aiStatus } = useAIOrder();
  const { pushHistory, undo, redo, canUndo, canRedo } = useUndoRedo(scenes, saveScenes);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Track scene changes for undo
  const prevScenesRef = useRef<Scene[]>([]);
  useEffect(() => {
    if (prevScenesRef.current.length > 0 && prevScenesRef.current !== scenes) {
      pushHistory(prevScenesRef.current);
    }
    prevScenesRef.current = scenes;
  }, [scenes]);

  // --- Smart Markdown Parser ---

  const cleanCell = (cell: string): string => {
    return cell
      .replace(/\*\*/g, '')           // Remove bold markers
      .replace(/\*([^*]+)\*/g, '$1')  // Remove italic markers
      .replace(/`([^`]+)`/g, '$1')    // Remove code markers
      .replace(/^\s*\|\s*/, '')       // Remove leading pipe
      .replace(/\s*\|\s*$/, '')       // Remove trailing pipe
      .trim();
  };

  const parseMarkdownTable = (text: string, defaultSection: 'image' | 'video' = 'image'): Scene[] => {
    const lines = text.split('\n');
    const newScenes: Scene[] = [];
    
    let currentSection: 'image' | 'video' | null = defaultSection;
    let inTable = false;
    let headerSkipped = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Detect section headers
      if (/im[aá]gen|est[aá]tic|foto|photo|static|image/i.test(line) && /^#+\s|^##/.test(line)) {
        currentSection = 'image';
        inTable = false;
        headerSkipped = false;
        continue;
      }
      if (/video|movimiento|motion|animaci[oó]n|din[aá]mic/i.test(line) && /^#+\s|^##/.test(line)) {
        currentSection = 'video';
        inTable = false;
        headerSkipped = false;
        continue;
      }

      // Also detect section from emoji headers without ##
      if (/📸|🖼️/.test(line) && /im[aá]gen|est[aá]tic/i.test(line)) {
        currentSection = 'image';
        inTable = false;
        headerSkipped = false;
        continue;
      }
      if (/🎥|🎬|📹/.test(line) && /video|movimiento/i.test(line)) {
        currentSection = 'video';
        inTable = false;
        headerSkipped = false;
        continue;
      }
      
      // Skip non-table lines
      if (!line.startsWith('|')) {
        if (inTable && line === '') {
          inTable = false;
          headerSkipped = false;
        }
        continue;
      }

      // We're in a table row
      inTable = true;

      // Skip separator rows (| :--- | :--- |) and header rows
      if (/^[\|\s:\-]+$/.test(line)) {
        continue;
      }

      // Skip the header row (first row with column titles)  
      if (!headerSkipped) {
        // Check if this looks like a header (contains #, Título, Escena, Descripción, etc.)
        if (/título|escena|descripci[oó]n|direcci[oó]n|c[aá]mara|#/i.test(line)) {
          headerSkipped = true;
          continue;
        }
      }

      // Parse data row: | **1** | **Title** | Description |
      const cells = line.split('|').map(c => cleanCell(c)).filter(c => c !== '');
      
      if (cells.length < 2) continue;

      // The description/prompt is typically the LAST column
      const description = cells[cells.length - 1];
      // The title is the second column (if exists)
      const title = cells.length >= 3 ? cells[1] : '';
      
      if (!description || description.length < 10) continue;

      // Determine mode: use section context, or default to image
      const mode = currentSection || 'image';
      
      const sceneText = title ? `${title}: ${description}` : description;

      newScenes.push({
        id: crypto.randomUUID(),
        imageText: mode === 'image' ? sceneText : '',
        videoText: mode === 'video' ? sceneText : '',
        mode: mode,
        asset: null,
      });
    }

    return newScenes;
  };

  const parseSimpleText = (rawText: string, mode: "image" | "video"): Scene[] => {
    // Try splitting by numbered patterns: "1 Title", "1. Title", etc.
    const lines = rawText.split('\n');
    const chunks: string[] = [];
    let currentChunk = "";
    // Allow markdown bold markers before the number, and catch the number.
    const numberPattern = /^\s*(?:\*\*)?\d+[\s\.\-\)]+\s*(?:\*\*)?[A-ZÁÉÍÓÚÑ]/;
    let inList = false;

    for (const line of lines) {
      if (numberPattern.test(line)) {
        if (inList && currentChunk.trim()) {
           chunks.push(currentChunk.trim());
        }
        currentChunk = line + "\n";
        inList = true;
      } else {
        if (inList) currentChunk += line + "\n";
      }
    }
    if (inList && currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    const finalParts = chunks.length > 0 ? chunks : [rawText.trim()];

    return finalParts.map((p) => {
      // Clean common prefixes
      let cleaned = p.trim()
        .replace(/^\s*(?:\*\*)?\d+[\s\.\-\)]+\s*(?:\*\*)?/, '')  // Remove numbering and markers
        .replace(/^[\s🎥📸#*:]+/, '')        // Remove emoji/md markers
        .trim();

      return {
        id: crypto.randomUUID(),
        imageText: mode === "image" ? cleaned : "",
        videoText: mode === "video" ? cleaned : "",
        mode: mode,
        asset: null,
      };
    });
  };

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
    
    const updatedScenes = [...scenes];
    
    newPrompts.forEach((prompt, index) => {
      if (updatedScenes[index]) {
        if (mode === 'image') updatedScenes[index].imageText = prompt;
        if (mode === 'video') updatedScenes[index].videoText = prompt;
      } else {
        updatedScenes.push({
          id: crypto.randomUUID(),
          imageText: mode === 'image' ? prompt : '',
          videoText: mode === 'video' ? prompt : '',
          mode: mode,
          asset: null
        });
      }
    });

    saveScenes(updatedScenes);
    if (mode === 'image') setImageMarkdown('');
    if (mode === 'video') setVideoMarkdown('');
  };

  const importMarkdown = (rawText: string) => {
    if (!rawText.trim()) return;

    // Detect if input contains markdown tables
    const hasTable = rawText.includes('|') && (rawText.match(/\|/g) || []).length > 5;
    
    let parsedRawScenes: Scene[];
    
    if (hasTable) {
      parsedRawScenes = parseMarkdownTable(rawText);
    } else {
      // Fallback: detect if it has image and video sections
      const hasImageSection = /im[aá]gen|est[aá]tic|📸/i.test(rawText);
      const hasVideoSection = /video|movimiento|🎥/i.test(rawText);
      
      if (hasImageSection && hasVideoSection) {
        // Split at video section and parse each half
        const videoSplit = rawText.split(/(?=##\s*🎥|(?:^|\n).*video.*prompts?)/i);
        const imagePart = videoSplit[0] || '';
        const videoPart = videoSplit.slice(1).join('\n') || '';
        
        parsedRawScenes = [
          ...parseSimpleText(imagePart, 'image'),
          ...parseSimpleText(videoPart, 'video'),
        ];
      } else {
        parsedRawScenes = parseSimpleText(rawText, 'image');
      }
    }

    // Now, instead of adding them as separate scenes, we pair up the "image" and "video" prompts
    // so they become single "flip cards" (one scene with both imageText and videoText).
    const imagePrompts = parsedRawScenes.filter(s => s.mode === 'image').map(s => s.imageText);
    const videoPrompts = parsedRawScenes.filter(s => s.mode === 'video').map(s => s.videoText);

    let newScenes: Scene[] = [];
    const maxLength = Math.max(imagePrompts.length, videoPrompts.length);

    if (maxLength === 0) {
      // Ultimate fallback: just create one scene with everything
      newScenes = [{
        id: crypto.randomUUID(),
        imageText: rawText.trim(),
        videoText: '',
        mode: 'image',
        asset: null,
      }];
    } else {
      // Pair them up
      for (let i = 0; i < maxLength; i++) {
        newScenes.push({
          id: crypto.randomUUID(),
          imageText: imagePrompts[i] || '',
          videoText: videoPrompts[i] || '',
          mode: imagePrompts[i] ? 'image' : 'video',
          asset: null
        });
      }
    }

    saveScenes([...scenes, ...newScenes]);
  };

  const updateScene = (id: string, data: Partial<Scene>) => {
    saveScenes(scenes.map((s) => (s.id === id ? { ...s, ...data } : s)));
  };

  const deleteScene = (id: string) => {
    saveScenes(scenes.filter((s) => s.id !== id));
  };

  // REC 1: Duplicate scene
  const duplicateScene = (id: string) => {
    const scene = scenes.find(s => s.id === id);
    if (!scene) return;
    const idx = scenes.indexOf(scene);
    const clone: Scene = { id: crypto.randomUUID(), imageText: "", videoText: "", mode: scene.mode, asset: null };
    const newScenes = [...scenes];
    newScenes.splice(idx + 1, 0, clone);
    saveScenes(newScenes);
  };

  const handleTranslate = async (id: string, mode: "image" | "video") => {
    const scene = scenes.find((s) => s.id === id);
    if (!scene) return;
    const currentText = mode === "video" ? scene.videoText : scene.imageText;
    if (!currentText.trim()) return;
    const translated = await translate(currentText, isTranslateEn);
    updateScene(id, mode === "video" ? { translatedVideoText: translated } : { translatedImageText: translated });
  };

  const flipAll = (mode: "image" | "video") => {
    saveScenes(scenes.map(s => ({ ...s, mode })));
    setGlobalMode(mode);
  };

  const handleAIOrder = async () => {
    const reordered = await orderScenes(scenes);
    if (reordered) {
      saveScenes(reordered);
    }
  };

  // REC 2 & 3: Export functions with numbering
  const exportAll = () => {
    const text = scenes.map((s, i) => 
      `ESCENA #${i + 1}\nIMAGEN: ${s.imageText || "-"}\nVIDEO: ${s.videoText || "-"}`
    ).join("\n\n---\n\n");
    navigator.clipboard.writeText(text);
  };

  const exportImages = () => {
    const text = scenes
      .filter(s => s.imageText.trim())
      .map((s, i) => `Escena ${i + 1}: ${s.imageText}`)
      .join("\n\n");
    navigator.clipboard.writeText(text);
  };

  const exportVideos = () => {
    const text = scenes
      .filter(s => s.videoText.trim())
      .map((s, i) => `Escena ${i + 1}: ${s.videoText}`)
      .join("\n\n");
    navigator.clipboard.writeText(text);
  };

  // REC 5: Import from file
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        importMarkdown(text);
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // Reset
  };

  // REC 7: Import image reference
  const handleImageRef = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/"));
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        saveScenes([...scenes, {
          id: crypto.randomUUID(),
          imageText: "",
          videoText: "",
          mode: "image",
          asset: ev.target?.result as string,
        }]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        saveScenes([...scenes, {
          id: crypto.randomUUID(),
          imageText: "",
          videoText: "",
          mode: "image",
          asset: ev.target?.result as string,
        }]);
      };
      reader.readAsDataURL(file);
    }
  }, [scenes, saveScenes]);

  const filteredScenes = useMemo(() => {
    const filtered = !search.trim() ? scenes : scenes.filter(s => 
      s.imageText.toLowerCase().includes(search.toLowerCase()) || 
      s.videoText.toLowerCase().includes(search.toLowerCase())
    );
    return filtered;
  }, [scenes, search]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  if (loading) {
    return (
      <div className={`theme-${theme} min-h-screen bg-[#020617] flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-6">
          <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <div className="text-emerald-400 font-black tracking-[0.3em] text-sm animate-pulse">PROMPT STUDIO</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`theme-${theme} min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-emerald-500/30 overflow-x-hidden`} onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
      
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept=".txt,.md,.csv" className="hidden" onChange={handleFileImport} />
      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageRef} />

      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-500/5 blur-[120px] rounded-full" />
      </div>

      {/* Main Navbar */}
      <nav className="sticky top-0 z-[60] p-4 lg:p-6">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center gap-3 bg-slate-900/40 backdrop-blur-2xl border border-white/5 p-3 lg:p-4 rounded-[2rem] shadow-2xl">
          
          {/* Logo */}
          <div className="flex items-center gap-3 px-3 mr-2 border-r border-white/5">
            <div className="w-9 h-9 bg-gradient-to-tr from-emerald-500 to-violet-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Sparkles className="text-white" size={18} />
            </div>
            <h1 className="text-base font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 hidden lg:block">PROMPT STUDIO</h1>
          </div>

          {/* Action buttons */}
          <div className="hidden xl:flex items-center gap-1">
            <NavButton icon={FolderPlus} label="Importar" onClick={() => fileInputRef.current?.click()} />
            <NavButton icon={Upload} label="Imagen Ref" onClick={() => imageInputRef.current?.click()} />
            
            {/* Export dropdown */}
            <div className="relative group/export">
              <NavButton icon={Copy} label="Exportar" color="emerald" onClick={exportAll} />
              <div className="absolute top-full left-0 mt-1 bg-slate-800/95 backdrop-blur-xl border border-white/10 rounded-xl p-1 opacity-0 invisible group-hover/export:opacity-100 group-hover/export:visible transition-all z-50 min-w-[160px] shadow-2xl">
                <button onClick={exportAll} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-all">
                  <Copy size={12} /> Todo
                </button>
                <button onClick={exportImages} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-emerald-400 hover:bg-emerald-500/10 transition-all">
                  <ImageIcon size={12} /> Solo Imágenes
                </button>
                <button onClick={exportVideos} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-violet-400 hover:bg-violet-500/10 transition-all">
                  <Clapperboard size={12} /> Solo Videos
                </button>
              </div>
            </div>

            {/* AI Order button */}
            <button
              onClick={handleAIOrder}
              disabled={ordering || scenes.length < 2}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all
                ${ordering 
                  ? "bg-amber-500/20 text-amber-400 cursor-wait" 
                  : "bg-gradient-to-r from-emerald-500/10 to-violet-500/10 text-amber-400 hover:from-emerald-500/20 hover:to-violet-500/20 hover:text-amber-300 border border-amber-500/20"
                } disabled:opacity-40`}
              title="Ordenar escenas con IA (Qwen 3 local)"
            >
              {ordering ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
              {ordering ? "Ordenando..." : "IA Ordenar"}
            </button>

            {/* Undo / Redo */}
            <div className="flex items-center bg-slate-800/40 rounded-xl border border-white/5 ml-1">
              <button onClick={undo} disabled={!canUndo} className="p-2 text-slate-400 hover:text-white disabled:opacity-20 transition-all" title="Deshacer (Ctrl+Z)">
                <Undo2 size={15} />
              </button>
              <div className="w-px h-5 bg-white/5" />
              <button onClick={redo} disabled={!canRedo} className="p-2 text-slate-400 hover:text-white disabled:opacity-20 transition-all" title="Rehacer (Ctrl+Y)">
                <Redo2 size={15} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-md mx-2 relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors" size={15} />
            <input 
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..." 
              className="w-full bg-slate-800/40 border border-white/5 rounded-xl py-2 pl-10 pr-3 outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all text-sm"
            />
          </div>

          {/* Mode toggle + translate + theme */}
          <div className="flex items-center gap-2">
            <NavButton icon={Trash2} label="LIMPIAR TODO" onClick={() => { if (confirm("¿Estás seguro de eliminar todas las escenas?")) saveScenes([]); }} color="red" />
            
            <div className="flex items-center bg-slate-800/60 p-1 rounded-xl border border-white/5">
              <button onClick={() => setTheme('dark')} className={`p-1.5 rounded-lg transition-all ${theme === 'dark' ? 'bg-black text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`} title="Oscuro Neón"><Moon size={14}/></button>
              <button onClick={() => setTheme('inter')} className={`p-1.5 rounded-lg transition-all ${theme === 'inter' ? 'bg-slate-700 text-cyan-300 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`} title="Intermedio"><Monitor size={14}/></button>
              <button onClick={() => setTheme('light')} className={`p-1.5 rounded-lg transition-all ${theme === 'light' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`} title="Claro"><Sun size={14}/></button>
            </div>

            <div className="flex items-center bg-slate-800/60 p-1 rounded-xl border border-white/5">
              <button 
                onClick={() => flipAll("image")}
                className={`p-2 rounded-lg transition-all ${globalMode === "image" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "text-slate-400 hover:text-emerald-400"}`}
                title="Todas Imagen"
              >
                <LayoutGrid size={15} />
              </button>
              <button 
                onClick={() => flipAll("video")}
                className={`p-2 rounded-lg transition-all ${globalMode === "video" ? "bg-violet-500 text-white shadow-lg shadow-violet-500/20" : "text-slate-400 hover:text-violet-400"}`}
                title="Todas Video"
              >
                <MonitorPlay size={15} />
              </button>
            </div>

            <button
              onClick={() => setIsTranslateEn(!isTranslateEn)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/40 border border-emerald-500/20 text-emerald-400 font-bold text-[10px] uppercase tracking-widest hover:bg-emerald-500/10 transition-all"
            >
              <Languages size={13} /> {isTranslateEn ? "EN → ES" : "ES → EN"}
            </button>
          </div>
        </div>

        {/* AI Status Bar */}
        <AnimatePresence>
          {aiStatus && (
            <motion.div 
              initial={{ opacity: 0, y: -10, height: 0 }} 
              animate={{ opacity: 1, y: 0, height: "auto" }} 
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="mt-2 max-w-[1600px] mx-auto flex items-center gap-3 bg-slate-900/60 backdrop-blur-xl border border-amber-500/20 px-5 py-2.5 rounded-xl overflow-hidden"
            >
              <Bot size={16} className={`text-amber-400 ${ordering ? "animate-bounce" : ""}`} />
              <span className="text-xs font-bold text-amber-400/90 tracking-wide">{aiStatus}</span>
              <span className="text-[9px] text-slate-500 ml-auto font-mono">qwen3:0.6b • local</span>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-4 gap-6 pb-20">
        
        {/* Sidebar Controls */}
        <aside className="lg:sticky lg:top-32 h-fit space-y-5">
          
          {/* MARKDOWN IMPORT - Dual Input */}
          <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl p-5 border-2 border-amber-500/20">
            <h2 className="text-xs font-black mb-3 flex items-center gap-3 text-amber-400">
              <FileText size={16} /> IMPORTAR MARKDOWN / TEXTO
            </h2>
            <p className="text-[10px] text-slate-500 mb-3">Pegá tus tablas Markdown o listas numeradas comunes (1., 2.). El sistema las unirá en tarjetas reversibles.</p>
            <div className="flex flex-col gap-2 mb-3">
              <h3 className="text-[9px] font-bold text-emerald-400 mb-1 flex items-center gap-1"><ImageIcon size={10}/> LISTA / TABLA IMÁGENES</h3>
              <textarea
                className="w-full h-20 bg-slate-950/40 rounded-xl p-3 text-sm text-slate-300 placeholder-slate-600 outline-none border border-emerald-500/20 focus:ring-1 focus:ring-emerald-500/20 transition-all resize-none font-mono text-[10px]"
                placeholder="Pegá tu texto normal numerado o tabla markdown de imágenes aquí..."
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
                placeholder="Pegá tu texto normal numerado o tabla markdown de videos aquí..."
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
              <Hash size={12} /> Estadísticas
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3 text-center">
                <div className="text-xl font-black text-emerald-400">{scenes.filter(s => s.imageText.trim()).length}</div>
                <div className="text-[9px] text-emerald-400/50 font-bold uppercase tracking-wider">Imágenes</div>
              </div>
              <div className="bg-violet-500/5 border border-violet-500/10 rounded-xl p-3 text-center">
                <div className="text-xl font-black text-violet-400">{scenes.filter(s => s.videoText.trim()).length}</div>
                <div className="text-[9px] text-violet-400/50 font-bold uppercase tracking-wider">Videos</div>
              </div>
            </div>
            <div className="mt-3 text-center">
              <div className="text-sm font-black text-slate-300">{scenes.length}</div>
              <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Total Escenas</div>
            </div>
          </div>
        </aside>

        {/* Workspace Area */}
        <main className="lg:col-span-3">
          <AnimatePresence mode="popLayout">
            {filteredScenes.length === 0 ? (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center h-[500px] rounded-[3rem] border-2 border-dashed border-white/5 bg-slate-900/20 backdrop-blur-sm">
                <div className="w-20 h-20 rounded-2xl bg-slate-800/40 flex items-center justify-center mb-6 shadow-2xl">
                  <Plus className="text-slate-600 animate-pulse" size={36} />
                </div>
                <h3 className="text-xl font-black text-slate-300 mb-2 tracking-tight">Comienza la magia</h3>
                <p className="text-slate-500 text-sm font-medium mb-6">Pega texto en los paneles laterales o arrastra imágenes</p>
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
                title="ORGANIZADOR DE ESCENAS" 
                count={filteredScenes.length} 
                color="emerald" 
                icon={Sparkles}
                items={filteredScenes}
                onReorder={(newOrder: Scene[]) => {
                  if (!search.trim()) {
                    saveScenes(newOrder);
                  } else {
                    const newFullList = [...scenes];
                    const filteredIds = filteredScenes.map(s => s.id);
                    let filteredCount = 0;
                    
                    const result = newFullList.map(s => {
                      if (filteredIds.includes(s.id)) {
                        return newOrder[filteredCount++];
                      }
                      return s;
                    });
                    saveScenes(result);
                  }
                }}
                renderItem={(scene: Scene, index: number) => (
                  <SceneCard 
                    key={scene.id} 
                    scene={scene} 
                    index={index} 
                    updateScene={updateScene} 
                    deleteScene={deleteScene} 
                    duplicateScene={duplicateScene}
                    onTranslate={handleTranslate} 
                  />
                )}
              />
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

// --- Specialized UI Components ---

const NavButton = ({ icon: Icon, label, onClick, color }: any) => {
  const styles: any = {
    emerald: "text-emerald-400 hover:bg-emerald-500/10",
    red: "text-red-400 hover:bg-red-500/10",
    default: "text-slate-400 hover:bg-white/5"
  };
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-xs transition-all ${styles[color] || styles.default}`}>
      <Icon size={15} /> {label}
    </button>
  );
};

const WorkspaceSection = ({ items, onReorder, renderItem }: any) => {
  if (items.length === 0) return null;
  return (
    <div className="w-full">
      <Reorder.Group axis="y" values={items} onReorder={onReorder} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {items.map((item: any, index: number) => renderItem(item, index))}
      </Reorder.Group>
    </div>
  );
};

export default App;
