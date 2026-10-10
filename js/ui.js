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
   VIDEO — one rule for every <video> on the page
   --------------------------------------------------------------------------
   Each one plays while it is on screen, pauses once it has left, and starts
   muted. A visitor downloads the films they scroll to and no others, and a
   section left behind is not still decoding video into a tab nobody is on.

   That last part did not hold before. preload="none" does not survive an
   autoplay attribute: the browser starts the file the moment the tag is
   parsed, and a pause() sent before playback has begun is a no-op, so every
   reel below the fold was downloading and running from the first paint.
   Measured with the page left at the top: 79MB in the first ten seconds, the
   long films still going. Only the hero keeps
   the attribute now, because it is on screen when the page opens; this
   function takes it off again before it can start anywhere else.

   Two kinds, and the markup says which is which:

   Ambient -- the hero, the reels, the banner, the promo loop. No controls,
   muted for good, looped: a photograph that happens to move. Every one of
   these files is digitally silent anyway; decoded, not one sample is above
   zero.

   Films -- anything written as <video controls>. Each of these carries a
   real soundtrack, so it starts muted like everything else but keeps the
   native controls, and the volume button on them is the visitor's to press.
   What they choose then sticks: sound they turned on is still on when the
   film resumes after a scroll away and back, and a film they paused by hand,
   or watched to the end, is not restarted behind their back.

   Ambient video starts once a fifth of it is in view; a film waits for half,
   so its opening is not spent mostly off screen. Both pause only once they
   have gone entirely, so a scroll that stops on the threshold cannot flicker
   one on and off -- the same two-mark rule the rail uses.

   Reduced motion and Data Saver switch off the starting, never the stopping:
   nothing begins by itself, a film still plays when its button is pressed,
   and whatever is playing still pauses when it leaves.
   ========================================================================== */
const AMBIENT_IN = 0.2;
const FILM_IN = 0.5;

const videoParked = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
  !!navigator.connection?.saveData;

/* A .player is a poster with its <video> built on demand, so not even the
   file's metadata is fetched until it is wanted. Scrolled to, it is ambient:
   looped, silent, nothing drawn over it. Reached by its button instead --
   which only shows when nothing starts by itself -- it is a deliberate request
   to watch, so it gets controls and plays once. */
function buildPlayer(player, auto) {
  const frame = player.querySelector(".player__frame");
  const src = player.dataset.src;
  if (!frame || !src || player.classList.contains("is-playing")) return null;

  const video = document.createElement("video");
  video.src = src;
  video.controls = !auto;
  video.loop = !!auto;
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
  return video;
}

function initPlayers() {
  /* With the observer running, a player starts itself and the button is only
     the fallback. Hidden rather than removed: it is what the keyboard reaches
     for if autoplay is ever refused. */
  const auto = "IntersectionObserver" in window && !videoParked();

  document.querySelectorAll(".player").forEach((player) => {
    const button = player.querySelector(".player__play");
    if (!button) return;
    if (auto) button.hidden = true;

    button.addEventListener("click", () => {
      const video = buildPlayer(player, false);
      video?.play?.().catch(() => {});
      // a click is deliberate, so the keyboard follows it; scrolling into view
      // is not, and stealing focus mid-scroll would yank the page around
      video?.focus({ preventScroll: true });
    }, { once: true });
  });
}

/* ==========================================================================
   A REEL'S SOUND BUTTON
   --------------------------------------------------------------------------
   A vertical reel loops like one, so it gets what a reel has instead of a
   player: one button in the corner, sound on and off. The markup carries
   native controls for the visitor without this script, who would otherwise
   have a poster and no way to play it; here they are swapped for the button.

   Reduced motion and Data Saver keep the native controls instead. Nothing
   starts by itself there, so the reel needs a play button, and the sound
   button alone would be a control for a film that never moves.
   ========================================================================== */
