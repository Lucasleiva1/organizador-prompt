const fs = require('fs');
const file = 'c:/Users/jaell/Desktop/organizador-prompt/prompt-studio/src/components/QwenEngine.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'if (confirm("¿Limpiar el Storyboard completo?\\nLos paneles, guion y datos se eliminarán. Las imágenes seguirán en tu carpeta.")) {',
  'confirmAction("Limpiar Storyboard", "¿Limpiar el Storyboard completo?\\nLos paneles, guion y datos se eliminarán de este panel. Las imágenes seguirán en tu carpeta.", () => {'
);
content = content.replace(
  '                  setImageErrors({});\n                }',
  '                  setImageErrors({});\n                });'
);
content = content.replace(
  '                  setImageErrors({});\r\n                }',
  '                  setImageErrors({});\r\n                });'
);

content = content.replace(
  'if (confirm(`¿Eliminar este Storyboard (#${storyboardIndex + 1}) por completo?\\nEsta acción no se puede deshacer.`)) {',
  'confirmAction("Eliminar Storyboard", `¿Eliminar este Storyboard (#${storyboardIndex + 1}) por completo?\\nEsta acción no se puede deshacer y el storyboard desaparecerá.`, () => {'
);
content = content.replace(
  '                    onDeleteStoryboard();\n                  }',
  '                    onDeleteStoryboard();\n                  });'
);
content = content.replace(
  '                    onDeleteStoryboard();\r\n                  }',
  '                    onDeleteStoryboard();\r\n                  });'
);

fs.writeFileSync(file, content);
