// ============================================================
// doc2pdf.js — Convert DOCX to PDF using JSZip + pdf-lib
// Extracts text & basic styles from DOCX XML and renders to PDF
// ============================================================

(function () {
  let currentFile = null;

  function init() {
    setupDropZone('dz-doc2pdf', 'in-doc2pdf', handleFile);
    document.getElementById('btn-doc2pdf').addEventListener('click', convert);
  }

  function handleFile(fileList) {
    const f = Array.from(fileList).find(f =>
      f.name.endsWith('.docx') || f.name.endsWith('.doc')
    );
    if (!f) { alert('Please upload a .docx file.'); return; }

    currentFile = f;
    const list = document.getElementById('list-doc2pdf');
    list.innerHTML = '';
    const item = createFileItem(f, () => {
      currentFile = null;
      list.innerHTML = '';
      document.getElementById('btn-doc2pdf').disabled = true;
    });
    list.appendChild(item);
    document.getElementById('btn-doc2pdf').disabled = false;
  }

  async function convert() {
    if (!currentFile) return;

    const btn = document.getElementById('btn-doc2pdf');
    btn.disabled = true;
    btn.textContent = 'Converting…';

    const resultBoxId = 'result-doc2pdf';
    document.getElementById(resultBoxId).classList.remove('show');
    setProgress('prog-doc2pdf', 0);

    try {
      const arrayBuffer = await readFileAsArrayBuffer(currentFile);
      setProgress('prog-doc2pdf', 15);

      // Parse DOCX (it's a ZIP containing XML)
      const zip = await JSZip.loadAsync(arrayBuffer);
      const documentXml = await zip.file('word/document.xml').async('string');

      // Also try to get numbering, styles
      let stylesXml = '';
      let numberingXml = '';
      try { stylesXml = await zip.file('word/styles.xml').async('string'); } catch {}
      try { numberingXml = await zip.file('word/numbering.xml').async('string'); } catch {}

      setProgress('prog-doc2pdf', 30);

      // Extract images
      const images = {};
      const imgFiles = Object.keys(zip.files).filter(k =>
        k.startsWith('word/media/') && /\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(k)
      );
      for (const imgPath of imgFiles) {
        try {
          const imgData = await zip.file(imgPath).async('base64');
          const ext = getExt(imgPath);
          const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
          images[imgPath.split('/').pop()] = `data:${mimeType};base64,${imgData}`;
        } catch {}
      }

      // Parse paragraphs from document XML
      const paragraphs = parseDocxParagraphs(documentXml, numberingXml);

      setProgress('prog-doc2pdf', 50);

      // Render to PDF
      const sizeName  = document.getElementById('doc-pagesize').value;
      const margin    = parseInt(document.getElementById('doc-margin').value, 10) || 40;
      const fontSize  = parseInt(document.getElementById('doc-fontsize').value, 10) || 12;
      const lineSpace = parseFloat(document.getElementById('doc-linespace').value) || 1.5;
      const headStyle = document.getElementById('doc-heading').value;
      const embedImgs = document.getElementById('doc-images').value === 'yes';

      const pdfBytes = await renderDocToPdf({
        paragraphs, images, embedImgs,
        sizeName, margin, fontSize, lineSpace, headStyle
      });

      setProgress('prog-doc2pdf', 95);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setProgress('prog-doc2pdf', 100);

      showResult(resultBoxId, baseName(currentFile.name) + '.pdf', blob);
    } catch (err) {
      console.error(err);
      showError(resultBoxId, 'Conversion failed: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Convert to PDF';
    }
  }

  // ---- DOCX XML Parser ----
  function parseDocxParagraphs(xml, numberingXml) {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(xml, 'application/xml');
    const ns     = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const paras  = doc.getElementsByTagNameNS(ns, 'p');
    const result = [];

    // Simple numbering extraction
    let listCounter = {};

    for (const para of paras) {
      const pPr  = para.getElementsByTagNameNS(ns, 'pPr')[0];
      const pStyle = pPr?.getElementsByTagNameNS(ns, 'pStyle')[0]?.getAttribute('w:val') || '';
      const numPr  = pPr?.getElementsByTagNameNS(ns, 'numPr')[0];
      const jc     = pPr?.getElementsByTagNameNS(ns, 'jc')[0]?.getAttribute('w:val') || '';

      // Collect runs
      const runs = para.getElementsByTagNameNS(ns, 'r');
      let text = '';
      let isBold = false, isItalic = false;

      for (const run of runs) {
        const rPr  = run.getElementsByTagNameNS(ns, 'rPr')[0];
        const bold = rPr?.getElementsByTagNameNS(ns, 'b')[0];
        const ital = rPr?.getElementsByTagNameNS(ns, 'i')[0];
        if (bold) isBold = true;
        if (ital) isItalic = true;

        // t elements
        const tEls = run.getElementsByTagNameNS(ns, 't');
        for (const t of tEls) text += t.textContent;

        // Check for drawing (image)
        const drawing = run.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blipFill')[0];
        if (drawing) {
          const blip = drawing.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0];
          if (blip) {
            const rId = blip.getAttribute('r:embed');
            text += `[IMAGE:${rId}]`;
          }
        }
      }

      // Determine heading level
      let headingLevel = 0;
      if (/^[Hh]eading\s*([1-6])/.test(pStyle)) {
        headingLevel = parseInt(pStyle.replace(/\D/g, ''), 10) || 1;
      }

      // List
      let isList = false, listPrefix = '';
      if (numPr) {
        isList = true;
        const ilvl = parseInt(numPr.getElementsByTagNameNS(ns, 'ilvl')[0]?.getAttribute('w:val') || '0', 10);
        listPrefix = '  '.repeat(ilvl) + '• ';
      }

      if (text.trim() || headingLevel) {
        result.push({
          text: text,
          headingLevel,
          isBold: isBold || headingLevel > 0,
          isItalic,
          isList,
          listPrefix,
          align: jc === 'center' ? 'center' : jc === 'right' ? 'right' : 'left'
        });
      } else {
        result.push({ text: '', headingLevel: 0, isBold: false, isItalic: false, isList: false, listPrefix: '', align: 'left' });
      }
    }
    return result;
  }

  // ---- PDF Renderer ----
  async function renderDocToPdf({ paragraphs, images, embedImgs, sizeName, margin, fontSize, lineSpace, headStyle }) {
    const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;
    const pdfDoc   = await PDFDocument.create();
    const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontItal = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const [pageW, pageH] = getPageDims(sizeName, 'portrait');
    const maxW = pageW - margin * 2;

    let page = pdfDoc.addPage([pageW, pageH]);
    let y    = pageH - margin;

    const headColors = {
      bold:    [[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
      colored: [[0.17,0.4,0.83],[0.22,0.55,0.42],[0.65,0.35,0.12],[0.4,0.3,0.6],[0.3,0.3,0.3],[0.3,0.3,0.3]],
      plain:   [[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
    };

    function newPage() {
      page = pdfDoc.addPage([pageW, pageH]);
      y = pageH - margin;
    }

    function needsPage(lineH) {
      if (y - lineH < margin) newPage();
    }

    function wrapText(text, fnt, size, maxWidth) {
      const words = text.split(' ');
      const lines = [];
      let current = '';

      for (const word of words) {
        const test = current ? current + ' ' + word : word;
        const w = fnt.widthOfTextAtSize(test, size);
        if (w > maxWidth && current) {
          lines.push(current);
          current = word;
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);
      return lines.length ? lines : [''];
    }

    for (const para of paragraphs) {
      if (!para.text.trim()) {
        // Empty paragraph = blank line
        y -= fontSize * lineSpace * 0.6;
        if (y < margin) newPage();
        continue;
      }

      let fntSz = fontSize;
      let fnt   = font;
      let color = [0, 0, 0];

      if (para.headingLevel > 0) {
        const idx = para.headingLevel - 1;
        fntSz = fontSize + Math.max(0, (6 - para.headingLevel) * 2 + 4);
        fnt   = fontBold;
        const c = (headColors[headStyle] || headColors.bold)[idx];
        color = c;
        y -= fntSz * 0.4; // extra spacing before heading
      } else if (para.isBold) {
        fnt = fontBold;
      } else if (para.isItalic) {
        fnt = fontItal;
      }

      const displayText = (para.isList ? para.listPrefix : '') + para.text;
      const lines = wrapText(displayText, fnt, fntSz, maxW);
      const lineH = fntSz * lineSpace;

      for (const line of lines) {
        needsPage(lineH);

        let xPos = margin;
        if (para.align === 'center') {
          const tw = fnt.widthOfTextAtSize(line, fntSz);
          xPos = margin + (maxW - tw) / 2;
        } else if (para.align === 'right') {
          const tw = fnt.widthOfTextAtSize(line, fntSz);
          xPos = pageW - margin - tw;
        }

        page.drawText(line, {
          x: xPos,
          y: y - fntSz,
          size: fntSz,
          font: fnt,
          color: rgb(color[0], color[1], color[2]),
          maxWidth: maxW,
        });
        y -= lineH;
      }
    }

    return pdfDoc.save();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
