(function () {
  const body = document.body;
  const indicator = document.getElementById('dnIndicator');
  const circleEl = document.getElementById('dnCircle');
  const arrowDayEl = document.getElementById('dnArrowDay');
  const arrowNightEl = document.getElementById('dnArrowNight');
  const starsWrap = document.getElementById('stars');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  window.DN_FALLBACK_IMG =
    'data:image/svg+xml;utf8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <circle cx="80" cy="80" r="79" fill="#FBF3E4"/>
      <path d="M2 80 A78 78 0 0 1 158 80 Z" fill="#211B42"/>
      <path d="M2 80 A78 78 0 0 0 158 80 Z" fill="#E2A33D"/>
      <circle cx="80" cy="44" r="19" fill="#A793EE"/>
      <circle cx="88" cy="38" r="16" fill="#211B42"/>
      <circle cx="80" cy="118" r="21" fill="#FBF3E4"/>
    </svg>`);

  // scatter fireflies once, low in the scene, each with its own drift path
  const rand = (min, max) => min + Math.random() * (max - min);
  const FIREFLY_COUNT = 16;
  for (let i = 0; i < FIREFLY_COUNT; i++) {
    const s = document.createElement('span');
    s.style.left = rand(3, 97) + '%';
    s.style.top = rand(20, 90) + '%';
    for (let n = 1; n <= 3; n++) {
      s.style.setProperty(`--dx${n}`, rand(-70, 70).toFixed(0) + 'px');
      s.style.setProperty(`--dy${n}`, rand(-45, 45).toFixed(0) + 'px');
    }
    s.style.setProperty('--drift-time', rand(10, 18).toFixed(1) + 's');
    s.style.setProperty('--glow-time', rand(2, 5).toFixed(1) + 's');
    s.style.setProperty('--delay', '-' + rand(0, 10).toFixed(1) + 's');
    starsWrap.appendChild(s);
  }

  // Parallax layers, back to front.
  // lag: 0 = scrolls with the page, higher = falls behind (looks slower)
  const LAYERS = [
    ['sky', 0.6],
    ['clouds', 0.6],
    ['sun', 0.45],
    ['mountains', 0.35],
    ['left-trees-back', 0.25],
    ['right-trees-back', 0.25],
    ['left-trees-front', 0.15],
    ['right-trees-front', 0.15],
    ['grass', 0],
    ['tents', 0],
    ['fire', 0],
    ['bushes', 0]
  ];

  const heroSky = document.querySelector('.hero-sky');
  const parallaxItems = [];
  const sunMoonLayers = [];

  const h = new Date().getHours();
  const firstTheme = (h >= 20 || h < 7) ? 'night' : 'day';
  let sunRotation = firstTheme === 'night' ? 180 : 0;
  let currentNight = firstTheme === 'night';

  ['day', 'night'].forEach((theme) => {
    const set = document.createElement('div');
    set.className = `hero-bg hero-bg-${theme}`;
    LAYERS.forEach(([name, lag]) => {
      const img = document.createElement('img');
      img.className = 'px-layer';
      const parallaxEl = name === 'sun' ? document.createElement('div') : img;
      const url = name === 'sun' ? 'images/bg-day/sun-moon.webp' : `images/bg-${theme}/${name}.webp`;
      if (name === 'sun') {
        parallaxEl.className = 'px-layer-wrap';
        img.classList.add('sun-moon-layer');
        img.style.rotate = `${sunRotation}deg`;
        sunMoonLayers.push(img);
        parallaxEl.appendChild(img);
      }
      if (theme === firstTheme) img.src = url;
      else img.dataset.src = url;
      img.alt = '';
      set.appendChild(parallaxEl);
      parallaxItems.push({ el: parallaxEl, lag, theme });
    });
    if (theme === 'night') {
      set.appendChild(starsWrap); // fireflies float in front of every layer
      parallaxItems.push({ el: starsWrap, lag: 0.1, theme });
    }
    heroSky.insertBefore(set, heroSky.firstChild);
  });

  // Images the loading screen waits for: the visible theme's layers + logos.
  // (Collected now, before the other theme gets its src.)
  const criticalImgs = Array.from(document.querySelectorAll(
    '.hero-bg .px-layer[src], .brand img, .hero-title img, #dnCircle'
  ));

  function updateSunMoonTransformOrigins() {
    sunMoonLayers.forEach((layer) => {
      if (!layer.naturalWidth || !layer.clientWidth || !layer.clientHeight) return;

      const scale = Math.max(
        layer.clientWidth / layer.naturalWidth,
        layer.clientHeight / layer.naturalHeight
      );
      const renderedWidth = layer.naturalWidth * scale;
      const renderedHeight = layer.naturalHeight * scale;
      const offsetX = (layer.clientWidth - renderedWidth) / 2;
      const offsetY = layer.clientHeight - renderedHeight;
      const sourceOriginX = layer.naturalWidth * 0.47;
      const sourceOriginY = layer.naturalHeight * 0.52;
      const originX = offsetX + sourceOriginX * scale;
      const originY = offsetY + sourceOriginY * scale;
      layer.style.transformOrigin = `${originX}px ${originY}px`;
    });
  }

  const sunMoonResizeObserver = new ResizeObserver(updateSunMoonTransformOrigins);
  sunMoonLayers.forEach((layer) => {
    layer.addEventListener('load', updateSunMoonTransformOrigins);
    sunMoonResizeObserver.observe(layer);
  });
  updateSunMoonTransformOrigins();

  // Load the other theme: after page load, or earlier if the visitor reaches for the toggle.
  function loadTheme() {
    document.querySelectorAll('.px-layer[data-src]').forEach((img) => {
      img.src = img.dataset.src;
      delete img.dataset.src;
      img.decode().catch(() => {});
    });
  }
  if (document.readyState === 'complete') loadTheme();
  else window.addEventListener('load', loadTheme);

  // Parallax is scroll-driven JS, so each frame must be pure writes:
  //  - layout measurements are cached (re-measured only on resize / image load)
  //  - only the visible theme's layers are moved (the hidden set is skipped,
  //    except during the day/night crossfade and on toggle)
  //  - nothing is written once the hero has scrolled fully out of view
  let requestParallaxUpdate = () => {};
  let parallaxBothUntil = 0; // while performance.now() < this, update both themes

  if (!reduceMotion) {
    const hero = document.getElementById('top');
    const heroTitle = hero.querySelector('.hero-title');
    const heroCtas = hero.querySelector('.hero-ctas');
    const dayNightMount = hero.querySelector('.dn-mount');

    let heroH = 0, gap = 0, startOffset = 0;
    let ticking = false;
    let lastSettled = false;

    function measure() {
      heroTitle.style.transform = ''; // measure the un-shifted position
      heroH = hero.offsetHeight;
      gap = Math.max(0, heroCtas.offsetTop - heroTitle.offsetTop - heroTitle.offsetHeight);
      const titleTop = heroTitle.getBoundingClientRect().top;
      const wheelBottom = dayNightMount.getBoundingClientRect().bottom;
      const safeLift = Math.max(0, titleTop - wheelBottom - 24);
      startOffset = Math.min(heroH * 0.32, 450, safeLift);
    }

    function updateParallax() {
      ticking = false;
      const sy = window.scrollY;
      const settled = sy >= heroH * 1.9; // everything is at its end position
      const both = performance.now() < parallaxBothUntil;
      if (settled && lastSettled && !both) return;
      lastSettled = settled;

      const y = Math.min(sy, heroH);
      for (let i = 0; i < parallaxItems.length; i++) {
        const item = parallaxItems[i];
        if (!both && (item.theme === 'night') !== currentNight) continue;
        item.el.style.transform = `translate3d(0, ${y * item.lag}px, 0)`;
      }

      const progress = Math.min(sy / (heroH * 1.9), 1);
      const titleOffset = -startOffset + (startOffset + gap) * progress;
      heroTitle.style.transform = `translate3d(0, ${titleOffset}px, 0)`;
    }

    requestParallaxUpdate = function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateParallax);
      }
    };

    window.addEventListener('scroll', requestParallaxUpdate, { passive: true });

    // re-measure when the hero or the logo changes size (resize, image load, rotate)
    const remeasure = () => { measure(); lastSettled = false; updateParallax(); };
    new ResizeObserver(remeasure).observe(hero);
    new ResizeObserver(remeasure).observe(heroTitle);
    measure();
    updateParallax();
  }

  // Screenshots zoom in as they reach the middle of the screen.
  const screenFrames = document.querySelectorAll('.screens-zigzag .screen-frame');
  if (!reduceMotion && screenFrames.length) {
    let zoomTicking = false;

    function updateScreenZoom() {
      zoomTicking = false;
      const vh = window.innerHeight;
      screenFrames.forEach((frame) => {
        const r = frame.getBoundingClientRect();
        const dist = Math.abs(r.top + r.height / 2 - vh / 2);
        const p = Math.max(0, 1 - dist / (vh * 0.2)); // lower number = zoom zone is narrower
        frame.style.setProperty('--p', p.toFixed(3));
        frame.style.zIndex = Math.round(p * 10);
      });
    }

    function requestZoomUpdate() {
      if (!zoomTicking) {
        zoomTicking = true;
        requestAnimationFrame(updateScreenZoom);
      }
    }

    window.addEventListener('scroll', requestZoomUpdate, { passive: true });
    window.addEventListener('resize', requestZoomUpdate);
    updateScreenZoom();
  }

  function setNight(isNight) {
    body.classList.toggle('night', isNight);
    if (isNight !== currentNight) {
      sunRotation += 180;
      sunMoonLayers.forEach((layer) => { layer.style.rotate = `${sunRotation}deg`; });
      currentNight = isNight;
      // keep both themes in sync through the 1.8s crossfade
      parallaxBothUntil = performance.now() + 2000;
      requestParallaxUpdate();
    }
    indicator.setAttribute('aria-pressed', String(isNight));
  }

  function easeOut(t) { return 1 - (1 - t) * (1 - t); }
  function easeIn(t) { return t * t; }

  function tween(from, to, duration, easing, onUpdate) {
    return new Promise((resolve) => {
      const start = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        onUpdate(from + (to - from) * easing(t));
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  let circleRotation = 0;
  function applyCircle() { circleEl.style.transform = `rotate(${circleRotation}deg)`; }

  async function flipCircle() {
    const start = circleRotation;
    const target = start + 180;

    if (reduceMotion) {
      circleRotation = target;
      applyCircle();
      return;
    }

    // anticipation: a small wind-up backward
    await tween(start, start - 18, 200, easeOut, (v) => { circleRotation = v; applyCircle(); });
    // main flip with overshoot
    await tween(circleRotation, target + 22, 300, easeIn, (v) => { circleRotation = v; applyCircle(); });
    // settle into place
    await tween(circleRotation, target, 180, easeOut, (v) => { circleRotation = v; applyCircle(); });
  }

  const DN_SIZE = 190; // keep this matching --dn-size in style.css
  const ARROW_REACH = DN_SIZE * 0.05;

  let arrowAngle = 0;
  function applyArrow() {
    const t = `translate(-50%, -50%) rotate(${arrowAngle}deg) translateY(${ARROW_REACH}px)`;
    arrowDayEl.style.transform = t;
    arrowNightEl.style.transform = t;
  }

  async function kickArrow() {
    if (reduceMotion) return;
    arrowAngle = -26;
    applyArrow();
    await tween(arrowAngle, 0, 400, easeOut, (v) => { arrowAngle = v; applyArrow(); });
  }

  // default to night mode if it's actually evening/night for the visitor
  const hour = new Date().getHours();
  const startNight = hour >= 20 || hour < 7;
  setNight(startNight);
  if (startNight) { circleRotation = 180; applyCircle(); }

  // start loading the other theme as soon as the visitor reaches for the toggle
  indicator.addEventListener('pointerenter', loadTheme, { once: true });

  indicator.addEventListener('click', () => {
    loadTheme();
    setNight(!body.classList.contains('night'));
    flipCircle();
    //kickArrow();
  });

  // Stays up until the visible theme's layers, logos and fonts are decoded.
  // Screenshots (lazy) and the other theme keep loading behind the scenes.
  const loader = document.getElementById('loadingScreen');
  if (loader) {
    const MIN_SHOW_MS = 400;   // avoid a flash when everything is cached
    const FAILSAFE_MS = 8000;  // never trap the visitor
    const shownAt = performance.now();

    const imgReady = (img) => {
      if (img.complete && img.naturalWidth) return Promise.resolve();
      if (img.decode) return img.decode().catch(() => {}); // broken image: don't block
      return new Promise((res) => {
        img.addEventListener('load', res, { once: true });
        img.addEventListener('error', res, { once: true });
      });
    };

    const fontsReady = document.fonts && document.fonts.ready
      ? document.fonts.ready.catch(() => {})
      : Promise.resolve();

    const assets = Promise.all([...criticalImgs.map(imgReady), fontsReady]);
    const failsafe = new Promise((res) => setTimeout(res, FAILSAFE_MS));

    const reveal = () => {
      loader.classList.add('hidden');
      document.documentElement.classList.remove('is-loading');
      setTimeout(() => loader.remove(), 700);
    };

    Promise.race([assets, failsafe])
      .then(() => new Promise((res) =>
        setTimeout(res, Math.max(0, MIN_SHOW_MS - (performance.now() - shownAt)))))
      .then(() => requestAnimationFrame(() => requestAnimationFrame(reveal)));
  }
})();