/* ==========================================================================
   ui.js — behaviour the stylesheet cannot express on its own
   --------------------------------------------------------------------------
   Every function here is written so that not running is a valid outcome. The
   page is complete and readable with this file blocked: nothing is hidden in
   CSS until the script has confirmed it can also un-hide it, anchors are real
   anchors, the language switch is a real link, and each <video> that matters
   carries its own controls in the markup.
   ========================================================================== */


/* ---------- scroll, throttled to one update per frame ----------
   Cancel-and-reschedule rather than a boolean "already queued" guard. The
   guard is the more common shape and it has a trap in it: a background tab
   does not run requestAnimationFrame, so a frame queued while hidden leaves
   the flag raised and every later scroll returns early — the handler is then
   dead until something happens to clear it. Here the newest request is always
   the live one, and the sweep on visibilitychange settles the page the moment
   it is looked at again. */
function onScrollFrame(update) {
  let frame = 0;

  const schedule = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { frame = 0; update(); });
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") update();
  });

  update();
}


/* ==========================================================================
   THE SIDE RAIL
   --------------------------------------------------------------------------
   Three jobs: decide when the rail exists, say which section you are in, and
   tell the rail what colour the thing behind it is.

   On the threshold. The brief asks for a rail that is absent at the very top
   and arrives once the visitor starts to scroll, so it is deliberately early —
   a fifth of the first screen — rather than waiting for the hero to clear. It
   shows and hides at two different marks so a scroll that stops exactly on the
   boundary cannot flicker the rail on and off.
   ========================================================================== */
function initRail() {
  const rail = document.querySelector("[data-rail]");
  const menubtn = document.querySelector("[data-menu-toggle]");
  const root = document.documentElement;

  const links = [...document.querySelectorAll("[data-spy]")];

  /* Deduplicated, and it matters: the rail and the phone menu both link to the
     same six sections, so the raw list is each section twice over. The walk in
     updateCurrent() takes the last section that starts above the midpoint, and
     with the list doubled that was always the menu's copy of the first one —
     the marker sat on "Home" for the whole page. A Set keeps insertion order,
     which here is document order. */
  const sections = [...new Set(
    links.map((l) => document.querySelector(l.getAttribute("href"))).filter(Boolean)
  )];

  let shown = false;

  function threshold() {
    return Math.max(90, window.innerHeight * 0.18);
  }

  function updateVisibility() {
    const on = threshold();
    const off = on * 0.6;
    const y = window.scrollY;

    // one mark to appear, a lower one to disappear — see the note above
    const next = shown ? y > off : y > on;
    if (next === shown) return;
    shown = next;

    rail?.classList.toggle("is-shown", shown);
    menubtn?.classList.toggle("is-shown", shown);
    root.classList.toggle("is-scrolled", shown);
  }

  /* Which section am I in? Whatever the middle of the window is sitting on.
     An intersection-ratio contest, which is the usual way to do this, gets
     this page wrong: the sections here differ enormously in height, so a short
     one can never win against a tall neighbour even when it fills the screen.
     The midpoint is also literally where the rail is, so the marker always
     names the section the rail is drawn over. */
  /* Marks one section current, everywhere it is listed. Pulled out so a click
     can use it too: waiting for the scroll that follows means the marker lags
     a whole section behind the page, and a link to the section you are already
     on produces no scroll at all and so would never light up. */
  function mark(section) {
    links.forEach((link) => {
      const on = link.getAttribute("href") === `#${section.id}`;
      link.classList.toggle("is-current", on);
      if (on) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });

    /* The rail is fixed, so it has no section of its own to inherit colours
       from — it has to be told which ground it is floating over. */
    if (rail) {
      rail.dataset.ground = section.classList.contains("on-light") ? "light" : "dark";
    }
  }

  /* Distance from the top of the document. Not offsetTop, which is measured
     against the nearest positioned ancestor: every .section is position:
     relative already, so wrapping one in another positioned element at any
     point would silently start returning a number relative to that instead,
     and the marker would drift. This is right whatever the page is nested in. */
  const topOf = (el) => el.getBoundingClientRect().top + window.scrollY;

  function updateCurrent() {
    if (!sections.length) return;

    const middle = window.scrollY + window.innerHeight / 2;
    let current = sections[0];

    for (const section of sections) {
      if (topOf(section) <= middle) current = section;
    }

    // The last section is often shorter than half a screen, so the midpoint
    // may never reach it. Touching the bottom of the page means you are there.
    const atBottom =
      window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
    if (atBottom) current = sections[sections.length - 1];

    mark(current);
  }

  // light the link the moment it is chosen, not when the scrolling catches up
  links.forEach((link) => {
    link.addEventListener("click", () => {
      const target = document.querySelector(link.getAttribute("href"));
      if (target) mark(target);
    });
  });

  onScrollFrame(() => {
    updateVisibility();
    updateCurrent();
  });
}


