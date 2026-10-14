/*
 * VEYA-AI – intro.ts
 * Short logo animation when Discord starts: bubbles flow together into the VEYA "V",
 * it shines for a moment, then falls apart and Discord appears. ~2.4 s, click-through.
 */

const SVG = `<svg viewBox="-10 -10 120 120" aria-hidden="true">
  <defs>
    <linearGradient id="veya-intro-lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F0FF8A"/><stop offset="0.5" stop-color="#CCFF00"/><stop offset="1" stop-color="#5FC400"/></linearGradient>
    <filter id="veya-intro-goo" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.5"/><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"/></filter>
  </defs>
  <g filter="url(#veya-intro-goo)" fill="url(#veya-intro-lg)">
    <path class="vi-path" d="M26 28 L50 72 L74 28" fill="none" stroke="url(#veya-intro-lg)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" pathLength="100"/>
    <circle class="vi-b" style="--x:-62px;--y:-40px;--d:0s;--fx:-26px;--fr:-40deg;--fd:.02s" cx="26" cy="28" r="11"/>
    <circle class="vi-b" style="--x:64px;--y:-48px;--d:.05s;--fx:30px;--fr:35deg;--fd:.08s" cx="74" cy="28" r="11"/>
    <circle class="vi-b" style="--x:6px;--y:70px;--d:.1s;--fx:4px;--fr:10deg;--fd:0s" cx="50" cy="73" r="9"/>
    <circle class="vi-b" style="--x:40px;--y:-66px;--d:.14s;--fx:40px;--fr:60deg;--fd:.12s" cx="85" cy="15" r="5.5"/>
    <circle class="vi-b" style="--x:-70px;--y:30px;--d:.08s;--fx:-18px;--fr:-20deg;--fd:.05s" cx="38" cy="50" r="7.5"/>
    <circle class="vi-b" style="--x:72px;--y:34px;--d:.12s;--fx:18px;--fr:25deg;--fd:.1s" cx="62" cy="50" r="7.5"/>
  </g>
  <ellipse class="vi-shine" cx="22" cy="23" rx="4.5" ry="2.4" transform="rotate(-35 22 23)" fill="#fff" fill-opacity="0.75"/>
  <ellipse class="vi-shine" cx="70" cy="23" rx="4" ry="2.2" transform="rotate(-35 70 23)" fill="#fff" fill-opacity="0.6"/>
</svg>`;

let el: HTMLDivElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

export function playIntro() {
    if (el || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el = document.createElement("div");
    el.className = "veya-intro";
    el.innerHTML = `<div class="vi-logo">${SVG}</div><div class="vi-word">VEYA<span>AI</span></div>`;
    document.body.appendChild(el);
    timer = setTimeout(stopIntro, 2500);
}

export function stopIntro() {
    clearTimeout(timer);
    el?.remove();
    el = null;
}
