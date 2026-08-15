/* ==========================================================================
   ui.js — behaviour CSS cannot express on its own.
   Step 1: fitting the mega headings to their container.
   ========================================================================== */

/* ---------- fit-to-width headings ----------
   The reference sets every mega heading flush to both edges of its column.
   CSS has no "fit text to box", and a character-count estimate is not close
   enough — measured across both languages it ran from 70% to 127% of the
   target width. So: measure the rendered line, scale the font size by the
   ratio. Exact for any string, any face, and it survives copy changes. */

const FIT_SELECTOR = ".mega";
const PROBE_SIZE = 100; // px — arbitrary; only the ratio matters

/* .mega--fill is set flush to both edges of its column, whatever that takes.
   Every other mega treats its stylesheet size as a ceiling and only shrinks
   below it to avoid overflowing — which is what "Photography" needs on a
   375px screen, and what keeps a short word like "צילום" from ballooning. */
function fitHeading(el) {
  const fillsColumn = el.classList.contains("mega--fill");

  el.style.fontSize = "";  // back to the stylesheet value before measuring
  const ceiling = parseFloat(getComputedStyle(el).fontSize);
  const available = el.getBoundingClientRect().width;
  if (!available) return;

  el.style.fontSize = `${PROBE_SIZE}px`;

  const range = document.createRange();
  range.selectNodeContents(el);
  const rendered = range.getBoundingClientRect().width;
  range.detach?.();

  if (!rendered) {
    el.style.fontSize = "";
    return;
  }

  // letter-spacing is set in em, so it scales with the font size and the
  // relationship stays linear.
  const fitted = (PROBE_SIZE * available) / rendered;

  /* Filling the column edge to edge is the reference's signature, but on a
     laptop it ate ninety per cent of the first screen before any work showed.
     Capping it against the window height keeps the gesture and gives the page
     back its opening — and it scales with the window rather than a fixed px. */
  const size = fillsColumn
    ? Math.min(fitted, window.innerHeight * 0.20)
    : Math.min(fitted, ceiling);
  el.style.fontSize = `${size.toFixed(2)}px`;
}

function fitAllHeadings() {
  document.querySelectorAll(FIT_SELECTOR).forEach(fitHeading);
}

/* ---------- before / after comparison ---------- */
function initCompare() {
  document.querySelectorAll(".compare").forEach((fig) => {
    const range = fig.querySelector(".compare__range");
    if (!range) return;
    const draw = () => fig.style.setProperty("--pos", `${range.value}%`);
    range.addEventListener("input", draw);
    draw();
  });
}

/* ---------- video reels ----------
   Nothing is downloaded until the visitor asks for it: the frame shows a
   poster, and the <video> is only created on the first play. */
function initPlayers() {
  document.querySelectorAll(".player").forEach((player) => {
    const button = player.querySelector(".player__play");
    const frame = player.querySelector(".player__frame");
    const src = player.dataset.src;
    if (!button || !frame || !src) return;

    button.addEventListener("click", () => {
      const video = document.createElement("video");
      video.src = src;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = "auto";
      /* Every reel is silent footage, so muting costs nothing and removes the
         one reason a browser would refuse to start playing on its own. */
      video.muted = true;

      // A reel that will not load should say so rather than sit there black.
      video.addEventListener("error", () => {
        const note = document.createElement("p");
        note.className = "player__error";
        note.textContent = document.documentElement.lang === "he"
          ? "לא הצלחנו לטעון את הסרטון. נסו שוב מאוחר יותר."
          : "This reel could not be loaded. Please try again later.";
        video.remove();
        frame.append(note);
        player.classList.remove("is-playing");
      }, { once: true });

      frame.append(video);
      button.remove();
      player.classList.add("is-playing");
      video.focus({ preventScroll: true });
      // controls are on, so a refusal is recoverable rather than a dead end
      video.play?.().catch(() => {});
    }, { once: true });
  });
}

/* ---------- scroll reveal ----------
   Blocks lift into place as they enter the frame. Everything starts visible in
   CSS terms unless this runs, so a failed script or a reduced-motion setting
   simply means no animation — never hidden content. */