/* ==========================================================================
   THE MENU — the rail's form below 60rem
   ========================================================================== */
function initMenu() {
  const toggle = document.querySelector("[data-menu-toggle]");
  const menu = document.querySelector("[data-menu]");
  if (!toggle || !menu) return;

  const labels = {
    open: toggle.dataset.labelOpen || "Open the menu",
    close: toggle.dataset.labelClose || "Close the menu",
  };

  /* One variable is the truth, and every attribute is written from it.

     This used to hide the overlay from a transitionend listener attached at
     the moment of closing, and that had two ways of going wrong. The listener
     never checked whether the menu had been reopened since, and transitionend
     bubbles, so a transition finishing anywhere inside the overlay would run
     it -- the language buttons in the foot carry one. Tapping to close and
     tapping again straight away, which is exactly what an impatient thumb
     does, left the menu reopened and then immediately hidden by the stranded
     listener: aria-expanded="true", the button showing a cross, and nothing on
     screen. It took two more taps to recover.

     A single timer that the next open cancels cannot do that. */
  let open = false;
  let hideTimer = 0;

  /* Matches --dur in base.css. The overlay is invisible and click-through the
     moment .is-open comes off, so this only decides when it leaves the layout;
     being a little generous costs nothing. */
  const FADE_MS = 450;

  const setOpen = (next) => {
    if (next === open) return;
    open = next;
    clearTimeout(hideTimer);

    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? labels.close : labels.open);
    document.body.style.overflow = open ? "hidden" : "";

    if (open) {
      menu.hidden = false;
      // a frame between display and opacity, or the fade has nothing to run from
      requestAnimationFrame(() => { if (open) menu.classList.add("is-open"); });
      menu.querySelector("a")?.focus({ preventScroll: true });
    } else {
      menu.classList.remove("is-open");
      hideTimer = setTimeout(() => { if (!open) menu.hidden = true; }, FADE_MS);
    }
  };

  toggle.addEventListener("click", () => setOpen(!open));

  menu.querySelectorAll("a").forEach((link) =>
    link.addEventListener("click", () => setOpen(false)));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) {
      setOpen(false);
      toggle.focus();
    }
  });

  // a rotation into the desktop layout must not strand the overlay open
  window.matchMedia("(min-width: 60rem)").addEventListener?.("change", (e) => {
    if (e.matches) setOpen(false);
  });
}


/* ==========================================================================
   HERO FILM
   --------------------------------------------------------------------------
   Autoplay is refused more often than it looks. A muted inline video is
   normally allowed, but Low Power Mode on iOS blocks it and a tab restored in
   the background starts paused — so the attempt is retried on the events that
   mean the browser has changed its mind.
   ========================================================================== */
