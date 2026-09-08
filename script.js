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

  // Built-in placeholder art for the spinning circle: only the bottom half
  // is ever visible at rest, so "day" goes on the bottom and "night" on
  // the top — a 180deg spin swaps which one shows.
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

  // scatter a handful of stars once
  const STAR_COUNT = 26;
  for (let i = 0; i < STAR_COUNT; i++) {
    const s = document.createElement('span');
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 55 + '%';
    s.style.animationDelay = (Math.random() * 3).toFixed(2) + 's';
    starsWrap.appendChild(s);
  }

  function setNight(isNight) {
    body.classList.toggle('night', isNight);
    indicator.setAttribute('aria-pressed', String(isNight));
    // phaseLine.textContent = isNight ? NIGHT_TEXT : DAY_TEXT;
  }

  // ---- tween helper -------------------------------------------------
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

  // ---- circle flip, mirrors the Unity FlipCircle coroutine ----------
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

  // ---- arrow kick, mirrors ArrowSnapToStart --------------------------
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

  indicator.addEventListener('click', () => {
    setNight(!body.classList.contains('night'));
    flipCircle();
    //kickArrow();
  });
})();