function initReveal() {
  const targets = document.querySelectorAll(".reveal");
  if (!targets.length) return;

  if (!("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;   // leave everything visible; the flag below is never set
  }

  /* Only now does the stylesheet start hiding anything. If this line is never
     reached the page reads normally, just without the animation. */
  document.documentElement.classList.add("js-reveal");

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-in");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.05 });

  targets.forEach((el) => observer.observe(el));

  /* A tab restored from the background can have missed every callback, which
     would strand whatever is already on screen. Sweep once on return. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    targets.forEach((el) => {
      if (el.classList.contains("is-in")) return;
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) {
        el.classList.add("is-in");
        observer.unobserve(el);
      }
    });
  });
}


/* ---------- sticky controls ----------
   The WhatsApp pill is the standing call to action. It appears once the
   opening photograph is behind you, and folds away over the contact section,
   where the same invitation is already on the page in full. The arrow waits
   longer — it is only worth offering once there is a real distance to undo. */
function initDock() {
  const dock = document.querySelector("[data-dock]");
  if (!dock) return;

  const wa = dock.querySelector("[data-wa]");
  const top = dock.querySelector("[data-to-top]");
  const contact = document.querySelector(".split--end");

  let contactVisible = false;
  if (contact && "IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      contactVisible = entry.isIntersecting;
      update();
    }, { threshold: 0 }).observe(contact);
  }

  function update() {
    const y = window.scrollY;
    wa.classList.toggle("is-shown", y > 500 && !contactVisible);
    top.classList.toggle("is-shown", y > window.innerHeight * 1.5);
  }

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { update(); ticking = false; });
  }, { passive: true });

  top.addEventListener("click", () => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    // send focus back to the top of the document, not just the pixels
    document.querySelector(".skip-link")?.focus({ preventScroll: true });
  });

  update();
}

/* ---------- lightbox ----------
   Every photograph on the page has a hover zoom, which reads as "I am
   clickable". Before this it was not — this makes the promise good, and on a
   photographer's site being able to look at the picture properly is the point.
   <dialog> is doing the heavy lifting: focus trapping, Esc and inertness of
   the page behind all come for free. */
function initLightbox() {
  const box = document.querySelector("[data-lightbox]");
  if (!box || typeof box.showModal !== "function") return;

  // the comparison slider and the reel posters have their own jobs
  const shots = [...document.querySelectorAll(".slot img")].filter(
    (img) => !img.closest(".compare") && !img.closest(".player")
  );
  if (!shots.length) return;

  const img = box.querySelector(".lightbox__img");
  const caption = box.querySelector(".lightbox__caption");
  const prev = box.querySelector("[data-lb-prev]");
  const next = box.querySelector("[data-lb-next]");
  let index = 0;
  let opener = null;
  let openedByKeyboard = false;

  function show(i) {
    index = (i + shots.length) % shots.length;
    const source = shots[index];
    // currentSrc is the size the browser already chose, so it is usually warm
    img.src = source.currentSrc || source.src;
    img.alt = source.alt || "";

    /* The alt text describes the picture for someone who cannot see it — it is
       not a caption. Show a caption only where the slot carries real detail
       (data-caption), which is where Location / Year will land once we have it. */
    const detail = source.closest(".slot")?.dataset.caption || "";
    caption.textContent = detail;
    caption.hidden = !detail;
  }

  shots.forEach((shot, i) => {
    const slot = shot.closest(".slot");
    slot.classList.add("slot--zoomable");
    slot.tabIndex = 0;
    slot.setAttribute("role", "button");
    slot.addEventListener("click", () => {
      opener = slot; openedByKeyboard = false; show(i); box.showModal();
    });
    slot.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      opener = slot;
      openedByKeyboard = true;
      show(i);
      box.showModal();
    });
  });

  prev.addEventListener("click", () => show(index - 1));
  next.addEventListener("click", () => show(index + 1));
  box.querySelector("[data-lb-close]").addEventListener("click", () => box.close());

  box.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); show(index + 1); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); show(index - 1); }
  });

  // clicking the backdrop closes; clicking the picture does not
  box.addEventListener("click", (e) => {
    if (e.target === box) box.close();
  });

  box.addEventListener("close", () => {
    /* Returning focus is right for a keyboard user and is exactly what leaves
       a mouse user staring at a ring on the photo they just closed. */
    if (openedByKeyboard) opener?.focus({ preventScroll: true });
    opener = null;
    openedByKeyboard = false;
  });
}


/* ---------- navigation ----------
   Three jobs: weight the bar once the page is moving, mark which section you
   are in, and drive the phone menu. Smooth scrolling itself is CSS
   (scroll-behavior on :root), so anchors work with the script off. */
