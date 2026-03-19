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
