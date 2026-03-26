const fs = require('fs');
const path = 'src/components/QwenEngine.tsx';
let content = fs.readFileSync(path, 'utf8');

// The broken line starts with "  const scanProjectImages = async () => {\r\n" (literal)
// and ends with "  };\r\n" right before "  const openProjectFolder"

const goodFunction = `  const scanProjectImages = async () => {
    const name = projectName.trim() || "Sin_Nombre";
    
    try {
      const docPath = await documentDir();
      const newImages: Record<number, string> = {};

      const scanFolderRecursive = async (folderPath: string) => {
        try {
          const entries = await readDir(folderPath);
          for (const entry of entries) {
            if (entry.isDirectory) {
              const subPath = await join(folderPath, entry.name);
              await scanFolderRecursive(subPath);
            } else if (entry.isFile) {
              const fname = entry.name.toLowerCase();
              if (fname.endsWith('.png') || fname.endsWith('.jpg') || fname.endsWith('.jpeg') || fname.endsWith('.webp')) {
                const numMatch = fname.match(/(\\d+)/);
                if (numMatch) {
                  const num = parseInt(numMatch[1]);
                  if (!newImages[num]) {
                    const fullPath = await join(folderPath, entry.name);
                    const src = convertFileSrc(fullPath);
                    newImages[num] = src;
                    console.log(\`[STORYBOARD] Imagen detectada: Panel \${num} -> \${src}\`);
                  }
                }
              }
            }
          }
        } catch {
          // Carpeta no existe, ignorar
        }
      };

      const searchRoots = [
        await join(docPath, 'Prompt Studio', name),
        await join(docPath, 'Prompt Studio', 'images-storyboard', name),
      ];

      for (const root of searchRoots) {
        console.log(\`[SCAN] Buscando recursivamente en: \${root}\`);
        await scanFolderRecursive(root);
      }

      const foundAny = Object.keys(newImages).length > 0;
      setProjectImages(newImages);
      setLastScanCount(Object.keys(newImages).length);
      setImageErrors({});
      console.log(\`[SCAN] \${Object.keys(newImages).length} imagenes encontradas para "\${name}"\`);

      if (!foundAny) {
        scanAttemptsRef.current += 1;
        console.log(\`[SCAN] Intento \${scanAttemptsRef.current}/2 sin resultados para "\${name}".\`);
        if (scanAttemptsRef.current < 2) {
          setTimeout(scanProjectImages, 2000);
        } else {
          console.log(\`[SCAN] 2 intentos completados. Usa el boton Escanear para buscar manualmente.\`);
        }
      } else {
        scanAttemptsRef.current = 0;
      }

    } catch (e) {
      console.warn("Error escaneando imagenes:", e);
      setLastScanCount(0);
    }
  };`;

// Find the broken line - it starts with "  const scanProjectImages"
// and replace through to just before "  const openProjectFolder"
const brokenStart = content.indexOf('  const scanProjectImages = async ()');
const openProjectFolder = content.indexOf('\r\n  const openProjectFolder');

if (brokenStart === -1 || openProjectFolder === -1) {
  console.log('Could not find markers!');
  console.log('brokenStart:', brokenStart);
  console.log('openProjectFolder:', openProjectFolder);
  process.exit(1);
}

const before = content.substring(0, brokenStart);
const after = content.substring(openProjectFolder);

content = before + goodFunction + after;
fs.writeFileSync(path, content, 'utf8');
console.log('Fixed!');
