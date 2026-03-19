import { writeFile, readFile, mkdir, BaseDirectory, remove } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

export class AssetManager {
  // New user-visible directory in "Documents"
  private static readonly NEW_ASSETS_DIR = 'Prompt Studio/personajes';
  // Old hidden AppData directory (for backward compatibility)
  private static readonly OLD_ASSETS_DIR = 'assets';

  /**
   * Initializes the new visible assets directory if it doesn't exist.
   */
  static async init() {
    try {
      await mkdir(this.NEW_ASSETS_DIR, { 
        baseDir: BaseDirectory.Document,
        recursive: true 
      });
    } catch (e) {
      console.warn('AssetManager: Assets directory initialization notice:', e);
    }
  }

  /**
   * Deletes an asset file from the Documents/Prompt Studio/personajes directory.
   */
  static async deleteAsset(fileName: string): Promise<void> {
    if (!fileName) return;

    // Don't delete URLs or Base64 (only local files)
    if (fileName.startsWith('http') || fileName.startsWith('data:') || fileName.startsWith('blob:')) {
      return;
    }

    try {
      const relativePath = await join(this.NEW_ASSETS_DIR, fileName);
      await remove(relativePath, { 
        baseDir: BaseDirectory.Document 
      });
      console.log('AssetManager: Deleted asset file:', fileName);
    } catch (e) {
      console.warn('AssetManager: Failed to delete asset (file might not exist):', e);
    }
  }

  /**
   * Saves a File object to the Documents/Prompt Studio/personajes directory
   * and returns the filename.
   */
  static async saveAsset(file: File, prefix: string = ''): Promise<string> {
    await this.init();

    const fileName = `${prefix}_${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const relativePath = await join(this.NEW_ASSETS_DIR, fileName);
    
    await writeFile(relativePath, uint8Array, { 
      baseDir: BaseDirectory.Document 
    });

    return fileName;
  }

  /**
   * Resolves a filename to its absolute system path for native integrations.
   * Checks the new Documents folder first, then falls back to AppData.
   */
  static async getAssetAbsolutePath(fileName: string): Promise<string | null> {
    if (!fileName) return null;
    
    try {
      const baseDocPath = await import("@tauri-apps/api/path").then(m => m.documentDir());
      return await join(baseDocPath, this.NEW_ASSETS_DIR, fileName);
    } catch {
      return null;
    }
  }

  /**
   * Resolves a filename to a Base64 Data URL that can be used everywhere.
   * Checks the new Documents folder first, then falls back to old AppData.
   */
  static async resolveAssetUrl(fileName: string): Promise<string> {
    if (!fileName) return '';
    
    if (fileName.startsWith('http') || fileName.startsWith('data:') || fileName.startsWith('blob:')) {
      return fileName;
    }

    let data: Uint8Array;
    
    try {
      // 1. Try new Documents location
      const newRelativePath = await join(this.NEW_ASSETS_DIR, fileName);
      data = await readFile(newRelativePath, { baseDir: BaseDirectory.Document });
    } catch (err1) {
      // 2. Fallback to old AppData location
      try {
        const oldRelativePath = await join(this.OLD_ASSETS_DIR, fileName);
        data = await readFile(oldRelativePath, { baseDir: BaseDirectory.AppData });
      } catch (err2) {
        console.error("AssetManager: Error resolving URL in both locations:", err2);
        return '';
      }
    }

    const extension = fileName.split('.').pop()?.toLowerCase() || 'png';
    const mimeType = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`;
    
    // Convert Uint8Array to Base64
    let binary = '';
    const len = data.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(data[i]);
    }
    const base64 = btoa(binary);
    
    return `data:${mimeType};base64,${base64}`;
  }
}
