// ============================================================
// split.js — Split PDF using pdf-lib
// ============================================================

(function () {
  let currentFile = null;
  let totalPages  = 0;

  function init() {
    setupDropZone('dz-split', 'in-split', handleFile);
    document.getElementById('btn-split').addEventListener('click', split);

    document.getElementById('split-mode').addEventListener('change', function () {
      const mode = this.value;
      const rangeGroup = document.getElementById('split-range-group');
      const everyGroup = document.getElementById('split-every-group');
      rangeGroup.style.display = mode === 'range' ? 'block' : 'none';
      everyGroup.style.display = mode === 'every' ? 'block' : 'none';
    });
  }

  async function handleFile(fileList) {
    const f = Array.from(fileList).find(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (!f) { alert('Please upload a PDF file.'); return; }

    currentFile = f;
    const list = document.getElementById('list-split');
    list.innerHTML = '';
    const item = createFileItem(f, () => {
      currentFile = null;
      totalPages = 0;
      list.innerHTML = '';
      document.getElementById('btn-split').disabled = true;
      document.getElementById('split-options-box').style.display = 'none';
    });
    list.appendChild(item);

    // Get page count
    try {
      const bytes  = await readFileAsArrayBuffer(f);
      const pdfDoc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
      totalPages   = pdfDoc.getPageCount();

      document.getElementById('split-page-info').textContent =
        `This PDF has ${totalPages} page${totalPages !== 1 ? 's' : ''}.`;
      document.getElementById('split-options-box').style.display = 'block';
      document.getElementById('btn-split').disabled = false;

      // Auto-populate ranges placeholder
      document.getElementById('split-ranges').placeholder =
        `e.g. 1-${Math.ceil(totalPages/2)}, ${Math.ceil(totalPages/2)+1}-${totalPages}`;
    } catch {
      document.getElementById('btn-split').disabled = false;
    }
  }

  function parseRanges(str, total) {
    const ranges = [];
    const parts = str.split(',').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.includes('-')) {
        const [a, b] = part.split('-').map(n => parseInt(n.trim(), 10));
        if (!isNaN(a) && !isNaN(b) && a >= 1 && b <= total && a <= b) {
          ranges.push({ from: a - 1, to: b - 1 }); // 0-indexed
        }
      } else {
        const n = parseInt(part, 10);
        if (!isNaN(n) && n >= 1 && n <= total) {
          ranges.push({ from: n - 1, to: n - 1 });
        }
      }
    }
    return ranges;
  }

  async function split() {
    if (!currentFile) return;

    const btn = document.getElementById('btn-split');
    btn.disabled = true;
    btn.textContent = 'Splitting…';

    const resultBoxId = 'result-split';
    document.getElementById(resultBoxId).classList.remove('show');
    setProgress('prog-split', 0);

    try {
      const mode    = document.getElementById('split-mode').value;
      const bytes   = await readFileAsArrayBuffer(currentFile);
      const srcDoc  = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
      const total   = srcDoc.getPageCount();
      const fname   = baseName(currentFile.name);
      const results = [];

      setProgress('prog-split', 20);

      let ranges = [];

      if (mode === 'range') {
        const rangeStr = document.getElementById('split-ranges').value;
        if (!rangeStr.trim()) { showError(resultBoxId, 'Please enter page ranges.'); return; }
        ranges = parseRanges(rangeStr, total);
        if (ranges.length === 0) { showError(resultBoxId, 'Invalid page ranges. Check format.'); return; }
      } else if (mode === 'every') {
        const n = parseInt(document.getElementById('split-every-n').value, 10) || 1;
        for (let i = 0; i < total; i += n) {
          ranges.push({ from: i, to: Math.min(i + n - 1, total - 1) });
        }
      } else if (mode === 'all') {
        for (let i = 0; i < total; i++) {
          ranges.push({ from: i, to: i });
        }
      } else if (mode === 'half') {
        if (total < 2) {
          showError(resultBoxId, 'Cannot split a 1-page PDF in half. Try "Every page" mode instead.');
          btn.disabled = false; btn.textContent = 'Split PDF'; return;
        }
        const mid = Math.ceil(total / 2);
        ranges.push({ from: 0, to: mid - 1 });
        ranges.push({ from: mid, to: total - 1 });
      }

      for (let ri = 0; ri < ranges.length; ri++) {
        setProgress('prog-split', 20 + Math.round((ri / ranges.length) * 70));
        const { from, to } = ranges[ri];
        const outDoc = await PDFLib.PDFDocument.create();
        const pageIndices = [];
        for (let p = from; p <= to; p++) pageIndices.push(p);

        if (pageIndices.length === 0) continue;

        const pages = await outDoc.copyPages(srcDoc, pageIndices);
        pages.forEach(p => outDoc.addPage(p));

        const pdfBytes = await outDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });

        let outName;
        if (ranges.length === 1) {
          outName = fname + '_split.pdf';
        } else if (mode === 'all') {
          outName = `${fname}_page_${from + 1}.pdf`;
        } else {
          outName = `${fname}_part${ri + 1}_pages${from + 1}-${to + 1}.pdf`;
        }

        results.push({ filename: outName, blob });
      }

      setProgress('prog-split', 100);

      if (results.length === 1) {
        showResult(resultBoxId, results[0].filename, results[0].blob);
      } else {
        showResults(resultBoxId, results);
      }
    } catch (err) {
      console.error(err);
      showError(resultBoxId, 'Split failed: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Split PDF';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
