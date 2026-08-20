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

/* ---------- before / after comparison ----------
   The wipe used to be driven entirely by an invisible <input type="range">
   stretched over the figure. That works with a mouse and it works with a
   keyboard, but on a phone it is unreliable: the browser has to decide whether
   a touch is a horizontal drag or the start of a vertical scroll, and while it
   is deciding it keeps the gesture for itself. Often the wipe simply did not
   move.

   So the pointer is handled here instead. Touch is given one small grace
   period to declare its direction — mostly sideways and we take the gesture,
   mostly downwards and we hand it straight back so the page scrolls normally.
   Mouse and pen commit on contact, because for them there is nothing to
   disambiguate. The range input stays in the markup and stays in sync: it is
   what a keyboard and a screen reader drive. */
function initCompare() {
  document.querySelectorAll(".compare").forEach((fig) => {
    const range = fig.querySelector(".compare__range");
    if (!range) return;

    const set = (pct) => {
      const v = Math.max(0, Math.min(100, pct));
      fig.style.setProperty("--pos", `${v}%`);
      range.value = String(Math.round(v));
    };

    // the keyboard path — arrows, Home/End — still goes through the input
    range.addEventListener("input", () => set(Number(range.value)));
    set(Number(range.value));

    /* The figure is forced to LTR in CSS, so this stays correct on the Hebrew
       page: a wipe reveals left-to-right regardless of reading direction. */
    const pctFromX = (x) => {
      const r = fig.getBoundingClientRect();
      return r.width ? ((x - r.left) / r.width) * 100 : 50;
    };

    let pid = null, dragging = false, decided = false, startX = 0, startY = 0;

    const release = () => {
      if (pid !== null && fig.hasPointerCapture?.(pid)) fig.releasePointerCapture(pid);
      pid = null; dragging = false; decided = false;
    };

    fig.addEventListener("pointerdown", (e) => {
      pid = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      if (e.pointerType === "touch") { dragging = false; decided = false; return; }
      dragging = true;
      decided = true;
      fig.setPointerCapture(pid);
      set(pctFromX(e.clientX));
    });

    fig.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pid) return;

      if (!decided) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx < 6 && dy < 6) return;      // too small to read as either yet
        decided = true;
        if (dy > dx) { pid = null; return; }   // a scroll — leave it to the page
        dragging = true;
        fig.setPointerCapture(pid);
      }

      if (!dragging) return;
      e.preventDefault();
      set(pctFromX(e.clientX));
    });

    fig.addEventListener("pointerup", release);
    fig.addEventListener("pointercancel", release);

    // A tap with no drag should still move the wipe to where it landed.
    fig.addEventListener("click", (e) => { if (!decided) set(pctFromX(e.clientX)); });
  });
}

/* ---------- hero film ----------
   There is no image fallback behind this any more, so the job here is to get
   the clip playing and keep it playing rather than to decide whether it is
   wanted. The poster attribute covers the gap before the first frame decodes,
   and it is the only thing a visitor sees if autoplay is refused outright.

   Autoplay is refused more often than it looks: a muted inline video is
   normally allowed, but Low Power Mode on iOS blocks it, and a tab restored
   in the background starts paused. So we retry on the events that mean the
   browser has changed its mind — first interaction, and returning to the tab. */
function initHeroVideo() {
  const video = document.querySelector(".hero-video");
  if (!video) return;

  // Belt and braces: muted+playsinline are the two attributes autoplay policy
  // actually checks, and a stale cached page could be missing them.
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;

  const attempt = () => video.play?.().catch(() => {});

  attempt();
  video.addEventListener("canplay", attempt, { once: true });
  video.addEventListener("loadeddata", attempt, { once: true });

  // A refused autoplay is recoverable the moment the visitor touches the page.
  const onGesture = () => attempt();
  ["pointerdown", "touchstart", "keydown"].forEach((e) =>
    document.addEventListener(e, onGesture, { once: true, passive: true }));

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && video.paused) attempt();
  });

  /* Someone who asked for less motion should not be handed a moving picture.
     Pausing rather than removing keeps the poster frame on screen, so the
     opening is still a photograph rather than an empty black band. */
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  const applyMotion = () => {
    if (still.matches) { video.pause(); video.removeAttribute("autoplay"); }
    else attempt();
  };
  applyMotion();
  still.addEventListener?.("change", applyMotion);
}

