// ============================================================
// ppt2pdf.js — Convert PPTX to PDF using JSZip + pdf-lib
// ============================================================

(function () {
  let currentFile = null;

  function init() {
    setupDropZone('dz-ppt2pdf', 'in-ppt2pdf', handleFile);
    document.getElementById('btn-ppt2pdf').addEventListener('click', convert);
  }

  function handleFile(fileList) {
    const f = Array.from(fileList).find(f =>
      f.name.endsWith('.pptx') || f.name.endsWith('.ppt')
    );
    if (!f) { alert('Please upload a .pptx file.'); return; }
    currentFile = f;
    const list = document.getElementById('list-ppt2pdf');
    list.innerHTML = '';
    const item = createFileItem(f, () => {
      currentFile = null;
      list.innerHTML = '';
      document.getElementById('btn-ppt2pdf').disabled = true;
    });
    list.appendChild(item);
    document.getElementById('btn-ppt2pdf').disabled = false;
  }

  async function convert() {
    if (!currentFile) return;
    const btn = document.getElementById('btn-ppt2pdf');
    btn.disabled = true;
    btn.textContent = 'Converting…';

    const resultBoxId = 'result-ppt2pdf';
    document.getElementById(resultBoxId).classList.remove('show');
    setProgress('prog-ppt2pdf', 0);

    try {
      const arrayBuffer = await readFileAsArrayBuffer(currentFile);
      setProgress('prog-ppt2pdf', 15);

      const zip = await JSZip.loadAsync(arrayBuffer);

      // Find slide files
      let slideFiles = Object.keys(zip.files)
        .filter(k => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
        .sort((a, b) => {
          const na = parseInt(a.match(/\d+/)[0]);
          const nb = parseInt(b.match(/\d+/)[0]);
          return na - nb;
        });

      if (slideFiles.length === 0) {
        throw new Error('No slides found in the PPTX file. Please make sure the file is a valid .pptx.');
      }

      // Extract images from ppt/media
      const mediaFiles = Object.keys(zip.files)
        .filter(k => k.startsWith('ppt/media/') && /\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(k));
      const images = {};
      for (const mf of mediaFiles) {
        try {
          const b64 = await zip.file(mf).async('base64');
          const ext = getExt(mf);
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
          images[mf] = `data:${mime};base64,${b64}`;
          // Also key by short name
          images[mf.split('/').pop()] = images[mf];
        } catch {}
      }

      // Read slide relationships to map rId → image path
      const slideRels = {};
      for (const sf of slideFiles) {
        const relPath = sf.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
        try {
          const relXml = await zip.file(relPath).async('string');
          const parser = new DOMParser();
          const relDoc = parser.parseFromString(relXml, 'application/xml');
          const rels = relDoc.getElementsByTagName('Relationship');
          const map = {};
          for (const rel of rels) {
            map[rel.getAttribute('Id')] = rel.getAttribute('Target');
          }
          slideRels[sf] = map;
        } catch { slideRels[sf] = {}; }
      }

      const layout = document.getElementById('ppt-layout').value;
      const perPage = parseInt(document.getElementById('ppt-perpage').value, 10) || 1;
      const showNums = document.getElementById('ppt-slidenum').value === 'yes';
      const bgMode   = document.getElementById('ppt-bg').value;

      // Page dimensions (in points)
      const slideW = layout === 'widescreen' ? 960 : 720;
      const slideH = layout === 'widescreen' ? 540 : 540;

      setProgress('prog-ppt2pdf', 25);

      const { PDFDocument, StandardFonts, rgb } = PDFLib;
      const pdfDoc = await PDFDocument.create();
      const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontB  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Determine grid layout
      const cols = perPage <= 1 ? 1 : 2;
      const rows = Math.ceil(perPage / cols);
      const padding = 20;

      const pageW = cols === 1 ? slideW : slideW * cols + padding * (cols + 1);
      const pageH = rows === 1 ? slideH : slideH * rows + padding * (rows + 1);

      let currentPage = null;
      let slideIdx = 0;

      for (let si = 0; si < slideFiles.length; si++) {
        const slotInPage = si % perPage;
        if (slotInPage === 0) {
          currentPage = pdfDoc.addPage([pageW, pageH]);
          // Background
          if (bgMode === 'white') {
            currentPage.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: rgb(1,1,1) });
          } else if (bgMode === 'black') {
            currentPage.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: rgb(0,0,0) });
          }
        }

        // Determine slot position
        const col = slotInPage % cols;
        const row = Math.floor(slotInPage / cols);
        const offsetX = cols === 1 ? 0 : padding + col * (slideW + padding);
        const offsetY_from_top = rows === 1 ? 0 : padding + row * (slideH + padding);
        const offsetY = pageH - offsetY_from_top - slideH;

        // Parse slide XML
        const slideXml = await zip.file(slideFiles[si]).async('string');
        const rels = slideRels[slideFiles[si]] || {};

        await renderSlide({
          pdfDoc, page: currentPage, font, fontB,
          slideXml, images, rels,
          x: offsetX, y: offsetY,
          w: slideW, h: slideH,
          slideNum: si + 1, totalSlides: slideFiles.length,
          showNums, bgMode
        });

        setProgress('prog-ppt2pdf', 25 + Math.round((si / slideFiles.length) * 65));
      }

      setProgress('prog-ppt2pdf', 95);
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setProgress('prog-ppt2pdf', 100);

      showResult(resultBoxId, baseName(currentFile.name) + '.pdf', blob);
    } catch (err) {
      console.error(err);
      showError(resultBoxId, 'Conversion failed: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Convert to PDF';
    }
  }

  async function renderSlide({ pdfDoc, page, font, fontB, slideXml, images, rels, x, y, w, h, slideNum, totalSlides, showNums, bgMode }) {
    const { rgb } = PDFLib;
    const parser = new DOMParser();
    const doc    = parser.parseFromString(slideXml, 'application/xml');

    // Background color from slide
    const bgEl = doc.getElementsByTagName('p:bg')[0];
    let bgColor = null;
    if (bgEl) {
      const solidFill = bgEl.getElementsByTagName('a:solidFill')[0];
      if (solidFill) {
        const srgb = solidFill.getElementsByTagName('a:srgbClr')[0];
        if (srgb) {
          const hex = srgb.getAttribute('val');
          if (hex) {
            bgColor = hexToRgb(hex);
          }
        }
      }
    }

    if (bgMode === 'keep' && bgColor) {
      page.drawRectangle({ x, y, width: w, height: h, color: rgb(bgColor[0], bgColor[1], bgColor[2]) });
    } else if (bgMode === 'white') {
      page.drawRectangle({ x, y, width: w, height: h, color: rgb(1,1,1) });
    } else if (bgMode === 'black') {
      page.drawRectangle({ x, y, width: w, height: h, color: rgb(0,0,0) });
    } else {
      // default white
      page.drawRectangle({ x, y, width: w, height: h, color: rgb(1,1,1) });
    }

    // Extract shapes
    const spTree = doc.getElementsByTagName('p:spTree')[0];
    if (!spTree) return;

    const shapes = spTree.getElementsByTagName('p:sp');
    const textBgColor = bgMode === 'black' ? [1,1,1] : [0,0,0];

    for (const shape of shapes) {
      try {
        // Position/size
        const xfrm = shape.getElementsByTagName('a:xfrm')[0];
        if (!xfrm) continue;
        const off  = xfrm.getElementsByTagName('a:off')[0];
        const ext  = xfrm.getElementsByTagName('a:ext')[0];
        if (!off || !ext) continue;

        // PPTX EMU = English Metric Unit, 914400 EMU per inch, 72pt per inch
        // slide dims in pptx = 9144000 x 5143500 EMU (16:9) or 6858000 x 5143500 (4:3 default 10x7.5in)
        const emu2pt_x = w / 9144000;
        const emu2pt_y = h / 6858000;

        const cx  = parseInt(off.getAttribute('x') || 0) * emu2pt_x + x;
        const cy_from_top = parseInt(off.getAttribute('y') || 0) * emu2pt_y;
        const cw  = parseInt(ext.getAttribute('cx') || 0) * emu2pt_x;
        const ch  = parseInt(ext.getAttribute('cy') || 0) * emu2pt_y;
        const cy  = y + h - cy_from_top - ch;

        // Text
        const txBody = shape.getElementsByTagName('p:txBody')[0];
        if (!txBody) continue;

        const paras = txBody.getElementsByTagName('a:p');
        let lineY = cy + ch;

        for (const para of paras) {
          const runs = para.getElementsByTagName('a:r');
          let lineText = '';
          let boldRun = false;
          let rFontSz = 14; // default

          for (const run of runs) {
            const rPr = run.getElementsByTagName('a:rPr')[0];
            const t   = run.getElementsByTagName('a:t')[0];
            if (!t) continue;
            lineText += t.textContent;
            if (rPr) {
              const sz = rPr.getAttribute('sz');
              if (sz) rFontSz = parseInt(sz, 10) / 100;
              if (rPr.getAttribute('b') === '1' || rPr.getAttribute('b') === 'true') boldRun = true;
            }
          }

          if (!lineText.trim()) {
            lineY -= rFontSz * 1.3;
            continue;
          }

          // Keep font size within slot bounds
          const maxFontSz = Math.min(rFontSz, ch * 0.2, cw * 0.08);
          const useFontSz = Math.max(6, maxFontSz);
          const useFont   = boldRun ? fontB : font;

          lineY -= useFontSz * 1.4;
          if (lineY < cy) break;

          page.drawText(lineText.slice(0, 200), {
            x: cx + 2,
            y: Math.max(cy, lineY),
            size: useFontSz,
            font: useFont,
            color: rgb(textBgColor[0], textBgColor[1], textBgColor[2]),
            maxWidth: cw - 4,
          });
        }
      } catch {}
    }

    // Handle images in slide
    const pics = doc.getElementsByTagName('p:pic');
    for (const pic of pics) {
      try {
        const blipFill = pic.getElementsByTagName('p:blipFill')[0];
        if (!blipFill) continue;
        const blip = blipFill.getElementsByTagName('a:blip')[0];
        if (!blip) continue;

        const rId = blip.getAttribute('r:embed');
        if (!rId || !rels[rId]) continue;

        let imgTarget = rels[rId];
        if (imgTarget.startsWith('../media/')) imgTarget = imgTarget.replace('../media/', '');
        const imgData = images[imgTarget] || images['ppt/media/' + imgTarget];
        if (!imgData) continue;

        // Position
        const xfrm = pic.getElementsByTagName('a:xfrm')[0] || pic.getElementsByTagName('p:xfrm')[0];
        if (!xfrm) continue;

        const emu2pt_x = w / 9144000;
        const emu2pt_y = h / 6858000;

        const off = xfrm.getElementsByTagName('a:off')[0];
        const ext = xfrm.getElementsByTagName('a:ext')[0];
        if (!off || !ext) continue;

        const ix  = parseInt(off.getAttribute('x') || 0) * emu2pt_x + x;
        const iyt = parseInt(off.getAttribute('y') || 0) * emu2pt_y;
        const iw  = parseInt(ext.getAttribute('cx') || 0) * emu2pt_x;
        const ih  = parseInt(ext.getAttribute('cy') || 0) * emu2pt_y;
        const iy  = y + h - iyt - ih;

        const isJpg = imgData.includes('image/jpeg');
        const b64   = imgData.split(',')[1];
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

        let pdfImg;
        if (isJpg) {
          pdfImg = await pdfDoc.embedJpg(bytes);
        } else {
          pdfImg = await pdfDoc.embedPng(bytes);
        }

        page.drawImage(pdfImg, { x: ix, y: iy, width: iw, height: ih });
      } catch {}
    }

    // Slide number
    if (showNums) {
      const numText = `${slideNum} / ${totalSlides}`;
      page.drawText(numText, {
        x: x + w - 50,
        y: y + 8,
        size: 9,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    // Border around each slide slot
    page.drawRectangle({
      x, y, width: w, height: h,
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 0.5,
    });
  }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(0,2), 16) / 255;
    const g = parseInt(hex.slice(2,4), 16) / 255;
    const b = parseInt(hex.slice(4,6), 16) / 255;
    return [r, g, b];
  }

  document.addEventListener('DOMContentLoaded', init);
})();