function initSoundButtons() {
  if (videoParked()) return;

  document.querySelectorAll("video[data-sound]").forEach((video) => {
    const button = video.parentElement.querySelector("[data-sound-toggle]");
    if (!button) return;

    video.controls = false;
    button.hidden = false;

    const labels = {
      on: button.dataset.labelOn || "Turn the sound on",
      off: button.dataset.labelOff || "Turn the sound off",
    };

    /* The label says what pressing will do, rather than aria-pressed on a
       fixed name: "Turn the sound off" needs no state to be understood. */
    const paint = () => {
      const audible = !video.muted;
      button.classList.toggle("is-on", audible);
      button.setAttribute("aria-label", audible ? labels.off : labels.on);
    };

    button.addEventListener("click", () => {
      video.muted = !video.muted;
      // a press is a gesture, the one moment sound is always allowed to start
      if (!video.muted && video.paused) video.play?.().catch(() => {});
    });

    /* Painted from the video rather than from the click, because the video
       can change on its own: initVideos() mutes a film again if the browser
       refuses its sound on the way back into view. */
    video.addEventListener("volumechange", paint);
    paint();
  });
}

function initVideos() {
  /* A .player is watched as a figure, because its video does not exist yet. */
  const targets = [...document.querySelectorAll("video, .player")];
  if (!targets.length) return;

  const videoIn = (t) => (t.tagName === "VIDEO" ? t : t.querySelector("video"));
  const targetOf = (v) => v.closest(".player") || v;
  /* A film is a video the visitor can hear: native controls, or a sound
     button of its own (data-sound -- the vertical reel, whose controls are
     swapped for one). Either way it must not be re-muted behind their back. */
  const isFilm = (v) => v.controls || v.hasAttribute("data-sound");

  const seen = new Map();        // target -> share of it on screen, as last reported
  const ours = new WeakSet();    // videos this code is in the middle of pausing
  const stopped = new WeakSet(); // films the visitor paused, or watched to the end
  const refused = new Set();     // play() turned down by the autoplay policy
  const ready = new WeakSet();

  function prepare(video) {
    if (ready.has(video)) return;
    ready.add(video);

    // the two properties the autoplay policy checks, set whatever the markup says
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.removeAttribute("autoplay");   // see the note at the top: only this starts anything

    video.addEventListener("play", () => stopped.delete(video));
    video.addEventListener("pause", () => {
      if (ours.has(video)) { ours.delete(video); return; }
      /* A page going into the background can have its media paused by the
         system as well as by this code, in either order. That is not the
         visitor's doing, and remembering it would leave the film stopped for
         good when they come back. */
      if (document.hidden) return;
      /* Not ours, so the visitor's -- or the end of the film, which fires pause
         too. An ambient video has no controls to pause it with, so a pause it
         did not ask for is the browser's and is not remembered. */
      if (isFilm(video)) stopped.add(video);
    });
  }

  function play(video) {
    refused.delete(video);
    if (!isFilm(video)) video.muted = true;
    video.play?.().catch((err) => {
      if (err?.name !== "NotAllowedError") return;   // AbortError: a pause overtook it
      /* Sound the visitor turned on can be refused on the way back in when
         there has been no fresh gesture (Safari). Muted beats not at all, and
         the volume button is right there. */
      if (!video.muted) { video.muted = true; play(video); return; }
      refused.add(video);   // Low Power Mode, mostly: tried again on the next gesture
    });
  }

  function pause(video) {
    if (!video || video.paused) return;
    ours.add(video);
    video.pause();
  }

  function settle(target) {
    const ratio = seen.get(target) || 0;
    let video = videoIn(target);

    if (ratio === 0 || document.hidden) { pause(video); return; }

    if (videoParked()) {
      // motion that was already running stops; a film the visitor started does not
      if (video && !isFilm(video)) pause(video);
      return;
    }

    // between the marks, on the way in or out: leave it as it is
    if (ratio < (video && isFilm(video) ? FILM_IN : AMBIENT_IN)) return;

    if (!video) video = buildPlayer(target, true);   // a player, first time on screen
    if (!video) return;
    prepare(video);

    if (video.paused && !stopped.has(video)) play(video);
  }

  targets.forEach((t) => { const v = videoIn(t); if (v) prepare(v); });

  if (!("IntersectionObserver" in window)) {
    // nothing to measure with, so everything counts as on screen
    targets.forEach((t) => { seen.set(t, 1); settle(t); });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      seen.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
      settle(entry.target);
    });
  }, { threshold: [0, AMBIENT_IN, FILM_IN] });

  targets.forEach((t) => observer.observe(t));

  // a backgrounded tab should not sit there playing to nobody, and picks up where it was
  document.addEventListener("visibilitychange", () => targets.forEach(settle));
  window.matchMedia("(prefers-reduced-motion: reduce)")
    .addEventListener?.("change", () => targets.forEach(settle));

  /* A refusal is the browser saying "not without a gesture", so the next
     gesture is when to ask again. */
  const retry = () => {
    if (!refused.size) return;
    [...refused].forEach((v) => { refused.delete(v); settle(targetOf(v)); });
  };
  ["touchend", "pointerdown", "keydown"].forEach((type) =>
    document.addEventListener(type, retry, { passive: true }));
}


