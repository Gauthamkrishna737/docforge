# DocForge

**A free, open-source, browser-based file converter and PDF studio.**

Live demo: `https://YOUR_USERNAME.github.io/docforge`

---

## Features

- 🖼 **Image → PDF** — JPG, PNG, WebP, GIF, BMP with page size, margin, fit, quality & background color options
- 📄 **DOCX → PDF** — Convert Word documents to PDF with heading styles, font size, line spacing options
- 📊 **PPTX → PDF** — Convert PowerPoint presentations to PDF with layout, slides-per-page, slide numbers
- ⊕ **Merge PDFs** — Combine multiple PDFs in any order with drag-to-reorder, bookmarks, page numbers
- ⊗ **Split PDF** — Split by custom page ranges, every N pages, individual pages, or in half
- ↔ **Convert Format** — Convert between PDF, PNG, JPG, TXT, HTML, EPUB

## Privacy

**Everything runs in your browser. Your files are never uploaded to any server.** No accounts, no watermarks, no limits.

## Tech Stack

- [pdf-lib](https://pdf-lib.js.org/) — PDF creation and manipulation
- [PDF.js](https://mozilla.github.io/pdf.js/) — PDF rendering to images/text (lazy loaded)
- [JSZip](https://stuk.github.io/jszip/) — DOCX/PPTX parsing (they are ZIP files)
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/) — Download trigger

## Hosting on GitHub Pages

1. Fork or clone this repo
2. Go to **Settings → Pages**
3. Set Source to `main` branch, `/ (root)` folder
4. Your site will be live at `https://YOUR_USERNAME.github.io/REPO_NAME`

## Adding Google AdSense

1. Sign up at [Google AdSense](https://adsense.google.com)
2. Add your site and get your **Publisher ID** (`ca-pub-XXXXXXXXXX`)
3. In `index.html`, uncomment the AdSense script tag in `<head>`:
   ```html
   <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXX" crossorigin="anonymous"></script>
   ```
4. Replace the `<div class="ad-placeholder">` blocks with actual `<ins class="adsbygoogle">` tags
5. Get your **Ad Slot IDs** from the AdSense dashboard and fill them in
6. Optionally uncomment the sticky footer ad block

## License

MIT
