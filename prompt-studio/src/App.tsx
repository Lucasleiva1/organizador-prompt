import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, Monitor, Sun, Plus, Sparkles, Trash2, Save, FolderOpen, Film, Settings, ChevronDown, FolderPlus } from "lucide-react";
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { load } from "@tauri-apps/plugin-store";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile, mkdir } from "@tauri-apps/plugin-fs";
import { documentDir, join } from "@tauri-apps/api/path";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import "./App.css";
import { Scene, Workspace, Character, Script } from "./types";
import { WorkspaceInstance } from "./components/WorkspaceInstance";
import { CharacterBar } from "./components/CharacterBar";
import { AssetManager } from "./utils/AssetManager";
import ScriptManager from "./components/ScriptManager.tsx";
import { QwenEngine } from "./components/QwenEngine.tsx";


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
        await AssetManager.init();
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
const useWorkspaceStore = () => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    const initStore = async () => {
      try {
        const s = await load("workspaces.json", { autoSave: false, defaults: { workspaces: [] } });
        if (!mounted) return;
        setStore(s);
        const saved = await s.get<Workspace[]>("workspaces");
        if (mounted && saved && Array.isArray(saved) && saved.length > 0) {
          setWorkspaces(saved);
        }
      } catch (e) {
        console.error("PROMPT_STUDIO: Error loading workspaces:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    initStore();
    return () => { mounted = false; };
  }, []);

  const saveWorkspaces = async (newWorkspaces: Workspace[]) => {
    setWorkspaces(newWorkspaces);
    if (store) {
      try { await store.set("workspaces", newWorkspaces); await store.save(); } catch (e) { console.error("Error saving workspaces:", e); }
    }
  };

  return { workspaces, setWorkspaces: saveWorkspaces, loading };
};

const useSettingsStore = () => {
  const [settings, setSettings] = useState<any>(null);
  const [store, setStore] = useState<any>(null);

  useEffect(() => {
    const init = async () => {
      const s = await load("settings.json", { autoSave: true, defaults: { visibility: { showTheme: true, showSave: true, showLoad: true, showProjectFolder: true, showScripts: true, showClear: true } } });
      setStore(s);
      const v = await s.get("visibility");
      if (v) setSettings(v);
    };
    init();
  }, []);

  const saveSettings = async (v: any) => {
    setSettings(v);
    if (store) {
      await store.set("visibility", v);
      await store.save();
    }
  };

  return { settings, saveSettings };
};

const useCharacterStore = () => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    const initStore = async () => {
      try {
        const s = await load("characters.json", { autoSave: false, defaults: { characters: [] } });
        if (!mounted) return;
        setStore(s);
        const saved = await s.get<Character[]>("characters");
        if (mounted && saved && Array.isArray(saved)) setCharacters(saved);
      } catch (e) {
        console.error("Error loading characters:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    initStore();
    return () => { mounted = false; };
  }, []);

  const saveCharacters = async (newChars: Character[]) => {
    setCharacters(newChars);
    if (store) {
      try { await store.set("characters", newChars); await store.save(); } catch (e) { console.error("Error saving characters:", e); }
    }
  };

  const addCharacter = async (file: File) => {
    try {
      const fileName = await AssetManager.saveAsset(file, 'char');
      const newChar: Character = {
        id: crypto.randomUUID(),
        name: file.name,
        asset: fileName
      };
      saveCharacters([...characters, newChar]);
    } catch (err) {
      console.error("Error adding character:", err);
      alert("Error al subir el personaje.");
    }
  };

  const deleteCharacter = async (id: string) => {
    if (confirm("¿Eliminar este personaje de la biblioteca?")) {
      const char = characters.find(c => c.id === id);
      if (char?.asset) {
        await AssetManager.deleteAsset(char.asset);
      }
      saveCharacters(characters.filter(c => c.id !== id));
    }
  };

  return { characters, saveCharacters, addCharacter, deleteCharacter, loading };
};

