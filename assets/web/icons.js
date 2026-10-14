"use strict";
/* Hand-drawn duotone icons: soft fill + one ink outline. icon(name) -> <span class="ic"> */

const IC = {
  ink: "#3e3a52", sky: "#bfe2f6", skyD: "#6fb6e3", mint: "#c4ecd9", mintD: "#64c49f",
  butter: "#ffe6a1", butterD: "#f4bf45", lav: "#ddd3ff", lavD: "#9d86f0", peach: "#ffd8bd",
  coral: "#ff8f70", cream: "#fffdf8", wood: "#ffe8c4",
};
const ICONS = {
  /* ---- games ---- */
  soup: `<path d="M17 16c-2-2.4 2-4.2 0-7M24 15c-2-2.4 2-4.2 0-7M31 16c-2-2.4 2-4.2 0-7" stroke="${IC.skyD}"/>
    <path d="M6.5 22h35c0 9.4-7.8 16-17.5 16S6.5 31.4 6.5 22z" fill="${IC.peach}"/>
    <path d="M18 38.5l1 2.5h10l1-2.5"/><circle cx="20" cy="27.5" r="1.6" fill="${IC.ink}" stroke="none"/>
    <circle cx="28" cy="27.5" r="1.6" fill="${IC.ink}" stroke="none"/><path d="M22.5 30.5q1.5 1.6 3 0"/>
    <ellipse cx="15" cy="30.5" rx="2.2" ry="1.3" fill="${IC.coral}" stroke="none" opacity=".45"/>
    <ellipse cx="33" cy="30.5" rx="2.2" ry="1.3" fill="${IC.coral}" stroke="none" opacity=".45"/>`,
  drawguess: `<path d="M24 7.5C13.5 7.5 6.5 14.8 6.5 23.2 6.5 32 12.8 39.5 21 39.5c3 0 3.6-2.4 2.6-4.3-1.1-2.1.4-4.2 2.9-4.2H31c6 0 10.5-3.7 10.5-9.4C41.5 14 34 7.5 24 7.5z" fill="${IC.butter}"/>
    <circle cx="15.5" cy="20" r="3" fill="${IC.skyD}" stroke="none"/><circle cx="23" cy="14.5" r="3" fill="${IC.mintD}" stroke="none"/>
    <circle cx="31" cy="16.5" r="3" fill="${IC.lavD}" stroke="none"/><circle cx="14.5" cy="28.5" r="3" fill="${IC.coral}" stroke="none"/>`,
  gomoku: `<rect x="6.5" y="6.5" width="35" height="35" rx="9" fill="${IC.wood}"/>
    <path d="M6.5 18h35M6.5 30h35M18 6.5v35M30 6.5v35" stroke="#e3b97f" stroke-width="1.6"/>
    <circle cx="18" cy="30" r="7" fill="#4b4562"/><circle cx="30" cy="18" r="7" fill="${IC.cream}"/>
    <circle cx="16" cy="30.5" r="1" fill="#fff" stroke="none"/><circle cx="20" cy="30.5" r="1" fill="#fff" stroke="none"/>
    <circle cx="28" cy="18.5" r="1" fill="${IC.ink}" stroke="none"/><circle cx="32" cy="18.5" r="1" fill="${IC.ink}" stroke="none"/>`,
  guesswho: `<circle cx="21" cy="21" r="12.5" fill="${IC.sky}"/><path d="M30.5 30.5l9 9" stroke-width="5"/>
    <path d="M14.5 18.5a7 7 0 0 1 6-5.5" stroke="#fff" stroke-width="2.6"/>
    <path d="M18 19.5a3 3 0 1 1 4.2 2.8c-.9.4-1.2 1-1.2 2" stroke-width="2.2"/><circle cx="21" cy="27.3" r="1.3" fill="${IC.ink}" stroke="none"/>`,
  idiom: `<rect x="5.5" y="12" width="19" height="22" rx="5.5" fill="${IC.mint}" transform="rotate(-6 15 23)"/>
    <rect x="23.5" y="14" width="19" height="22" rx="5.5" fill="${IC.sky}" transform="rotate(6 33 25)"/>
    <text x="15" y="28" text-anchor="middle" font-size="12" font-weight="700" fill="${IC.ink}" stroke="none" transform="rotate(-6 15 23)">成</text>
    <text x="33" y="30" text-anchor="middle" font-size="12" font-weight="700" fill="${IC.ink}" stroke="none" transform="rotate(6 33 25)">语</text>`,
  emoji: `<circle cx="24" cy="24" r="16.5" fill="${IC.butter}"/><path d="M15.5 21q2.5-3 5 0M27.5 21q2.5-3 5 0"/>
    <path d="M17.5 27.5q6.5 6.5 13 0z" fill="${IC.coral}"/>
    <ellipse cx="13.5" cy="27" rx="2.5" ry="1.5" fill="${IC.coral}" stroke="none" opacity=".4"/>
    <ellipse cx="34.5" cy="27" rx="2.5" ry="1.5" fill="${IC.coral}" stroke="none" opacity=".4"/>
    <path d="M38 8l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill="${IC.butterD}" stroke-width="1.4"/>`,
  story: `<path d="M24 14c-4.5-3.5-11-4.3-17.5-3v25c6.5-1.3 13-.5 17.5 3 4.5-3.5 11-4.3 17.5-3V11c-6.5-1.3-13-.5-17.5 3z" fill="${IC.cream}"/>
    <path d="M24 14v25"/><path d="M11 18c3-.5 6-.2 9 .8M11 23.5c3-.5 6-.2 9 .8M28 18.8c3-1 6-1.3 9-.8M28 24.3c3-1 6-1.3 9-.8" stroke-width="1.8" stroke="${IC.skyD}"/>
    <path d="M31 9.5v9l2.5-2 2.5 2v-9.5" fill="${IC.lav}" stroke-width="1.8"/>`,
  undercover: `<path d="M5.5 20.5c0-3.3 2.7-5.5 6-5.5h25c3.3 0 6 2.2 6 5.5 0 7.4-4.4 12.5-9.6 12.5-4.4 0-6.1-4-8.9-4s-4.5 4-8.9 4c-5.2 0-9.6-5.1-9.6-12.5z" fill="${IC.lav}"/>
    <ellipse cx="15" cy="22.5" rx="4.6" ry="3.6" fill="${IC.cream}"/><ellipse cx="33" cy="22.5" rx="4.6" ry="3.6" fill="${IC.cream}"/>
    <circle cx="16" cy="23" r="1.6" fill="${IC.ink}" stroke="none"/><circle cx="34" cy="23" r="1.6" fill="${IC.ink}" stroke="none"/>`,
  adventure: `<path d="M24 5l16.5 9.5v19L24 43 7.5 33.5v-19z" fill="${IC.sky}"/>
    <path d="M24 13.5l10 17H14z" fill="${IC.cream}"/><path d="M24 5v8.5M40.5 14.5l-6.5 16M7.5 14.5l6.5 16M14 30.5L7.5 33.5M34 30.5l6.5 3M14 30.5L24 43l10-12.5" stroke-width="1.8"/>
    <text x="24" y="27.5" text-anchor="middle" font-size="8.5" font-weight="800" fill="${IC.ink}" stroke="none">20</text>`,

  /* ---- people & critters ---- */
  you: `<circle cx="24" cy="25" r="15.5" fill="${IC.butter}"/><path d="M15 15.5c3-4.5 10-6 15-3" fill="none"/>
    <circle cx="18.5" cy="25" r="1.8" fill="${IC.ink}" stroke="none"/><circle cx="29.5" cy="25" r="1.8" fill="${IC.ink}" stroke="none"/>
    <path d="M20.5 30q3.5 3 7 0"/><ellipse cx="14.5" cy="29.5" rx="2.5" ry="1.5" fill="${IC.coral}" stroke="none" opacity=".4"/>
    <ellipse cx="33.5" cy="29.5" rx="2.5" ry="1.5" fill="${IC.coral}" stroke="none" opacity=".4"/>`,
  cat: `<path d="M10 22L9 7.5l10 6.5M38 22l1-14.5-10 6.5" fill="${IC.lav}"/>
    <ellipse cx="24" cy="27" rx="16" ry="13.5" fill="${IC.lav}"/>
    <circle cx="18.5" cy="26" r="1.8" fill="${IC.ink}" stroke="none"/><circle cx="29.5" cy="26" r="1.8" fill="${IC.ink}" stroke="none"/>
    <path d="M21 30.5q1.5 1.6 3 0 1.5 1.6 3 0"/><path d="M5 26.5l6 1M5 31l6-1M43 26.5l-6 1M43 31l-6-1" stroke-width="1.6"/>`,
  dog: `<ellipse cx="24" cy="26" rx="14.5" ry="14" fill="${IC.peach}"/>
    <path d="M12 15c-5-1-7.5 4-6.5 10s5 6 6.5 3zM36 15c5-1 7.5 4 6.5 10s-5 6-6.5 3z" fill="#e8b58f"/>
    <circle cx="19" cy="24" r="1.8" fill="${IC.ink}" stroke="none"/><circle cx="29" cy="24" r="1.8" fill="${IC.ink}" stroke="none"/>
    <ellipse cx="24" cy="29" rx="3" ry="2.2" fill="${IC.ink}" stroke="none"/><path d="M24 31v2.5M21 33.5q3 2 6 0"/>`,
  bunny: `<path d="M17 18c-3-7-2.5-13 .5-13.5s5 6 4.5 12.5M31 18c3-7 2.5-13-.5-13.5s-5 6-4.5 12.5" fill="${IC.cream}"/>
    <path d="M18.5 10c.5 2 .8 4 .8 6M29.5 10c-.5 2-.8 4-.8 6" stroke="${IC.coral}" stroke-width="1.6" opacity=".6"/>
    <ellipse cx="24" cy="29" rx="14.5" ry="12" fill="${IC.cream}"/>
    <circle cx="19" cy="28" r="1.8" fill="${IC.ink}" stroke="none"/><circle cx="29" cy="28" r="1.8" fill="${IC.ink}" stroke="none"/>
    <path d="M22.5 32q1.5 1.4 3 0"/><ellipse cx="15" cy="32" rx="2.4" ry="1.4" fill="${IC.coral}" stroke="none" opacity=".4"/>
    <ellipse cx="33" cy="32" rx="2.4" ry="1.4" fill="${IC.coral}" stroke="none" opacity=".4"/>`,
  ai: `<path d="M10.5 21L9.5 7.5l10.5 6.5M37.5 21l1-13.5-10.5 6.5" fill="#c9b8ff"/>
    <path d="M7.5 27c0-9 7.4-14 16.5-14s16.5 5 16.5 14c0 7.5-6.6 12-16.5 12S7.5 34.5 7.5 27z" fill="${IC.lav}"/>
    <path d="M17 25.5q2-2.5 4 0M27 25.5q2-2.5 4 0"/><path d="M21.5 30.5q2.5 2.5 5 0"/>
    <ellipse cx="14" cy="30" rx="2.4" ry="1.4" fill="${IC.coral}" stroke="none" opacity=".4"/>
    <ellipse cx="34" cy="30" rx="2.4" ry="1.4" fill="${IC.coral}" stroke="none" opacity=".4"/>`,
  me: `<circle cx="24" cy="18" r="9" fill="${IC.butter}"/><path d="M9 41c0-8.3 6.7-13 15-13s15 4.7 15 13z" fill="${IC.sky}"/>
    <circle cx="21" cy="18" r="1.3" fill="${IC.ink}" stroke="none"/><circle cx="27" cy="18" r="1.3" fill="${IC.ink}" stroke="none"/><path d="M22 21.5q2 1.6 4 0"/>`,

  /* ---- adventure classes ---- */
  sword: `<path d="M35 7.5h5.5V13L20 33.5l-5.5-5.5z" fill="${IC.cream}"/><path d="M36.5 11.5L19 29" stroke="${IC.skyD}" stroke-width="1.6"/>
    <path d="M11.5 25l11.5 11.5" stroke-width="3.6"/><path d="M14.5 33.5l-6 6" stroke-width="4.2" stroke="${IC.butterD}"/>
    <circle cx="7.5" cy="40.5" r="2.4" fill="${IC.butter}"/>`,
  dagger: `<path d="M24 5.5c3.5 4 4.5 10 4.5 18h-9c0-8 1-14 4.5-18z" fill="${IC.cream}"/><path d="M24 9v13" stroke="${IC.skyD}" stroke-width="1.6"/>
    <rect x="15" y="23.5" width="18" height="4.5" rx="2.25" fill="${IC.mint}"/><path d="M24 28v9" stroke-width="4.2" stroke="${IC.mintD}"/>
    <circle cx="24" cy="40" r="2.6" fill="${IC.butter}"/>`,
  orb: `<circle cx="24" cy="20" r="12" fill="${IC.lav}"/><path d="M17.5 15.5a7.5 7.5 0 0 1 5.5-3.5" stroke="#fff" stroke-width="2.6"/>
    <path d="M28 21l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="#fff" stroke-width="1.2"/>
    <path d="M15 41l3.5-8.5h11L33 41z" fill="${IC.butter}"/>`,
  lute: `<path d="M27 21l11-11" stroke-width="4.4" stroke="#c99566"/><path d="M36 6.5l5.5 5.5-3 3-5.5-5.5z" fill="${IC.butter}"/>
    <ellipse cx="19" cy="29" rx="12.5" ry="11" transform="rotate(-45 19 29)" fill="${IC.peach}"/>
    <circle cx="19.5" cy="28.5" r="3.6" fill="#c99566"/><path d="M12 36l4-4" stroke-width="3"/>`,

  /* ---- ui ---- */
  logo: `<path d="M8.5 17c1.6-3.8 4.8-5.5 8.5-5.5h14c3.7 0 6.9 1.7 8.5 5.5l3.4 9.2c2 5.5-.6 11.3-5.8 11.3-3.2 0-4.7-2.4-6.1-4.7H17c-1.4 2.3-2.9 4.7-6.1 4.7-5.2 0-7.8-5.8-5.8-11.3z" fill="${IC.sky}"/>
    <path d="M15.5 20v7M12 23.5h7" stroke-width="2.6"/><circle cx="31.5" cy="21" r="2.3" fill="${IC.butterD}"/><circle cx="35.5" cy="26" r="2.3" fill="${IC.mintD}"/>`,
  pencil: `<path d="M30.5 9.5l8 8L18 38l-10 2 2-10z" fill="${IC.butter}"/><path d="M26.5 13.5l8 8"/><path d="M10 30l8 8" stroke-width="1.8"/>`,
  heart: `<path d="M24 39.5S7 30 7 18.5C7 13 11 9 15.8 9c3.6 0 6.5 2 8.2 5 1.7-3 4.6-5 8.2-5C37 9 41 13 41 18.5 41 30 24 39.5 24 39.5z" fill="${IC.coral}"/>
    <path d="M13 16.5c.6-2 2-3.3 3.8-3.6" stroke="#fff" stroke-width="2.4" opacity=".8"/>`,
  heartOff: `<path d="M24 39.5S7 30 7 18.5C7 13 11 9 15.8 9c3.6 0 6.5 2 8.2 5 1.7-3 4.6-5 8.2-5C37 9 41 13 41 18.5 41 30 24 39.5 24 39.5z" fill="#efeaf2" stroke="#c9c0cf" stroke-dasharray="3 3"/>`,
  coin: `<circle cx="24" cy="24" r="15" fill="${IC.butter}"/><circle cx="24" cy="24" r="10" fill="none" stroke="${IC.butterD}" stroke-width="2"/><path d="M24 18.5v11" stroke-width="2.6"/>`,
  bag: `<path d="M17 15v-3a7 7 0 0 1 14 0v3"/><rect x="9" y="15" width="30" height="25" rx="8" fill="${IC.mint}"/>
    <rect x="16" y="25" width="16" height="9" rx="3" fill="${IC.cream}"/><path d="M24 25v3" />`,
  pin: `<path d="M24 41s-12-11.5-12-21a12 12 0 0 1 24 0c0 9.5-12 21-12 21z" fill="${IC.coral}"/><circle cx="24" cy="20" r="4.5" fill="${IC.cream}"/>`,
  map: `<path d="M7 12l11-4 12 4 11-4v28l-11 4-12-4-11 4z" fill="${IC.mint}"/><path d="M18 8v28M30 12v28"/>
    <path d="M12 26c3-4 6 2 9-2s6-4 9 0 5 2 7-1" stroke="${IC.coral}" stroke-width="2" stroke-dasharray="3 3"/>`,
  think: `<path d="M12 31c-4.4 0-7-3-7-6.5 0-3.8 3.2-6.5 7-6.5.6-5 4.6-8.5 10-8.5 4.3 0 7.6 2.2 9 5.7 1-.3 1.8-.4 2.8-.4 5 0 9.2 3.8 9.2 8.6S38.8 31 33.8 31z" fill="${IC.cream}"/>
    <circle cx="10" cy="37" r="2.6" fill="${IC.cream}"/><circle cx="6" cy="42" r="1.4" fill="${IC.cream}"/>
    <circle cx="17" cy="23" r="1.9" fill="${IC.lavD}" stroke="none"/><circle cx="24" cy="23" r="1.9" fill="${IC.lavD}" stroke="none"/><circle cx="31" cy="23" r="1.9" fill="${IC.lavD}" stroke="none"/>`,
  eraser: `<path d="M20 40l-9-9a3 3 0 0 1 0-4.2L27 10.8a3 3 0 0 1 4.2 0l8 8a3 3 0 0 1 0 4.2L22.5 40z" fill="${IC.sky}"/><path d="M15.5 22.5l12.5 12.5"/><path d="M22.5 40H40"/>`,
  trophy: `<path d="M15 9h18v9a9 9 0 0 1-18 0z" fill="${IC.butter}"/><path d="M15 12H9.5c0 5 2.5 8 6.5 8.5M33 12h5.5c0 5-2.5 8-6.5 8.5"/>
    <path d="M24 27v6"/><path d="M16.5 40c0-4 3-7 7.5-7s7.5 3 7.5 7z" fill="${IC.butter}"/>`,
  sparkle: `<path d="M24 5c1.6 9.5 4.5 12.4 14 14-9.5 1.6-12.4 4.5-14 14-1.6-9.5-4.5-12.4-14-14C19.5 17.4 22.4 14.5 24 5z" fill="${IC.butter}"/>
    <path d="M37 31c.6 3.4 1.6 4.4 5 5-3.4.6-4.4 1.6-5 5-.6-3.4-1.6-4.4-5-5 3.4-.6 4.4-1.6 5-5z" fill="${IC.mint}" stroke-width="1.6"/>`,
  arrow: `<path d="M10 24h26M28 15.5l8.5 8.5-8.5 8.5" stroke-width="3.2"/>`,
};
const CRITTER = { "你": "you", "阿喵": "cat", "豆豆": "dog", "布丁": "bunny" };
const CLASS_ICON = { "战士": "sword", "盗贼": "dagger", "法师": "orb", "吟游诗人": "lute" };

function icon(name, cls = "") {
  const el = document.createElement("span");
  el.className = "ic" + (cls ? " " + cls : "");
  el.innerHTML = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="${IC.ink}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.sparkle}</svg>`;
  return el;
}
