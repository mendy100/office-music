// ==UserScript==
// @name         אוצר הניגונים → Office speaker
// @namespace    https://mendy100.github.io/office-music/
// @version      1.0
// @description  Play buttons on oitzerhanigunim.org play on the office Google speaker instead of this PC.
// @match        https://oitzerhanigunim.org/*
// @match        https://www.oitzerhanigunim.org/*
// @run-at       document-start
// @noframes
// @grant        none
// @updateURL    https://mendy100.github.io/office-music/oitzer-speaker.user.js
// @downloadURL  https://mendy100.github.io/office-music/oitzer-speaker.user.js
// ==/UserScript==

(function () {
  'use strict';

  // The site refuses the Google speaker, so recordings go through our small Cloudflare relay.
  const RELAY = 'https://oitzer-relay.4251306.workers.dev/r/';
  const FILES = /^https:\/\/(?:api\.|www\.)?oitzerhanigunim\.org\/api\/files\/recordings\/([^/?#]+)/;
  const KEY = 'officeSpeakerOn';

  let ctx = null;
  let speakerOn = true;
  try { speakerOn = localStorage.getItem(KEY) !== '0'; } catch (e) {}

  // ---------- Chrome Cast ----------
  window.__onGCastApiAvailable = ok => {
    if (!ok) return;
    ctx = cast.framework.CastContext.getInstance();
    ctx.setOptions({
      receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    ctx.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, paint);
    paint();
  };
  function loadCast() {
    const s = document.createElement('script');
    s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    (document.head || document.documentElement).appendChild(s);
  }

  function liveSession() {
    const s = ctx && ctx.getCurrentSession();
    if (!s) return null;
    const st = s.getSessionState(), S = cast.framework.SessionState;
    return st === S.SESSION_STARTED || st === S.SESSION_RESUMED ? s : null;
  }

  function niceTitle() {
    return (document.title || 'אוצר הניגונים').replace(/\s*[—|-]\s*ניגון.*$/, '').replace(/\s*\|\s*אוצר הניגונים\s*$/, '').trim();
  }

  async function castRecording(src) {
    const m = FILES.exec(src);
    if (!m || !ctx) return false;
    const url = RELAY + m[1];
    try {
      let s = liveSession();
      if (!s) { await ctx.requestSession(); s = ctx.getCurrentSession(); }   // first time: pick "Office speaker"
      const mi = new chrome.cast.media.MediaInfo(url, 'audio/mpeg');
      mi.streamType = chrome.cast.media.StreamType.BUFFERED;
      const md = new chrome.cast.media.MusicTrackMediaMetadata();
      md.title = niceTitle(); md.artist = 'אוצר הניגונים';
      mi.metadata = md;
      let by = null; try { by = localStorage.getItem('officeMusicName'); } catch (e) {}
      mi.customData = { by };
      const req = new chrome.cast.media.LoadRequest(mi);
      req.autoplay = true;
      await s.loadMedia(req);
      toast('🔊 שפילט אויפן ספיקער: ' + md.title);
      return true;
    } catch (e) {
      if (e !== 'cancel' && !(e && e.code === 'cancel')) toast('האט נישט געקענט שפילן אויפן ספיקער');
      return false;
    }
  }

  // ---------- take over the site's play buttons ----------
  const realPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const src = this.currentSrc || this.src || '';
    if (speakerOn && FILES.test(src)) {
      const el = this;
      el.muted = true;                       // never play on this PC
      try { el.pause(); } catch (e) {}
      castRecording(src).then(ok => { if (!ok) { el.muted = false; } });
      return Promise.resolve();
    }
    return realPlay.apply(this, arguments);
  };

  // ---------- small control box ----------
  let box, stateEl, toggleEl;
  function ui() {
    if (box || !document.body) return;
    const css = document.createElement('style');
    css.textContent = `
      #osp-box{position:fixed;left:14px;bottom:14px;z-index:2147483647;display:flex;align-items:center;gap:8px;
        background:#2b2d33;color:#f3f4f6;padding:8px 10px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.3);
        font:13px/1.3 "Segoe UI",system-ui,sans-serif;direction:rtl}
      #osp-box button{border:0;border-radius:8px;padding:6px 10px;font:inherit;font-weight:600;cursor:pointer}
      #osp-toggle.on{background:#2547d0;color:#fff} #osp-toggle.off{background:#55575f;color:#ddd}
      #osp-stop{background:#e5484d;color:#fff}
      #osp-box google-cast-launcher{width:26px;height:26px;cursor:pointer;--disconnected-color:#f3f4f6;--connected-color:#5b8cff}
      #osp-toast{position:fixed;left:50%;bottom:70px;transform:translateX(-50%);background:#212529;color:#fff;
        padding:9px 16px;border-radius:8px;font:14px "Segoe UI",sans-serif;z-index:2147483647;opacity:0;transition:opacity .2s;pointer-events:none;direction:rtl}
      #osp-toast.show{opacity:1}`;
    document.head.appendChild(css);
    box = document.createElement('div'); box.id = 'osp-box';
    box.innerHTML = `<button id="osp-toggle"></button><google-cast-launcher title="פארבינדן צום ספיקער"></google-cast-launcher>
      <span id="osp-state"></span><button id="osp-stop" title="אפשטעלן דעם ספיקער">■</button>`;
    document.body.appendChild(box);
    const t = document.createElement('div'); t.id = 'osp-toast'; document.body.appendChild(t);
    toggleEl = box.querySelector('#osp-toggle'); stateEl = box.querySelector('#osp-state');
    toggleEl.onclick = () => {
      speakerOn = !speakerOn;
      try { localStorage.setItem(KEY, speakerOn ? '1' : '0'); } catch (e) {}
      paint();
      toast(speakerOn ? 'שפילט אויפן ספיקער' : 'שפילט אויף דעם קאמפיוטער');
    };
    box.querySelector('#osp-stop').onclick = () => {
      const s = liveSession(); if (!s) return;
      const ms = s.getMediaSession && s.getMediaSession();
      if (ms) ms.stop(null, () => {}, () => {}); else s.endSession(true);
      toast('אפגעשטעלט');
    };
    paint();
  }
  function paint() {
    if (!toggleEl) return;
    toggleEl.textContent = speakerOn ? '🔊 ספיקער' : '💻 קאמפיוטער';
    toggleEl.className = speakerOn ? 'on' : 'off';
    const s = liveSession();
    stateEl.textContent = s ? 'פארבונדן' : '';
  }
  function toast(msg) {
    const t = document.getElementById('osp-toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
  }

  loadCast();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ui); else ui();
})();
