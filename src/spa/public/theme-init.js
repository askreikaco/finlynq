/* Runs before first paint (loaded from index.html, no inline script under CSP script-src 'self').
   Mirrors next-themes (storageKey "theme", default dark, enableSystem) + FONT/DENSITY FOUC scripts of
   src/app/layout.tsx. Keys must match font-provider.tsx (pf-font) and density-provider.tsx (pf-density). */
(function () {
  var d = document.documentElement;
  try {
    var t = localStorage.getItem("theme") || "dark";
    if (t === "system") t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    d.classList.remove("light", "dark");
    d.classList.add(t);
    d.style.colorScheme = t;
  } catch (e) {
    d.classList.add("dark");
  }
  try {
    var f = localStorage.getItem("pf-font");
    if (f && ["rounded", "serif", "mono"].indexOf(f) !== -1) d.setAttribute("data-font", f);
  } catch (e) {}
  try {
    if (localStorage.getItem("pf-density") === "compact") d.setAttribute("data-density", "compact");
  } catch (e) {}
})();