function initHeroVideo() {
  const video = document.querySelector("[data-hero-video]");
  if (!video) return;

  // muted + playsinline are the two attributes the autoplay policy checks, and
  // a stale cached page could be missing them
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;

  const attempt = () => video.play?.().catch(() => {});

  attempt();
  video.addEventListener("canplay", attempt, { once: true });
  video.addEventListener("loadeddata", attempt, { once: true });

  ["pointerdown", "touchstart", "keydown"].forEach((type) =>
    document.addEventListener(type, attempt, { once: true, passive: true }));

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && video.paused) attempt();
  });

  /* Someone who asked for less motion should not be handed a moving picture.
     Pausing rather than removing keeps the poster frame on screen, so the
     opening is still a photograph rather than an empty black window. */
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  const applyMotion = () => {
    if (still.matches) {
      video.pause();
      video.removeAttribute("autoplay");
    } else {
      attempt();
    }
  };
  applyMotion();
  still.addEventListener?.("change", applyMotion);
}


/* ==========================================================================
   REELS
   --------------------------------------------------------------------------
   Nothing is downloaded until it is wanted: the frame shows a poster and the
   <video> is built on the first play, or when the reel becomes the thing on
   screen. Only one plays at a time — a single scroll should not set four
   files downloading over whatever connection the visitor is on.
   ========================================================================== */
function initPlayers() {
  const players = [...document.querySelectorAll(".player")];
  if (!players.length) return;

  function start(player, auto) {
    const frame = player.querySelector(".player__frame");
    const src = player.dataset.src;
    if (!frame || !src || player.classList.contains("is-playing")) return null;

    const video = document.createElement("video");
    video.src = src;
    /* Scrolled to, a reel is a moving photograph: it loops, silently, with no
       furniture over it. Reached by the button instead — which is what happens
       when autoplay is off — it is a deliberate request to watch, so it gets
       its controls and plays once. */
    video.controls = !auto;
    video.loop = !!auto;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "auto";
    video.muted = true;

    /* The frame already shows a poster, but a <video> paints its own black
       background over it while the file buffers. Handing it the very image the
       browser already chose keeps the still on screen through the wait.
       currentSrc is empty until a candidate has actually been picked, which for
       a lazy image below the fold may not have happened — hence the fallback. */
    const poster = frame.querySelector(".player__poster");
    const posterSrc = poster && (poster.currentSrc || poster.getAttribute("src"));
    if (posterSrc) video.poster = posterSrc;

    video.addEventListener("error", () => {
      const note = document.createElement("p");
      note.className = "player__error";
      note.textContent = document.documentElement.lang === "he"
        ? "לא הצלחנו לטעון את הסרטון. אפשר לנסות שוב מאוחר יותר."
        : "This film could not be loaded. Please try again later.";
      video.remove();
      frame.append(note);
      player.classList.remove("is-playing");
    }, { once: true });

    frame.append(video);
    player.querySelector(".player__play")?.remove();
    player.classList.add("is-playing");
    video.play?.().catch(() => {});
    return video;
  }

  players.forEach((player) => {
    player.querySelector(".player__play")?.addEventListener("click", () => {
      const video = start(player, false);
      // a click is deliberate, so the keyboard follows it; scrolling into view
      // is not, and stealing focus mid-scroll would yank the page around
      video?.focus({ preventScroll: true });
    }, { once: true });
  });

  watchOnScroll(players, start);
}

/* A reel begins when it is the thing on screen and stops when it is not, so a
   visitor scrolling through sees the work move without hunting for play
   buttons. Reduced motion and Data Saver switch the whole mechanism off; the
   play buttons then work exactly as they always did.

   The long proposal film is left out on purpose. It runs three quarters of a
   minute and is the only piece here with a real soundtrack, so it stays a
   deliberate choice rather than something that ambushes you on the way past. */
