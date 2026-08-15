/* ==========================================================================
   lang.js — the language control
   ==========================================================================
   The two languages are separate pages now, so the control is a plain link
   and works with scripting off. All this adds is the curtain: it closes,
   then the navigation happens behind it, so the swap reads as a cut rather
   than a page blink. */

const COVER_MS = 190;

document.querySelectorAll("[data-lang-link]").forEach((link) => {
  link.addEventListener("click", (e) => {
    // let the browser handle anything that is not a plain left click
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

    const curtain = document.querySelector(".curtain");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!curtain || reduced) return;

    e.preventDefault();
    curtain.classList.add("is-on");
    setTimeout(() => { window.location.href = link.href; }, COVER_MS);
  });
});