/* ---------- video reels ----------
   Nothing is downloaded until the visitor asks for it: the frame shows a
   poster, and the <video> is only created on the first play. */
function initPlayers() {
  const players = [...document.querySelectorAll(".player")];
  if (!players.length) return;

  /* Creating and starting a reel. Pulled out of the click handler so that the
     scroll watcher below can do exactly the same thing without duplicating it,
     and so that clicking still behaves identically to before. */
  function start(player) {
    const button = player.querySelector(".player__play");
    const frame = player.querySelector(".player__frame");
    const src = player.dataset.src;
    if (!frame || !src || player.classList.contains("is-playing")) return null;

    {
      const video = document.createElement("video");
      video.src = src;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = "auto";
      /* The frame already shows a poster, but the <video> paints its own black
         background over it at z-index 3 while the file buffers. Handing it the
         very image the browser already picked keeps the still on screen right
         through the wait instead of flashing to black. */
      const poster = frame.querySelector(".player__poster");
      /* currentSrc is empty until the browser has actually picked a candidate,
         which for a lazy image below the fold may not have happened yet. Fall
         back to the plain src so the frame never starts on black. */
      const posterSrc = poster && (poster.currentSrc || poster.getAttribute("src"));
      if (posterSrc) video.poster = posterSrc;
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
      button?.remove();
      player.classList.add("is-playing");
      // controls are on, so a refusal is recoverable rather than a dead end
      video.play?.().catch(() => {});
      return video;
    }
  }

  players.forEach((player) => {
    const button = player.querySelector(".player__play");
    button?.addEventListener("click", () => {
      const video = start(player);
      // a click is a deliberate act, so move the keyboard there; scrolling into
      // view is not, and stealing focus mid-scroll would yank the page around
      video?.focus({ preventScroll: true });
    }, { once: true });
  });

  watchOnScroll(players, start);
}

/* ---------- reels that start themselves ----------
   A reel begins when it is the thing on screen and stops when it is not, so a
   visitor scrolling through sees the work move without hunting for play
   buttons. Three rules keep that from turning into a nuisance:

     · only one plays at a time, or a single scroll would set four files
       downloading at once over whatever connection the visitor is on;
     · muted, because no browser will start a reel with sound unprompted, and
       these reels carry no real audio anyway;
     · the long proposal film is left alone. It runs forty-five seconds and it
       is the only piece here with a real soundtrack, so it stays a deliberate
       choice rather than something that ambushes you on the way past.

   Reduced motion and Data Saver both switch the whole thing off; the play
   buttons still work exactly as they did. */