function watchOnScroll(players, start) {
  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (navigator.connection?.saveData) return;

  /* With this running the reels start themselves, so the button is only the
     fallback for the cases above. Hidden rather than removed: it is what the
     keyboard reaches for if autoplay is ever refused. */
  players.forEach((p) => {
    const button = p.querySelector(".player__play");
    if (button) button.hidden = true;
  });

  /* Only .player elements now. The inline-film branch that used to live here
     drove the colour-grading clip, and that clip has gone: the Events section
     loops the same venue at the same hour, so keeping it below was a repeat
     rather than a second piece of work. Reels are handled by initReels(). */
  const items = players.map((el) => ({ el, kind: "player" }));
  const videoOf = (item) => item.el.querySelector("video");

  let current = null;
  const ratios = new Map();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const item = items.find((i) => i.el === entry.target);
      if (item) ratios.set(item, entry.isIntersecting ? entry.intersectionRatio : 0);
    });

    // whichever reel shows the most of itself wins, if it is really on screen
    let best = null;
    let bestRatio = 0.55;
    ratios.forEach((ratio, item) => {
      if (ratio > bestRatio) { bestRatio = ratio; best = item; }
    });

    if (best === current) return;

    if (current) {
      const video = videoOf(current);
      // never interrupt someone who took over with the controls
      if (video && !video.paused && video.muted) video.pause();
    }

    current = best;
    if (!best) return;

    let video = videoOf(best);
    if (!video && best.kind === "player") video = start(best.el, true);
    if (!video) return;

    video.muted = true;
    video.play?.().catch(() => {});
  }, { threshold: [0, 0.25, 0.55, 0.75, 1] });

  items.forEach((item) => observer.observe(item.el));

  // a backgrounded tab should not sit there playing to nobody
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden || !current) return;
    const video = videoOf(current);
    if (video && video.muted) video.pause();
  });
}


/* ==========================================================================
   REELS
   --------------------------------------------------------------------------
   The markup already says autoplay loop muted playsinline, so these play with
   no script at all. What this adds is restraint: four reels sit in the Events
   section and preload="none" keeps them off the wire until one is actually
   worth watching. A reel starts when it comes into view and pauses when it
   leaves, so a visitor downloads the films they scroll past and no others, and
   a section left behind is not still decoding video into a tab nobody is on.

   Per reel, deliberately, rather than the one-at-a-time rule the old player
   governor used. These sit two abreast: with a single winner one half of a
   pair would run while the other stood frozen beside it, which reads as a
   broken video rather than as a considered layout.
   ========================================================================== */
function initReels() {
  const reels = [...document.querySelectorAll("[data-reel]")];
  if (!reels.length) return;

  const still = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* Asked for less motion, or on a metered connection: leave every reel on its
     poster frame. Nothing is fetched and nothing moves. */
  const parked = () => still.matches || navigator.connection?.saveData;

  const settle = (video, visible) => {
    if (parked() || !visible) {
      if (!video.paused) video.pause();
      return;
    }
    video.muted = true;              // the attribute autoplay policy checks
    video.play?.().catch(() => {});
  };

  if (!("IntersectionObserver" in window)) {
    reels.forEach((v) => settle(v, !parked()));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => settle(entry.target, entry.isIntersecting));
  }, { threshold: 0.2 });

  reels.forEach((video) => {
    video.muted = true;
    video.playsInline = true;
    observer.observe(video);
  });

  // a backgrounded tab should not sit there playing to nobody
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) reels.forEach((v) => v.pause());
  });

  still.addEventListener?.("change", () =>
    reels.forEach((v) => settle(v, v.getBoundingClientRect().top < innerHeight && v.getBoundingClientRect().bottom > 0)));
}


/* ==========================================================================
   BEFORE / AFTER WIPE
   --------------------------------------------------------------------------
   The pointer is handled here rather than left to the range input underneath.
   On a phone the browser has to decide whether a touch is a horizontal drag or
   the start of a vertical scroll, and while it is deciding it keeps the
   gesture — so the wipe often simply did not move.

   Touch gets one short grace period to declare its direction: mostly sideways
   and we take it, mostly downwards and we hand it straight back so the page
   scrolls normally. Mouse and pen commit on contact, because for them there is
   nothing to disambiguate. The input stays in the markup and stays in sync; it
   is what a keyboard and a screen reader drive.
   ========================================================================== */
