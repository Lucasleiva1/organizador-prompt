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
}

export interface Workspace {
  id: string;
  theme: "normal" | "golden";
}