function watchOnScroll(players, start) {
  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (navigator.connection?.saveData) return;

  const items = players.map((el) => ({ el, kind: "player" }));

  // the inline colour-grading film can join in; the proposal film cannot
  document.querySelectorAll("figure.filmshow video").forEach((video) => {
    const src = video.currentSrc || video.querySelector("source")?.getAttribute("src") || "";
    if (/proposal/i.test(src)) return;
    items.push({ el: video.closest("figure"), kind: "inline", video });
  });
  if (!items.length) return;

  let current = null;
  const ratios = new Map();

  const videoOf = (item) =>
    item.kind === "inline" ? item.video : item.el.querySelector("video");

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const item = items.find((i) => i.el === e.target);
      if (item) ratios.set(item, e.isIntersecting ? e.intersectionRatio : 0);
    });

    // whichever reel is showing the most of itself wins, if it is really on screen
    let best = null, bestRatio = 0.55;
    ratios.forEach((r, item) => { if (r > bestRatio) { bestRatio = r; best = item; } });

    if (best === current) return;

    if (current) {
      const v = videoOf(current);
      // never interrupt someone who took over with the controls
      if (v && !v.paused && v.muted) v.pause();
    }
    current = best;
    if (!best) return;

    let v = videoOf(best);
    if (!v && best.kind === "player") v = start(best.el);
    if (!v) return;
    v.muted = true;
    v.play?.().catch(() => {});
  }, { threshold: [0, 0.25, 0.55, 0.75, 1] });

  items.forEach((i) => observer.observe(i.el));

  // a backgrounded tab should not sit there playing to nobody
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden || !current) return;
    const v = videoOf(current);
    if (v && v.muted) v.pause();
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

  /* The widest file the browser was offered. Not the one it picked: that was
     chosen for a thumbnail a couple of hundred pixels wide. */
  function widest(el) {
    const set = el.getAttribute("srcset");
    if (!set) return el.src;
    let best = el.src, bestW = 0;
    for (const part of set.split(",")) {
      const [url, w] = part.trim().split(/\s+/);
      const width = parseInt(w, 10) || 0;
      if (url && width >= bestW) { bestW = width; best = url; }
    }
    return best;
  }

  /* Place and year are already on the page beside the work, and already in the
     right language, so the caption is read back out of the document rather than
     duplicated into another set of strings. */
  function captionFor(el) {
    const scope = el.closest("section, footer");
    const dl = scope && scope.querySelector("dl.meta");
    if (!dl) return "";
    const parts = [...dl.querySelectorAll("dd")].map((d) => d.textContent.trim()).filter(Boolean);
    return parts.slice(0, 2).join(" · ");
  }

  function show(i) {
    index = (i + shots.length) % shots.length;
    const source = shots[index];
    img.alt = source.alt || "";

    /* Open on whatever is already decoded so the frame is never blank, then
       swap in the full-size file once it arrives. Stopping at the warm copy,
       as this used to, meant the one view built for looking at a photograph
       properly was the one showing a thumbnail blown up. */
    const warm = source.currentSrc || source.src;
    const full = widest(source);
    img.src = warm;
    if (full && full !== warm) {
      const hi = new Image();
      hi.addEventListener("load", () => {
        // the visitor may have moved on while this was loading
        if (shots[index] === source) img.src = full;
      }, { once: true });
      hi.src = full;
    }

    /* The alt text describes the picture for someone who cannot see it — it is
       not a caption. A slot may name its own; otherwise fall back to the work's
       location and year. */
    const detail = source.closest(".slot")?.dataset.caption || captionFor(source);
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

/* ---------- mobile "show more" ----------
   A category on a phone opens on its strongest frames and keeps the rest
   folded away, so scrolling from Events to Live Music is a few thumb flicks
   rather than a minute of portraits.

   The tiles are never removed from the DOM — the grid is clipped with
   max-height, so everything stays in the document for search engines and for
   anyone who lands with JS disabled (they simply see the full grid, because
   .is-collapsible is only ever added by this function).

   Auto-collapse: once a grid the visitor opened has been scrolled well past,
   it folds itself back up. Re-entering from below does not re-collapse it,
   which would yank the page out from under a thumb mid-scroll. */
const SHOWMORE_Q = window.matchMedia("(max-width: 46rem)");

function initShowMore() {
  const grids = document.querySelectorAll(".mosaic, .grid-3");
  if (!grids.length) return;

  const strings = {
    more: document.documentElement.lang === "he" ? "הצגת הכל" : "Show more",
    less: document.documentElement.lang === "he" ? "הצגת פחות" : "Show less",
  };

  const entries = [];

  grids.forEach((grid) => {
    const tiles = [...grid.children];
    // Nothing to fold away if the category is barely more than the peek.
    if (tiles.length < 4) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "showmore";
    btn.hidden = true;
    btn.setAttribute("aria-expanded", "false");

    const label = () => {
      const hidden = tiles.length - visibleCount(grid);
      btn.innerHTML = grid.classList.contains("is-open")
        ? strings.less
        : `${strings.more} <span class="showmore__count">(${hidden})</span>`;
    };

    grid.after(btn);
    entries.push({ grid, btn, tiles, label });

    btn.addEventListener("click", () => {
      const open = grid.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", String(open));
      if (open) {
        grid.style.setProperty("--full", grid.scrollHeight + "px");
        /* --full is a snapshot, and these are lazy images: one that decodes
           after the measurement would be clipped by a max-height taken before
           it had a height. Once the opening transition is over the cap has
           done its job, so drop it and let the grid size to its content. */
        grid.addEventListener("transitionend", function done(e) {
          if (e.propertyName !== "max-height") return;
          grid.removeEventListener("transitionend", done);
          if (grid.classList.contains("is-open")) grid.style.maxHeight = "none";
        });
      } else {
        /* Collapsing from max-height:none would jump rather than animate, so
           pin the height it actually has, force a reflow, then hand it back
           to the stylesheet's zero. */
        grid.style.maxHeight = grid.scrollHeight + "px";
        void grid.offsetHeight;
        grid.style.maxHeight = "";
      }
      label();
      if (!open) {
        // Collapsing from below would leave the viewport past the section.
        const top = grid.getBoundingClientRect().top;
        if (top < 0) grid.scrollIntoView({ block: "start", behavior: "auto" });
      }
    });
  });

  /* Nothing is shown while a grid is folded. A peek of one row looked like
     photographs stacked on each other, because each visible frame was cut off
     partway down, so the fold now hides the grid outright and the control
     carries the whole count. */
  function visibleCount() {
    return 0;
  }

  function measure() {
    entries.forEach(({ grid, btn, tiles, label }) => {
      if (!SHOWMORE_Q.matches) {
        grid.classList.remove("is-collapsible", "is-open");
          grid.style.removeProperty("--full");
        btn.hidden = true;
        return;
      }

      const peek = 0;
      const full = grid.scrollHeight;

      // Not worth a control if folding saves almost nothing.
      if (full - peek < 120) {
        grid.classList.remove("is-collapsible", "is-open");
        btn.hidden = true;
        return;
      }

      grid.classList.add("is-collapsible");
      grid.style.setProperty("--full", full + "px");
      btn.hidden = false;
      label();
    });
  }

  // Tiles are lazy images; their height is only real once they have loaded.
  measure();
  window.addEventListener("load", measure);
  document.querySelectorAll(".mosaic img, .grid-3 img").forEach((img) => {
    if (!img.complete) img.addEventListener("load", debounce(measure, 120), { once: true });
  });

  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(measure, 150); });
  SHOWMORE_Q.addEventListener?.("change", measure);

  /* Auto-collapse. A grid folds back once its bottom has travelled a full
     screen above the fold — far enough that the visitor has clearly moved on,
     and never while any part of it is still on screen. */
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((records) => {
      records.forEach((r) => {
        const grid = r.target;
        if (!grid.classList.contains("is-open")) return;
        const past = r.boundingClientRect.bottom < 0;
        if (!r.isIntersecting && past) {
          grid.classList.remove("is-open");
          const btn = grid.nextElementSibling;
          if (btn?.classList.contains("showmore")) {
            btn.setAttribute("aria-expanded", "false");
            const e = entries.find((x) => x.grid === grid);
            e?.label();
          }
        }
      });
    }, { rootMargin: "100% 0px 0px 0px", threshold: 0 });
    entries.forEach(({ grid }) => io.observe(grid));
  }
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
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
  initHeroVideo();
  initPlayers();
  initReveal();
  initDock();
  initLightbox();
  initNav();
  initShowMore();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