function initCompare() {
  document.querySelectorAll(".compare").forEach((fig) => {
    const range = fig.querySelector(".compare__range");
    if (!range) return;

    const set = (pct) => {
      const value = Math.max(0, Math.min(100, pct));
      fig.style.setProperty("--pos", `${value}%`);
      range.value = String(Math.round(value));
    };

    range.addEventListener("input", () => set(Number(range.value)));
    set(Number(range.value));

    // the figure is forced to LTR in CSS, so this stays correct in Hebrew
    const pctFromX = (x) => {
      const rect = fig.getBoundingClientRect();
      return rect.width ? ((x - rect.left) / rect.width) * 100 : 50;
    };

    let pid = null;
    let dragging = false;
    let decided = false;
    let startX = 0;
    let startY = 0;

    const release = () => {
      if (pid !== null && fig.hasPointerCapture?.(pid)) fig.releasePointerCapture(pid);
      pid = null;
      dragging = false;
      decided = false;
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
        if (dx < 6 && dy < 6) return;            // too small to read as either
        decided = true;
        if (dy > dx) { pid = null; return; }      // a scroll — leave it be
        dragging = true;
        fig.setPointerCapture(pid);
      }

      if (!dragging) return;
      e.preventDefault();
      set(pctFromX(e.clientX));
    });

    fig.addEventListener("pointerup", release);
    fig.addEventListener("pointercancel", release);

    // a tap with no drag should still move the wipe to where it landed
    fig.addEventListener("click", (e) => { if (!decided) set(pctFromX(e.clientX)); });
  });
}


/* ==========================================================================
   JUSTIFYING THE PICTURE GRIDS
   --------------------------------------------------------------------------
   Rows, not columns. Frames are taken in order until the row is about as tall
   as it should be, then every frame in that row is scaled to the single height
   that makes the row fill the width exactly. Nothing is cropped: the height
   follows from the ratios rather than being imposed on them, and because each
   row closes, the wall has no hole anywhere in it.

   Widths are written as a share of the row rather than in pixels, so a window
   drag keeps every row justified between recalculations — only the row height
   changes, which is what should happen.

   The ratios come from the width and height attributes on each <img>, so the
   wall is laid out on the first frame and never reflows as the files arrive.
   ========================================================================== */

/* How many frames a row wants. Derived from the gallery's own pictures rather
   than fixed, so a row of upright portraits and a row of landscapes both come
   out at a sensible size: --cols says how many should sit across, and the
   average shape says how tall that makes them. */
function targetRowHeight(ratios, inner, cols) {
  const average = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return inner / cols / average;
}

/* A row plan written into the markup, as data-rows="3 2 3".

   The automatic planner below optimises for evenness, which is the right
   default and a poor way to art-direct a particular wall. This lets the layout
   be stated outright: three frames, then two, then three. Each row is still
   justified to the full width by the same code, so a hand-written plan can
   change the rhythm but cannot introduce a gap or crop anything — the two
   things that are not negotiable.

   It applies only at the widest layout. Below that there are fewer columns and
   a plan drawn for three across would be wrong, so the automatic planner takes
   over again. A plan whose numbers do not add up to the number of frames is
   ignored rather than half-applied. */
function statedRows(frames, gallery, cols) {
  const spec = gallery.dataset.rows;
  if (!spec || cols < 3) return null;

  const lengths = spec.trim().split(/\s+/).map(Number);
  if (lengths.some((n) => !Number.isInteger(n) || n < 1)) return null;
  if (lengths.reduce((a, b) => a + b, 0) !== frames.length) return null;

  const rows = [];
  let at = 0;
  for (const n of lengths) { rows.push(frames.slice(at, at + n)); at += n; }
  return rows;
}

