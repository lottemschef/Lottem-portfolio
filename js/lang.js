/* ==========================================================================
   lang.js — the language control
   --------------------------------------------------------------------------
   The two languages are separate pages, so the control is a plain link and
   works with scripting switched off. This adds two things. The curtain: it
   closes, the navigation happens behind it, and the swap reads as a cut rather
   than a page blink. And the place: the link takes the section you are in
   with it, so switching language halfway down the page lands you in the same
   section of the other one rather than back at the top.
   ========================================================================== */

const COVER_MS = 190;

/* The section the rail is marking as current -- the one under the middle of
   the window -- or, if the rail has not marked one yet, worked out the same
   way. The top of the page needs no fragment. */
function hereFragment() {
  const marked = document.querySelector("[data-spy].is-current")?.getAttribute("href");
  if (marked) return marked === "#top" ? "" : marked;

  let id = "";
  const middle = window.innerHeight / 2;
  document.querySelectorAll("main > section[id], footer[id]").forEach((section) => {
    if (section.getBoundingClientRect().top <= middle) id = section.id;
  });
  return id ? `#${id}` : "";
}

document.querySelectorAll("[data-lang-link]").forEach((link) => {
  const base = link.getAttribute("href");

  link.addEventListener("click", (e) => {
    /* Written onto the link itself, before anything else, so every way of
       following it carries the place: this click, a command-click into a new
       tab, and the plain navigation reduced motion gets. */
    link.setAttribute("href", base + hereFragment());

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
