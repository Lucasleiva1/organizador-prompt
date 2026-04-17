export interface Scene {
  id: string;
  imageText: string;
  videoText: string;
  translatedImageText?: string;
  translatedVideoText?: string;
  mode: "image" | "video";
  asset: string | null;
  groupId?: string;
  theme?: "normal" | "golden";
  sceneNumber?: number;
  optics?: string;
  physics?: string;
  timing?: string;
  vfx?: string;
  sound?: string;
}

export interface Workspace {
  id: string;
  theme: "normal" | "golden";
  name?: string;
}
export interface Character {
  id: string;
  name: string;
  asset: string;
}

export interface Script {
  id: string;
  title: string;
  content: string;
}

export interface QwenPanel {
  scene: number;
  description: string;
  optics: string;
  physics: string;
  timing: string;
  imageUrl?: string;
}

export interface Storyboard {
  id: string;
  folderNumber: number;
  panels: QwenPanel[];
  script: string;
}
