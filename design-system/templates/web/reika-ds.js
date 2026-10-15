/*! REIKA DS web components v1. Vanilla JS, no build, no dependencies, light DOM (style with tokens.css + reika.css).
 *  Elements: r-tip r-tabs/r-tab/r-panel r-dialog r-notice r-amount r-badge r-metric r-card.
 *  Progressive enhancement: server-rendered markup is readable without JS. Idempotent: safe to load twice.
 *  Only global: window.ReikaDS. */
(function () {
  "use strict";
  if (typeof window === "undefined" || !window.customElements) return;
  if (window.ReikaDS && window.ReikaDS.loaded) return;

  var uid = 0;
  function nextId(p) { uid += 1; return "r-" + p + "-" + uid; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function attrBool(node, name) { return node.hasAttribute(name) && node.getAttribute(name) !== "false"; }
  function define(name, ctor) { if (!customElements.get(name)) customElements.define(name, ctor); }

  /* ── money ────────────────────────────────────────────────────────────────────────────────────── */
  var ZERO_DEC = { VND: 1, JPY: 1, KRW: 1, IDR: 0 };
  function formatAmount(value, opts) {
    opts = opts || {};
    var n = Number(value);
    if (!isFinite(n)) return null;
    var currency = opts.currency || "VND";
    var locale = opts.locale || "vi-VN";
    var digits = opts.decimals != null ? Number(opts.decimals) : (ZERO_DEC[currency] ? 0 : 2);
    if (opts.compact) {
      var a = Math.abs(n), s;
      if (a >= 1e9) s = (n / 1e9).toFixed(1) + "B";
      else if (a >= 1e6) s = (n / 1e6).toFixed(1) + "M";
      else if (a >= 1e3) s = (n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "K";
      else s = String(Math.round(n));
      return s.replace(".", new Intl.NumberFormat(locale).format(1.1).charAt(1));
    }
    var out;
    try {
      out = new Intl.NumberFormat(locale, { style: "currency", currency: currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
    } catch (e) {
      out = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n) + " " + currency;
    }
    if (opts.sign && n > 0) out = "+" + out;
    return out;
  }

  /* ── r-amount ─────────────────────────────────────────────────────────────────────────────────── */
  class RAmount extends HTMLElement {
    static get observedAttributes() { return ["value", "currency", "locale", "compact", "sign", "tone", "decimals"]; }
    connectedCallback() {
      if (this._orig == null) this._orig = this.textContent;
      this.render();
    }
    attributeChangedCallback() { if (this.isConnected) this.render(); }
    render() {
      var raw = this.hasAttribute("value") ? this.getAttribute("value") : this._orig;
      var cleaned = String(raw == null ? "" : raw).replace(/[^\d.\-+eE]/g, "");
      var n = cleaned === "" ? NaN : Number(cleaned);
      var txt = formatAmount(n, {
        currency: this.getAttribute("currency") || "VND", locale: this.getAttribute("locale") || undefined,
        compact: attrBool(this, "compact"), sign: attrBool(this, "sign"), decimals: this.getAttribute("decimals"),
      });
      if (txt == null) return; // keep server-rendered text
      this.textContent = txt;
      var tone = this.getAttribute("tone");
      if (tone === "auto") this.setAttribute("data-tone", n < 0 ? "neg" : n > 0 ? "pos" : "zero");
      else if (tone && tone !== "none") this.setAttribute("data-tone", tone);
      else this.removeAttribute("data-tone");
      if (attrBool(this, "compact")) this.setAttribute("title", formatAmount(n, { currency: this.getAttribute("currency") || "VND", locale: this.getAttribute("locale") || undefined }));
      this.setAttribute("data-ready", "");
    }
  }
  /* ── r-badge ──────────────────────────────────────────────────────────────────────────────────── */
  class RBadge extends HTMLElement { connectedCallback() { this.setAttribute("data-ready", ""); } }

  /* ── r-tip ────────────────────────────────────────────────────────────────────────────────────── */
  var openTip = null;
  function closeTip(t) { if (!t) return; t._pinned = false; t._bubble.hidden = true; t._btn.setAttribute("aria-expanded", "false"); if (openTip === t) openTip = null; }
  function placeTip(t) {
    t.style.removeProperty("--r-tip-shift");
    var r = t._bubble.getBoundingClientRect(), pad = 8, shift = 0;
    if (r.right > window.innerWidth - pad) shift = window.innerWidth - pad - r.right;
    else if (r.left < pad) shift = pad - r.left;
    if (shift) t.style.setProperty("--r-tip-shift", shift + "px");
  }
  class RTip extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      var bubble = el("span", "r-tip__bubble");
      bubble.id = this.id ? this.id + "-bubble" : nextId("tip");
      bubble.setAttribute("role", "tooltip");
      while (this.firstChild) bubble.appendChild(this.firstChild);
      bubble.hidden = true;
      var btn = el("button", "r-tip__btn");
      btn.appendChild(el("span", "r-tip__glyph", "i"));
      btn.type = "button";
      btn.setAttribute("aria-label", this.getAttribute("label") || "More info");
      btn.setAttribute("aria-describedby", bubble.id);
      btn.setAttribute("aria-expanded", "false");
      this.appendChild(btn);
      this.appendChild(bubble);
      this._btn = btn; this._bubble = bubble;
      var self = this;
      function open() { if (openTip && openTip !== self) closeTip(openTip); bubble.hidden = false; btn.setAttribute("aria-expanded", "true"); openTip = self; placeTip(self); }
      self._pinned = false;
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (bubble.hidden) { open(); self._pinned = true; }
        else if (self._pinned) { self._pinned = false; closeTip(self); }
        else self._pinned = true; // opened by hover: a click keeps it open
      });
      this.addEventListener("mouseenter", function () { if (window.matchMedia("(hover: hover)").matches) open(); });
      this.addEventListener("mouseleave", function () { if (!self._pinned && window.matchMedia("(hover: hover)").matches) closeTip(self); });
      btn.addEventListener("focus", function () { if (btn.matches(":focus-visible")) open(); });
      btn.addEventListener("blur", function () { if (!self._pinned) closeTip(self); });
      this.setAttribute("data-ready", "");
    }
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && openTip) { var t = openTip; closeTip(t); t._btn.focus(); } });
  document.addEventListener("click", function (e) { if (openTip && !openTip.contains(e.target)) closeTip(openTip); });

  /* ── r-tabs ───────────────────────────────────────────────────────────────────────────────────── */
  class RTab extends HTMLElement {}
  class RPanel extends HTMLElement {}
  class RTabs extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      var tabs = Array.prototype.filter.call(this.children, function (c) { return c.tagName === "R-TAB"; });
      var panels = Array.prototype.filter.call(this.children, function (c) { return c.tagName === "R-PANEL"; });
      if (!tabs.length) return;
      var list = el("div", "r-tabs__list");
      list.setAttribute("role", "tablist");
      if (this.getAttribute("label")) list.setAttribute("aria-label", this.getAttribute("label"));
      this.insertBefore(list, tabs[0]);
      var self = this;
      tabs.forEach(function (tab, i) {
        var panel = (tab.getAttribute("for") && self.querySelector("#" + CSS.escape(tab.getAttribute("for")))) || panels[i];
        if (!panel) return;
        if (!panel.id) panel.id = nextId("panel");
        if (!tab.id) tab.id = nextId("tab");
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-controls", panel.id);
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", tab.id);
        panel.tabIndex = 0;
        tab._panel = panel;
        list.appendChild(tab);
        tab.addEventListener("click", function () { self.select(tab, true); });
      });
      this._tabs = tabs.filter(function (t) { return t._panel; });
      this._list = list;
      list.addEventListener("keydown", function (e) {
        var i = self._tabs.indexOf(document.activeElement), n = self._tabs.length, j = -1;
        if (i < 0) return;
        if (e.key === "ArrowRight") j = (i + 1) % n;
        else if (e.key === "ArrowLeft") j = (i - 1 + n) % n;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = n - 1;
        if (j >= 0) { e.preventDefault(); self.select(self._tabs[j], true); }
      });
      var initial = this._tabs.filter(function (t) { return t.hasAttribute("selected"); })[0] || this._tabs[0];
      this.select(initial, false);
      this.setAttribute("data-ready", "");
    }
    select(tab, focus) {
      if (!tab || !this._tabs) return;
      this._tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        if (on) t.setAttribute("selected", ""); else t.removeAttribute("selected");
        t._panel.hidden = !on;
      });
      if (focus) tab.focus();
      if (tab.scrollIntoView) { try { tab.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) { /* old browsers */ } }
      this.dispatchEvent(new CustomEvent("r-tabs-change", { bubbles: true, detail: { tab: tab, panel: tab._panel } }));
    }
  }

  /* ── r-notice ─────────────────────────────────────────────────────────────────────────────────── */
  var ICONS = {
    info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z",
    success: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.2 14.4-3.9-3.9 1.4-1.4 2.5 2.5 5.6-5.6 1.4 1.4-7 7Z",
    warning: "M12 2 1 21h22L12 2Zm1 15h-2v-2h2v2Zm0-4h-2V9h2v4Z",
    danger: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z",
    neutral: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z",
  };
  function svgIcon(tone, cls) {
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "currentColor"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", cls);
    var p = document.createElementNS(ns, "path"); p.setAttribute("d", ICONS[tone] || ICONS.info); s.appendChild(p);
    return s;
  }
  class RNotice extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      var tone = this.getAttribute("tone") || "info";
      if (!this.hasAttribute("role")) this.setAttribute("role", tone === "danger" || tone === "warning" ? "alert" : "status");
      var main = el("div", "r-notice__main");
      var title = this.getAttribute("title");
      var existingTitle = this.querySelector(":scope > [data-title]");
      while (this.firstChild) main.appendChild(this.firstChild);
      if (title && !existingTitle) { var t = el("strong", "r-notice__title", title); main.insertBefore(t, main.firstChild); this.removeAttribute("title"); }
      if (!attrBool(this, "no-icon")) this.appendChild(svgIcon(tone, "r-notice__icon"));
      this.appendChild(main);
      if (attrBool(this, "dismissible")) {
        var x = el("button", "r-notice__close", "×");
        x.type = "button"; x.setAttribute("aria-label", this.getAttribute("dismiss-label") || "Dismiss");
        var self = this;
        x.addEventListener("click", function () { self.hidden = true; self.dispatchEvent(new CustomEvent("r-dismiss", { bubbles: true })); });
        this.appendChild(x);
      }
      this.setAttribute("data-ready", "");
    }
  }

  /* ── r-dialog ─────────────────────────────────────────────────────────────────────────────────── */
  class RDialog extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      var variant = this.getAttribute("variant") || "detail";
      var dlg = document.createElement("dialog");
      if (typeof dlg.showModal !== "function") { this.removeAttribute("data-ready"); return; } // very old browser: stays hidden
      var title = el("h2", "r-dialog__title", this.getAttribute("heading") || "");
      title.id = nextId("dlg-title");
      dlg.setAttribute("aria-labelledby", title.id);
      if (variant === "confirm") dlg.setAttribute("role", "alertdialog");
      var head = el("div", "r-dialog__head");
      head.appendChild(title);
      var x = el("button", "r-dialog__x", "×");
      x.type = "button"; x.setAttribute("aria-label", this.getAttribute("close-label") || "Close");
      head.appendChild(x);
      var body = el("div", "r-dialog__body");
      while (this.firstChild) body.appendChild(this.firstChild);
      dlg.appendChild(head); dlg.appendChild(body);
      var self = this;
      if (variant !== "detail") {
        var foot = el("div", "r-dialog__foot");
        var cancel = el("button", "r-btn r-btn--outline", this.getAttribute("cancel-label") || "Cancel");
        cancel.type = "button";
        var ok = el("button", "r-btn " + (attrBool(this, "danger") ? "r-btn--danger" : "r-btn--primary"), this.getAttribute("confirm-label") || (variant === "form" ? "Save" : "OK"));
        foot.appendChild(cancel); foot.appendChild(ok);
        dlg.appendChild(foot);
        cancel.addEventListener("click", function () { self.close("cancel"); });
        var form = body.querySelector("form");
        if (variant === "form" && form) {
          if (!form.id) form.id = nextId("dlg-form");
          ok.type = "submit"; ok.setAttribute("form", form.id);
          form.addEventListener("submit", function () { self.dispatchEvent(new CustomEvent("r-confirm", { bubbles: true })); });
        } else {
          ok.type = "button";
          ok.addEventListener("click", function () { self.dispatchEvent(new CustomEvent("r-confirm", { bubbles: true })); self.close("confirm"); });
        }
        this._ok = ok;
      }
      x.addEventListener("click", function () { self.close("cancel"); });
      dlg.addEventListener("click", function (e) { if (e.target === dlg) self.close("cancel"); });
      dlg.addEventListener("close", function () { self.dispatchEvent(new CustomEvent("r-close", { bubbles: true, detail: { returnValue: dlg.returnValue } })); });
      this.appendChild(dlg);
      this._dlg = dlg;
      this.setAttribute("data-ready", "");
    }
    open() { if (this._dlg && !this._dlg.open) { this._dlg.showModal(); var f = this._dlg.querySelector("[autofocus], input, select, textarea, .r-dialog__foot .r-btn--primary, .r-dialog__foot .r-btn--danger"); if (f && f.focus) f.focus(); } }
    close(v) { if (this._dlg && this._dlg.open) this._dlg.close(v || ""); }
    get isOpen() { return !!(this._dlg && this._dlg.open); }
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-r-dialog-open]");
    if (!t) return;
    var d = document.getElementById(t.getAttribute("data-r-dialog-open"));
    if (d && d.open) { e.preventDefault(); d.open(); }
  });

  /* ── r-metric ─────────────────────────────────────────────────────────────────────────────────── */
  function sparkSvg(points) {
    var ns = "http://www.w3.org/2000/svg", w = 100, h = 28;
    var min = Math.min.apply(null, points), max = Math.max.apply(null, points), span = max - min || 1;
    var step = points.length > 1 ? w / (points.length - 1) : w;
    var d = points.map(function (v, i) { return (i ? "L" : "M") + (i * step).toFixed(1) + " " + (h - 2 - ((v - min) / span) * (h - 4)).toFixed(1); }).join(" ");
    var s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 " + w + " " + h); s.setAttribute("preserveAspectRatio", "none"); s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", d); p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor"); p.setAttribute("stroke-width", "2"); p.setAttribute("vector-effect", "non-scaling-stroke"); p.setAttribute("stroke-linejoin", "round"); p.setAttribute("stroke-linecap", "round");
    s.appendChild(p);
    return s;
  }
  class RMetric extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      if (this.children.length) { this.setAttribute("data-ready", ""); return; } // server markup wins
      var wrap = this.hasAttribute("href") ? el("a", "r-metric__link") : el("div", "r-metric__inner");
      if (this.hasAttribute("href")) wrap.setAttribute("href", this.getAttribute("href"));
      wrap.appendChild(el("span", "r-metric__label", this.getAttribute("label") || ""));
      var v = el("span", "r-metric__value");
      if (this.hasAttribute("currency")) {
        var a = document.createElement("r-amount");
        a.setAttribute("value", this.getAttribute("value") || "0"); a.setAttribute("currency", this.getAttribute("currency")); a.setAttribute("tone", "none");
        if (this.hasAttribute("compact")) a.setAttribute("compact", "");
        v.appendChild(a);
      } else v.textContent = this.getAttribute("value") || "";
      wrap.appendChild(v);
      var delta = this.getAttribute("delta");
      if (delta) {
        var dEl = el("span", "r-metric__delta", delta);
        var tone = this.getAttribute("delta-tone") || (/^\s*[-−]/.test(delta) ? "neg" : "pos");
        dEl.setAttribute("data-tone", tone);
        wrap.appendChild(dEl);
      }
      var spark = this.getAttribute("spark");
      var slot = this.querySelector("[data-slot='spark']");
      if (spark) {
        var pts = spark.split(",").map(Number).filter(isFinite);
        if (pts.length > 1) { var box = el("span", "r-metric__spark"); box.appendChild(sparkSvg(pts)); wrap.appendChild(box); }
      } else if (slot) { var b2 = el("span", "r-metric__spark"); b2.appendChild(slot); wrap.appendChild(b2); }
      this.textContent = "";
      this.appendChild(wrap);
      this.setAttribute("data-ready", "");
    }
  }

  /* ── r-card ───────────────────────────────────────────────────────────────────────────────────── */
  class RCard extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      var label = this.getAttribute("label"), desc = this.getAttribute("description"), tip = this.getAttribute("tip");
      var outside = this.getAttribute("label-position") === "outside";
      var surface = el("div", "r-card__surface");
      var body = el("div", "r-card__body");
      while (this.firstChild) body.appendChild(this.firstChild);
      var head = null;
      if (label || tip) {
        head = el("div", "r-card__label");
        if (label) head.appendChild(el("span", "", label));
        if (tip) { var t = document.createElement("r-tip"); t.textContent = tip; head.appendChild(t); }
      }
      if (head && outside) this.appendChild(head);
      this.appendChild(surface);
      if (head && !outside) surface.appendChild(head);
      if (desc) surface.appendChild(el("p", "r-card__desc", desc));
      surface.appendChild(body);
      this.setAttribute("data-ready", "");
    }
  }

  function defineAll() {
    define("r-amount", RAmount); define("r-badge", RBadge); define("r-tip", RTip);
    define("r-tab", RTab); define("r-panel", RPanel); define("r-tabs", RTabs);
    define("r-notice", RNotice); define("r-dialog", RDialog); define("r-metric", RMetric); define("r-card", RCard);
  }

  window.ReikaDS = {
    loaded: true,
    version: "1.0.0",
    define: defineAll,
    formatAmount: formatAmount,
    elements: ["r-tip", "r-tabs", "r-tab", "r-panel", "r-dialog", "r-notice", "r-amount", "r-badge", "r-metric", "r-card"],
  };
  /* inner-first upgrade order: define leaf elements before containers, after the DOM exists */
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", defineAll); else defineAll();
})();
