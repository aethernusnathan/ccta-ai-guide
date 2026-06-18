// CCTA Knowledge Assistant — chat widget
// Self-contained: injects its own styles + HTML, no external deps.
//
// Dual mode:
//   Inline  — if <div id="cai-inline"> exists on the page, renders as an embedded card
//   Floating — otherwise renders as a floating fab + slide-in panel (clinical guide page)
//
// Auto-detect: use relative path on Vercel (avoids CORS), absolute URL on GitHub Pages / other hosts
const CCTA_SAME_ORIGIN = (
  window.location.hostname === 'localhost' ||
  window.location.hostname.includes('vercel.app')
);
const CCTA_CHAT_API = CCTA_SAME_ORIGIN ? '/api/chat' : 'https://ccta-ai-guide.vercel.app/api/chat';
// Only send credentials same-origin. Cross-site (GitHub Pages → Vercel) credentialed
// requests are blocked by Safari's "Prevent Cross-Site Tracking", and the rate-limit
// cookie can't be set cross-site anyway — so omit credentials there to keep chat working.
const CCTA_CREDENTIALS = CCTA_SAME_ORIGIN ? 'include' : 'omit';

(function () {
  'use strict';

  // ── Styles ────────────────────────────────────────────────────────────────
  const css = `
/* ── Floating mode ── */
.cai-fab {
  position: fixed; bottom: 28px; right: 28px; z-index: 9999;
  width: 56px; height: 56px; border-radius: 50%;
  background: #1B3F6E; color: #fff; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 20px rgba(27,63,110,.38), 0 2px 8px rgba(0,0,0,.14);
  transition: transform 180ms cubic-bezier(.25,.1,.25,1), box-shadow 180ms cubic-bezier(.25,.1,.25,1);
}
.cai-fab:hover { transform: scale(1.07); box-shadow: 0 6px 28px rgba(27,63,110,.48); }
.cai-fab:active { transform: scale(.96); }
.cai-fab-icon-open  { display: flex; }
.cai-fab-icon-close { display: none; }
.cai-fab.open .cai-fab-icon-open  { display: none; }
.cai-fab.open .cai-fab-icon-close { display: flex; }

.cai-panel {
  position: fixed; bottom: 0; right: 0; z-index: 9998;
  width: 390px; height: 100%; height: 100dvh;
  background: #ffffff;
  box-shadow: -6px 0 48px rgba(60,60,100,.14), -1px 0 0 rgba(0,0,0,.06);
  display: flex; flex-direction: column;
  transform: translateX(110%);
  transition: transform 300ms cubic-bezier(.25,.1,.25,1);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
  /* iOS Safari: keep above virtual keyboard */
  padding-bottom: env(safe-area-inset-bottom);
}
.cai-panel.open { transform: translateX(0); }
.cai-panel .cai-msgs { flex: 1; min-height: 0; }

/* ── Inline card mode ── */
.cai-card {
  background: #fff;
  border-radius: 18px;
  border: 1px solid rgba(0,0,0,.07);
  box-shadow: 0 4px 18px rgba(60,60,100,.10), 0 1px 4px rgba(60,60,100,.05);
  overflow: hidden;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.cai-card .cai-hdr-title { font-size: 1rem; }
.cai-card .cai-msgs { max-height: 380px; min-height: 168px; }
.cai-card .cai-examples {
  display: grid; grid-template-columns: 1fr 1fr; gap: .35rem; margin-top: 0; width: 100%;
}
@media (max-width: 520px) { .cai-card .cai-examples { grid-template-columns: 1fr; } }

/* ── Shared header ── */
.cai-hdr {
  display: flex; align-items: center; gap: .6rem;
  padding: .85rem 1rem; border-bottom: 1px solid rgba(0,0,0,.07);
  background: rgba(255,255,255,.96); backdrop-filter: blur(12px);
  flex-shrink: 0;
}
.cai-hdr-mark {
  width: 32px; height: 32px; border-radius: 9px; background: #1B3F6E;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.cai-hdr-text { flex: 1; min-width: 0; }
.cai-hdr-title { font-size: .84rem; font-weight: 600; color: #1C1C1E; letter-spacing: -.01em; line-height: 1.2; }
.cai-hdr-sub   { font-size: .6rem; font-weight: 500; color: #8E8E93; text-transform: uppercase; letter-spacing: .04em; margin-top: .1rem; }
.cai-close {
  width: 28px; height: 28px; border-radius: 50%;
  background: rgba(0,0,0,.05); border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center; color: #6E6E73;
  transition: background 120ms; flex-shrink: 0;
}
.cai-close:hover { background: rgba(0,0,0,.09); }

/* ── Shared messages area ── */
.cai-msgs {
  overflow-y: auto; padding: .9rem 1rem;
  display: flex; flex-direction: column; gap: .8rem;
  scroll-behavior: smooth;
}
.cai-msgs::-webkit-scrollbar { width: 4px; }
.cai-msgs::-webkit-scrollbar-thumb { background: rgba(0,0,0,.12); border-radius: 2px; }

/* Empty / example chips */
.cai-empty { display: flex; flex-direction: column; gap: .3rem; padding: .1rem 0; }
.cai-empty-icon {
  width: 52px; height: 52px; border-radius: 15px;
  background: linear-gradient(135deg,#1B3F6E 0%,#3a6ab0 100%);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: .85rem; box-shadow: 0 4px 16px rgba(27,63,110,.25);
}
.cai-empty-title { font-size: .9rem; font-weight: 600; color: #1C1C1E; letter-spacing: -.01em; margin-bottom: .3rem; }
.cai-empty-sub   { font-size: .74rem; color: #6E6E73; line-height: 1.6; max-width: 280px; }
.cai-examples { display: flex; flex-direction: column; gap: .3rem; margin-top: .85rem; width: 100%; }
.cai-ex-btn {
  background: #F5F5F7; border: 1px solid rgba(0,0,0,.07); border-radius: 10px;
  padding: .55rem .85rem; font-size: .74rem; font-weight: 500;
  color: #1B3F6E; text-align: left; cursor: pointer; font-family: inherit;
  transition: background 120ms, border-color 120ms;
  display: flex; align-items: center; gap: .5rem;
}
.cai-ex-btn:hover { background: #eef1f8; border-color: rgba(27,63,110,.3); }
.cai-ex-arrow { opacity: .4; margin-left: auto; flex-shrink: 0; }

/* Message bubbles */
.cai-msg { display: flex; flex-direction: column; gap: .3rem; }
.cai-msg.user      { align-items: flex-end; }
.cai-msg.assistant { align-items: flex-start; }
.cai-bubble {
  max-width: 87%; padding: .6rem .9rem; border-radius: 16px;
  font-size: .83rem; line-height: 1.65; word-break: break-word;
}
.cai-msg.user .cai-bubble {
  background: #1B3F6E; color: #fff; border-bottom-right-radius: 4px;
}
.cai-msg.assistant .cai-bubble {
  background: #F5F5F7; color: #1C1C1E;
  border-bottom-left-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,.06);
}
.cai-bubble sup { font-size: .65em; font-weight: 600; color: #0071E3; }
.cai-msg.user .cai-bubble sup { color: rgba(255,255,255,.75); }

/* Skeleton */
.cai-skeleton { max-width: 82%; display: flex; flex-direction: column; gap: .45rem; padding: .6rem .9rem; }
.cai-skel {
  height: 11px; border-radius: 6px;
  background: linear-gradient(90deg,#ECECEC 25%,#E0E0E5 50%,#ECECEC 75%);
  background-size: 200% 100%; animation: caiShimmer 1.5s infinite;
}
@keyframes caiShimmer { from{background-position:200% 0} to{background-position:-200% 0} }
.cai-skel:nth-child(1){width:84%} .cai-skel:nth-child(2){width:70%} .cai-skel:nth-child(3){width:56%}
.cai-timer { display:flex; align-items:center; gap:.35rem; margin-top:.25rem; font-size:.68rem; color:#8E8E93; font-weight:500; }
.cai-timer-dot { width:5px; height:5px; border-radius:50%; background:#8E8E93; flex-shrink:0; animation:caiPulse 1s ease infinite; }
@keyframes caiPulse { 0%,100%{opacity:1} 50%{opacity:.25} }

/* Citations */
.cai-cites { display:flex; flex-direction:column; gap:.22rem; max-width:92%; padding-left:.1rem; }
.cai-cite { display:flex; align-items:flex-start; gap:.4rem; font-size:.69rem; color:#6E6E73; line-height:1.45; }
.cai-cite-n {
  width:19px; height:19px; border-radius:5px;
  display:flex; align-items:center; justify-content:center;
  font-size:.6rem; font-weight:700; flex-shrink:0; margin-top:.05rem;
}
.cai-cite-n.pubmed { background:rgba(11,122,62,.12); color:#0B7A3E; }
.cai-cite-n.trials { background:rgba(0,113,227,.12);  color:#0071E3; }
.cai-cite-n.web    { background:rgba(120,80,10,.09);  color:#7A5000; }
.cai-cite-body { flex:1; min-width:0; }
.cai-cite-link { color:#1C1C1E; text-decoration:none; font-weight:500; }
.cai-cite-link:hover { color:#1B3F6E; text-decoration:underline; }
.cai-cite-meta { color:#8E8E93; display:block; margin-top:.05rem; }

/* Input row */
.cai-input-row {
  border-top:1px solid rgba(0,0,0,.07); padding:.65rem .75rem;
  display:flex; gap:.45rem; align-items:flex-end; flex-shrink:0; background:#fff;
}
.cai-textarea {
  flex:1; min-height:38px; max-height:96px;
  border:1.5px solid rgba(0,0,0,.11); border-radius:12px;
  padding:.52rem .8rem; font-family:inherit; font-size:.83rem;
  color:#1C1C1E; resize:none; outline:none; background:#F5F5F7;
  transition:border-color 140ms,background 140ms; line-height:1.5; overflow-y:auto;
}
.cai-textarea:focus { border-color:#1B3F6E; background:#fff; box-shadow:0 0 0 3px rgba(27,63,110,.1); }
.cai-textarea::placeholder { color:#8E8E93; }
.cai-send {
  width:38px; height:38px; border-radius:10px;
  background:#1B3F6E; color:#fff; border:none; cursor:pointer;
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
  transition:opacity 140ms,transform 120ms;
}
.cai-send:hover { opacity:.87; }
.cai-send:active { transform:scale(.93); }
.cai-send:disabled { opacity:.3; cursor:not-allowed; transform:none; }

/* Footer */
.cai-foot {
  padding:.4rem 1rem; border-top:1px solid rgba(0,0,0,.05);
  display:flex; align-items:center; justify-content:center; gap:.4rem; flex-shrink:0;
}
.cai-foot-tag { font-size:.59rem; color:#AEAEB2; font-weight:500; letter-spacing:.02em; }
.cai-foot-dot { width:2px; height:2px; border-radius:50%; background:#D1D1D6; }

@media(max-width:440px) {
  .cai-panel{width:100vw;height:100%;height:100dvh}
  .cai-fab{bottom:20px;right:18px}
  .cai-card .cai-msgs{max-height:300px}
}
@media(prefers-reduced-motion:reduce) { .cai-panel,.cai-fab,.cai-skel{transition:none!important;animation:none!important} }

/* ── Heart icon containers need white icon color ── */
.cai-fab { color: #fff; }
.cai-hdr-mark { color: #fff; }
.cai-empty-icon { color: #fff; }

/* ── FAB heartbeat pulse (fires 3× on load, stops after) ── */
@keyframes cai-heartpulse {
  0%,100%{transform:scale(1);box-shadow:0 4px 20px rgba(27,63,110,.38),0 2px 8px rgba(0,0,0,.14)}
  15%{transform:scale(1.14);box-shadow:0 7px 30px rgba(27,63,110,.58),0 3px 12px rgba(0,0,0,.18)}
  30%{transform:scale(1.02)}
  46%{transform:scale(1.10);box-shadow:0 5px 24px rgba(27,63,110,.48)}
  72%{transform:scale(1)}
}
.cai-fab:not(.open){ animation: cai-heartpulse 2.1s ease-in-out 1.9s 3; }

/* ── Speech bubble greeting ── */
.cai-greet{
  position:fixed; bottom:100px; right:16px; z-index:9999;
  background:#fff; border-radius:14px; padding:12px 30px 12px 14px;
  max-width:238px;
  box-shadow:0 4px 26px rgba(27,63,110,.22),0 1px 6px rgba(0,0,0,.10);
  border:1px solid rgba(27,63,110,.12);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  font-size:.77rem; line-height:1.58; color:#3A3A3C;
  opacity:0; transform:translateY(8px) scale(.97);
  transition:opacity 300ms ease,transform 300ms ease;
  pointer-events:none;
}
.cai-greet.visible{ opacity:1; transform:translateY(0) scale(1); pointer-events:auto; }
.cai-greet::after{
  content:''; position:absolute; bottom:-8px; right:22px;
  border-width:8px 7px 0; border-style:solid;
  border-color:#fff transparent transparent;
  filter:drop-shadow(0 2px 1px rgba(0,0,0,.06));
}
.cai-greet-name{ font-weight:700; color:#1B3F6E; display:block; margin-bottom:3px; font-size:.79rem; }
.cai-greet-x{
  position:absolute; top:7px; right:7px;
  width:18px; height:18px; border:none; background:none; cursor:pointer;
  color:#AEAEB2; font-size:.65rem; padding:0;
  display:flex; align-items:center; justify-content:center; border-radius:50%;
}
.cai-greet-x:hover{ background:rgba(0,0,0,.06); color:#6E6E73; }
@media(max-width:440px){ .cai-greet{ display:none; } }
  `;

  // ── Icons ─────────────────────────────────────────────────────────────────
  // Anatomical heart: body + aortic arch + pulmonary trunk
  const ICON_HEART = `<svg width="22" height="22" viewBox="0 0 100 106" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 94C50 94 10 67 8 43C6 29 14 17 27 16C36 16 43 21 47 29C53 21 61 16 70 16C82 17 89 29 87 43C84 67 50 94 50 94Z"/>
    <path d="M46 29C42 20 40 10 44 4C47 0 54 1 56 6C59 12 56 21 52 26" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>
    <path d="M53 23C57 15 64 8 72 6" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
  </svg>`;
  const ICON_SEND = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>`;
  const ICON_CLOSE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`;
  const ICON_X = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`;

  const EXAMPLES = [
    'What is the diagnostic accuracy of HeartFlow FFRCT?',
    'HeartFlow vs Cleerly — how do they compare?',
    'Active trials comparing FFRCT to invasive FFR',
    'SCCT 2025 CT-FFR consensus criteria',
  ];

  const FOOTER_HTML = `
    <div class="cai-foot">
      <span class="cai-foot-tag">PubMed</span><span class="cai-foot-dot"></span>
      <span class="cai-foot-tag">ClinicalTrials.gov</span><span class="cai-foot-dot"></span>
      <span class="cai-foot-tag">Web</span><span class="cai-foot-dot"></span>
      <span class="cai-foot-tag">Claude</span>
    </div>`;

  const INPUT_HTML = `
    <div class="cai-input-row">
      <textarea class="cai-textarea" id="cai-input"
        placeholder="Ask about FFRCT, plaque AI, vendor comparisons…"
        rows="1" aria-label="Your question"></textarea>
      <button class="cai-send" id="cai-send" aria-label="Send">${ICON_SEND}</button>
    </div>`;

  // ── Mount ─────────────────────────────────────────────────────────────────
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  const inlineTarget = document.getElementById('cai-inline');
  const inlineMode   = !!inlineTarget;
  let root;

  if (inlineMode) {
    // ── Inline card ──────────────────────────────────────────────────────
    inlineTarget.classList.add('cai-card');
    inlineTarget.innerHTML = `
      <div class="cai-hdr">
        <div class="cai-hdr-mark">${ICON_HEART}</div>
        <div class="cai-hdr-text">
          <div class="cai-hdr-title">CCTA Research Assistant</div>
          <div class="cai-hdr-sub">PubMed · ClinicalTrials.gov · Guidelines · Claude · β</div>
        </div>
      </div>
      <div class="cai-msgs" id="cai-msgs">
        <div class="cai-empty" id="cai-empty">
          <div class="cai-examples" id="cai-examples"></div>
        </div>
      </div>
      ${INPUT_HTML}
      ${FOOTER_HTML}
    `;
    root = inlineTarget;

  } else {
    // ── Floating fab + panel ─────────────────────────────────────────────
    const fab = document.createElement('button');
    fab.className = 'cai-fab';
    fab.setAttribute('aria-label', 'Open CCTA Research Assistant');
    fab.innerHTML = `
      <span class="cai-fab-icon-open">${ICON_HEART}</span>
      <span class="cai-fab-icon-close">${ICON_X}</span>
    `;

    // ── Speech bubble greeting ──────────────────────────────────────────
    const greet = document.createElement('div');
    greet.className = 'cai-greet';
    greet.innerHTML = `
      <button class="cai-greet-x" aria-label="Dismiss">✕</button>
      <span class="cai-greet-name">CCTA Research AI</span>
      Hi — I'm built by Nathan Qin. Ask me anything: FFRCT accuracy, vendor comparisons, active trials, CPT billing, or the latest SCCT guidelines.
    `;

    const panel = document.createElement('div');
    panel.className = 'cai-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'CCTA Research Assistant');
    panel.innerHTML = `
      <div class="cai-hdr">
        <div class="cai-hdr-mark">${ICON_HEART}</div>
        <div class="cai-hdr-text">
          <div class="cai-hdr-title">CCTA Research Assistant</div>
          <div class="cai-hdr-sub">PubMed · Trials · Guidelines · β</div>
        </div>
        <button class="cai-close" aria-label="Close">${ICON_CLOSE}</button>
      </div>
      <div class="cai-msgs" id="cai-msgs">
        <div class="cai-empty" id="cai-empty">
          <div class="cai-empty-icon">${ICON_HEART}</div>
          <div class="cai-empty-title">Hi — I'm Nathan's CCTA Research AI</div>
          <div class="cai-empty-sub">Ask me anything about coronary CT: FFRCT accuracy, AI plaque vendors, active clinical trials, CPT reimbursement, or the latest SCCT/ACC guidelines — with live citations from PubMed and ClinicalTrials.gov.</div>
          <div class="cai-examples" id="cai-examples"></div>
        </div>
      </div>
      ${INPUT_HTML}
      ${FOOTER_HTML}
    `;

    document.body.appendChild(panel);
    document.body.appendChild(greet);
    document.body.appendChild(fab);

    let isOpen = false;
    const input_ = panel.querySelector('#cai-input');

    // Greeting bubble: show after 2.2 s, auto-dismiss after 8 s
    let greetTimer;
    function showGreet() { greet.classList.add('visible'); greetTimer = setTimeout(hideGreet, 8000); }
    function hideGreet() { clearTimeout(greetTimer); greet.classList.remove('visible'); }
    setTimeout(showGreet, 2200);
    greet.querySelector('.cai-greet-x').addEventListener('click', hideGreet);

    function openPanel()  { isOpen=true;  panel.classList.add('open');    fab.classList.add('open');    hideGreet(); setTimeout(()=>input_.focus(),320); }
    function closePanel() { isOpen=false; panel.classList.remove('open'); fab.classList.remove('open'); }
    fab.addEventListener('click', () => isOpen ? closePanel() : openPanel());
    panel.querySelector('.cai-close').addEventListener('click', closePanel);
    document.addEventListener('keydown', e => { if(e.key==='Escape'&&isOpen) closePanel(); });
    root = panel;
  }

  // ── Shared refs ───────────────────────────────────────────────────────────
  const msgs    = root.querySelector('#cai-msgs');
  const input   = root.querySelector('#cai-input');
  const sendBtn = root.querySelector('#cai-send');
  const empty   = root.querySelector('#cai-empty');
  const exWrap  = root.querySelector('#cai-examples');

  let history = [];
  let loading = false;

  // Example chips
  EXAMPLES.forEach(ex => {
    const btn = document.createElement('button');
    btn.className = 'cai-ex-btn';
    btn.innerHTML = `<span>${ex}</span><span class="cai-ex-arrow">→</span>`;
    btn.addEventListener('click', () => ask(ex));
    exWrap.appendChild(btn);
  });

  // ── Input handlers ────────────────────────────────────────────────────────
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 96) + 'px';
  });
  input.addEventListener('focus', () => {
    // On mobile, scroll the input into view after virtual keyboard appears
    setTimeout(() => input.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  sendBtn.addEventListener('click', send);

  // ── Send / ask ────────────────────────────────────────────────────────────
  function send() {
    const q = input.value.trim();
    if (!q || loading) return;
    ask(q);
  }

  async function ask(question) {
    if (loading) return;
    input.value = '';
    input.style.height = 'auto';
    empty.style.display = 'none';

    appendBubble('user', question);
    history.push({ role: 'user', content: question });

    const skelEl = appendSkeleton();
    const timerLabel = skelEl.querySelector('.cai-timer-label');
    let elapsed = 0;
    const PHASES = [
      'Searching PubMed & guidelines…',
      'Searching PubMed & guidelines…',
      'Searching PubMed & guidelines…',
      'Synthesizing evidence…',
      'Synthesizing evidence…',
      'Synthesizing evidence…',
      'Almost done…',
    ];
    const timerInterval = setInterval(() => {
      elapsed++;
      if (timerLabel) timerLabel.textContent = PHASES[Math.min(elapsed - 1, PHASES.length - 1)] + ` (${elapsed}s)`;
    }, 1000);
    loading = true;
    sendBtn.disabled = true;
    scrollBottom();

    try {
      const res = await fetch(CCTA_CHAT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: CCTA_CREDENTIALS,
        body: JSON.stringify({ question, history: history.slice(0, -1) }),
      });
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        skelEl.remove();
        appendBubble('assistant', data.error || 'Daily query limit reached. Please try again tomorrow.');
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      skelEl.remove();
      const { el: msgEl } = appendBubble('assistant', data.answer || '');
      if (data.citations?.length) appendCitations(msgEl.parentElement, data.citations);
      history.push({ role: 'assistant', content: data.answer || '' });
    } catch (err) {
      skelEl.remove();
      const m = (err.message || '').toLowerCase();
      const isNetwork = m.includes('fetch') || m.includes('network') || m.includes('load failed');
      const errMsg = isNetwork
        ? 'Could not reach the server — please try again in a moment.'
        : 'Something went wrong — please try again.';
      appendBubble('assistant', errMsg);
    } finally {
      clearInterval(timerInterval);
      loading = false;
      sendBtn.disabled = false;
      input.focus();
      scrollBottom();
    }
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────
  function appendBubble(role, text) {
    const wrap = document.createElement('div');
    wrap.className = `cai-msg ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'cai-bubble';
    bubble.innerHTML = role === 'assistant' ? renderMarkdown(text) : escapeHtml(text);
    wrap.appendChild(bubble);
    msgs.appendChild(wrap);
    return { el: bubble, wrap };
  }

  function renderMarkdown(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid rgba(0,0,0,.1);margin:.6rem 0">')
      .replace(/\[(\d+)\]/g, '<sup style="font-size:.65em;font-weight:600;color:#0071E3">[$1]</sup>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  function appendSkeleton() {
    const wrap = document.createElement('div');
    wrap.className = 'cai-msg assistant';
    wrap.innerHTML = `<div class="cai-skeleton">
      <div class="cai-skel"></div>
      <div class="cai-skel"></div>
      <div class="cai-skel"></div>
      <div class="cai-timer"><span class="cai-timer-dot"></span><span class="cai-timer-label">Searching sources · 0s</span></div>
    </div>`;
    msgs.appendChild(wrap);
    return wrap;
  }

  function appendCitations(msgWrap, citations) {
    const container = document.createElement('div');
    container.className = 'cai-cites';
    citations.forEach(c => {
      const item = document.createElement('div');
      item.className = 'cai-cite';
      const nClass = c.source === 'pubmed' ? 'pubmed' : c.source === 'trials' ? 'trials' : 'web';
      const meta = [c.authors, c.journal, c.year, c.status].filter(Boolean).join(' · ');
      item.innerHTML = `
        <span class="cai-cite-n ${nClass}">${c.n}</span>
        <div class="cai-cite-body">
          <a class="cai-cite-link" href="${escapeAttr(c.url)}" target="_blank" rel="noopener">${escapeHtml(c.title)}</a>
          ${meta ? `<span class="cai-cite-meta">${escapeHtml(meta)}</span>` : ''}
        </div>
      `;
      container.appendChild(item);
    });
    msgWrap.appendChild(container);
  }

  function scrollBottom() {
    setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 60);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function escapeAttr(str) {
    return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

})();
