const { jsPDF } = require('jspdf');
const fs = require('fs');
const path = require('path');

const doc = new jsPDF();

// Title
doc.setFontSize(22);
doc.setTextColor(30, 41, 59); // Slate-800
doc.text("LÓGICA DEL AGENTE DE PRODUCCIÓN TÉCNICA", 20, 25);

// Header line
doc.setLineWidth(1);
doc.setDrawColor(16, 185, 129); // Emerald-500
doc.line(20, 30, 190, 30);

// Bullet points
doc.setFontSize(14);
doc.setFont("helvetica", "bold");
doc.text("1. Divisor por 'Hachazo' Inteligente", 20, 45);
doc.setFont("helvetica", "normal");
doc.setFontSize(11);
doc.text("A diferencia del Storyboard, este agente no depende de saltos de línea. \nBusca el patrón 'PLANO X' en cualquier parte del texto para separar escenas.", 25, 52);

doc.setFontSize(14);
doc.setFont("helvetica", "bold");
doc.text("2. Mapeo de Campos Técnicos", 20, 75);
doc.setFont("helvetica", "normal");
doc.setFontSize(11);
doc.text("Extrae dinámicamente el contenido de 'Visual', 'Óptica' y 'Luz'. \nLa 'Visual' se convierte en el prompt principal, mientras que 'Óptica' y 'Luz' \nse guardan como metadatos para la barra lateral.", 25, 82);

doc.setFontSize(14);
doc.setFont("helvetica", "bold");
doc.text("3. Limpieza de Citaciones (cite: X)", 20, 105);
doc.setFont("helvetica", "normal");
doc.setFontSize(11);
doc.text("Identifica y elimina de forma invisible marcadores como '[cite: 8]' y '[cite_start]'. \nEsto asegura que la IA de generación no 'lea' basura técnica de la planilla.", 25, 112);

doc.setFontSize(14);
doc.setFont("helvetica", "bold");
doc.text("4. Re-Enumeración Dinámica", 20, 135);
doc.setFont("helvetica", "normal");
doc.setFontSize(11);
doc.text("Asigna un número de escena correlativo a cada tarjeta para mantener el orden, \nincluso si el guion original tiene saltos o duplicados.", 25, 142);

// Signature
doc.setFontSize(10);
doc.setTextColor(100, 116, 139); // Slate-500
doc.text("Generado por Antigravity v1.0 - Modo Producción Final", 20, 280);

const desktopPath = "C:\\Users\\jaell\\Desktop\\Logica_Agente_Produccion.pdf";
const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
fs.writeFileSync(desktopPath, pdfBuffer);

console.log("PDF Creado con éxito en el escritorio.");
