(() => {
  'use strict';
  // Green, gently blinking dot shown in the top-right corner of the page.
  // Injected only on hostnames where the user enabled QuietBlock, so it also
  // works as a visible "this site is protected" indicator. No page CSS
  // injection: everything is applied through CSSOM, so page CSP cannot block
  // it, and nothing is sent anywhere.
  if (!document.documentElement || document.getElementById('quietblock-dot')) return;

  const dot = document.createElement('div');
  dot.id = 'quietblock-dot';
  dot.setAttribute('aria-hidden', 'true');

  const style = dot.style;
  style.position = 'fixed';
  style.top = '12px';
  style.right = '12px';
  style.width = '10px';
  style.height = '10px';
  style.borderRadius = '50%';
  style.background = '#22c55e';
  style.boxShadow = '0 0 8px rgba(34,197,94,.9)';
  style.zIndex = '2147483647';
  style.pointerEvents = 'none';
  style.opacity = '1';

  document.documentElement.appendChild(dot);

  let bright = true;
  const blink = setInterval(() => {
    bright = !bright;
    dot.style.opacity = bright ? '1' : '0.25';
  }, 750);
})();