/* ==========================================================================
   CAROUSEL
   --------------------------------------------------------------------------
   The track is a real scroll container with scroll-snap, so swiping, flicking
   and dragging the scrollbar already work before any of this runs. What this
   adds is the furniture: arrows, dots, a timer that advances on its own, the
   loop, and a one-off hint that the strip moves sideways at all.

   Everything below drives the carousel by setting scrollLeft and then reading
   it back, rather than keeping an index of its own. That matters: the visitor
   can move the track by hand at any moment, and a component that remembers
   where it thinks it is will disagree with where it actually is the first time
   they do. The scroll position is the single source of truth.

   THE LOOP. The set of photographs is copied once before itself and once
   after, and the visitor starts on the middle copy. Wherever they stop, if it
   is on one of the outer copies the track jumps by exactly one set's width to
   the same picture in the middle -- instantly, and only once scrolling has
   come to rest, so the jump lands between two identical frames and is never
   seen. Moving a scroll position mid-gesture is what makes other infinite
   carousels stutter on iOS, which is why it waits.

   A whole set on either side is more than it strictly needs, and that is the
   point: scroll-snap-stop holds a swipe to one frame, so the visitor can never
   outrun the buffer before the jump, however fast they flick. The copies are
   aria-hidden and inert, so a screen reader and the Tab key meet each
   photograph once.
   ========================================================================== */
const CAROUSEL_MS = 4000;

/* The hint waits for most of the strip to be on screen, and then a beat
   more, so the eye has landed on it before it moves. */
const NUDGE_AT = 0.6;
const NUDGE_DELAY_MS = 450;

function initCarousels() {
  document.querySelectorAll("[data-carousel]").forEach(setupCarousel);
}