function initNav() {
  const bar = document.querySelector("[data-nav]");
  const menu = document.querySelector("[data-menu]");
  const toggle = document.querySelector("[data-nav-toggle]");
  if (!bar) return;

  /* --- weight on scroll --- */
  const onScroll = () => bar.classList.toggle("is-stuck", window.scrollY > 24);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* --- which section am I in --- */
  const links = [...document.querySelectorAll(".nav__link, .menu__link")];
  const targets = links
    .map((l) => l.getAttribute("href"))
    .filter((h) => h && h.startsWith("#"))
    .map((h) => document.querySelector(h))
    .filter(Boolean);

  if (targets.length && "IntersectionObserver" in window) {
    const seen = new Map();
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => seen.set(e.target.id, e.intersectionRatio));
      // the section occupying most of the screen wins
      let best = null, bestRatio = 0;
      seen.forEach((ratio, id) => { if (ratio > bestRatio) { bestRatio = ratio; best = id; } });
      links.forEach((l) => l.classList.toggle("is-current", best && l.getAttribute("href") === `#${best}`));
    }, { threshold: [0, .15, .35, .6, .85], rootMargin: "-20% 0px -40% 0px" });
    targets.forEach((t) => spy.observe(t));
  }

  /* --- phone menu --- */
  if (menu && toggle) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      document.body.style.overflow = open ? "hidden" : "";
      if (open) {
        menu.hidden = false;
        requestAnimationFrame(() => menu.classList.add("is-open"));
      } else {
        menu.classList.remove("is-open");
        const done = () => { menu.hidden = true; menu.removeEventListener("transitionend", done); };
        menu.addEventListener("transitionend", done);
        // if the transition never fires (reduced motion), close anyway
        setTimeout(() => { if (!menu.classList.contains("is-open")) menu.hidden = true; }, 400);
      }
    };

    toggle.addEventListener("click", () =>
      setOpen(toggle.getAttribute("aria-expanded") !== "true"));

    menu.querySelectorAll(".menu__link").forEach((l) =>
      l.addEventListener("click", () => setOpen(false)));

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") setOpen(false);
    });

    // a rotation into the desktop layout should not leave the overlay stranded
    window.matchMedia("(min-width: 60rem)").addEventListener("change", (e) => {
      if (e.matches) setOpen(false);
    });
  }
}


/* ---------- opening sequence ----------
   Runs once, on first paint. The flag goes on before the frame is painted so
   nothing flashes, and comes off again when the sequence has finished so the
   animation can never strand an element at opacity zero. */
function initIntro() {
  const root = document.documentElement;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  root.classList.add("js-intro");

  const clear = () => root.classList.remove("js-intro", "is-ready");

  const start = () => {
    requestAnimationFrame(() => root.classList.add("is-ready"));
    // total sequence is 1.5s; clear well after so the styles stop applying
    setTimeout(clear, 2600);
  };

  /* Timers are throttled in a background tab, so a page opened behind another
     could sit on the hidden state longer than intended. Clearing on return to
     view means the sequence can never be what keeps the hero invisible. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") setTimeout(clear, 2600);
  }, { once: true });

  // wait for the face the title is set in, or give up and start anyway
  if (document.fonts && document.fonts.ready) {
    Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))]).then(start);
  } else {
    start();
  }
}

/* ---------- photographs fading in as they load ---------- */
function initImageFade() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const shots = document.querySelectorAll(".slot img");
  if (!shots.length) return;

  document.documentElement.classList.add("js-imgfade");

  const settle = (img) => img.classList.add("is-loaded");

  shots.forEach((img) => {
    if (img.complete && img.naturalWidth) {
      settle(img);
    } else {
      img.addEventListener("load", () => settle(img), { once: true });
      // a broken file should not stay invisible
      img.addEventListener("error", () => settle(img), { once: true });
    }
  });

  /* A tab in the background does not advance transitions, so an image that
     finished loading there can be left mid-fade. Settle everything already
     downloaded the moment the page is actually being looked at. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    shots.forEach((img) => { if (img.complete) settle(img); });
  });
}

function initFit() {
  fitAllHeadings();

  // Web fonts change the metrics, so measure again once they are in.
  document.fonts?.ready.then(fitAllHeadings);


  /* Each heading is a write, a forced reflow and another write. Running that
     on every frame of a resize drag thrashes layout, so it waits for the drag
     to settle instead. */
  let timer;
  const refit = () => { clearTimeout(timer); timer = setTimeout(fitAllHeadings, 120); };
  window.addEventListener("resize", refit, { passive: true });
  window.addEventListener("orientationchange", refit);
}

function init() {
  initIntro();
  initImageFade();
  initFit();
  initCompare();
  initPlayers();
  initReveal();
  initDock();
  initLightbox();
  initNav();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
