import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Languages, Image as ImageIcon, Clapperboard, Moon, Monitor, Sun, Plus, Sparkles, Search, LayoutGrid, MonitorPlay, Wand2, Bot, Undo2, Redo2, Trash2 } from "lucide-react";
import { load } from "@tauri-apps/plugin-store";
import "./App.css";
import { Scene, Workspace } from "./types";
import { WorkspaceInstance } from "./components/WorkspaceInstance";

const PROTECTED_TERMS = ["slow motion", "dolly zoom", "dolly", "tracking shot", "pan", "tilt", "pedestal", "drone", "fpv", "bokeh", "cinematic", "film", "grain", "lens", "focal length", "close up", "wide angle", "hyperlapse", "timelapse", "fps", "glitch", "vfx", "dolpy", "cgi", "rendering", "unreal engine", "octane render", "zoom", "blur", "focus", "tracking", "steadycam", "gimbal"];

const useTranslate = () => {
  const [translating, setTranslating] = useState(false);
  const translate = async (text: string, toEnglish: boolean): Promise<string> => {
    if (!text.trim()) return text;
    setTranslating(true);
    try {
      let processText = text;
      const map: Record<string, string> = {};
      let counter = 0;
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
      const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(processText)}`);
      const data = await response.json();
      let finalTranslation = data[0].map((item: any) => item[0]).join('');
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
        if (mounted && loading) setLoading(false);
      }, 3000);
      try {
        const s = await load("scenes.json", { autoSave: false, defaults: { scenes: [] } });
        if (!mounted) return;
        setStore(s);
        const saved = await s.get<Scene[]>("scenes");
        if (mounted && saved && Array.isArray(saved)) setScenes(saved);
      } catch (e) {
        console.error("PROMPT_STUDIO: Error loading scenes:", e);
      } finally {
        if (mounted) { clearTimeout(timeout); setLoading(false); }
      }
    };
    initStore();
    return () => { mounted = false; };
  }, []);
  const saveScenes = async (newScenes: Scene[]) => {
    setScenes(newScenes);
    if (store) {
      try { await store.set("scenes", newScenes); await store.save(); } catch (e) { console.error("Error saving:", e); }
    }
  };
  return { scenes, saveScenes, loading };
};

const useUndoRedo = (scenes: Scene[], saveScenes: (s: Scene[]) => void) => {
  const historyRef = useRef<Scene[][]>([]);
  const futureRef = useRef<Scene[][]>([]);
  const skipRef = useRef(false);
  const pushHistory = (currentScenes: Scene[]) => {
    if (skipRef.current) { skipRef.current = false; return; }
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

const OLLAMA_URL = "http://127.0.0.1:11434";
const useAIOrder = () => {
  const [ordering, setOrdering] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const checkOllama = async (): Promise<boolean> => {
    try { const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) }); return res.ok; } catch { return false; }
  };
  const orderScenes = async (scenes: Scene[]): Promise<Scene[] | null> => {
    if (scenes.length < 2) { setAiStatus("⚠ Necesitás al menos 2 escenas para ordenar"); setTimeout(() => setAiStatus(null), 3000); return null; }
    setOrdering(true); setAiStatus("Verificando Ollama...");
    try {
      const isAvailable = await checkOllama();
      if (!isAvailable) throw new Error("Ollama no está corriendo. Abrí Ollama primero.");
      setAiStatus("Enviando escenas a Qwen 3...");
      const sceneSummaries = scenes.map((s, i) => `[${i}] IMG: "${s.imageText ? s.imageText.slice(0, 150).replace(/\n/g, " ") : "(vacío)"}" | VID: "${s.videoText ? s.videoText.slice(0, 150).replace(/\n/g, " ") : "(vacío)"}"`).join("\n");
      const systemPrompt = `You are a scene ordering assistant. You ONLY return comma-separated index numbers. No explanations, no text, no markdown. Example output: 2,0,3,1,4`;
      const userPrompt = `Order these ${scenes.length} scenes in optimal narrative sequence. Return ONLY the indices as comma-separated numbers.\n\n${sceneSummaries}\n\nOrder:`;
      setAiStatus("Analizando con IA local...");
      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "qwen3:0.6b", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], stream: false, options: { temperature: 0.1, num_predict: 200 } }),
      });
      if (!response.ok) throw new Error(`Ollama respondió con error: ${await response.text().then(t=>t.slice(0,100))}`);
      const data = await response.json();
      let rawResponse = data.message?.content?.trim() || "";
      rawResponse = rawResponse.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      const allNumbers = rawResponse.match(/\d+/g);
      if (!allNumbers || allNumbers.length === 0) throw new Error("La IA no devolvió índices válidos");
      const indices = allNumbers.map(Number);
      const validIndices = indices.filter((i: number) => i >= 0 && i < scenes.length);
      const uniqueIndices: number[] = []; const seen = new Set<number>();
      for (const idx of validIndices) { if (!seen.has(idx)) { seen.add(idx); uniqueIndices.push(idx); } }
      if (uniqueIndices.length < scenes.length) { for (let i = 0; i < scenes.length; i++) { if (!seen.has(i)) uniqueIndices.push(i); } }
      setAiStatus(`✓ ${scenes.length} escenas reordenadas por IA`); setTimeout(() => setAiStatus(null), 4000);
      return uniqueIndices.slice(0, scenes.length).map(i => scenes[i]);
    } catch (error: any) {
      console.error("AI Order error:", error); setAiStatus(`✗ Error: ${error.message}`); setTimeout(() => setAiStatus(null), 5000); return null;
    } finally { setOrdering(false); }
  };
  return { orderScenes, ordering, aiStatus };
};

const NavButton = ({ icon: Icon, label, onClick, color }: any) => {
  const styles: any = { emerald: "text-emerald-400 hover:bg-emerald-500/10", red: "text-red-400 hover:bg-red-500/10", default: "text-slate-400 hover:bg-white/5" };
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-xs transition-all ${styles[color] || styles.default}`}><Icon size={15} /> {label}</button>
  );
};