/* Where the rows break.

   Taken as a whole rather than one row at a time. A left-to-right greedy pass
   is the obvious way to do this and it is what ran first: it closes a row the
   moment adding another frame would take the height further from the target.
   That is locally right and globally poor — it spends the good frames early
   and leaves whatever is over to form the last row, which on the proposals
   wall came out half as tall again as the rows above it.

   So every possible set of breaks is costed instead, and the cheapest wins.
   The cost of a row is how far its height lands from the target, measured as a
   proportion rather than in pixels: a row 60px under target matters much more
   when the target is 200 than when it is 500. Rows are held to roughly the
   intended frames across, which stops the arithmetic buying an even wall by
   putting seven tiny pictures on a line.

   Row length carries a cost of its own, because height alone does not know
   what the wall is meant to look like. Left to the arithmetic, the proposals
   wall came out four across at 142px tall: beautifully even, and thumbnails.
   --cols says three, so a row that is not three pays a little for it and only
   wins if it is clearly better. That keeps the declared design and the media
   queries behind it in charge, with the fit as the tie-breaker.

   It is a short dynamic program over the frames in order, so the sequence is
   never rearranged: the wall reads in the order the pictures were given. */
const ROW_LENGTH_COST = 0.03;
function planRows(frames, width, gutter, target, cols) {
  const n = frames.length;
  const minLen = Math.max(1, Math.min(cols - 1, n));
  const maxLen = cols + 1;

  const prefix = [0];
  frames.forEach((f, i) => prefix.push(prefix[i] + f.ratio));
  const heightOf = (from, to) =>
    (width - gutter * (to - from - 1)) / (prefix[to] - prefix[from]);

  const cost = new Array(n + 1).fill(Infinity);
  const from = new Array(n + 1).fill(-1);
  cost[0] = 0;

  for (let to = 1; to <= n; to++) {
    for (let len = minLen; len <= maxLen; len++) {
      const start = to - len;
      if (start < 0 || cost[start] === Infinity) continue;
      const deviation = heightOf(start, to) / target - 1;
      const off = len - cols;
      const total = cost[start] + deviation * deviation + ROW_LENGTH_COST * off * off;
      if (total < cost[to]) { cost[to] = total; from[to] = start; }
    }
  }

  if (cost[n] === Infinity) return null;   // nothing satisfied the bounds

  const rows = [];
  for (let to = n; to > 0; to = from[to]) rows.unshift(frames.slice(from[to], to));
  return rows;
}

function justifyGallery(gallery) {
  const items = [...gallery.children];
  if (!items.length) return;

  const frames = items.map((el) => {
    const img = el.querySelector("img");
    const w = Number(img?.getAttribute("width"));
    const h = Number(img?.getAttribute("height"));
    return { el, ratio: w && h ? w / h : 0 };
  });
  if (frames.some((f) => !f.ratio)) return;   // rather no layout than a wrong one

  const cols = parseInt(getComputedStyle(gallery).getPropertyValue("--cols"), 10) || 1;
  const width = gallery.getBoundingClientRect().width;
  const gutter = parseFloat(getComputedStyle(gallery).gap) || 0;
  if (!width) return;

  /* One across is a plain stack: every frame is its own row, full width. */
  if (cols < 2) {
    items.forEach((el) => { el.style.width = "100%"; });
    gallery.classList.add("is-justified");
    return;
  }

  const target = targetRowHeight(frames.map((f) => f.ratio), width - gutter * (cols - 1), cols);
  const rows = statedRows(frames, gallery, cols)
           || planRows(frames, width, gutter, target, cols);
  if (!rows) return;

  rows.forEach((cells) => {
    const ratioSum = cells.reduce((a, c) => a + c.ratio, 0);
    const gaps = cells.length - 1;
    cells.forEach(({ el, ratio }) => {
      /* The gutter goes in as var(--gutter), not as the pixel value it happens
         to have right now. That matters: --gutter is fluid, so a width with the
         old pixel count frozen into it is wrong the instant the window moves,
         and two frames plus a gutter that grew would overflow their row and
         wrap — eight rows of one, at 768px, until the debounced recalculation
         caught up. Left in CSS terms the row re-justifies itself continuously
         through a resize drag, and this function only has to decide grouping.

         The 1px is a rounding allowance. Widths summing to exactly the
         container can tip a wrapping flex row over by a fraction of a pixel and
         drop the last frame onto a line of its own; a pixel short of the full
         width is invisible and cannot. */
      el.style.width =
        `calc((100% - ${gaps} * var(--gutter) - 1px) * ${(ratio / ratioSum).toFixed(6)})`;
    });
  });

  gallery.classList.add("is-justified");
}

