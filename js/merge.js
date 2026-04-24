// ============================================================
// merge.js — Merge multiple PDFs using pdf-lib
// ============================================================

(function () {
  const files = [];

  function init() {
    setupDropZone('dz-merge', 'in-merge', handleFiles);
    document.getElementById('btn-merge').addEventListener('click', merge);
    initSortable();
  }

  function handleFiles(fileList) {
    Array.from(fileList).forEach(f => {
      if (f.type === 'application/pdf' || f.name.endsWith('.pdf')) files.push(f);
    });
    renderList();
    document.getElementById('btn-merge').disabled = files.length < 2;
  }

  function renderList() {
    const list = document.getElementById('list-merge');
    list.innerHTML = '';
    files.forEach((f, i) => {
      const item = createFileItem(f, () => {
        files.splice(i, 1);
        renderList();
        document.getElementById('btn-merge').disabled = files.length < 2;
      }, true);
      item.dataset.index = i;
      list.appendChild(item);
    });
    initSortable();
  }

  function initSortable() {
    const list = document.getElementById('list-merge');
    if (!list) return;
    // Simple drag-and-drop reorder
    let dragIdx = null;
    Array.from(list.children).forEach((item, i) => {
      const handle = item.querySelector('.drag-handle');
      if (!handle) return;
      handle.addEventListener('mousedown', () => {
        item.setAttribute('draggable', 'true');
      });
      item.addEventListener('dragstart', e => { dragIdx = parseInt(item.dataset.index); item.style.opacity = '0.5'; });
      item.addEventListener('dragend',   e => { item.style.opacity = ''; item.removeAttribute('draggable'); });
      item.addEventListener('dragover',  e => { e.preventDefault(); item.style.borderColor = 'var(--accent)'; });
      item.addEventListener('dragleave', e => { item.style.borderColor = ''; });
      item.addEventListener('drop',      e => {
        e.preventDefault();
        item.style.borderColor = '';
        const dropIdx = parseInt(item.dataset.index);
        if (dragIdx === null || dragIdx === dropIdx) return;
        const moved = files.splice(dragIdx, 1)[0];
        files.splice(dropIdx, 0, moved);
        renderList();
      });
    });
  }

  async function merge() {
    if (files.length < 2) return;

    const btn = document.getElementById('btn-merge');
    btn.disabled = true;
    btn.textContent = 'Merging…';

    const resultBoxId = 'result-merge';
    document.getElementById(resultBoxId).classList.remove('show');
    setProgress('prog-merge', 0);

    try {
      const { PDFDocument, StandardFonts, rgb } = PDFLib;

      const addPageNums = document.getElementById('merge-pagenums').value;
      const addBlank    = document.getElementById('merge-blank').value === 'yes';
      const addBookmarks = document.getElementById('merge-bookmarks').value === 'yes';

      const mergedDoc = await PDFDocument.create();
      let font;
      if (addPageNums !== 'no') {
        font = await mergedDoc.embedFont(StandardFonts.Helvetica);
      }

      const bookmarks = []; // { title, pageIndex }

      for (let i = 0; i < files.length; i++) {
        setProgress('prog-merge', Math.round((i / files.length) * 80));

        const bytes = await readFileAsArrayBuffer(files[i]);
        const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const startPage = mergedDoc.getPageCount();

        bookmarks.push({ title: baseName(files[i].name), pageIndex: startPage });

        const pages = await mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices());
        pages.forEach(p => mergedDoc.addPage(p));

        // Insert blank page if needed (ensures even page count for duplex)
        if (addBlank && i < files.length - 1 && mergedDoc.getPageCount() % 2 !== 0) {
          const blankPage = mergedDoc.addPage();
          blankPage.drawRectangle({ x: 0, y: 0, width: blankPage.getWidth(), height: blankPage.getHeight(), color: rgb(1,1,1) });
        }
      }

      // Add page numbers
      if (addPageNums !== 'no' && font) {
        const totalPages = mergedDoc.getPageCount();
        for (let pi = 0; pi < totalPages; pi++) {
          const p = mergedDoc.getPage(pi);
          const { width, height } = p.getSize();
          const numStr = `${pi + 1} / ${totalPages}`;
          const textWidth = font.widthOfTextAtSize(numStr, 9);

          let px, py;
          if (addPageNums === 'bottom-center') {
            px = (width - textWidth) / 2;
            py = 20;
          } else {
            px = width - textWidth - 20;
            py = 20;
          }

          p.drawText(numStr, { x: px, y: py, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
        }
      }

      setProgress('prog-merge', 95);
      const pdfBytes = await mergedDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setProgress('prog-merge', 100);

      showResult(resultBoxId, 'merged.pdf', blob);
    } catch (err) {
      console.error(err);
      showError(resultBoxId, 'Merge failed: ' + err.message);
    } finally {
      btn.disabled = files.length < 2;
      btn.textContent = 'Merge PDFs';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