function setupCarousel(root) {
  const track = root.querySelector("[data-carousel-track]");
  const slides = [...root.querySelectorAll(".carousel__slide")];
  if (!track || slides.length < 2) return;

  const prev = root.querySelector("[data-carousel-prev]");
  const next = root.querySelector("[data-carousel-next]");
  const dotWrap = root.querySelector("[data-carousel-dots]");
  const count = root.querySelector("[data-carousel-count]");
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");

  const n = slides.length;

  // ---- the loop: a copy of the set either side of it
  const copies = () => slides.map((slide) => {
    const copy = slide.cloneNode(true);
    copy.setAttribute("aria-hidden", "true");
    copy.inert = true;
    return copy;
  });
  track.prepend(...copies());
  track.append(...copies());
  const all = [...track.children];          // 3n frames: copy, the real set, copy

  slides.forEach((slide, i) => {
    slide.setAttribute("role", "group");
    slide.setAttribute("aria-roledescription", "slide");
    slide.setAttribute("aria-label", `${i + 1} / ${n}`);
  });

  /* Measured from the first frame, so the number is how far the track has to
     travel. From the bounding box rather than offsetLeft, which rounds to a
     whole pixel: the frames are fractional widths, so they sit at fractional
     positions, and a jump to a rounded one lands up to a pixel off the snap
     line. Both frames carry the same transform during the hint, so it cancels
     out of the difference. */
  const leftOf = (k) => all[k].getBoundingClientRect().left - all[0].getBoundingClientRect().left;
  const setWidth = () => leftOf(n);         // one whole set, its gaps included

  /* Where the track actually is, not where we last told it to go: whichever
     frame sits nearest the leading edge, which is what scroll-snap aligns to.
     An index into all 3n, so a step from the last frame goes on to the copy
     after it rather than back to the start. */
  const at = () => {
    const x = track.scrollLeft;
    let best = 0, bestGap = Infinity;
    for (let k = 0; k < all.length; k++) {
      const gap = Math.abs(leftOf(k) - x);
      if (gap < bestGap) { bestGap = gap; best = k; }
    }
    return best;
  };

  /* Where a smooth scroll is headed until it gets there. Without it, a second
     press of the arrow mid-glide reads the frame the track is still leaving
     and asks for the one already on its way, and the press is lost. */
  let heading = null;
  const from = () => heading ?? at();

  // the frame at the leading edge when the track last came to rest
  let showing = n;

  /* "instant", not "auto": auto means "do whatever CSS scroll-behavior says",
     which here is smooth -- and a jump that animates is a jump you can see. */
  let ownJump = false;
  const jump = (left) => { ownJump = true; track.scrollTo({ left, behavior: "instant" }); };

  // back to the middle copy, keeping exactly what is on screen
  function recentre() {
    const k = from();
    const shift = k < n ? 1 : k >= 2 * n ? -1 : 0;
    if (!shift) return;
    jump(track.scrollLeft + shift * setWidth());
    if (heading !== null) heading += shift * n;
  }

  const goTo = (k, smooth = true) => {
    heading = k;
    track.scrollTo({
      left: leftOf(k),
      behavior: smooth && !still.matches ? "smooth" : "instant",
    });
    /* Repaint against the frame asked for, not the one the track is still on.
       Waiting for the scroll event leaves the dots a beat behind every press,
       and a smooth scroll has not arrived yet when the handler returns. */
    paint(k % n);
  };

  const step = (dir) => {
    recentre();                  // so a step never runs off either end
    goTo(from() + dir);
  };

  // the copy of picture i nearest to where the track is now, so a dot takes the short way
  const nearest = (i) => {
    const k = from();
    const base = k - (k % n) + i;
    return [base - n, base, base + n]
      .filter((c) => c >= 0 && c < all.length)
      .reduce((a, b) => (Math.abs(b - k) < Math.abs(a - k) ? b : a));
  };

  // ---- dots, one per photograph, written here so the markup need not track them
  const label = dotWrap?.dataset.label || "Go to image";
  const dots = slides.map((_, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "carousel__dot";
    b.setAttribute("aria-label", `${label} ${i + 1}`);
    b.addEventListener("click", () => { hold(); goTo(nearest(i)); });
    dotWrap?.append(b);
    return b;
  });

  /* Takes the index when the caller knows it — a button press knows where it is
     going before the track gets there — and reads the scroll position when it
     does not, which is the case after a swipe. */
  function paint(i = at() % n) {
    dots.forEach((d, j) => {
      if (j === i) d.setAttribute("aria-current", "true");
      else d.removeAttribute("aria-current");
    });
    /* The phone's stand-in for the bar, and not hidden from assistive tech.
       The two never speak over each other because each is display:none at the
       size the other is shown, and display:none takes an element out of the
       accessibility tree as well as off the screen — so on a phone, where the
       dots are gone, this is the only thing left saying where you are. */
    if (count) count.textContent = `${i + 1} / ${n}`;
  }

  // ---- the timer ----
  let timer = 0;
  let paused = false;

  const start = () => {
    clearInterval(timer);
    if (paused || still.matches || document.hidden) return;
    timer = setInterval(() => step(1), CAROUSEL_MS);
  };
  const stop = () => clearInterval(timer);

  /* A pause that outlives the pointer. Clicking an arrow and then moving the
     mouse away should not hand the carousel straight back to the timer while
     the visitor is still looking at what they chose. */
  let holdTimer = 0;
  function hold() {
    stop();
    clearTimeout(holdTimer);
    holdTimer = setTimeout(start, CAROUSEL_MS * 2);
  }

  // ---- the hint ----
  /* Once, the first time the strip is properly on screen: every frame slides a
     little way towards the next photograph and settles back. It is drawn by
     the .is-nudging rule in components.css as a transform on the frames, not a
     scroll -- snapping is mandatory here, so a scroll that stopped short of a
     frame would be pulled straight back before the gesture could show.

     Anyone who has already moved the strip themselves has nothing to learn
     from it, so touching the carousel first cancels it for good. */
  let nudged = false;
  let nudgeTimer = 0;

  const learned = () => { nudged = true; clearTimeout(nudgeTimer); };

  /* The visitor has hold of the strip. Any glide this code had under way is
     theirs now, so stop waiting for it to arrive. */
  const takeOver = () => { learned(); heading = null; };

  const nudge = () => {
    if (nudged || still.matches || document.hidden) return;
    nudged = true;
    root.classList.add("is-nudging");
    start();        // a fresh interval, so the first advance does not land on the hint
  };

  // every frame finishes at once; the first to say so is enough
  track.addEventListener("animationend", (e) => {
    if (e.animationName === "carousel-nudge" && root.classList.contains("is-nudging")) {
      root.classList.remove("is-nudging");
    }
  });

  /* Both wrap, because the timer does -- and with the loop there is no end
     for either of them to stop at. */
  prev?.addEventListener("click", () => { learned(); hold(); step(-1); });
  next?.addEventListener("click", () => { learned(); hold(); step(1); });
  dotWrap?.addEventListener("click", learned);

  // pause while it is being looked at or touched, and resume when it is not
  root.addEventListener("pointerenter", () => { paused = true; stop(); });
  root.addEventListener("pointerleave", () => { paused = false; start(); });
  root.addEventListener("focusin", () => { paused = true; stop(); });
  root.addEventListener("focusout", (e) => {
    if (!root.contains(e.relatedTarget)) { paused = false; start(); }
  });
  track.addEventListener("pointerdown", () => { takeOver(); hold(); });
  track.addEventListener("wheel", (e) => {
    hold();
    // a sideways flick is someone using the strip; scrolling the page past it is not
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) takeOver();
  }, { passive: true });

  track.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    learned();
    hold();
    step(e.key === "ArrowRight" ? 1 : -1);
  });

  // ---- settling: the one moment the loop is allowed to move the track
  const hasScrollEnd = "onscrollend" in window;

  /* A finger on the glass is never at rest, however still it is, so the
     fallback timer below must not recentre under it. scrollend already knows
     this, and waits for the snap after the finger lifts as well -- so where it
     exists, lifting the finger schedules nothing. Scheduling there anyway was
     a bug: the timer beat the snap animation and recentred a frame that was
     still 65px from home, and it stayed there. */
  let touching = false;
  track.addEventListener("touchstart", () => { takeOver(); touching = true; }, { passive: true });
  const lift = () => { touching = false; if (!hasScrollEnd) schedule(); };
  track.addEventListener("touchend", lift, { passive: true });
  track.addEventListener("touchcancel", lift, { passive: true });

  /* Exactly on a frame's edge, not merely near it. See the frame observer
     below for how the two come apart. */
  const align = (k) => {
    if (Math.abs(track.scrollLeft - leftOf(k)) > 0.5) jump(leftOf(k));
  };

  function settled() {
    if (touching) return;
    /* A scrollend can arrive for a scroll this code has already replaced --
       the instant jump in recentre(), typically, fired just before the glide
       that follows it. Acting on that one recentred the track out from under
       the glide: twenty-five quick presses of next landed two frames too far.
       It is told apart by distance: it comes while the glide has a frame or
       more still to go. */
    if (heading !== null && Math.abs(track.scrollLeft - leftOf(heading)) > 16) return;
    align(heading ?? at());
    heading = null;
    recentre();
    showing = at();
    paint();
  }

  let settle = 0;
  function schedule() {
    clearTimeout(settle);
    settle = setTimeout(settled, 120);
  }

  if (hasScrollEnd) {
    track.addEventListener("scrollend", settled);
    // the dots still follow a swipe while it is moving, not only when it stops
    track.addEventListener("scroll", () => { if (heading === null) paint(); }, { passive: true });
  } else {
    track.addEventListener("scroll", () => {
      if (heading === null) paint();
      schedule();
    }, { passive: true });
  }

  /* A resize changes the ribbon's height and so every frame's width, which
     leaves scrollLeft pointing somewhere in the middle of a different
     picture. Put the one that was showing back at the leading edge. */
  if ("ResizeObserver" in window) {
    new ResizeObserver(() => { jump(leftOf(heading ?? showing)); }).observe(track);

    /* Frames also change width under a strip that is standing still. A
       photograph arrives a fraction wider or narrower than its width and
       height attributes promised -- the file that loads is a resized copy
       rounded to whole pixels, so a 3:2 comes in at 1.5015 -- and every frame
       after it moves along. Measured, 19 of the 21 shift as they load, by up
       to 0.6px each; across a quick run of presses that left the strip 3px off
       its frame, and the browser does not re-snap for it.

       So when a frame changes size and nothing is moving the strip, the one
       that was showing goes back on the edge. If something is moving it,
       settled() lines it up on arrival instead. */
    /* Only the visitor's scrolling counts as moving here: this code's own
       glides are covered by heading, and its jumps by ownJump. Counting those
       too skipped the photograph that loaded just after a glide arrived. */
    let lastScroll = 0;
    track.addEventListener("scroll", () => {
      if (ownJump) ownJump = false;
      else if (heading === null) lastScroll = performance.now();
    }, { passive: true });
    const drift = new ResizeObserver(() => {
      if (heading !== null || touching || performance.now() - lastScroll < 150) return;
      align(showing);
    });
    all.forEach((frame) => drift.observe(frame));
  }

  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  still.addEventListener?.("change", start);

  /* Only runs while it is on screen. A slideshow ticking away three sections
     above the fold is work nobody asked for, and on a phone it is battery. */
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      const ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
      if (ratio >= 0.25) start(); else stop();

      clearTimeout(nudgeTimer);
      if (ratio >= NUDGE_AT && !nudged) nudgeTimer = setTimeout(nudge, NUDGE_DELAY_MS);
    }, { threshold: [0, 0.25, NUDGE_AT] }).observe(root);
  } else {
    start();
  }

  // open on the first real photograph, with a whole set to spare either side
  jump(leftOf(n));
  paint(0);
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

  /* Warm the neighbours. By the time the visitor presses next, the file is
     usually already decoded and the change is instant. */
  function preload(i) {
    const source = shots[(i + shots.length) % shots.length];
    if (!source) return;
    const url = widest(source);
    if (url) new Image().src = url;
  }

  /* Which show() call is the live one. An await sits in the middle of the
     function, so two quick presses of next can overlap: without this the first
     decode could finish last and put its picture up over the second. */
  let token = 0;

  async function show(i, opening) {
    index = (i + shots.length) % shots.length;
    const source = shots[index];
    const mine = ++token;

    /* alt only. It describes the picture for someone who cannot see it, and it
       is not drawn on screen: no typography goes near a photograph here, in
       the viewer any more than in the grid. */
    img.alt = source.alt || "";

    /* Opening, put up whatever is already decoded so the frame is never blank
       — the box is fixed now, so the thumbnail costs a moment of softness
       rather than a jump. Navigating, leave the previous photograph on screen
       instead: a blur that sharpens is worse than a beat of the picture you
       were already looking at, and the neighbours are usually warm anyway. */
    const warm = source.currentSrc || source.src;
    if (opening && warm) img.src = warm;

    const target = widest(source) || warm;
    if (target) {
      /* decode() rather than load: load fires when the bytes are in, decode
         when the frame is ready to paint. Swapping on load can still show one
         partly-drawn frame, which is the flicker at the end of the change. */
      const next = new Image();
      next.src = target;

      /* Raced against a deadline, never simply awaited. decode() is tied to the
         rendering loop, so in a tab that is not being painted it can stay
         pending indefinitely — and an await that never settles means the line
         below never runs and the viewer quietly stops changing picture. A swap
         one frame less perfect beats a viewer that is stuck. The catch covers a
         broken or cancelled file, where letting the element fall back to its
         own alt text is better than leaving the previous photograph up. */
      await Promise.race([
        next.decode().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);

      if (mine !== token) return;     // they moved on while this was decoding
      img.src = target;
    }

    preload(index + 1);
    preload(index - 1);
  }

  shots.forEach((shot, i) => {
    const frame = shot.closest(".frame");
    frame.classList.add("frame--zoomable");
    frame.tabIndex = 0;
    frame.setAttribute("role", "button");

    frame.addEventListener("click", () => {
      opener = frame; openedByKeyboard = false; show(i, true); box.showModal();
    });

    frame.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      opener = frame; openedByKeyboard = true; show(i, true); box.showModal();
    });
  });

  box.querySelector("[data-lb-prev]").addEventListener("click", () => show(index - 1));
  box.querySelector("[data-lb-next]").addEventListener("click", () => show(index + 1));
  box.querySelector("[data-lb-close]").addEventListener("click", () => box.close());

  box.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    /* The arrows follow the pictures, not the keyboard. The row runs right to
       left in Hebrew and the grid puts the next button on the left, so Left is
       what has to advance there — otherwise the key and the button sitting
       under the same finger disagree about which way forward is. */
    const rtl = document.documentElement.dir === "rtl";
    const forward = rtl ? e.key === "ArrowLeft" : e.key === "ArrowRight";
    show(index + (forward ? 1 : -1));
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

  /* A film's control bar is the one thing here the dock must not sit on. The
     volume button on it is how a visitor hears the film, and the dock floats
     at the bottom right -- exactly where the bar is drawn. With a film scrolled
     to the middle of a laptop screen, "Let's talk" covered the right end of
     the bar. So each button stands aside while it overlaps one, and comes back
     as soon as it does not. Queried each time rather than once, because a
     player's video is built later and gets controls when it is clicked. A
     vertical reel's sound button sits in the same band, so it counts too. */
  const CONTROL_BAR = 72;   // Chrome draws its bar about 60px up from the bottom edge
  const overFilm = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return [...document.querySelectorAll("video[controls], video[data-sound]")].some((video) => {
      const f = video.getBoundingClientRect();
      return r.right > f.left && r.left < f.right &&
             r.bottom > f.bottom - CONTROL_BAR && r.top < f.bottom;
    });
  };

  function update() {
    const y = window.scrollY;
    wa?.classList.toggle("is-shown", y > window.innerHeight * 0.6 && !contactVisible && !overFilm(wa));
    top?.classList.toggle("is-shown", y > window.innerHeight * 1.8 && !overFilm(top));
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
  initRail();
  initMenu();
  initCompare();
  initCarousels();
  initGalleries();
  initPlayers();
  initSoundButtons();
  initVideos();
  initReveal();
  initDock();
  initLightbox();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