function justifyGalleries() {
  // .gallery--tiles is a fixed three-across grid and owns its own sizing
  document.querySelectorAll(".gallery:not(.gallery--tiles)").forEach(justifyGallery);
}

function initGalleries() {
  justifyGalleries();

  let timer;
  const redo = () => { clearTimeout(timer); timer = setTimeout(justifyGalleries, 120); };
  window.addEventListener("resize", redo, { passive: true });
  window.addEventListener("orientationchange", redo);

  /* A background tab throttles timers, so a window resized while it was hidden
     can come back still grouped for the width it had before. Nothing is broken
     in the meantime — the widths are in CSS terms, so the rows stay justified
     and gap-free at any size; only the choice of how many frames share a row is
     stale. Settling it on return costs one pass. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") justifyGalleries();
  });

  // the gutter moves with the type scale, so measure again once the face is in
  document.fonts?.ready.then(justifyGalleries);
}


/* ==========================================================================
   LIGHTBOX
   --------------------------------------------------------------------------
   Every photograph carries a hover zoom, which reads as "I am clickable". This
   makes the promise good — on a photographer's site, being able to look at the
   picture properly is rather the point.
   ========================================================================== */
function initLightbox() {
  const box = document.querySelector("[data-lightbox]");
  if (!box || typeof box.showModal !== "function") return;

  // the grading wipe and the reel posters have their own jobs
  const shots = [...document.querySelectorAll(".frame img")].filter(
    (img) => !img.closest(".compare") && !img.closest(".player")
  );
  if (!shots.length) return;

  const img = box.querySelector(".lightbox__img");
  let index = 0;
  let opener = null;
  let openedByKeyboard = false;

  /* The widest file the browser was offered — not the one it picked, which was
     chosen for a thumbnail a couple of hundred pixels across. */
  function widest(el) {
    const set = el.getAttribute("srcset");
    if (!set) return el.src;
    let best = el.src;
    let bestWidth = 0;
    for (const part of set.split(",")) {
      const [url, w] = part.trim().split(/\s+/);
      const width = parseInt(w, 10) || 0;
      if (url && width >= bestWidth) { bestWidth = width; best = url; }
    }
    return best;
  }

  function show(i) {
    index = (i + shots.length) % shots.length;
    const source = shots[index];
    img.alt = source.alt || "";

    /* Open on whatever is already decoded so the frame is never blank, then
       swap in the full-size file when it arrives. Stopping at the warm copy
       would mean the one view built for looking at a photograph properly is
       the one showing a thumbnail blown up. */
    const warm = source.currentSrc || source.src;
    const full = widest(source);
    img.src = warm;
    if (full && full !== warm) {
      const hi = new Image();
      hi.addEventListener("load", () => {
        if (shots[index] === source) img.src = full;   // they may have moved on
      }, { once: true });
      hi.src = full;
    }

    /* alt only. It describes the picture for someone who cannot see it, and
       it is not drawn on screen: no typography goes near a photograph here,
       in the viewer any more than in the grid. */
  }

  shots.forEach((shot, i) => {
    const frame = shot.closest(".frame");
    frame.classList.add("frame--zoomable");
    frame.tabIndex = 0;
    frame.setAttribute("role", "button");

    frame.addEventListener("click", () => {
      opener = frame; openedByKeyboard = false; show(i); box.showModal();
    });

    frame.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      opener = frame; openedByKeyboard = true; show(i); box.showModal();
    });
  });

  box.querySelector("[data-lb-prev]").addEventListener("click", () => show(index - 1));
  box.querySelector("[data-lb-next]").addEventListener("click", () => show(index + 1));
  box.querySelector("[data-lb-close]").addEventListener("click", () => box.close());

  box.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); show(index + 1); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); show(index - 1); }
  });

  // clicking the backdrop closes; clicking the picture does not
  box.addEventListener("click", (e) => { if (e.target === box) box.close(); });

  box.addEventListener("close", () => {
    /* Returning focus is right for a keyboard user, and is exactly what leaves
       a mouse user staring at a focus ring on the photo they just closed. */
    if (openedByKeyboard) opener?.focus({ preventScroll: true });
    opener = null;
    openedByKeyboard = false;
  });
}


