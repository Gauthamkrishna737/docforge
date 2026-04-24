// ============================================================
// img2pdf.js — Convert images to PDF using pdf-lib
// ============================================================

(function () {
  const files = [];

  function init() {
    setupDropZone('dz-img2pdf', 'in-img2pdf', handleFiles);

    document.getElementById('img-quality').addEventListener('input', function () {
      document.getElementById('img-quality-val').textContent = parseFloat(this.value).toFixed(2);
    });

    document.getElementById('btn-img2pdf').addEventListener('click', convert);
  }

  function handleFiles(fileList) {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
    Array.from(fileList).forEach(f => {
      if (!allowed.includes(f.type)) return;
      files.push(f);
    });
    renderList();
    renderPreviews();
    document.getElementById('btn-img2pdf').disabled = files.length === 0;
  }

  function renderList() {
    const list = document.getElementById('list-img2pdf');
    list.innerHTML = '';
    files.forEach((f, i) => {
      const item = createFileItem(f, () => {
        files.splice(i, 1);
        renderList();
        renderPreviews();
        document.getElementById('btn-img2pdf').disabled = files.length === 0;
      });
      list.appendChild(item);
    });
  }

  function renderPreviews() {
    const box = document.getElementById('preview-img2pdf');
    box.innerHTML = '';
    files.forEach(f => {
      const url = URL.createObjectURL(f);
      const img = document.createElement('img');
      img.className = 'preview-thumb';
      img.src = url;
      img.onload = () => URL.revokeObjectURL(url);
      box.appendChild(img);
    });
  }

  async function convert() {
    if (files.length === 0) return;

    const btn = document.getElementById('btn-img2pdf');
    btn.disabled = true;
    btn.textContent = 'Converting…';

    const resultBoxId = 'result-img2pdf';
    document.getElementById(resultBoxId).classList.remove('show');
    setProgress('prog-img2pdf', 0);

    try {
      const sizeName   = document.getElementById('img-pagesize').value;
      const orient     = document.getElementById('img-orientation').value;
      const margin     = parseInt(document.getElementById('img-margin').value, 10) || 0;
      const fit        = document.getElementById('img-fit').value;
      const quality    = parseFloat(document.getElementById('img-quality').value);
      const bgColorHex = document.getElementById('img-bg').value;

      const { PDFDocument, rgb } = PDFLib;
      const pdfDoc = await PDFDocument.create();

      for (let i = 0; i < files.length; i++) {
        setProgress('prog-img2pdf', Math.round((i / files.length) * 80));

        const dataUrl = await readFileAsDataURL(files[i]);
        const img     = await loadImage(dataUrl);

        // Draw image to canvas to normalize format & apply quality
        const canvas  = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx     = canvas.getContext('2d');

        // Fill background
        ctx.fillStyle = bgColorHex;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
        const jpegBytes   = Uint8Array.from(atob(jpegDataUrl.split(',')[1]), c => c.charCodeAt(0));
        const pdfImage    = await pdfDoc.embedJpg(jpegBytes);

        // Determine page size
        let pageW, pageH;
        if (sizeName === 'fit') {
          pageW = img.naturalWidth;
          pageH = img.naturalHeight;
        } else {
          const rawDims = getPageDims(sizeName,
            orient === 'auto'
              ? (img.naturalWidth > img.naturalHeight ? 'landscape' : 'portrait')
              : orient
          );
          pageW = rawDims[0];
          pageH = rawDims[1];
        }

        const page = pdfDoc.addPage([pageW, pageH]);

        const drawW = pageW - margin * 2;
        const drawH = pageH - margin * 2;
        const imgAR = img.naturalWidth / img.naturalHeight;
        const drawAR = drawW / drawH;

        let x, y, w, h;

        if (fit === 'stretch') {
          x = margin; y = margin; w = drawW; h = drawH;
        } else if (fit === 'contain') {
          if (imgAR > drawAR) {
            w = drawW; h = w / imgAR;
            x = margin; y = margin + (drawH - h) / 2;
          } else {
            h = drawH; w = h * imgAR;
            y = margin; x = margin + (drawW - w) / 2;
          }
        } else { // crop — scale image so shorter side fills the draw area
          if (imgAR > drawAR) {
            // image wider than slot: scale by height, overflow left/right
            h = drawH; w = h * imgAR;
            x = margin + (drawW - w) / 2; y = margin;
          } else {
            // image taller than slot: scale by width, overflow top/bottom
            w = drawW; h = w / imgAR;
            x = margin; y = margin + (drawH - h) / 2;
          }
          // Constrain visible area to draw region via CropBox
          page.setCropBox(margin, margin, drawW, drawH);
        }

        // Parse background color
        const r = parseInt(bgColorHex.slice(1,3), 16) / 255;
        const g = parseInt(bgColorHex.slice(3,5), 16) / 255;
        const b = parseInt(bgColorHex.slice(5,7), 16) / 255;
        page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: rgb(r, g, b) });

        page.drawImage(pdfImage, { x, y, width: w, height: h });
      }

      setProgress('prog-img2pdf', 95);
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setProgress('prog-img2pdf', 100);

      const outName = files.length === 1
        ? baseName(files[0].name) + '.pdf'
        : 'images_converted.pdf';

      showResult(resultBoxId, outName, blob);
    } catch (err) {
      console.error(err);
      showError(resultBoxId, 'Conversion failed: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Convert to PDF';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
