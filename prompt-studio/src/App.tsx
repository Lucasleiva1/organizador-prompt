import { useState, useEffect, useCallback } from "react";
import { motion, Reorder, AnimatePresence } from "framer-motion";
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
  RotateCcw,
} from "lucide-react";
import { load } from "@tauri-apps/plugin-store";
import "./App.css";

interface Scene {
  id: number;
  imageText: string;
  videoText: string;
  mode: "image" | "video";
  asset: string | null;
}

const DEFAULT_LOGIC = "Escena \\d+|Paso \\d+|## \\d+|🎥 ESCENA";

const useTranslate = () => {
  const [translating, setTranslating] = useState(false);

  const translate = async (text: string, toEnglish: boolean): Promise<string> => {
    if (!text.trim()) return text;
    setTranslating(true);
    try {
      const sourceLang = toEnglish ? "es" : "en";
      const targetLang = toEnglish ? "en" : "es";
      const response = await fetch(
        `https://lingva.ml/api/v1/${sourceLang}/${targetLang}/${encodeURIComponent(text)}`
      );
      const data = await response.json();
      return data.translation || text;
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
  const [store, setStore] = useState<Awaited<ReturnType<typeof load>> | null>(null);

  useEffect(() => {
    const initStore = async () => {
      try {
        const s = await load("scenes.json", { autoSave: false, defaults: {} });
        setStore(s);
        const saved = await s.get<Scene[]>("scenes");
        if (saved) setScenes(saved);
      } catch (e) {
        console.error("Error loading scenes:", e);
      } finally {
        setLoading(false);
      }
    };
    initStore();
  }, []);

  const saveScenes = async (newScenes: Scene[]) => {
    setScenes(newScenes);
    if (store) {
      try {
        await store.set("scenes", newScenes);
        await store.save();
      } catch (e) {
        console.error("Error saving scenes:", e);
      }
    }
  };

  return { scenes, saveScenes, loading };
};

const SceneCard = ({
  scene,
  index,
  updateScene,
  deleteScene,
  onTranslate,
  isTranslating,
}: {
  scene: Scene;
  index: number;
  updateScene: (id: number, data: Partial<Scene>) => void;
  deleteScene: (id: number) => void;
  onTranslate: (id: number) => void;
  isTranslating: boolean;
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const isVideo = scene.mode === "video";

  const currentText = isVideo ? scene.videoText : scene.imageText;

  const handleFlip = () => {
    const newMode = isVideo ? "image" : "video";
    updateScene(scene.id, { mode: newMode });
    setIsFlipped(!isFlipped);
  };

  const handleTextChange = (text: string) => {
    if (isVideo) {
      updateScene(scene.id, { videoText: text });
    } else {
      updateScene(scene.id, { imageText: text });
    }
  };

  return (
    <Reorder.Item
      value={scene}
      id={scene.id.toString()}
      className="relative w-full h-80 perspective-1000 cursor-grab active:cursor-grabbing list-none"
    >
      <motion.div
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
        className="relative w-full h-full preserve-3d"
      >
        <div
          className={`absolute inset-0 backface-hidden rounded-2xl border-2 ${
            isVideo
              ? "border-violet-500/50 shadow-violet-500/20"
              : "border-emerald-500/50 shadow-emerald-500/20"
          } bg-slate-900/80 backdrop-blur-md p-4`}
          style={{
            boxShadow: isVideo
              ? "0 0 30px rgba(139, 92, 246, 0.2)"
              : "0 0 30px rgba(16, 185, 129, 0.2)",
          }}
        >
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-bold uppercase tracking-widest ${
                  isVideo ? "text-violet-400" : "text-emerald-400"
                }`}
              >
                {isVideo ? "Video" : "Imagen"} #{index + 1}
              </span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => onTranslate(scene.id)}
                disabled={isTranslating}
                className="p-1.5 hover:bg-white/10 rounded transition-colors"
                title="Traducir"
              >
                <Languages size={14} />
              </button>
              <button
                onClick={handleFlip}
                className={`p-1.5 hover:bg-white/10 rounded transition-colors ${
                  isVideo ? "text-violet-400" : "text-emerald-400"
                }`}
                title={isVideo ? "Cambiar a Imagen" : "Cambiar a Video"}
              >
                <ArrowRightLeft size={14} />
              </button>
              <button
                onDoubleClick={() => deleteScene(scene.id)}
                className="p-1.5 hover:bg-red-500/20 text-red-400 rounded transition-colors"
                title="Doble clic para eliminar"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <textarea
            className="w-full h-40 bg-transparent resize-none focus:outline-none text-sm text-slate-300 placeholder-slate-600"
            value={currentText}
            placeholder={isVideo ? "Escribe el prompt de video..." : "Escribe el prompt de imagen..."}
            onChange={(e) => handleTextChange(e.target.value)}
          />
          {scene.asset && (
            <img
              src={scene.asset}
              alt="Asset"
              className="mt-2 h-20 w-full object-cover rounded-lg"
            />
          )}
        </div>

        <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-2xl border-2 border-violet-500/50 bg-slate-900/90 backdrop-blur-md p-4 shadow-lg shadow-violet-500/20">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold uppercase tracking-widest text-violet-400">
              Video #{index + 1}
            </span>
            <button
              onClick={handleFlip}
              className="p-1 hover:bg-white/10 rounded transition-colors text-violet-400"
              title="Volver a Imagen"
            >
              <ArrowRightLeft size={14} />
            </button>
          </div>
          <textarea
            className="w-full h-40 bg-transparent resize-none focus:outline-none text-sm text-slate-300 placeholder-slate-600"
            value={scene.videoText}
            placeholder="Escribe el prompt de video..."
            onChange={(e) => updateScene(scene.id, { videoText: e.target.value })}
          />
          <div className="flex items-center justify-center h-16 border-2 border-dashed border-violet-500/30 rounded-lg mt-2">
            <Play className="text-violet-500 mr-2" size={20} />
            <span className="text-xs text-violet-400/70">Vista Previa de Video</span>
          </div>
        </div>
      </motion.div>
    </Reorder.Item>
  );
};

function App() {
  const { scenes, saveScenes, loading } = useSceneStore();
  const [imageText, setImageText] = useState("");
  const [videoText, setVideoText] = useState("");
  const [logic, setLogic] = useState(DEFAULT_LOGIC);
  const [isTranslateEn, setIsTranslateEn] = useState(false);
  const { translate, translating } = useTranslate();

  const extractPrompt = (text: string): string => {
    let cleaned = text.trim();
    const promptMatch = cleaned.match(/(?:\*\*Prompt:\*\*|Prompt:)([\s\S]*)/i);
    if (promptMatch) {
      cleaned = promptMatch[1].trim();
    }
    cleaned = cleaned.replace(/^[\s🎥#*:]+/, '').trim();
    return cleaned;
  };

  const processImageText = () => {
    if (!imageText.trim()) return;
    
    const regex = new RegExp(logic, "gi");
    const splitParts = imageText.split(regex).filter((p) => p.trim() !== "");
    
    let parts = splitParts;
    if (splitParts.length === 0 || (splitParts.length === 1 && splitParts[0].trim().length > 100)) {
      parts = [imageText];
    }
    
    if (parts.length === 0) return;
    
    const newScenes: Scene[] = parts.map((p, i) => ({
      id: Date.now() + i,
      imageText: extractPrompt(p),
      videoText: "",
      mode: "image" as const,
      asset: null,
    }));
    saveScenes([...scenes, ...newScenes]);
    setImageText("");
  };

  const processVideoText = () => {
    if (!videoText.trim()) return;
    
    const regex = new RegExp(logic, "gi");
    const splitParts = videoText.split(regex).filter((p) => p.trim() !== "");
    
    let parts = splitParts;
    if (splitParts.length === 0 || (splitParts.length === 1 && splitParts[0].trim().length > 100)) {
      parts = [videoText];
    }
    
    if (parts.length === 0) return;
    
    const newScenes: Scene[] = parts.map((p, i) => ({
      id: Date.now() + i + 10000,
      imageText: "",
      videoText: extractPrompt(p),
      mode: "video" as const,
      asset: null,
    }));
    saveScenes([...scenes, ...newScenes]);
    setVideoText("");
  };

  const updateScene = (id: number, data: Partial<Scene>) => {
    const updated = scenes.map((s) => (s.id === id ? { ...s, ...data } : s));
    saveScenes(updated);
  };

  const deleteScene = (id: number) => {
    const filtered = scenes.filter((s) => s.id !== id);
    saveScenes(filtered);
  };

  const handleTranslate = async (id: number) => {
    const scene = scenes.find((s) => s.id === id);
    if (!scene) return;
    
    const currentText = scene.mode === "video" ? scene.videoText : scene.imageText;
    if (!currentText.trim()) return;
    
    const translated = await translate(currentText, isTranslateEn);
    
    if (scene.mode === "video") {
      updateScene(id, { videoText: translated });
    } else {
      updateScene(id, { imageText: translated });
    }
  };

  const copyAll = () => {
    const imagePrompts = scenes.filter(s => s.imageText).map(s => s.imageText).join("\n\n");
    const videoPrompts = scenes.filter(s => s.videoText).map(s => s.videoText).join("\n\n");
    const allText = `=== IMÁGENES ===\n${imagePrompts}\n\n=== VIDEOS ===\n${videoPrompts}`;
    navigator.clipboard.writeText(allText);
  };

  const deleteAll = () => {
    if (scenes.length === 0) return;
    if (window.confirm(`¿Eliminar todas las ${scenes.length} escenas?`)) {
      saveScenes([]);
    }
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));

      for (const file of imageFiles) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const newScene: Scene = {
            id: Date.now() + Math.random(),
            imageText: "",
            videoText: "",
            mode: "image",
            asset: ev.target?.result as string,
          };
          saveScenes([...scenes, newScene]);
        };
        reader.readAsDataURL(file);
      }
    },
    [scenes, saveScenes]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="text-emerald-400">Cargando...</div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#020617] text-slate-200 p-6 font-sans"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <nav className="flex gap-4 mb-8 bg-slate-900/50 p-4 rounded-2xl border border-white/5 backdrop-blur-xl sticky top-0 z-50">
        <button className="btn-icon">
          <FolderPlus size={20} /> Carpeta
        </button>
        <button className="btn-icon">
          <Upload size={20} /> Arrastrar Imagen
        </button>
        <button onClick={copyAll} className="btn-icon text-emerald-400">
          <Copy size={20} /> Copiar Todo
        </button>
        <button onClick={deleteAll} className="btn-icon text-red-400">
          <Trash2 size={20} /> Borrar Todo
        </button>
        <button
          onClick={() => setIsTranslateEn(!isTranslateEn)}
          className="btn-icon"
        >
          <Languages size={20} /> {isTranslateEn ? "EN → ES" : "ES → EN"}
        </button>
        <button
          onClick={() => setLogic(DEFAULT_LOGIC)}
          className="ml-auto btn-icon"
        >
          <RotateCcw size={16} /> Reset
        </button>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1 space-y-4">
          <div className="bg-slate-900/80 p-5 rounded-3xl border-2 border-emerald-500/30 backdrop-blur-md">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-emerald-400">
              <ImageIcon size={18} /> Imágenes
            </h2>
            <textarea
              className="w-full h-40 bg-slate-800/50 rounded-xl p-4 focus:ring-2 focus:ring-emerald-500 outline-none border border-white/5 transition-all placeholder-slate-500 text-sm"
              placeholder="Escena 1: El mazo en el ápice..."
              value={imageText}
              onChange={(e) => setImageText(e.target.value)}
            />
            <button
              onClick={processImageText}
              className="w-full mt-3 bg-emerald-600 hover:bg-emerald-500 py-2 rounded-xl font-bold transition-colors text-sm"
            >
              Agregar Imágenes
            </button>
          </div>

          <div className="bg-slate-900/80 p-5 rounded-3xl border-2 border-violet-500/30 backdrop-blur-md">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-violet-400">
              <Clapperboard size={18} /> Videos
            </h2>
            <textarea
              className="w-full h-40 bg-slate-800/50 rounded-xl p-4 focus:ring-2 focus:ring-violet-500 outline-none border border-white/5 transition-all placeholder-slate-500 text-sm"
              placeholder="🎥 ESCENA 1: Primer plano del mago..."
              value={videoText}
              onChange={(e) => setVideoText(e.target.value)}
            />
            <button
              onClick={processVideoText}
              className="w-full mt-3 bg-violet-600 hover:bg-violet-500 py-2 rounded-xl font-bold transition-colors text-sm"
            >
              Agregar Videos
            </button>
          </div>
          <div className="bg-slate-900/80 p-4 rounded-3xl border border-white/10 backdrop-blur-md">
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">
              <FileText size={14} /> Lógica (Regex)
            </h3>
            <input
              value={logic}
              onChange={(e) => setLogic(e.target.value)}
              className="w-full bg-black/20 p-2 rounded text-xs font-mono border border-white/5 text-slate-300"
            />
            <p className="text-xs text-slate-500 mt-2">
              Separador: Escena 1:, Paso 1:, ## 1, 🎥 ESCENA
            </p>
          </div>
        </aside>

        <main className="lg:col-span-3">
          {scenes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-white/10 rounded-3xl bg-slate-900/30">
              <ImageIcon size={48} className="text-slate-600 mb-4" />
              <p className="text-slate-500">Arrastra imágenes o pega texto para comenzar</p>
            </div>
          ) : (
            <Reorder.Group
              axis="y"
              values={scenes}
              onReorder={saveScenes}
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
              <AnimatePresence>
                {scenes.map((scene, index) => (
                  <SceneCard
                    key={scene.id}
                    scene={scene}
                    index={index}
                    updateScene={updateScene}
                    deleteScene={deleteScene}
                    onTranslate={handleTranslate}
                    isTranslating={translating}
                  />
                ))}
              </AnimatePresence>
            </Reorder.Group>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