/* ==========================================================================
   THE DOCK
   ========================================================================== */
function initDock() {
  const dock = document.querySelector("[data-dock]");
  if (!dock) return;

  const wa = dock.querySelector("[data-wa]");
  const top = dock.querySelector("[data-to-top]");
  const contact = document.querySelector("#contact");

  let contactVisible = false;
  if (contact && "IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      contactVisible = entry.isIntersecting;
      update();
    }, { threshold: 0 }).observe(contact);
  }

  function update() {
    const y = window.scrollY;
    wa?.classList.toggle("is-shown", y > window.innerHeight * 0.6 && !contactVisible);
    top?.classList.toggle("is-shown", y > window.innerHeight * 1.8);
  }

  onScrollFrame(update);

  top?.addEventListener("click", () => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    // send focus back to the top of the document, not merely the pixels
    document.querySelector(".skip-link")?.focus({ preventScroll: true });
  });
}


/* ==========================================================================
   SCROLL REVEAL
   ========================================================================== */
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
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.05 });

  targets.forEach((el) => observer.observe(el));

  /* A tab restored from the background can have missed every callback, which
     would strand whatever is already on screen. Sweep once on return. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    targets.forEach((el) => {
      if (el.classList.contains("is-in")) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        el.classList.add("is-in");
        observer.unobserve(el);
      }
    });
  });
}


/* ==========================================================================
   PHOTOGRAPHS FADING IN AS THEY DECODE
   ========================================================================== */
function initImageFade() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const shots = document.querySelectorAll(".frame img");
  if (!shots.length) return;

  document.documentElement.classList.add("js-imgfade");

  const settle = (img) => img.classList.add("is-loaded");

  shots.forEach((img) => {
    if (img.complete && img.naturalWidth) {
      settle(img);
    } else {
      img.addEventListener("load", () => settle(img), { once: true });
      img.addEventListener("error", () => settle(img), { once: true });  // never invisible
    }
  });

  /* A tab in the background does not advance transitions, so an image that
     finished loading there can be left mid-fade. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    shots.forEach((img) => { if (img.complete) settle(img); });
  });
}


/* ==========================================================================
   OPENING AT THE TOP
   --------------------------------------------------------------------------
   A browser restores the scroll position it remembers for a URL, and with
   scroll-behavior: smooth on the root that restoration animates — so a shared
   link could open part way down the page and then visibly slide further. A
   real #section link is still honoured; only the remembered position is
   dropped.
   ========================================================================== */
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
if (!location.hash) {
  window.addEventListener("load", () => {
    if (!location.hash) window.scrollTo({ top: 0, behavior: "auto" });
  }, { once: true });
}


function init() {
  initImageFade();
  initHeroVideo();
  initRail();
  initMenu();
  initCompare();
  initGalleries();
  initPlayers();
  initReels();
  initReveal();
  initDock();
  initLightbox();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
