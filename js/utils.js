// ============================================================
// utils.js — shared helpers for all DocForge tools
// ============================================================

/**
 * Format bytes into human-readable string
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Get file extension (lowercase, no dot)
 */
function getExt(filename) {
  return filename.split('.').pop().toLowerCase();
}

/**
 * Truncate long filenames for display
 */
function truncate(str, max = 40) {
  if (str.length <= max) return str;
  const ext = str.includes('.') ? '.' + getExt(str) : '';
  const base = str.slice(0, max - ext.length - 3);
  return base + '...' + ext;
}

/**
 * Create a file item element for the file list
 */
function createFileItem(file, onRemove, draggable = false) {
  const extIcons = {
    pdf: '📄', png: '🖼', jpg: '🖼', jpeg: '🖼', gif: '🖼',
    bmp: '🖼', webp: '🖼', docx: '📝', doc: '📝',
    pptx: '📊', ppt: '📊', txt: '📃', epub: '📚'
  };
  const ext = getExt(file.name);
  const icon = extIcons[ext] || '📁';

  const item = document.createElement('div');
  item.className = 'file-item';
  item.innerHTML = `
    ${draggable ? '<span class="drag-handle" title="Drag to reorder">⠿</span>' : ''}
    <span class="file-icon">${icon}</span>
    <span class="file-name" title="${file.name}">${truncate(file.name)}</span>
    <span class="file-size">${formatBytes(file.size)}</span>
    <button class="file-remove" title="Remove">&times;</button>
  `;
  item.querySelector('.file-remove').addEventListener('click', onRemove);
  return item;
}

/**
 * Set progress bar width (0–100)
 */
function setProgress(id, pct) {
  const el = document.getElementById(id);
  if (el) el.style.width = pct + '%';
}

/**
 * Show a result download item
 */
function showResult(resultBoxId, filename, blob, mimeType = 'application/pdf') {
  const box = document.getElementById(resultBoxId);
  box.innerHTML = '';
  box.classList.add('show');

  const item = document.createElement('div');
  item.className = 'result-item';
  item.innerHTML = `
    <span class="result-name">✅ ${truncate(filename, 50)}</span>
    <button class="btn-download">⬇ Download</button>
  `;
  item.querySelector('.btn-download').addEventListener('click', () => {
    saveAs(blob, filename);
  });
  box.appendChild(item);
}

/**
 * Show multiple result items (for split, multi-output)
 */
function showResults(resultBoxId, files) {
  const box = document.getElementById(resultBoxId);
  box.innerHTML = '';
  box.classList.add('show');

  files.forEach(({ filename, blob }) => {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = `
      <span class="result-name">✅ ${truncate(filename, 50)}</span>
      <button class="btn-download">⬇ Download</button>
    `;
    item.querySelector('.btn-download').addEventListener('click', () => {
      saveAs(blob, filename);
    });
    box.appendChild(item);
  });
}

/**
 * Show an error in result box
 */
function showError(resultBoxId, message) {
  const box = document.getElementById(resultBoxId);
  box.innerHTML = `<div class="result-item result-error">❌ ${message}</div>`;
  box.classList.add('show');
}

/**
 * Read a file as ArrayBuffer
 */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Read a file as DataURL
 */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Read a file as text
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Load an Image from a DataURL
 */
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Page size dimensions in pdf-lib points (1pt = 1/72 inch)
 */
const PAGE_SIZES = {
  A4:     [595.28, 841.89],
  Letter: [612, 792],
  A3:     [841.89, 1190.55],
  A5:     [419.53, 595.28],
};

/**
 * Get page dimensions considering orientation
 */
function getPageDims(sizeName, orientation) {
  let [w, h] = PAGE_SIZES[sizeName] || PAGE_SIZES['A4'];
  if (orientation === 'landscape') return [h, w];
  return [w, h];
}

/**
 * Setup drag-and-drop on a drop zone
 */
function setupDropZone(dzId, inputId, onFilesSelected) {
  const dz = document.getElementById(dzId);
  const input = document.getElementById(inputId);

  if (!dz || !input) return;

  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    if (e.dataTransfer.files.length) onFilesSelected(e.dataTransfer.files);
  });
  dz.addEventListener('click', (e) => {
    if (!e.target.closest('.btn-upload')) input.click();
  });
  input.addEventListener('change', () => {
    if (input.files.length) onFilesSelected(input.files);
    input.value = ''; // reset so same file can be re-selected
  });
}

/**
 * Escape HTML for safe display
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Strip filename extension, return base name
 */
function baseName(filename) {
  return filename.replace(/\.[^.]+$/, '');
}

/**
 * Build a simple EPUB from HTML content
 */
function buildEpub(title, htmlContent, fontSize = 16) {
  const zip = new JSZip();

  // mimetype (must be first, no compression)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // META-INF/container.xml
  zip.folder('META-INF').file('container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:schemas:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  const oebps = zip.folder('OEBPS');

  // content.opf
  oebps.file('content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeHtml(title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="BookId">urn:uuid:docforge-${Date.now()}</dc:identifier>
  </metadata>
  <manifest>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="content"/>
  </spine>
</package>`);

  // toc.ncx
  oebps.file('toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="docforge-${Date.now()}"/></head>
  <docTitle><text>${escapeHtml(title)}</text></docTitle>
  <navMap>
    <navPoint id="navpoint-1" playOrder="1">
      <navLabel><text>${escapeHtml(title)}</text></navLabel>
      <content src="content.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`);

  // style.css
  oebps.file('style.css', `body { font-family: Georgia, serif; font-size: ${fontSize}px; line-height: 1.8; margin: 2em; }
h1,h2,h3 { font-family: sans-serif; } p { margin-bottom: 1em; }`);

  // content.xhtml
  oebps.file('content.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${htmlContent}
</body>
</html>`);

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
}
