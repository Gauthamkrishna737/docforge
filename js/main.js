// ============================================================
// main.js — Tab switching + global app init
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  // --- Tab switching ---
  const tabs   = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tool-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', function () {
      const toolId = this.dataset.tool;

      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');

      panels.forEach(p => p.classList.remove('active'));
      const target = document.getElementById('panel-' + toolId);
      if (target) target.classList.add('active');
    });
  });

  // --- Smooth scroll for hero CTA ---
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // --- Animate floating hero cards ---
  const cards = document.querySelectorAll('.floating-card');
  cards.forEach((card, i) => {
    card.style.animationDelay = (i * 0.3) + 's';
  });

  // --- Lazy-load AdSense when scrolled into view ---
  // Uncomment if using AdSense:
  /*
  const adObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        (adsbygoogle = window.adsbygoogle || []).push({});
        adObserver.unobserve(entry.target);
      }
    });
  });
  document.querySelectorAll('.adsbygoogle').forEach(ad => adObserver.observe(ad));
  */

  console.log('%cDocForge loaded ✅', 'color:#f5a623;font-weight:bold;font-size:14px;');
});
