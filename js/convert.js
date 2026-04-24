// ============================================================
// convert.js — Multi-format conversion tool
// ============================================================

(function () {
  let currentFile = null;

  function init() {
    setupDropZone('dz-convert', 'in-convert', handleFile);
    document.getElementById('btn-convert').addEventListener('click', convert);
  }

  function handleFile(fileList) {
    const f = fileList[0];
    if (!f) return;
    currentFile = f;
    const list = document.getElementById('list-convert');
    list.innerHTML = '';
    const item = createFileItem(f, () => {
      currentFile = null;
      list.innerHTML = '';
      document.getElementById('btn-convert').disabled = true;
    });
    list.appendChild(item);
    document.getElementById('btn-convert').disabled = false;
  }

  async function convert() {
    if (!currentFile) return;

    const outFormat = document.querySelector('input[name="out-format"]:checked')?.value || 'pdf';
    const btn = document.getElementById('btn-convert');
    btn.disabled = true;
    btn.textContent = 'Converting…';

    const resultBoxId = 'result-convert';
    document.getElementById(resultBoxId).classList.remove('show');
    setProgress('prog-convert', 0);

    try {
      const ext = getExt(currentFile.name);
      const fname = baseName(currentFile.name);

      // Route conversion
      if (ext === 'pdf') {
        await fromPDF(outFormat, fname);
      } else if (['jpg','jpeg','png','gif','bmp','webp'].includes(ext)) {
        await fromImage(outFormat, fname, ext);
      } else if (ext === 'docx') {
        await fromDocx(outFormat, fname);
      } else if (ext === 'pptx') {
        await fromPptx(outFormat, fname);
      } else {
        showError(resultBoxId, `Conversion from .${ext} is not supported in this tool.`);
      }
    } catch (err) {
      console.error(err);
      showError(resultBoxId, 'Conversion failed: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Convert';
    }
  }

  // ---- PDF → * ----
  async function fromPDF(outFormat, fname) {
    const resultBoxId = 'result-convert';

    if (outFormat === 'pdf') {
      // PDF → PDF: just return same
      const blob = new Blob([await readFileAsArrayBuffer(currentFile)], { type: 'application/pdf' });
      showResult(resultBoxId, fname + '.pdf', blob);
      return;
    }

    if (outFormat === 'txt' || outFormat === 'html' || outFormat === 'epub') {
      // Extract text from PDF using pdf.js
      setProgress('prog-convert', 20);
      const text = await extractTextFromPDF();
      setProgress('prog-convert', 70);

      if (outFormat === 'txt') {
        const blob = new Blob([text], { type: 'text/plain' });
        setProgress('prog-convert', 100);
        showResult(resultBoxId, fname + '.txt', blob);
      } else if (outFormat === 'html') {
        const html = buildHtml(fname, text);
        const blob = new Blob([html], { type: 'text/html' });
        setProgress('prog-convert', 100);
        showResult(resultBoxId, fname + '.html', blob);
      } else if (outFormat === 'epub') {
        const fontSize = parseInt(document.getElementById('conv-epub-font').value, 10) || 16;
        const htmlContent = text.split('\n\n').map(p => `<p>${escapeHtml(p)}</p>`).join('\n');
        const blob = await buildEpub(fname, htmlContent, fontSize);
        setProgress('prog-convert', 100);
        showResult(resultBoxId, fname + '.epub', blob);
      }
      return;
    }

    if (outFormat === 'png' || outFormat === 'jpg') {
      // PDF → Image using PDF.js
      setProgress('prog-convert', 10);
      const images = await pdfToImages(outFormat);
      setProgress('prog-convert', 90);

      if (images.length === 1) {
        showResult(resultBoxId, fname + '.' + outFormat, images[0].blob);
      } else {
        showResults(resultBoxId, images.map((img, i) => ({
          filename: `${fname}_page${i+1}.${outFormat}`,
          blob: img.blob
        })));
      }
      setProgress('prog-convert', 100);
      return;
    }

    showError(resultBoxId, `PDF → ${outFormat.toUpperCase()} is not yet supported.`);
  }

  // Extract text from PDF using pdfjs-dist CDN (lazy loaded)
  async function extractTextFromPDF() {
    if (!window.pdfjsLib) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const bytes = await readFileAsArrayBuffer(currentFile);
    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    let text = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      text += pageText + '\n\n';
    }
    return text;
  }

  // Convert PDF pages to images using PDF.js
  async function pdfToImages(format) {
    if (!window.pdfjsLib) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const dpi    = parseInt(document.getElementById('conv-dpi').value, 10) || 150;
    const scale  = dpi / 72;
    const bytes  = await readFileAsArrayBuffer(currentFile);
    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const pdf    = await loadingTask.promise;
    const images = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      setProgress('prog-convert', 10 + Math.round(((i-1) / pdf.numPages) * 75));
      const page     = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas   = document.createElement('canvas');
      canvas.width   = viewport.width;
      canvas.height  = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      const quality  = format === 'jpg' ? 0.9 : undefined;
      const dataUrl  = format === 'png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality);
      const b64      = dataUrl.split(',')[1];
      const bytes2   = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      images.push({ blob: new Blob([bytes2], { type: mimeType }) });
    }
    return images;
  }

  // ---- Image → * ----
  async function fromImage(outFormat, fname, ext) {
    const resultBoxId = 'result-convert';
    setProgress('prog-convert', 20);

    if (outFormat === 'pdf') {
      // Use img2pdf logic inline
      const { PDFDocument, rgb } = PDFLib;
      const pdfDoc  = await PDFDocument.create();
      const dataUrl = await readFileAsDataURL(currentFile);
      const img     = await loadImage(dataUrl);

      const canvas  = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx     = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const jpegBytes   = Uint8Array.from(atob(jpegDataUrl.split(',')[1]), c => c.charCodeAt(0));
      const pdfImage    = await pdfDoc.embedJpg(jpegBytes);

      const page = pdfDoc.addPage([img.naturalWidth, img.naturalHeight]);
      page.drawImage(pdfImage, { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight });

      setProgress('prog-convert', 80);
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setProgress('prog-convert', 100);
      showResult(resultBoxId, fname + '.pdf', blob);
      return;
    }

    if (outFormat === 'png' || outFormat === 'jpg') {
      const dataUrl = await readFileAsDataURL(currentFile);
      const img     = await loadImage(dataUrl);
      const canvas  = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx     = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const mimeType = outFormat === 'png' ? 'image/png' : 'image/jpeg';
      const quality  = outFormat === 'jpg' ? 0.92 : undefined;
      const out      = outFormat === 'png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality);
      const b64      = out.split(',')[1];
      const outBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const blob     = new Blob([outBytes], { type: mimeType });
      setProgress('prog-convert', 100);
      showResult(resultBoxId, fname + '.' + outFormat, blob);
      return;
    }

    if (outFormat === 'txt') {
      const blob = new Blob(['[Image file — no text content to extract]'], { type: 'text/plain' });
      setProgress('prog-convert', 100);
      showResult(resultBoxId, fname + '.txt', blob);
      return;
    }

    if (outFormat === 'html') {
      const dataUrl = await readFileAsDataURL(currentFile);
      const html = buildHtml(fname, '', `<img src="${dataUrl}" style="max-width:100%" alt="${escapeHtml(fname)}" />`);
      const blob = new Blob([html], { type: 'text/html' });
      setProgress('prog-convert', 100);
      showResult(resultBoxId, fname + '.html', blob);
      return;
    }

    if (outFormat === 'epub') {
      const dataUrl = await readFileAsDataURL(currentFile);
      const htmlContent = `<img src="${dataUrl}" alt="${escapeHtml(fname)}" style="max-width:100%"/>`;
      const fontSize = parseInt(document.getElementById('conv-epub-font').value, 10) || 16;
      const blob = await buildEpub(fname, htmlContent, fontSize);
      setProgress('prog-convert', 100);
      showResult(resultBoxId, fname + '.epub', blob);
      return;
    }

    showError(resultBoxId, `Image → ${outFormat.toUpperCase()} is not supported.`);
  }

  // ---- DOCX → * ----
  async function fromDocx(outFormat, fname) {
    const resultBoxId = 'result-convert';

    if (outFormat === 'pdf') {
      // Delegate to doc2pdf logic — trigger its flow
      showError(resultBoxId, 'Use the "DOC → PDF" tool for DOCX to PDF conversion.');
      return;
    }

    // Extract raw text from docx
    setProgress('prog-convert', 20);
    const ab  = await readFileAsArrayBuffer(currentFile);
    const zip = await JSZip.loadAsync(ab);
    const xml = await zip.file('word/document.xml').async('string');
    const parser = new DOMParser();
    const doc  = parser.parseFromString(xml, 'application/xml');
    const ns   = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const tEls = doc.getElementsByTagNameNS(ns, 't');
    let text   = '';
    for (const t of tEls) text += t.textContent + ' ';

    setProgress('prog-convert', 60);

    if (outFormat === 'txt') {
      const blob = new Blob([text], { type: 'text/plain' });
      setProgress('prog-convert', 100);
      showResult(resultBoxId, fname + '.txt', blob);
    } else if (outFormat === 'html') {
      const html = buildHtml(fname, text);
      const blob = new Blob([html], { type: 'text/html' });
      setProgress('prog-convert', 100);
      showResult(resultBoxId, fname + '.html', blob);
    } else if (outFormat === 'epub') {
      const fontSize = parseInt(document.getElementById('conv-epub-font').value, 10) || 16;
      const htmlContent = text.split(/\n\s*\n/).map(p => `<p>${escapeHtml(p.trim())}</p>`).join('\n');
      const blob = await buildEpub(fname, htmlContent, fontSize);
      setProgress('prog-convert', 100);
      showResult(resultBoxId, fname + '.epub', blob);
    } else {
      showError(resultBoxId, `DOCX → ${outFormat.toUpperCase()} is not supported in this tool.`);
    }
  }

  // ---- PPTX → * ----
  async function fromPptx(outFormat, fname) {
    const resultBoxId = 'result-convert';

    if (outFormat === 'pdf') {
      showError(resultBoxId, 'Use the "PPT → PDF" tool for PPTX to PDF conversion.');
      return;
    }

    // Extract text from pptx slides
    setProgress('prog-convert', 20);
    const ab  = await readFileAsArrayBuffer(currentFile);
    const zip = await JSZip.loadAsync(ab);

    const slideFiles = Object.keys(zip.files)
      .filter(k => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
      .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

    let allText = '';
    for (let i = 0; i < slideFiles.length; i++) {
      const xml = await zip.file(slideFiles[i]).async('string');
      const parser = new DOMParser();
      const doc  = parser.parseFromString(xml, 'application/xml');
      const tEls = doc.getElementsByTagName('a:t');
      let slideText = `\n--- Slide ${i+1} ---\n`;
      for (const t of tEls) slideText += t.textContent + ' ';
      allText += slideText + '\n';
    }

    setProgress('prog-convert', 65);

    if (outFormat === 'txt') {
      const blob = new Blob([allText], { type: 'text/plain' });
      setProgress('prog-convert', 100);
      showResult(resultBoxId, fname + '.txt', blob);
    } else if (outFormat === 'html') {
      const html = buildHtml(fname, allText);
      const blob = new Blob([html], { type: 'text/html' });
      setProgress('prog-convert', 100);
      showResult(resultBoxId, fname + '.html', blob);
    } else if (outFormat === 'epub') {
      const fontSize = parseInt(document.getElementById('conv-epub-font').value, 10) || 16;
      const htmlContent = allText.split(/\n\s*\n/).map(p => `<p>${escapeHtml(p.trim())}</p>`).join('\n');
      const blob = await buildEpub(fname, htmlContent, fontSize);
      setProgress('prog-convert', 100);
      showResult(resultBoxId, fname + '.epub', blob);
    } else {
      showError(resultBoxId, `PPTX → ${outFormat.toUpperCase()} is not supported.`);
    }
  }

  // ---- Helpers ----
  function buildHtml(title, text, extraHtml = '') {
    const escaped = text.split('\n').map(l => `<p>${escapeHtml(l)}</p>`).join('\n');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: Georgia, serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.8; color: #222; }
  h1 { font-size: 1.8rem; margin-bottom: 1.5rem; }
  p { margin-bottom: 0.75rem; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${extraHtml}
${escaped}
</body>
</html>`;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