const useScriptStore = () => {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    const initStore = async () => {
      try {
        const s = await load("scripts.json", { autoSave: false, defaults: { scripts: [] } });
        if (!mounted) return;
        setStore(s);
        const saved = await s.get<Script[]>("scripts");
        if (mounted && saved && Array.isArray(saved)) setScripts(saved);
      } catch (e) {
        console.error("Error loading scripts:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    initStore();
    return () => { mounted = false; };
  }, []);

  const saveScripts = async (newScripts: Script[]) => {
    setScripts(newScripts);
    if (store) {
      try { await store.set("scripts", newScripts); await store.save(); } catch (e) { console.error("Error saving scripts:", e); }
    }
  };

  return { scripts, saveScripts, loading };
};





export default function App() {
  const { scenes, saveScenes, loading: loadingScenes } = useSceneStore();
  const { workspaces, setWorkspaces, loading: loadingWorkspaces } = useWorkspaceStore();
  const { characters, saveCharacters, addCharacter, deleteCharacter } = useCharacterStore();
  const { scripts, saveScripts, loading: loadingScripts } = useScriptStore();
  const { settings, saveSettings } = useSettingsStore();

  const [isTranslateEn] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [projectName, setProjectName] = useState(() => localStorage.getItem('ps-project-name') || "");
  const [visibility, setVisibility] = useState({
    showTheme: true,
    showSave: true,
    showLoad: true,
    showProjectFolder: true,
    showScripts: true,
    showClear: true
  });

  const [isScriptManagerOpen, setIsScriptManagerOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'inter' | 'light'>(() => (localStorage.getItem('ps-theme') as any) || 'inter');
  useEffect(() => { localStorage.setItem('ps-theme', theme); }, [theme]);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const { translate } = useTranslate();
  const prevScenesRef = useRef<Scene[]>([]);
  useEffect(() => {
    prevScenesRef.current = scenes;
  }, [scenes]);

  useEffect(() => {
    if (settings) {
      setVisibility(settings);
    }
  }, [settings]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const changeResolution = async (width: number, height: number) => {
    try {
      const win = getCurrentWindow();
      // Solo ajustamos el tamaño y centramos
      await win.setSize(new LogicalSize(width, height));
      await win.center();
      setIsSettingsOpen(false);
    } catch (error: any) {
      alert("Error Tauri: " + error);
    }
  };

  const [workspacesInitialized, setWorkspacesInitialized] = useState(false);

  useEffect(() => {
    if (loadingScenes || loadingWorkspaces) return;
    if (!workspacesInitialized) {
      if (workspaces.length === 0) {
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
      }
      setWorkspacesInitialized(true);
    }
  }, [scenes, loadingScenes, loadingWorkspaces, workspacesInitialized, workspaces]);

  const addWorkspace = (theme: "normal" | "golden") => {
    setWorkspaces([...workspaces, { id: crypto.randomUUID(), theme }]);
  };

  const updateWorkspaceName = (id: string, name: string) => {
    setWorkspaces(workspaces.map(ws => ws.id === id ? { ...ws, name } : ws));
  };

  const deleteWorkspace = async (id: string) => {
    if (confirm("¿Eliminar esta sección?")) {
      const workspaceScenes = scenes.filter(s => s.groupId === id);
      for (const scene of workspaceScenes) {
        if (scene.asset) {
          await AssetManager.deleteAsset(scene.asset);
        }
      }
      setWorkspaces(workspaces.filter(ws => ws.id !== id));
      saveScenes(scenes.filter(s => s.groupId !== id));
    }
  };

  const updateScene = (id: string, data: Partial<Scene>) => { saveScenes(scenes.map((s) => (s.id === id ? { ...s, ...data } : s))); };
  const deleteScene = async (id: string) => {
    const scene = scenes.find(s => s.id === id);
    if (scene?.asset) {
      await AssetManager.deleteAsset(scene.asset);
    }
    saveScenes(scenes.filter((s) => s.id !== id));
  };
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

  
  const saveProject = async () => {
    try {
      const filePath = await saveDialog({
        title: "Guardar Proyecto",
        defaultPath: `prompt-studio-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "Proyecto Prompt Studio", extensions: ["json"] }]
      });
      if (!filePath) return; // user cancelled
      const projectData = JSON.stringify({ scenes, workspaces, scripts }, null, 2);
      await writeTextFile(filePath, projectData);
    } catch (err) {
      console.error("Error saving project:", err);
      alert("Error al guardar el proyecto.");
    }
  };

  const loadProject = async () => {
    try {
      const filePath = await openDialog({
        title: "Cargar Proyecto",
        filters: [{ name: "Proyecto Prompt Studio", extensions: ["json"] }],
        multiple: false
      });
      if (!filePath || typeof filePath !== "string") return;
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const text = await readTextFile(filePath);
      const data = JSON.parse(text);
      if (data.scenes && Array.isArray(data.scenes)) await saveScenes(data.scenes);
      if (data.workspaces && Array.isArray(data.workspaces)) await setWorkspaces(data.workspaces);
      if (data.scripts && Array.isArray(data.scripts)) await saveScripts(data.scripts);
    } catch (err) {
      console.error("Error loading project:", err);
      alert("Error al cargar el proyecto.");
    }
  };

  const handleCreateProjectFolder = async () => {
    if (!folderName.trim()) return;

    try {
      const docs = await documentDir();
      const studioPath = await join(docs, "Prompt Studio");
      const projectPath = await join(studioPath, folderName.trim());

      await mkdir(projectPath, { recursive: true });
      await revealItemInDir([projectPath]);
      setProjectName(folderName.trim());
      localStorage.setItem('ps-project-name', folderName.trim());
      setIsFolderModalOpen(false);
      setFolderName("");
    } catch (err) {
      console.error("Error creating project folder:", err);
      alert("No se pudo crear la carpeta. Asegúrate de tener permisos en Documentos.");
    }
  };

  const addGeneratedScenes = (panels: any[]) => {
    const newScenes: Scene[] = [
      ...scenes,
      ...panels.map((p, index) => ({
        id: crypto.randomUUID(),
        sceneNumber: p.scene || (scenes.length + index + 1),
        imageText: p.description || "",
        videoText: "",
        mode: "image" as const,
        asset: null,
        optics: p.optics || "N/A",
        physics: p.physics || "N/A",
        timing: p.timing || "3s",
        groupId: workspaces.length > 0 ? workspaces[0].id : undefined
      }))
    ];
    saveScenes(newScenes);
    alert(`${panels.length} paneles añadidos al Workspace.`);
  };

  if (loadingScenes || loadingWorkspaces || loadingScripts || !workspacesInitialized) {
    return (
      <div className={`theme-${theme} min-h-screen bg-[#030303] flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-6"><div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" /><div className="text-emerald-400 font-black tracking-[0.3em] text-sm animate-pulse">PROMPT STUDIO</div></div>
      </div>
    );
  }

  return (
    <div className={`theme-${theme} min-h-screen bg-[#030303] text-slate-200 font-sans selection:bg-emerald-500/30 overflow-x-hidden`}>


      <nav className="sticky top-0 z-[60] p-4 lg:p-6">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center gap-3 bg-[#0a0a0a] border border-[#222] p-3 lg:p-4 rounded-3xl shadow-2xl">
          <div className="flex items-center gap-3 px-3 mr-2 border-r border-[#222]">
            <div className="w-9 h-9 bg-gradient-to-tr from-emerald-500 to-violet-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20"><Sparkles className="text-white" size={18} /></div>
            <h1 className="text-base font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 hidden lg:block">PROMPT STUDIO</h1>
   

          </div>


          <div className="flex-1" />

          <div className="flex items-center gap-2">
            {visibility.showProjectFolder && (
              <button
                onClick={() => setIsFolderModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 font-black text-[10px] uppercase tracking-widest transition-all hover:bg-violet-500/20 hover:border-violet-500/40 hover:shadow-[0_0_15px_rgba(167,139,250,0.2)]"
              >
                <FolderPlus size={14} />
                CREAR PROYECTO
              </button>
            )}

            {visibility.showScripts && (
              <button 
                onClick={() => setIsScriptManagerOpen(!isScriptManagerOpen)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded font-bold text-xs transition-all ${isScriptManagerOpen ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "bg-slate-800/40 text-slate-400 hover:bg-white/5 border border-white/5"}`}
              >
                <div className={`w-2 h-2 rounded-full mr-1 transition-all ${isScriptManagerOpen ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-500"}`} />
                GUIONES
              </button>
            )}

            <div className="w-px h-6 bg-white/5 mx-1" />

            {visibility.showClear && (
               <button 
                onClick={async () => { 
                  if (confirm("¿Nuevo proyecto? Se limpiarán escenas, personajes y guiones.\nLas fotos de personajes seguirán en tu carpeta.")) {
                    // 1. Borrar assets de escenas del disco
                    for (const scene of scenes) {
                      if (scene.asset) await AssetManager.deleteAsset(scene.asset);
                    }
                    // 2. Limpiar escenas
                    saveScenes([]); 
                    // 3. Desvincular personajes (fotos se mantienen en disco)
                    saveCharacters([]);
                    // 4. Limpiar guiones
                    saveScripts([]);
                    // 5. Resetear workspaces a uno vacío
                    setWorkspaces([{ id: crypto.randomUUID(), theme: 'normal' }]);
                    // 6. Limpiar nombre del proyecto
                    setProjectName("");
                    localStorage.removeItem('ps-project-name');
                  }
                }} 
                className="flex items-center gap-2 px-3 py-2 rounded bg-red-500/10 border border-red-500/20 text-red-500 font-bold text-[10px] tracking-widest hover:bg-red-500 hover:text-white transition-all"
                title="Nuevo proyecto: limpia todo"
               >
                 <Trash2 size={14} /> LIMPIAR TODO
               </button>
            )}

            {visibility.showTheme && (
              <div className="flex items-center bg-slate-800/60 p-1 rounded border border-white/5">
                <button onClick={() => setTheme('dark')} className={`p-1.5 rounded-sm transition-all ${theme === 'dark' ? 'bg-black text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><Moon size={12}/></button>
                <button onClick={() => setTheme('inter')} className={`p-1.5 rounded-sm transition-all ${theme === 'inter' ? 'bg-slate-700 text-cyan-300 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><Monitor size={12}/></button>
                <button onClick={() => setTheme('light')} className={`p-1.5 rounded-sm transition-all ${theme === 'light' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><Sun size={12}/></button>
              </div>
            )}

            <div className="w-px h-6 bg-white/5 mx-1" />

            {visibility.showSave && (
              <button
                onClick={saveProject}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-[10px] uppercase tracking-widest transition-all hover:bg-emerald-500/20 hover:border-emerald-500/40 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                title="Guardar proyecto completo (JSON)"
              >
                <Save size={14} /> GUARDAR
              </button>
            )}

            {visibility.showLoad && (
              <button
                onClick={loadProject}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 font-black text-[10px] uppercase tracking-widest transition-all hover:bg-violet-500/20 hover:border-violet-500/40 hover:shadow-[0_0_15px_rgba(167,139,250,0.2)]"
                title="Cargar proyecto completo (JSON)"
              >
                <FolderOpen size={14} /> CARGAR
              </button>
            )}

            <div className="w-px h-6 bg-white/5 mx-1" />

            {/* CONFIGURACION (RESOLUCIONES) */}
            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className={`flex items-center gap-2 px-4 py-2 rounded font-bold text-[10px] uppercase tracking-widest transition-all border ${isSettingsOpen ? 'bg-slate-700/50 border-slate-500/50 text-white' : 'bg-slate-800/40 border-slate-500/20 text-slate-400 hover:bg-slate-700/30 hover:border-slate-500/40 hover:text-slate-300'}`}
                title="Configuraciones de Visualización"
              >
                <Settings size={13} /> CONFIG. <ChevronDown size={10} className={`transition-transform duration-200 ${isSettingsOpen ? 'rotate-180' : ''}`} />
              </button>
              
              <AnimatePresence>
                {isSettingsOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-56 bg-[#1a1a1a] border border-[#333] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden z-[100] flex flex-col"
                  >
                    <div className="p-3 border-b border-[#333] bg-[#111]">
                      <h3 className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Resolución de Ventana</h3>
                    </div>
                    <div className="p-2 flex flex-col gap-1">
                      <button onClick={() => changeResolution(1920, 1080)} className="text-left px-3 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex justify-between items-center group">
                        1920 x 1080 <span className="text-[9px] text-slate-600 group-hover:text-amber-500 uppercase tracking-widest">Full HD</span>
                      </button>
                      <button onClick={() => changeResolution(1280, 720)} className="text-left px-3 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex justify-between items-center group">
                        1280 x 720 <span className="text-[9px] text-slate-600 group-hover:text-amber-500 uppercase tracking-widest">HD</span>
                      </button>
                      <button onClick={() => changeResolution(1024, 768)} className="text-left px-3 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex justify-between items-center group">
                        1024 x 768 <span className="text-[9px] text-slate-600 group-hover:text-emerald-400 uppercase tracking-widest">Modo Chico</span>
                      </button>
                    </div>

                    <div className="p-3 border-t border-[#333] bg-[#111]">
                      <h3 className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Tema Visual</h3>
                    </div>
                    <div className="p-2 grid grid-cols-3 gap-1 border-b border-[#333]">
                      <button 
                        onClick={() => setTheme('dark')}
                        className={`flex flex-col items-center gap-1.5 p-2 rounded-lg transition-all ${theme === 'dark' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-500 hover:bg-white/5 border border-transparent'}`}
                      >
                        <Moon size={14} />
                        <span className="text-[8px] font-black uppercase">Oscuro</span>
                      </button>
                      <button 
                        onClick={() => setTheme('inter')}
                        className={`flex flex-col items-center gap-1.5 p-2 rounded-lg transition-all ${theme === 'inter' ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'text-slate-500 hover:bg-white/5 border border-transparent'}`}
                      >
                        <Monitor size={14} />
                        <span className="text-[8px] font-black uppercase">Inter</span>
                      </button>
                      <button 
                        onClick={() => setTheme('light')}
                        className={`flex flex-col items-center gap-1.5 p-2 rounded-lg transition-all ${theme === 'light' ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' : 'text-slate-500 hover:bg-white/5 border border-transparent'}`}
                      >
                        <Sun size={14} />
                        <span className="text-[8px] font-black uppercase">Claro</span>
                      </button>
                    </div>

                    <div className="p-3 border-t border-[#333] bg-[#0c0c0c] flex items-center justify-between">
                      <h3 className="text-[9px] text-slate-500 uppercase tracking-widest font-black">Visibilidad de Barra</h3>
                    </div>
                    <div className="p-3 flex flex-col gap-2 border-b border-[#333]">
                       <MiniToggle 
                          icon={Monitor} 
                          label="Temas" 
                          isActive={visibility.showTheme} 
                          onToggle={() => saveSettings({...visibility, showTheme: !visibility.showTheme})} 
                       />
                       <MiniToggle 
                          icon={Save} 
                          label="Guardar" 
                          isActive={visibility.showSave} 
                          onToggle={() => saveSettings({...visibility, showSave: !visibility.showSave})} 
                       />
                       <MiniToggle 
                          icon={FolderOpen} 
                          label="Cargar" 
                          isActive={visibility.showLoad} 
                          onToggle={() => saveSettings({...visibility, showLoad: !visibility.showLoad})} 
                       />
                       <MiniToggle 
                          icon={FolderPlus} 
                          label="Crear Proyecto" 
                          isActive={visibility.showProjectFolder} 
                          onToggle={() => saveSettings({...visibility, showProjectFolder: !visibility.showProjectFolder})} 
                       />
                       <MiniToggle 
                          icon={Trash2} 
                          label="Limpiar Todo" 
                          isActive={visibility.showClear} 
                          onToggle={() => saveSettings({...visibility, showClear: !visibility.showClear})} 
                       />
                    </div>

                    <div className="mt-auto p-4 bg-black/40 flex gap-2">
                       <button onClick={saveProject} className="flex-1 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all" title="Guardar Proyecto"><Save size={14}/></button>
                       <button onClick={loadProject} className="flex-1 p-2 bg-violet-500/10 border border-violet-500/20 rounded-lg text-violet-400 hover:bg-violet-500 hover:text-white transition-all" title="Cargar Proyecto"><FolderOpen size={14}/></button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {/* FIN CONFIGURACION */}
          </div>
        </div>
        

      </nav>

      {/* Project Name Display */}
      {projectName && (
        <div className="w-full text-center py-4 bg-gradient-to-b from-[#0a0a0a] to-transparent">
          <h1 className="text-3xl md:text-4xl font-black italic text-white/90 tracking-tight uppercase" style={{ fontFamily: "'Inter', sans-serif", letterSpacing: '-0.02em' }}>
            {projectName}
          </h1>
        </div>
      )}

      <CharacterBar 
        characters={characters} 
        addCharacter={addCharacter} 
        deleteCharacter={deleteCharacter} 
      />

      <QwenEngine onAddGeneratedScenes={addGeneratedScenes} />




      {/* Main Workspaces Container */}
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 pb-20 mt-8">
        
        {/* PRODUCCION FINAL HEADER */}
        {workspaces.length > 0 && (
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 border-b border-white/10 pb-8 gap-6 mt-16">
            <div className="flex flex-col gap-1">
              <h1 className="text-3xl lg:text-4xl font-black text-white tracking-tighter italic flex items-center gap-4 uppercase">
                <div className="relative">
                  <Film className="text-emerald-500" size={36} />
                  <div className="absolute -inset-2 bg-emerald-500/20 blur-xl rounded-full animate-pulse" />
                </div>
                Producción Final
              </h1>
              <p className="text-slate-500 text-[10px] font-black tracking-[0.3em] uppercase ml-14">Generación de Assets y Renderizado</p>
            </div>
          </div>
        )}

        {workspaces.map((ws, idx) => (
          <WorkspaceInstance
            key={ws.id}
            index={idx}
            workspace={ws}
            scenes={scenes}
            search={""}
            saveScenes={saveScenes}
            updateScene={updateScene}
            deleteScene={deleteScene}
            duplicateScene={duplicateScene}
            handleTranslate={handleTranslate}
            updateWorkspaceName={updateWorkspaceName}
            deleteWorkspace={deleteWorkspace}
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

      <AnimatePresence>
        {isScriptManagerOpen && (
          <ScriptManager
            scripts={scripts}
            saveScripts={saveScripts}
            onClose={() => setIsScriptManagerOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFolderModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsFolderModalOpen(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-[#0a0a0a] border border-[#222] rounded-3xl p-8 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600/10 rounded-full blur-3xl -mr-16 -mt-16" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-emerald-600/5 rounded-full blur-3xl -ml-16 -mb-16" />

              <div className="relative">
                <div className="w-12 h-12 bg-violet-500/10 rounded-2xl flex items-center justify-center text-violet-400 mb-6 border border-violet-500/20">
                  <FolderPlus size={24} />
                </div>
                
                <h2 className="text-xl font-black text-white mb-2 tracking-tight">NUEVO PROYECTO</h2>
                <p className="text-sm text-slate-400 mb-8 leading-relaxed">
                  Crea una carpeta donde vas a poder guardar todo lo relacionado con este proyecto. 
                  Esto se creará en <span className="text-violet-400 font-medium">Documentos/Prompt Studio/</span>
                </p>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">NOMBRE DE LA CARPETA</label>
                    <input
                      type="text"
                      autoFocus
                      className="w-full bg-black/50 border border-[#222] rounded-xl px-4 py-3.5 text-slate-200 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all placeholder:text-slate-700"
                      placeholder="Ej: El Ritual de la 14"
                      value={folderName}
                      onChange={(e) => setFolderName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateProjectFolder()}
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setIsFolderModalOpen(false)}
                      className="flex-1 px-4 py-3.5 rounded-xl bg-slate-800/40 text-slate-400 text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
                    >
                      CANCELAR
                    </button>
                    <button
                      onClick={handleCreateProjectFolder}
                      disabled={!folderName.trim()}
                      className="flex-[1.5] px-4 py-3.5 rounded-xl bg-violet-500 text-white text-xs font-black uppercase tracking-widest shadow-xl shadow-violet-500/20 hover:bg-violet-400 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
                    >
                      CREAR CARPETA
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

const MiniToggle = ({ icon: Icon, label, isActive, onToggle }: any) => (
  <button 
    onClick={onToggle}
    className={`w-full flex items-center justify-between p-2 rounded-lg transition-all ${isActive ? 'bg-white/5 text-emerald-400' : 'bg-transparent text-slate-600 hover:text-slate-400'}`}
  >
    <div className="flex items-center gap-2">
       <Icon size={12} />
       <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
    </div>
    <div className={`w-8 h-4 rounded-full p-0.5 transition-all ${isActive ? 'bg-emerald-500' : 'bg-slate-800'}`}>
       <div className={`w-3 h-3 bg-white rounded-full transition-all ${isActive ? 'translate-x-4' : 'translate-x-0'} shadow-sm`} />
    </div>
  </button>
);
