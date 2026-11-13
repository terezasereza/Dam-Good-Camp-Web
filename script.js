(function () {
  const body = document.body;
  const indicator = document.getElementById('dnIndicator');
  const circleEl = document.getElementById('dnCircle');
  const arrowDayEl = document.getElementById('dnArrowDay');
  const arrowNightEl = document.getElementById('dnArrowNight');
  const phaseLine = document.getElementById('phaseLine');
  const starsWrap = document.getElementById('stars');

  const DAY_TEXT = "☀️ It's daytime at camp — time to build.";
  const NIGHT_TEXT = "🌙 Night has fallen — happy guests only.";

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
    ['clouds', 0.5],
    ['sun', 0.5],
    ['mountains', 0.4],
    ['left-trees-back', 0.35],
    ['right-trees-back', 0.35],
    ['left-trees-front', 0.25],
    ['right-trees-front', 0.25],
    ['grass', 0.15],
    ['tents', 0.1],
    ['fire', 0.1],
    ['bushes', 0]
  ];

  const heroSky = document.querySelector('.hero-sky');
  const parallaxItems = [];

  const h = new Date().getHours();
  const firstTheme = (h >= 20 || h < 7) ? 'night' : 'day';

  ['day', 'night'].forEach((theme) => {
    const set = document.createElement('div');
    set.className = `hero-bg hero-bg-${theme}`;
    LAYERS.forEach(([name, lag]) => {
      const img = document.createElement('img');
      img.className = 'px-layer';
      const url = `images/${theme}/${name}.webp`;
      if (theme === firstTheme) img.src = url;
      else img.dataset.src = url;
      img.alt = '';
      set.appendChild(img);
      parallaxItems.push({ el: img, lag });
    });
    if (theme === 'night') {
      set.appendChild(starsWrap); // fireflies float in front of every layer
      parallaxItems.push({ el: starsWrap, lag: 0.1 });
    }
    heroSky.insertBefore(set, heroSky.firstChild);
  });

  // Load the other theme: after page load, or earlier if the visitor reaches for the toggle.
  function loadTheme() {
    document.querySelectorAll('.px-layer[data-src]').forEach((img) => {
      img.src = img.dataset.src;
      delete img.dataset.src;
    });
  }
  if (document.readyState === 'complete') loadTheme();
  else window.addEventListener('load', loadTheme);

  if (!reduceMotion) {
    const hero = document.getElementById('top');
    let ticking = false;

    function updateParallax() {
      ticking = false;
      const y = Math.min(window.scrollY, hero.offsetHeight);
      parallaxItems.forEach(({ el, lag }) => {
        el.style.transform = `translate3d(0, ${y * lag}px, 0)`;
      });
    }

    window.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateParallax);
      }
    }, { passive: true });
    updateParallax();
  }

  function setNight(isNight) {
    body.classList.toggle('night', isNight);
    indicator.setAttribute('aria-pressed', String(isNight));
    if (phaseLine) phaseLine.textContent = isNight ? NIGHT_TEXT : DAY_TEXT;
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
})();