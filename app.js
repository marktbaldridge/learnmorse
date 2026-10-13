/* Morse Trainer — practice copying Morse code by ear.
   Plain JS, no dependencies. Audio is synthesised with Web Audio. */
"use strict";
(() => {
  /* ======================================================================
     Data
     ====================================================================== */
  const MORSE = {
    E: ".", T: "-",
    I: "..", A: ".-", N: "-.", M: "--",
    S: "...", U: "..-", R: ".-.", W: ".--", D: "-..", K: "-.-", G: "--.", O: "---",
    H: "....", V: "...-", F: "..-.", L: ".-..", P: ".--.", J: ".---",
    B: "-...", X: "-..-", C: "-.-.", Y: "-.--", Z: "--..", Q: "--.-",
    0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-",
    5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.",
    ".": ".-.-.-", ",": "--..--", "?": "..--..", "/": "-..-.", "=": "-...-",
    "+": ".-.-.", "@": ".--.-.", "-": "-....-", "'": ".----.", ":": "---...",
    "(": "-.--.", ")": "-.--.-", "!": "-.-.--",
  };

  // Single characters grouped by length, not alphabet.
  const CHAR_GROUPS = [
    ["1 element", "ET"],
    ["2 elements", "IANM"],
    ["3 elements", "SURWDKGO"],
    ["4 elements", "HVFLPJBXCYZQ"],
    ["Digits (5 elements)", "0123456789"],
    ["Punctuation (5–6 elements)", ".,?/=+@-':()!"],
  ];

  // Common on-air abbreviations: [text, meaning]
  const QSO_ABBREVS = [
    ["CQ", "Calling any station"], ["DE", "From"], ["UR", "Your, you are"],
    ["ES", "And"], ["TU", "Thank you"], ["FB", "Fine business, great"],
    ["OM", "Old man, fellow ham"], ["YL", "Young lady"], ["WX", "Weather"],
    ["HR", "Here"], ["GM", "Good morning"], ["GA", "Good afternoon"],
    ["GE", "Good evening"], ["HW", "How do you copy?"], ["K", "Over, go ahead"],
    ["73", "Best regards"], ["88", "Love and kisses"],
    ["RST", "Signal report"], ["TNX", "Thanks"], ["PSE", "Please"],
    ["AGN", "Again"], ["QTH", "Location"], ["QRL", "Is the frequency busy?"],
    ["QRM", "Interference"], ["QRN", "Static, noise"], ["QRZ", "Who is calling me?"],
    ["QSB", "Fading"], ["QSL", "Confirmed, received"], ["QSO", "A contact"],
    ["QSY", "Change frequency"], ["QRS", "Send slower"], ["QRQ", "Send faster"],
  ];

  // Prosigns: two letters sent run together as one character. [letters, meaning, alternate answer]
  const PROSIGNS = [
    ["AR", "End of message", "+"],
    ["SK", "End of contact", ""],
    ["KN", "Go ahead, named station only", ""],
    ["BT", "Pause, new paragraph", "="],
    ["AS", "Wait", ""],
    ["BK", "Break", ""],
  ];
  const PROSIGN_ALT = { "=": "BT", "+": "AR" };

  const ITEMS = new Map();
  function addItem(key, display, codes, gap, accept, kind) {
    ITEMS.set(key, { key, display, codes, gap, accept, kind });
  }
  for (const [, chars] of CHAR_GROUPS) {
    for (const c of chars) {
      addItem(c, c, [MORSE[c]], 0, PROSIGN_ALT[c] ? [c, PROSIGN_ALT[c]] : [c], "char");
    }
  }
  for (const [t] of QSO_ABBREVS) {
    addItem("q:" + t, t, [...t].map((ch) => MORSE[ch]), 3, [t], "qso");
  }
  for (const [l, , alt] of PROSIGNS) {
    addItem("p:" + l, `<${l}>`, [...l].map((ch) => MORSE[ch]), 1, alt ? [l, alt] : [l], "qso");
  }
  const TOTAL_CHARS = [...ITEMS.values()].filter((i) => i.kind === "char").length;

  const patternText = (item) =>
    item.codes.map((c) => c.replace(/\./g, "·").replace(/-/g, "−")).join(item.gap >= 3 ? " " : "");
  const spokenPattern = (item) =>
    item.codes.map((c) => [...c].map((s) => (s === "-" ? "dah" : "dit")).join(" ")).join(", ");

  /* ======================================================================
     Helpers
     ====================================================================== */
  const $ = (s, r = document) => r.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false && k !== "checked") continue;
      if (k === "class") e.className = v;
      else if (k === "style") e.style.cssText = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "checked" || k === "value" || k === "type" || k === "min" || k === "max" || k === "step" || k === "disabled" || k === "hidden") e[k] = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      e.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return e;
  }

  const loadJSON = (k, fb) => {
    try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fb; } catch { return fb; }
  };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

  /* ======================================================================
     Settings and stats (persisted in localStorage)
     ====================================================================== */
  const LS_CFG = "morse.config.v1";
  const LS_STATS = "morse.stats.v1";
  const LS_INSTALL = "morse.installHintDismissed";
  const DEFAULT_CHARS = [..."ETIANMSURWDKGOHVFLPJBXCYZQ"];

  function loadConfig() {
    const raw = loadJSON(LS_CFG, {});
    const num = (v, d, lo, hi) => (Number.isFinite(+v) && v !== null && v !== "" ? clamp(+v, lo, hi) : d);
    const chars = Array.isArray(raw.chars) ? raw.chars : DEFAULT_CHARS;
    const qso = Array.isArray(raw.qso) ? raw.qso : [];
    return {
      wpm: Math.round(num(raw.wpm, 20, 5, 40)),
      toneHz: Math.round(num(raw.toneHz, 500, 300, 1000)),
      volume: Math.round(num(raw.volume, 70, 0, 100)),
      pacing: Math.round(num(raw.pacing, 0.7, 0, 5) * 10) / 10,
      qsoRatio: Math.round(num(raw.qsoRatio, 20, 5, 100)),
      haptics: raw.haptics !== false,
      wake: raw.wake !== false,
      keys: raw.keys !== false,
      chars: new Set(chars.filter((k) => ITEMS.get(k)?.kind === "char")),
      qso: new Set(qso.filter((k) => ITEMS.get(k)?.kind === "qso")),
    };
  }
  const cfg = loadConfig();
  const saveCfg = () => saveJSON(LS_CFG, { ...cfg, chars: [...cfg.chars], qso: [...cfg.qso] });

  let stats = loadJSON(LS_STATS, {});
  if (typeof stats !== "object" || Array.isArray(stats)) stats = {};

  const session = { a: 0, c: 0 };
  const boost = {};            // extra draw weight for recently missed items

  /* ======================================================================
     Audio synthesis
     ====================================================================== */
  const volumeToAmp = (v) => 0.9 * Math.pow(v / 100, 1.6);

  function addTone(out, start, n, freq, amp, sr) {
    const ramp = Math.max(1, Math.min(Math.round(0.005 * sr), n >> 1));   // 5 ms raised-cosine edges: no clicks
    const w = (2 * Math.PI * freq) / sr;
    for (let i = 0; i < n; i++) {
      let e = 1;
      const j = n - 1 - i;
      if (i < ramp) e = 0.5 * (1 - Math.cos((Math.PI * i) / ramp));
      else if (j < ramp) e = 0.5 * (1 - Math.cos((Math.PI * j) / ramp));
      out[start + i] = Math.sin(w * i) * e * amp;
    }
  }

  const TAIL_S = 0.15;                                   // silence after the last element

  function renderItem(item, wpm, freq, amp, sr) {
    const unit = 1.2 / wpm;                              // PARIS standard
    const segs = [["s", 0.1]];
    item.codes.forEach((code, ti) => {
      if (ti) segs.push(["s", unit * item.gap]);
      [...code].forEach((sym, si) => {
        if (si) segs.push(["s", unit]);
        segs.push(["t", unit * (sym === "-" ? 3 : 1)]);
      });
    });
    segs.push(["s", TAIL_S]);
    const lens = segs.map(([, d]) => Math.round(d * sr));
    const out = new Float32Array(lens.reduce((a, b) => a + b, 0));
    let pos = 0;
    segs.forEach(([kind], i) => {
      if (kind === "t") addTone(out, pos, lens[i], freq, amp, sr);
      pos += lens[i];
    });
    return out;
  }

  function renderBuzzer(amp, sr) {
    const lead = Math.round(0.05 * sr), body = Math.round(0.32 * sr), tail = Math.round(0.12 * sr);
    const out = new Float32Array(lead + body + tail);
    const inN = Math.round(0.012 * sr), outN = inN * 4;
    for (let i = 0; i < body; i++) {
      const t = i / sr;
      const wave = 0.6 * Math.sin(2 * Math.PI * 170 * t) + 0.3 * Math.sin(2 * Math.PI * 255 * t);
      const trem = 0.75 + 0.25 * Math.sin(2 * Math.PI * 18 * t);
      let env = 1;
      if (i < inN) env = i / inN;
      else if (body - 1 - i < outN) env = (body - 1 - i) / outN;
      out[lead + i] = wave * trem * env * amp * 0.55;
    }
    return out;
  }

  function silentWavUrl() {
    // One second of 8-bit mono silence, used to keep an iOS media audio session alive.
    const n = 8000, buf = new Uint8Array(44 + n).fill(128);
    const dv = new DataView(buf.buffer);
    const str = (o, s) => [...s].forEach((c, i) => buf[o + i] = c.charCodeAt(0));
    str(0, "RIFF"); dv.setUint32(4, 36 + n, true); str(8, "WAVE"); str(12, "fmt ");
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
    str(36, "data"); dv.setUint32(40, n, true);
    return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  }

  /* ======================================================================
     Player (Web Audio) — completion is signalled by the source's own `ended` event
     ====================================================================== */
  const player = {
    ctx: null, src: null, playing: false, onDone: null, silent: null,

    get sr() { return this.ctx ? this.ctx.sampleRate : 44100; },

    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC({ latencyHint: "interactive" });
        this.ctx.addEventListener?.("statechange", () => onAudioState());
      }
      return this.ctx;
    },

    /** Call from a user gesture (tap / key press): iOS only allows audio to start there. */
    unlock() {
      const ctx = this.ensure();
      if (ctx.state !== "running") ctx.resume().catch(() => {});
      try {
        const s = ctx.createBufferSource();
        s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        s.connect(ctx.destination);
        s.start(0);
      } catch { /* ignore */ }
      // Treat output as media playback so the ringer/silent switch does not mute it.
      try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch { /* ignore */ }
      try {
        if (!this.silent) {
          this.silent = new Audio(silentWavUrl());
          this.silent.loop = true;
          this.silent.setAttribute("playsinline", "");
        }
        this.silent.play().catch(() => {});
      } catch { /* ignore */ }
    },

    endSession() { try { this.silent?.pause(); } catch { /* ignore */ } },

    play(samples, onDone) {
      this.stop();
      const ctx = this.ensure();
      if (ctx.state !== "running") ctx.resume().catch(() => {});
      const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buf.copyToChannel(samples, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      this.src = src;
      this.playing = true;
      this.onDone = onDone || null;
      src.onended = () => {
        if (this.src !== src) return;
        this.src = null;
        this.playing = false;
        const cb = this.onDone;
        this.onDone = null;
        if (cb) cb();
      };
      src.start();
    },

    stop() {
      this.onDone = null;
      this.playing = false;
      const s = this.src;
      this.src = null;
      if (s) { s.onended = null; try { s.stop(); } catch { /* already ended */ } }
    },

    /** Run cb when the current sound ends (immediately if nothing is playing). */
    whenDone(cb) { if (this.playing) this.onDone = cb; else cb(); },
  };

  let audioMemo = { k: "", a: null };
  function audioFor(item) {
    const k = [item.key, cfg.wpm, cfg.toneHz, cfg.volume, player.sr].join("|");
    if (audioMemo.k !== k) {
      audioMemo = { k, a: renderItem(item, cfg.wpm, cfg.toneHz, volumeToAmp(cfg.volume), player.sr) };
    }
    return audioMemo.a;
  }

  /* ======================================================================
     iOS niceties: haptics, wake lock, viewport/keyboard, media session
     ====================================================================== */
  const haptics = (() => {
    // iOS 17.4+ fires a light haptic when a switch-style checkbox toggles. Best effort.
    let label = null;
    const tap = () => {
      try {
        if (!label) {
          label = h("label", { "aria-hidden": "true", style: "position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none" },
            h("input", { type: "checkbox", switch: "", tabindex: "-1" }));
          document.body.append(label);
        }
        // Clicking the label focuses the hidden checkbox, which would drop the keyboard.
        // Hand focus straight back within the same task so the keyboard stays up.
        const keep = document.activeElement === ui.kbd;
        label.click();
        if (keep) focusKbd();
      } catch { /* ignore */ }
    };
    return {
      success() { if (!cfg.haptics) return; try { navigator.vibrate?.(10); } catch { /* */ } tap(); },
      error() { if (!cfg.haptics) return; try { navigator.vibrate?.([30, 60, 30]); } catch { /* */ } tap(); setTimeout(tap, 90); },
    };
  })();

  let wakeLock = null;
  async function setWake(on) {
    try {
      if (on && cfg.wake && "wakeLock" in navigator) {
        if (!wakeLock) {
          wakeLock = await navigator.wakeLock.request("screen");
          wakeLock.addEventListener("release", () => { wakeLock = null; });
        }
      } else if (wakeLock) {
        const w = wakeLock; wakeLock = null; await w.release();
      }
    } catch { /* not allowed or unsupported */ }
  }

  function setMediaSession(on) {
    if (!("mediaSession" in navigator)) return;
    try {
      if (on) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: "Morse practice",
          artist: "Morse Trainer",
          artwork: [{ src: "icons/icon-512.png", sizes: "512x512", type: "image/png" }],
        });
        navigator.mediaSession.setActionHandler("play", () => setRunning(true));
        navigator.mediaSession.setActionHandler("pause", () => setRunning(false));
      }
      navigator.mediaSession.playbackState = on ? "playing" : "paused";
    } catch { /* ignore */ }
  }

  const root = document.documentElement;
  function syncViewport() {
    const vv = window.visualViewport;
    const height = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    root.style.setProperty("--app-h", height + "px");
    root.style.setProperty("--app-top", top + "px");
    const kb = vv ? window.innerHeight - vv.height > 120 : false;
    const free = height - (cfg.keys ? ui.keys.offsetHeight : 0);   // what is left above the built-in keys
    root.style.setProperty("--free-h", free + "px");
    document.body.classList.toggle("kb-open", kb);
    document.body.classList.toggle("compact", free < 540);
    document.body.classList.toggle("tiny", free < 340);
  }

  /* ======================================================================
     DOM refs
     ====================================================================== */
  const ui = {
    app: $("#app"), stage: $("#stage"), status: $("#status"), big: $("#big"), pattern: $("#pattern"),
    typed: $("#typed"), hint: $("#hint"), toast: $("#toast"), install: $("#install"),
    score: $("#scoreBtn"), start: $("#startBtn"), startLabel: $("#startLabel"),
    replay: $("#replayBtn"), reveal: $("#revealBtn"), kbd: $("#kbd"), keys: $("#keys"),
    wpmSlider: $("#wpmSlider"), wpmValue: $("#wpmValue"),
  };

  /* ======================================================================
     Stage rendering
     ====================================================================== */
  function setBig(text, tone) {
    ui.big.textContent = text || " ";
    ui.big.dataset.tone = tone || "";
    ui.pattern.dataset.tone = tone || "";
    const n = [...text].length;
    ui.big.style.setProperty("--fit", n <= 2 ? 1 : Math.max(0.4, 2.1 / n).toFixed(3));
  }
  function pop() { ui.big.classList.remove("pop"); void ui.big.offsetWidth; ui.big.classList.add("pop"); }
  const setStatus = (t) => { ui.status.textContent = t; };
  const setTyped = (t) => { ui.typed.textContent = t; };

  function setPattern(item) {
    ui.pattern.replaceChildren();
    if (!item) return;
    const wrap = h("span", { class: "pat" });
    item.codes.forEach((code, ti) => {
      const g = h("span", { class: "pat-g" + (ti && item.gap >= 3 ? " sp" : "") });
      for (const s of code) g.append(h("i", { class: s === "-" ? "dah" : "dit" }));
      wrap.append(g);
    });
    ui.pattern.append(wrap);
  }

  const poolSize = () => cfg.chars.size + cfg.qso.size;
  let kbFocused = false;

  function renderHint() {
    if (!running) {
      const n = poolSize();
      ui.hint.textContent = n
        ? `${n} ${n === 1 ? "item" : "items"} in your pool. Tap Start, then type what you hear.`
        : "Turn on at least one character in Settings.";
    } else if (!cfg.keys && !kbFocused && !sheetOpen) {
      ui.hint.textContent = "Tap anywhere to bring the keyboard back.";
    } else {
      ui.hint.textContent = "Type what you hear.";
    }
  }

  function renderControls() {
    ui.start.classList.toggle("running", running);
    ui.start.setAttribute("aria-label", running ? "Pause" : "Start");
    ui.startLabel.textContent = running ? "Pause" : "Start";
    ui.replay.disabled = !running;
    ui.reveal.disabled = !running;
  }

  function renderScore() {
    const { a, c } = session;
    ui.score.textContent = a ? `${c}/${a} · ${Math.round((100 * c) / a)}%` : "Stats";
  }

  let toastTimer = null;
  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 2600);
  }

  /* ======================================================================
     Speed slider (custom, so dragging never steals focus from the keyboard)
     ====================================================================== */
  const WPM_MIN = 5, WPM_MAX = 40;
  function renderSpeed() {
    ui.wpmSlider.style.setProperty("--t", (cfg.wpm - WPM_MIN) / (WPM_MAX - WPM_MIN));
    ui.wpmSlider.setAttribute("aria-valuenow", cfg.wpm);
    ui.wpmSlider.setAttribute("aria-valuetext", `${cfg.wpm} words per minute`);
    ui.wpmValue.textContent = `${cfg.wpm} WPM`;
  }
  function setWpm(v) {
    const n = clamp(Math.round(v), WPM_MIN, WPM_MAX);
    if (n === cfg.wpm) return;
    cfg.wpm = n;
    renderSpeed();
    saveCfg();
  }
  function initSpeedSlider() {
    let drag = false;
    const fromX = (x) => {
      const r = ui.wpmSlider.getBoundingClientRect();
      const t = clamp((x - r.left - 14) / (r.width - 28), 0, 1);
      setWpm(WPM_MIN + t * (WPM_MAX - WPM_MIN));
    };
    ui.wpmSlider.addEventListener("pointerdown", (e) => {
      drag = true;
      ui.wpmSlider.setPointerCapture(e.pointerId);
      fromX(e.clientX);
      e.preventDefault();
    });
    ui.wpmSlider.addEventListener("pointermove", (e) => { if (drag) fromX(e.clientX); });
    const end = () => { drag = false; };
    ui.wpmSlider.addEventListener("pointerup", end);
    ui.wpmSlider.addEventListener("pointercancel", end);
    renderSpeed();
  }

  /* ======================================================================
     Practice flow
     ====================================================================== */
  const IDLE = "idle", WAITING = "waiting", FEEDBACK = "feedback";
  let running = false;
  let state = IDLE;
  let current = null;
  let typed = "";
  let missed = false;
  let lastKey = null;
  let paceTimer = null;
  let answerFrom = 0;          // performance.now() at which the item finished sounding

  // Recall time: under FAST_MS is instant recognition, SLOW_MS and beyond needs the most practice.
  const FAST_MS = 600, SLOW_MS = 2000, CAP_MS = 4000;
  const EXTRA_KEY_MS = 300;    // typing allowance for each further letter of a multi-letter answer
  const TIME_ALPHA = 0.3;      // weight of the newest answer in the running average
  const fmtMs = (ms) => (ms / 1000).toFixed(2) + " s";

  /** 0 = recalled instantly, 1 = slow. Items never timed sit in the middle so they get a fair share. */
  const slowness = (s) => (s && s[3] ? clamp((s[2] - FAST_MS) / (SLOW_MS - FAST_MS), 0, 1) : 0.5);
  const missRate = (s) => (s && s[0] ? 1 - s[1] / s[0] : 0);
  const need = (s) => 4 * slowness(s) + 3 * missRate(s);

  function setState(s) { state = s; ui.stage.dataset.state = s; }

  function pick() {
    const chars = [...cfg.chars].map((k) => ITEMS.get(k)).filter(Boolean);
    const qso = [...cfg.qso].map((k) => ITEMS.get(k)).filter(Boolean);
    let pool;
    if (chars.length && qso.length) pool = Math.random() * 100 < cfg.qsoRatio ? qso : chars;
    else pool = chars.length ? chars : qso;
    if (!pool.length) return null;
    if (pool.length > 1 && lastKey !== null) {
      const f = pool.filter((i) => i.key !== lastKey);
      if (f.length) pool = f;
    }
    const w = pool.map((i) => 1 + (boost[i.key] || 0) + need(stats[i.key]));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  function setRunning(run) {
    if (run === running) return;
    if (run && poolSize() === 0) {
      toast("Turn on at least one character in Settings.");
      return;
    }
    running = run;
    clearTimeout(paceTimer);
    if (run) {
      player.unlock();
      focusKbd();
      setWake(true);
      setMediaSession(true);
      nextItem();
    } else {
      player.stop();
      player.endSession();
      setWake(false);
      setMediaSession(false);
      setState(IDLE);
      current = null;
      typed = "";
      setStatus("Paused");
      setBig("?", "muted");
      setPattern(null);
      setTyped("");
      ui.kbd.blur();
    }
    renderControls();
    renderHint();
  }

  function nextItem() {
    if (!running) return;
    const item = pick();
    if (!item) { setRunning(false); return; }
    current = item;
    lastKey = item.key;
    typed = "";
    missed = false;
    setState(WAITING);
    setStatus("Listening…");
    setBig("?", "muted");
    setPattern(null);
    setTyped("");
    const audio = audioFor(item);
    player.play(audio);
    answerFrom = performance.now() + (audio.length / player.sr - TAIL_S + (player.ctx.outputLatency || 0)) * 1000;
  }

  const scheduleNext = () => {
    if (running) paceTimer = setTimeout(nextItem, cfg.pacing * 1000);
  };

  function onTyped(ch) {
    if (!running || state !== WAITING || !current) return;
    const attempt = typed + ch;
    if (current.accept.includes(attempt)) correct();
    else if (current.accept.some((a) => a.startsWith(attempt))) { typed = attempt; setTyped(attempt); }
    else wrong();
  }

  function onReplay() {
    if (running && state === WAITING && current) player.play(audioFor(current));
  }

  function onReveal() {
    if (!running || state !== WAITING || !current) return;
    markMissed();
    setState(FEEDBACK);
    typed = "";
    showAnswer();
    player.play(audioFor(current), awaitCorrectKey);
  }

  function correct() {
    let ms = null;
    if (!missed) {
      ms = clamp(performance.now() - answerFrom - EXTRA_KEY_MS * (current.accept[0].length - 1), 0, CAP_MS);
      record(true, ms);
    }
    setState(FEEDBACK);
    setStatus(ms === null ? "Got it" : `Got it · ${fmtMs(ms)}`);
    setBig(current.display, "ok");
    setPattern(current);
    setTyped("");
    pop();
    haptics.success();
    player.whenDone(scheduleNext);
  }

  /** Gentle buzzer, then the item is sent again with its answer shown.
      The correct key must be pressed before moving on; another wrong key repeats this. */
  function wrong() {
    markMissed();
    setState(FEEDBACK);
    typed = "";
    setStatus("Listen again");
    setTyped("");
    setBig("", "");
    setPattern(null);
    haptics.error();
    player.play(renderBuzzer(volumeToAmp(cfg.volume), player.sr), () => {
      if (!running) return;
      showAnswer();
      player.play(audioFor(current), awaitCorrectKey);
    });
  }

  function showAnswer() {
    setStatus("This is it");
    setBig(current.display, "show");
    setPattern(current);
    setTyped("");
    pop();
  }

  function markMissed() {
    if (!missed) { missed = true; record(false); }   // one miss per item, however many wrong keys follow
  }

  function awaitCorrectKey() {
    if (!running) return;
    setState(WAITING);
    setStatus("Now type it");
  }

  // stats[key] = [attempts, correct, average recall ms, timed answers]
  function record(ok, ms) {
    const k = current.key;
    const s = stats[k] || [0, 0];
    s[0] += 1;
    if (ok) {
      s[1] += 1;
      s[2] = Math.round(s[3] ? s[2] + TIME_ALPHA * (ms - s[2]) : ms);
      s[3] = (s[3] || 0) + 1;
    }
    stats[k] = s;
    saveJSON(LS_STATS, stats);
    session.a += 1;
    if (ok) session.c += 1;
    if (ok) { boost[k] = (boost[k] || 0) * 0.5; }
    else boost[k] = (boost[k] || 0) + 3;
    renderScore();
  }

  function onAudioState() {
    // If iOS interrupts audio (call, Siri…), the `ended` event would never arrive: stop cleanly.
    const ctx = player.ctx;
    if (!running || !ctx || ctx.state === "running") return;
    setTimeout(() => {
      if (running && player.ctx && player.ctx.state !== "running") {
        setRunning(false);
        toast("Audio was interrupted. Tap Start to continue.");
      }
    }, 1500);
  }

  /* ======================================================================
     Keyboard input (on-screen keyboard and hardware keyboards)
     ====================================================================== */
  const focusKbd = () => { if (cfg.keys) return; try { ui.kbd.focus({ preventScroll: true }); } catch { /* ignore */ } };
  const NORMALIZE = { "’": "'", "‘": "'", "ʼ": "'", "–": "-", "—": "-", "−": "-", "‐": "-", "‑": "-" };

  ui.kbd.addEventListener("input", (e) => {
    if (e.isComposing) return;
    const v = ui.kbd.value;
    ui.kbd.value = "";
    for (const raw of v) {
      if (/\s/.test(raw)) continue;                    // Space is reserved for word gaps later
      onTyped((NORMALIZE[raw] || raw).toUpperCase());
    }
  });
  ui.kbd.addEventListener("focus", () => { kbFocused = true; renderHint(); });
  ui.kbd.addEventListener("blur", () => { kbFocused = false; renderHint(); });

  document.addEventListener("keydown", (e) => {
    if (asClose) { if (e.key === "Escape") asClose(); return; }
    if (sheetOpen) { if (e.key === "Escape") closeSheet(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case "Tab": e.preventDefault(); onReplay(); return;
      case "Enter": e.preventDefault(); if (running) onReveal(); else setRunning(true); return;
      case "Escape": if (running) { e.preventDefault(); setRunning(false); } return;
      case "ArrowUp": case "ArrowRight": e.preventDefault(); setWpm(cfg.wpm + 1); return;
      case "ArrowDown": case "ArrowLeft": e.preventDefault(); setWpm(cfg.wpm - 1); return;
      default:
    }
    if (cfg.keys) {                                    // hardware keyboard alongside the built-in keys
      if (e.key.length === 1 && !e.repeat && !/\s/.test(e.key)) {
        e.preventDefault();
        onTyped((NORMALIZE[e.key] || e.key).toUpperCase());
      }
      return;
    }
    if (running && document.activeElement !== ui.kbd && e.key.length === 1) focusKbd();
  });

  // Tapping the stage brings the keyboard back if it was dismissed.
  ui.stage.addEventListener("click", () => { if (running && !sheetOpen) focusKbd(); });

  /* ======================================================================
     Built-in keys: every character in the pool on one screen, so digits and
     punctuation never sit behind a shift or 123 layer.
     ====================================================================== */
  const KEY_BLOCKS = [
    ["1234567890"],
    ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"],
    [".,?/=+@", "-':()!"],
  ];

  function buildKeys() {
    const used = new Set();
    for (const k of [...cfg.chars, ...cfg.qso]) for (const ch of ITEMS.get(k).accept[0]) used.add(ch);
    // Whole blocks only, so a key never moves when the pool changes.
    let blocks = KEY_BLOCKS.filter((rows) => [...rows.join("")].some((ch) => used.has(ch)));
    if (!blocks.length) blocks = [KEY_BLOCKS[1]];
    ui.keys.replaceChildren(...blocks.flat().map((row) =>
      h("div", { class: "keys-row" }, [...row].map((ch) => h("button", { type: "button", class: "key", "data-k": ch }, ch)))));
  }

  function applyKeysMode() {
    document.body.classList.toggle("keys-on", cfg.keys);
    ui.keys.hidden = !cfg.keys;
    if (cfg.keys) { ui.kbd.blur(); buildKeys(); }
    syncViewport();
    renderHint();
  }

  // pointerdown, not click: the answer registers the instant the finger lands.
  ui.keys.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".key");
    if (!b) return;
    e.preventDefault();
    b.classList.add("down");
    setTimeout(() => b.classList.remove("down"), 120);
    onTyped(b.dataset.k);
  });

  /* ======================================================================
     Settings sheet
     ====================================================================== */
  const sheet = $("#sheet"), scrim = $("#scrim"), sheetBody = $("#sheetBody"), seg = $("#seg");
  const TABS = ["chars", "qso", "sound", "stats"];
  let sheetOpen = false;
  let resumeAfterSheet = false;
  let asClose = null;

  function section(title, card, opts = {}) {
    const head = title || opts.actions
      ? h("div", { class: "sec-head" },
          h("span", {}, title || ""),
          opts.actions ? h("span", { class: "sec-actions" },
            opts.actions.map(([t, fn]) => h("button", { type: "button", class: "text-btn", onclick: fn }, t))) : null)
      : null;
    return h("section", { class: "sec" }, head, card, opts.foot ? h("p", { class: "sec-foot" }, opts.foot) : null);
  }

  function sliderRow({ label, min, max, step, value, fmt, onInput }) {
    const out = h("span", { class: "row-value" }, fmt(value));
    const input = h("input", { type: "range", min, max, step, value, "aria-label": label });
    const paint = () => input.style.setProperty("--p", ((input.value - min) / (max - min)) * 100 + "%");
    input.addEventListener("input", () => { paint(); out.textContent = fmt(+input.value); onInput(+input.value); });
    paint();
    return h("div", { class: "row col" }, h("div", { class: "row-line" }, h("span", { class: "grow" }, label), out), input);
  }

  function switchRow({ title, sub, checked, onChange }) {
    const input = h("input", { type: "checkbox", class: "ios-switch", role: "switch", checked });
    input.addEventListener("change", () => onChange(input.checked));
    return { input, row: h("label", { class: "row" },
      h("div", { class: "grow" }, h("div", { class: "row-title" }, title), sub ? h("div", { class: "row-sub" }, sub) : null), input) };
  }

  function bulk(boxes, set, keys, on) {
    boxes.forEach((b, i) => { b.checked = on; on ? set.add(keys[i]) : set.delete(keys[i]); });
    poolChanged();
  }
  function poolChanged() { saveCfg(); updateSummaries(); renderHint(); if (cfg.keys) { buildKeys(); syncViewport(); } }

  function updateSummaries() {
    const a = $("#poolSummary"), b = $("#qsoSummary");
    if (a) a.textContent = `${cfg.chars.size} of ${TOTAL_CHARS} characters selected`;
    if (b) b.textContent = `${cfg.qso.size} QSO items selected`;
  }

  function buildChars() {
    const pane = $("#pane-chars");
    pane.replaceChildren(h("p", { class: "summary", id: "poolSummary" }));
    for (const [title, chars] of CHAR_GROUPS) {
      const keys = [...chars], boxes = [];
      const grid = h("div", { class: "chips" });
      for (const c of keys) {
        const item = ITEMS.get(c);
        const input = h("input", { type: "checkbox", checked: cfg.chars.has(c), "aria-label": `${c}, ${spokenPattern(item)}` });
        input.addEventListener("change", () => { input.checked ? cfg.chars.add(c) : cfg.chars.delete(c); poolChanged(); });
        boxes.push(input);
        grid.append(h("label", { class: "chip" }, input,
          h("span", { class: "chip-body" }, h("span", { class: "chip-ch" }, c), h("span", { class: "chip-pat" }, patternText(item)))));
      }
      pane.append(section(title, h("div", { class: "card" }, grid), {
        actions: [["All", () => bulk(boxes, cfg.chars, keys, true)], ["None", () => bulk(boxes, cfg.chars, keys, false)]],
      }));
    }
    updateSummaries();
  }

  function buildQso() {
    const pane = $("#pane-qso");
    const ratio = sliderRow({
      label: "Share of practice that is QSO items", min: 5, max: 100, step: 5, value: cfg.qsoRatio,
      fmt: (v) => `${v}%`, onInput: (v) => { cfg.qsoRatio = v; saveCfg(); },
    });
    pane.replaceChildren(
      h("p", { class: "summary", id: "qsoSummary" }),
      section(null, h("div", { class: "card" }, ratio),
        { foot: "Characters and QSO items are drawn from your pool at random. This sets how often a QSO item comes up." }));

    const list = (title, entries, foot) => {
      const rows = [], boxes = [], keys = [];
      for (const { key, label, sub } of entries) {
        const { row, input } = switchRow({
          title: label, sub, checked: cfg.qso.has(key),
          onChange: (on) => { on ? cfg.qso.add(key) : cfg.qso.delete(key); poolChanged(); },
        });
        row.querySelector(".row-title").classList.add("mono");
        rows.push(row); boxes.push(input); keys.push(key);
      }
      pane.append(section(title, h("div", { class: "card" }, rows), {
        foot, actions: [["All", () => bulk(boxes, cfg.qso, keys, true)], ["None", () => bulk(boxes, cfg.qso, keys, false)]],
      }));
    };
    list("Abbreviations", QSO_ABBREVS.map(([t, m]) => ({ key: "q:" + t, label: t, sub: m })),
      "Sent as separate letters. Type the letters in order; one wrong key counts the whole group as a miss.");
    list("Prosigns", PROSIGNS.map(([l, m, alt]) => ({ key: "p:" + l, label: `<${l}>`, sub: `${m}. Type ${l}${alt ? ` or ${alt}` : ""}` })),
      "Two letters sent run together as one character, with no gap between them.");
    updateSummaries();
  }

  function buildSound() {
    const pane = $("#pane-sound");
    const test = (fn) => () => { player.unlock(); fn(); };
    const sw1 = switchRow({ title: "Haptic feedback", sub: "A tap for right and wrong answers, where supported", checked: cfg.haptics,
      onChange: (on) => { cfg.haptics = on; saveCfg(); if (on) haptics.success(); } });
    const sw2 = switchRow({ title: "Keep screen awake", sub: "While practicing", checked: cfg.wake,
      onChange: (on) => { cfg.wake = on; saveCfg(); setWake(on && running); } });
    const sw3 = switchRow({ title: "Built-in keyboard", sub: "Letters, digits and punctuation on one screen. Turn off to use the system keyboard.", checked: cfg.keys,
      onChange: (on) => { cfg.keys = on; saveCfg(); applyKeysMode(); } });
    pane.replaceChildren(
      section("Tone", h("div", { class: "card" },
        sliderRow({ label: "Pitch", min: 300, max: 1000, step: 10, value: cfg.toneHz, fmt: (v) => `${v} Hz`,
          onInput: (v) => { cfg.toneHz = v; saveCfg(); } }),
        sliderRow({ label: "Volume", min: 0, max: 100, step: 1, value: cfg.volume, fmt: (v) => `${v}%`,
          onInput: (v) => { cfg.volume = v; saveCfg(); } }),
        h("button", { type: "button", class: "row", onclick: test(() =>
          player.play(renderItem(ITEMS.get("q:CQ"), cfg.wpm, cfg.toneHz, volumeToAmp(cfg.volume), player.sr))) }, "Play a test (CQ)"),
        h("button", { type: "button", class: "row", onclick: test(() =>
          player.play(renderBuzzer(volumeToAmp(cfg.volume), player.sr))) }, "Play the wrong-answer sound"))),
      section("Timing", h("div", { class: "card" },
        sliderRow({ label: "Pause before the next character", min: 0, max: 5, step: 0.1, value: cfg.pacing,
          fmt: (v) => `${v.toFixed(1)} s`, onInput: (v) => { cfg.pacing = Math.round(v * 10) / 10; saveCfg(); } })),
        { foot: "Speed is on the main screen. Pitch and volume apply from the next character." }),
      section("On this device", h("div", { class: "card" }, sw3.row, sw1.row, sw2.row)),
      section(null, h("div", { class: "card" },
        h("div", { class: "row col" }, h("div", { class: "row-title" }, "Morse Trainer"),
          h("div", { class: "row-sub" }, "Works offline once installed. Your settings and stats stay on this device."))))
    );
  }

  function buildStats() {
    const pane = $("#pane-stats");
    const rows = Object.entries(stats).filter(([, v]) => v && v[0] > 0);
    const totA = rows.reduce((s, [, v]) => s + v[0], 0), totC = rows.reduce((s, [, v]) => s + v[1], 0);
    const pct = (c, a) => (a ? Math.round((100 * c) / a) + "%" : "–");
    const tile = (num, label) => h("div", { class: "tile" }, h("div", { class: "tile-num" }, num), h("div", { class: "tile-label" }, label));
    const times = rows.filter(([, v]) => v[3]).map(([, v]) => v[2]).sort((x, y) => x - y);
    const median = times.length ? fmtMs(times[times.length >> 1]) : "–";
    pane.replaceChildren(section(null, h("div", { class: "card tiles" },
      tile(pct(session.c, session.a), "This session"), tile(pct(totC, totA), "All time"),
      tile(median, "Typical recall"), tile(String(totA), "Attempts"))));

    if (!rows.length) {
      pane.append(section(null, h("div", { class: "card empty" }, "No attempts yet. Start practicing and your accuracy and recall time per character show up here.")));
      return;
    }
    rows.sort((x, y) => need(y[1]) - need(x[1]) || y[1][0] - x[1][0]);
    const list = rows.map(([k, v]) => {
      const [a, c] = v;
      const p = (100 * c) / a;
      const color = p >= 90 ? "var(--green)" : p >= 70 ? "var(--orange)" : "var(--red)";
      const slow = slowness(v);
      const timeColor = slow < 1 / 3 ? "var(--green)" : slow < 2 / 3 ? "var(--orange)" : "var(--red)";
      return h("div", { class: "row stat-row" },
        h("span", { class: "stat-name" }, ITEMS.get(k)?.display ?? k),
        h("div", { class: "bar" }, h("i", { style: `width:${p}%;background:${color}` })),
        h("span", { class: "stat-count" }, `${c} / ${a}`),
        h("span", { class: "stat-pct" }, Math.round(p) + "%"),
        h("span", { class: "stat-time", style: v[3] ? `color:${timeColor}` : null }, v[3] ? fmtMs(v[2]) : "–"));
    });
    pane.append(
      section("By item, most practice needed first", h("div", { class: "card" }, list),
        { foot: `Recall is the time from the end of the sound to your correct answer, averaged over recent first-try answers. Slow and often-missed items come up more often; under ${fmtMs(FAST_MS)} counts as instant.` }),
      section(null, h("div", { class: "card" },
        h("button", { type: "button", class: "row danger", onclick: resetStatsPrompt }, "Reset statistics"))));
  }

  function resetStatsPrompt() {
    confirmSheet({
      title: "Reset statistics?", message: "This clears accuracy and recall times for every character on this device.", confirm: "Reset statistics",
      onConfirm: () => { stats = {}; saveJSON(LS_STATS, stats); buildStats(); },
    });
  }

  function confirmSheet({ title, message, confirm, onConfirm }) {
    const as = h("div", { class: "scrim as-scrim" });
    const close = () => {
      asClose = null;
      as.classList.remove("open"); box.classList.remove("open");
      setTimeout(() => { as.remove(); box.remove(); }, 400);
    };
    const box = h("div", { class: "actionsheet", role: "alertdialog", "aria-modal": "true" },
      h("div", { class: "as-group" },
        h("div", { class: "as-title" }, title), h("div", { class: "as-msg" }, message),
        h("button", { type: "button", class: "as-btn danger", onclick: () => { close(); onConfirm(); } }, confirm)),
      h("button", { type: "button", class: "as-btn cancel", onclick: close }, "Cancel"));
    as.addEventListener("click", close);
    document.body.append(as, box);
    asClose = close;
    requestAnimationFrame(() => requestAnimationFrame(() => { as.classList.add("open"); box.classList.add("open"); }));
  }

  function selectTab(name) {
    const i = Math.max(0, TABS.indexOf(name));
    seg.style.setProperty("--i", i);
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === TABS[i])));
    TABS.forEach((t) => { $("#pane-" + t).hidden = t !== TABS[i]; });
    if (TABS[i] === "stats") buildStats();
    sheetBody.scrollTop = 0;
  }

  function openSheet(tab = "chars") {
    if (sheetOpen) return;
    sheetOpen = true;
    resumeAfterSheet = running;
    if (running) setRunning(false);
    ui.kbd.blur();
    sheet.style.transform = "";
    sheet.inert = false;
    ui.app.inert = true;
    selectTab(tab);
    sheet.classList.add("open");
    scrim.classList.add("open");
  }

  function closeSheet() {
    if (!sheetOpen) return;
    sheetOpen = false;
    player.stop();
    sheet.classList.remove("open", "dragging");
    sheet.style.transform = "";
    scrim.classList.remove("open");
    sheet.inert = true;
    ui.app.inert = false;
    renderHint();
    if (resumeAfterSheet) {
      resumeAfterSheet = false;
      setRunning(true);                                // blocked with a message if the pool is empty
    }
  }

  function initSheet() {
    buildChars(); buildQso(); buildSound();
    seg.addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (b) selectTab(b.dataset.tab); });
    $("#sheetDone").addEventListener("click", closeSheet);
    scrim.addEventListener("click", closeSheet);

    // Swipe the header down to dismiss.
    const head = $("#sheetHead");
    let y0 = null, dy = 0, t0 = 0;
    head.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      y0 = e.clientY; dy = 0; t0 = performance.now();
      head.setPointerCapture(e.pointerId);
      sheet.classList.add("dragging");
    });
    head.addEventListener("pointermove", (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.clientY - y0);
      sheet.style.transform = `translateY(${dy}px)`;
    });
    const release = () => {
      if (y0 === null) return;
      const fast = dy / Math.max(1, performance.now() - t0) > 0.6;
      y0 = null;
      sheet.classList.remove("dragging");
      if (dy > 110 || (fast && dy > 30)) closeSheet(); else sheet.style.transform = "";
    };
    head.addEventListener("pointerup", release);
    head.addEventListener("pointercancel", release);
  }

  /* ======================================================================
     Wire-up
     ====================================================================== */
  // Keep taps on buttons from moving focus away from the hidden input (desktop browsers).
  document.querySelectorAll(".controls button, .nav button").forEach((b) =>
    b.addEventListener("mousedown", (e) => e.preventDefault()));

  ui.start.addEventListener("click", () => setRunning(!running));
  ui.replay.addEventListener("click", () => { onReplay(); if (running) focusKbd(); });
  ui.reveal.addEventListener("click", () => { onReveal(); if (running) focusKbd(); });
  $("#settingsBtn").addEventListener("click", () => openSheet("chars"));
  ui.score.addEventListener("click", () => openSheet("stats"));

  // Pause when the app goes to the background; iOS suspends audio there anyway.
  document.addEventListener("visibilitychange", () => { if (document.hidden && running) setRunning(false); });
  window.addEventListener("pagehide", () => { if (running) setRunning(false); });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncViewport);
    window.visualViewport.addEventListener("scroll", () => { syncViewport(); if (!sheetOpen) window.scrollTo(0, 0); });
  }
  window.addEventListener("resize", syncViewport);
  window.addEventListener("orientationchange", syncViewport);

  // Install hint: only on iOS Safari, only until dismissed.
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  if (isIOS && !standalone && !loadJSON(LS_INSTALL, false)) ui.install.hidden = false;
  $("#installClose").addEventListener("click", (e) => { e.stopPropagation(); ui.install.hidden = true; saveJSON(LS_INSTALL, true); });
  ui.install.addEventListener("click", (e) => e.stopPropagation());

  initSpeedSlider();
  initSheet();
  applyKeysMode();
  renderControls();
  renderScore();
  renderHint();
  setBig("?", "muted");

  try { navigator.storage?.persist?.(); } catch { /* ignore */ }
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