export default function App() {
  const { scenes, saveScenes, loading } = useSceneStore();
  const [theme, setTheme] = useState<'dark' | 'inter' | 'light'>(() => (localStorage.getItem('ps-theme') as any) || 'inter');
  useEffect(() => { localStorage.setItem('ps-theme', theme); }, [theme]);
  
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!workspacesLoaded) {
      if (scenes.length === 0) {
        setWorkspaces([{ id: crypto.randomUUID(), theme: 'normal' }]);
      } else {
        const map = new Map<string, Workspace>();
        scenes.forEach(s => {
          const gId = s.groupId || 'default';
          if (!map.has(gId)) map.set(gId, { id: gId, theme: s.theme || 'normal' });
        });
        setWorkspaces(Array.from(map.values()));
      }
      setWorkspacesLoaded(true);
    }
  }, [scenes, loading, workspacesLoaded]);

  const addWorkspace = (theme: "normal" | "golden") => {
    setWorkspaces([...workspaces, { id: crypto.randomUUID(), theme }]);
  };

  const [isTranslateEn, setIsTranslateEn] = useState(false);
  const [search, setSearch] = useState("");
  const [globalMode, setGlobalMode] = useState<"image" | "video" | null>(null);
  const { translate } = useTranslate();
  const { orderScenes, ordering, aiStatus } = useAIOrder();
  const { pushHistory, undo, redo, canUndo, canRedo } = useUndoRedo(scenes, saveScenes);

  const prevScenesRef = useRef<Scene[]>([]);
  useEffect(() => {
    if (prevScenesRef.current.length > 0 && prevScenesRef.current !== scenes) pushHistory(prevScenesRef.current);
    prevScenesRef.current = scenes;
  }, [scenes]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  const updateScene = (id: string, data: Partial<Scene>) => { saveScenes(scenes.map((s) => (s.id === id ? { ...s, ...data } : s))); };
  const deleteScene = (id: string) => { saveScenes(scenes.filter((s) => s.id !== id)); };
  const duplicateScene = (id: string) => {
    const scene = scenes.find(s => s.id === id);
    if (!scene) return;
    const idx = scenes.indexOf(scene);
    const clone: Scene = { id: crypto.randomUUID(), imageText: "", videoText: "", mode: scene.mode, asset: null, groupId: scene.groupId, theme: scene.theme };
    const newScenes = [...scenes]; newScenes.splice(idx + 1, 0, clone);
    saveScenes(newScenes);
  };
  const handleTranslate = async (id: string, mode: "image" | "video") => {
    const scene = scenes.find((s) => s.id === id); if (!scene) return;
    const currentText = mode === "video" ? scene.videoText : scene.imageText;
    if (!currentText.trim()) return;
    const translated = await translate(currentText, isTranslateEn);
    updateScene(id, mode === "video" ? { translatedVideoText: translated } : { translatedImageText: translated });
  };
  const flipAll = (mode: "image" | "video") => { saveScenes(scenes.map(s => ({ ...s, mode }))); setGlobalMode(mode); };
  const handleAIOrder = async () => { const reordered = await orderScenes(scenes); if (reordered) saveScenes(reordered); };

  const exportAll = () => { navigator.clipboard.writeText(scenes.map((s, i) => `ESCENA #${i + 1}\\nIMAGEN: ${s.imageText || "-"}\\nVIDEO: ${s.videoText || "-"}`).join("\\n\\n---\\n\\n")); };
  const exportImages = () => { navigator.clipboard.writeText(scenes.filter(s => s.imageText.trim()).map((s, i) => `Escena ${i + 1}: ${s.imageText}`).join("\\n\\n")); };
  const exportVideos = () => { navigator.clipboard.writeText(scenes.filter(s => s.videoText.trim()).map((s, i) => `Escena ${i + 1}: ${s.videoText}`).join("\\n\\n")); };

  if (loading || !workspacesLoaded) {
    return (
      <div className={`theme-${theme} min-h-screen bg-[#020617] flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-6"><div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" /><div className="text-emerald-400 font-black tracking-[0.3em] text-sm animate-pulse">PROMPT STUDIO</div></div>
      </div>
    );
  }

  return (
    <div className={`theme-${theme} min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-emerald-500/30 overflow-x-hidden`}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-500/5 blur-[120px] rounded-full" />
      </div>

      <nav className="sticky top-0 z-[60] p-4 lg:p-6">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center gap-3 bg-slate-900/40 backdrop-blur-2xl border border-white/5 p-3 lg:p-4 rounded-[2rem] shadow-2xl">
          <div className="flex items-center gap-3 px-3 mr-2 border-r border-white/5">
            <div className="w-9 h-9 bg-gradient-to-tr from-emerald-500 to-violet-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20"><Sparkles className="text-white" size={18} /></div>
            <h1 className="text-base font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 hidden lg:block">PROMPT STUDIO</h1>
          </div>

          <div className="hidden xl:flex items-center gap-1">
            <div className="relative group/export">
              <NavButton icon={Copy} label="Exportar Todas" color="emerald" onClick={exportAll} />
              <div className="absolute top-full left-0 mt-1 bg-slate-800/95 backdrop-blur-xl border border-white/10 rounded-xl p-1 opacity-0 invisible group-hover/export:opacity-100 group-hover/export:visible transition-all z-50 min-w-[160px] shadow-2xl">
                <button onClick={exportAll} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-all"><Copy size={12} /> Todo</button>
                <button onClick={exportImages} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-emerald-400 hover:bg-emerald-500/10 transition-all"><ImageIcon size={12} /> Solo Imágenes</button>
                <button onClick={exportVideos} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-violet-400 hover:bg-violet-500/10 transition-all"><Clapperboard size={12} /> Solo Videos</button>
              </div>
            </div>

            <button onClick={handleAIOrder} disabled={ordering || scenes.length < 2} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${ordering ? "bg-amber-500/20 text-amber-400 cursor-wait" : "bg-gradient-to-r from-emerald-500/10 to-violet-500/10 text-amber-400 hover:from-emerald-500/20 hover:to-violet-500/20 hover:text-amber-300 border border-amber-500/20"} disabled:opacity-40`}><Wand2 size={15} /> IA Ordenar</button>

            <div className="flex items-center bg-slate-800/40 rounded-xl border border-white/5 ml-1">
              <button onClick={undo} disabled={!canUndo} className="p-2 text-slate-400 hover:text-white disabled:opacity-20 transition-all"><Undo2 size={15} /></button>
              <div className="w-px h-5 bg-white/5" />
              <button onClick={redo} disabled={!canRedo} className="p-2 text-slate-400 hover:text-white disabled:opacity-20 transition-all"><Redo2 size={15} /></button>
            </div>
          </div>

          <div className="flex-1 max-w-md mx-2 relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors" size={15} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="w-full bg-slate-800/40 border border-white/5 rounded-xl py-2 pl-10 pr-3 outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all text-sm" />
          </div>

          <div className="flex items-center gap-2">
            <NavButton icon={Trash2} label="LIMPIAR TODO" onClick={() => { if (confirm("¿Estás seguro de eliminar todas las escenas?")) saveScenes([]); }} color="red" />
            
            <div className="flex items-center bg-slate-800/60 p-1 rounded-xl border border-white/5">
              <button onClick={() => setTheme('dark')} className={`p-1.5 rounded-lg transition-all ${theme === 'dark' ? 'bg-black text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><Moon size={14}/></button>
              <button onClick={() => setTheme('inter')} className={`p-1.5 rounded-lg transition-all ${theme === 'inter' ? 'bg-slate-700 text-cyan-300 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><Monitor size={14}/></button>
              <button onClick={() => setTheme('light')} className={`p-1.5 rounded-lg transition-all ${theme === 'light' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><Sun size={14}/></button>
            </div>

            <div className="flex items-center bg-slate-800/60 p-1 rounded-xl border border-white/5">
              <button onClick={() => flipAll("image")} className={`p-2 rounded-lg transition-all ${globalMode === "image" ? "bg-emerald-500 text-white" : "text-slate-400 hover:text-emerald-400"}`}><LayoutGrid size={15} /></button>
              <button onClick={() => flipAll("video")} className={`p-2 rounded-lg transition-all ${globalMode === "video" ? "bg-violet-500 text-white" : "text-slate-400 hover:text-violet-400"}`}><MonitorPlay size={15} /></button>
            </div>

            <button onClick={() => setIsTranslateEn(!isTranslateEn)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/40 border border-emerald-500/20 text-emerald-400 font-bold text-[10px] uppercase tracking-widest hover:bg-emerald-500/10 transition-all">
              <Languages size={13} /> {isTranslateEn ? "EN → ES" : "ES → EN"}
            </button>
          </div>
        </div>
        
        <AnimatePresence>
          {aiStatus && (
            <motion.div initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }} exit={{ opacity: 0, y: -10, height: 0 }} className="mt-2 max-w-[1600px] mx-auto flex items-center gap-3 bg-slate-900/60 backdrop-blur-xl border border-amber-500/20 px-5 py-2.5 rounded-xl">
              <Bot size={16} className={`text-amber-400 ${ordering ? "animate-bounce" : ""}`} />
              <span className="text-xs font-bold text-amber-400/90">{aiStatus}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Main Workspaces Container */}
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 pb-20 mt-8">
        {workspaces.map((ws) => (
          <WorkspaceInstance
            key={ws.id}
            workspace={ws}
            scenes={scenes}
            search={search}
            saveScenes={saveScenes}
            updateScene={updateScene}
            deleteScene={deleteScene}
            duplicateScene={duplicateScene}
            handleTranslate={handleTranslate}
          />
        ))}

        {/* Global Block Addition Controls */}
        <div className="flex items-center justify-center gap-4 mt-8 pt-8">
          <button onClick={() => addWorkspace("normal")} className="px-8 py-4 bg-slate-800/40 border-2 border-slate-700/50 rounded-2xl text-slate-300 text-sm font-black hover:bg-slate-800 hover:border-slate-600 transition-all flex items-center gap-3 tracking-widest shadow-xl">
            <Plus size={18} /> AÑADIR NUEVA SECCIÓN
          </button>
          <button onClick={() => addWorkspace("golden")} className="px-8 py-4 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl text-amber-400 text-sm font-black hover:bg-amber-500/20 transition-all flex items-center gap-3 tracking-widest shadow-[0_0_25px_rgba(245,158,11,0.1)] hover:shadow-[0_0_35px_rgba(245,158,11,0.2)]">
            <Sparkles size={18} /> SECCIÓN ESPECIAL DORADA
          </button>
        </div>
      </div>
    </div>
  );
}
