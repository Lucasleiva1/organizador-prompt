import { useState, useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { Moon, Monitor, Sun, Plus, Sparkles, Trash2, Save, FolderOpen } from "lucide-react";
import { load } from "@tauri-apps/plugin-store";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
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

  return { characters, addCharacter, deleteCharacter, loading };
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



const NavButton = ({ icon: Icon, label, onClick, color }: any) => {
  const styles: any = { emerald: "text-emerald-400 hover:bg-emerald-500/10", red: "text-red-400 hover:bg-red-500/10", default: "text-slate-400 hover:bg-white/5" };
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-xs transition-all ${styles[color] || styles.default}`}><Icon size={15} /> {label}</button>
  );
};

export default function App() {
  const { scenes, saveScenes, loading: loadingScenes } = useSceneStore();
  const { workspaces, setWorkspaces, loading: loadingWorkspaces } = useWorkspaceStore();
  const { characters, addCharacter, deleteCharacter } = useCharacterStore();
  const { scripts, saveScripts, loading: loadingScripts } = useScriptStore();
  const [isScriptManagerOpen, setIsScriptManagerOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'inter' | 'light'>(() => (localStorage.getItem('ps-theme') as any) || 'inter');
  useEffect(() => { localStorage.setItem('ps-theme', theme); }, [theme]);
  
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

  const [isTranslateEn] = useState(false);
  const { translate } = useTranslate();

  const prevScenesRef = useRef<Scene[]>([]);
  useEffect(() => {
    prevScenesRef.current = scenes;
  }, [scenes]);

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

  if (loadingScenes || loadingWorkspaces || loadingScripts || !workspacesInitialized) {
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


          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsScriptManagerOpen(!isScriptManagerOpen)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${isScriptManagerOpen ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "bg-slate-800/40 text-slate-400 hover:bg-white/5 border border-white/5"}`}
            >
              <div className={`w-2 h-2 rounded-full mr-1 transition-all ${isScriptManagerOpen ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-500"}`} />
              GUIONES
            </button>
            <div className="w-px h-6 bg-white/5 mx-1" />
            <NavButton icon={Trash2} label="LIMPIAR TODO" onClick={async () => { 
              if (confirm("¿Estás seguro de eliminar todas las escenas?")) {
                for (const scene of scenes) {
                  if (scene.asset) await AssetManager.deleteAsset(scene.asset);
                }
                saveScenes([]); 
              }
            }} color="red" />
            <div className="flex items-center bg-slate-800/60 p-1 rounded-xl border border-white/5">
              <button onClick={() => setTheme('dark')} className={`p-1.5 rounded-lg transition-all ${theme === 'dark' ? 'bg-black text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><Moon size={14}/></button>
              <button onClick={() => setTheme('inter')} className={`p-1.5 rounded-lg transition-all ${theme === 'inter' ? 'bg-slate-700 text-cyan-300 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><Monitor size={14}/></button>
              <button onClick={() => setTheme('light')} className={`p-1.5 rounded-lg transition-all ${theme === 'light' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><Sun size={14}/></button>
            </div>

            <button
              onClick={saveProject}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/40 border border-emerald-500/20 text-emerald-400 font-bold text-[10px] uppercase tracking-widest transition-all hover:bg-emerald-500/15 hover:border-emerald-400/60 hover:shadow-[0_0_18px_rgba(52,211,153,0.35)] hover:text-emerald-300"
              title="Guardar proyecto como archivo JSON"
            >
              <Save size={13} /> GUARDAR
            </button>
            <button
              onClick={loadProject}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/40 border border-violet-500/20 text-violet-400 font-bold text-[10px] uppercase tracking-widest transition-all hover:bg-violet-500/15 hover:border-violet-400/60 hover:shadow-[0_0_18px_rgba(167,139,250,0.35)] hover:text-violet-300"
              title="Cargar proyecto desde archivo JSON"
            >
              <FolderOpen size={13} /> CARGAR
            </button>
          </div>
        </div>
        

      </nav>

      <CharacterBar 
        characters={characters} 
        addCharacter={addCharacter} 
        deleteCharacter={deleteCharacter} 
      />

      <QwenEngine />




      {/* Main Workspaces Container */}
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 pb-20 mt-8">
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
    </div>
  );
}
