// CCTA Knowledge Assistant — chat widget
// Self-contained: injects its own styles + HTML, no external deps.
//
// ─── CONFIGURE THIS AFTER DEPLOYING TO VERCEL ──────────────────────────────
// Replace with your actual Vercel deployment URL:
const CCTA_CHAT_API = 'https://ccta-ai-guide.vercel.app/api/chat';
// For local dev with `vercel dev`: use 'http://localhost:3000/api/chat'
// ───────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ── Styles ────────────────────────────────────────────────────────────────
  const css = `
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
  width: 390px; height: 100dvh; max-height: 100dvh;
  background: #ffffff;
  box-shadow: -6px 0 48px rgba(60,60,100,.14), -1px 0 0 rgba(0,0,0,.06);
  display: flex; flex-direction: column;
  transform: translateX(110%);
  transition: transform 300ms cubic-bezier(.25,.1,.25,1);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.cai-panel.open { transform: translateX(0); }

/* Header */
.cai-hdr {
  display: flex; align-items: center; gap: .6rem;
  padding: .85rem 1rem; border-bottom: 1px solid rgba(0,0,0,.07);
  background: rgba(255,255,255,.96); backdrop-filter: blur(12px);
  flex-shrink: 0;
}
.cai-hdr-mark {
  width: 32px; height: 32px; border-radius: 9px;
  background: #1B3F6E;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.cai-hdr-text { flex: 1; min-width: 0; }
.cai-hdr-title { font-size: .84rem; font-weight: 600; color: #1C1C1E; letter-spacing: -.01em; line-height: 1.2; }
.cai-hdr-sub   { font-size: .6rem;  font-weight: 500; color: #8E8E93; text-transform: uppercase; letter-spacing: .04em; margin-top: .1rem; }
.cai-close {
  width: 28px; height: 28px; border-radius: 50%;
  background: rgba(0,0,0,.05); border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center; color: #6E6E73;
  transition: background 120ms; flex-shrink: 0;
}
.cai-close:hover { background: rgba(0,0,0,.09); }

/* Message area */
.cai-msgs {
  flex: 1; overflow-y: auto; padding: 1rem .9rem;
  display: flex; flex-direction: column; gap: .8rem;
  scroll-behavior: smooth;
}
.cai-msgs::-webkit-scrollbar { width: 4px; }
.cai-msgs::-webkit-scrollbar-thumb { background: rgba(0,0,0,.12); border-radius: 2px; }

/* Empty state */
.cai-empty {
  display: flex; flex-direction: column; align-items: center;
  text-align: center; padding: 1.8rem .5rem 1rem;
}
.cai-empty-icon {
  width: 52px; height: 52px; border-radius: 15px;
  background: linear-gradient(135deg, #1B3F6E 0%, #3a6ab0 100%);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: .85rem;
  box-shadow: 0 4px 16px rgba(27,63,110,.25);
}
.cai-empty-title { font-size: .9rem; font-weight: 600; color: #1C1C1E; letter-spacing: -.01em; margin-bottom: .3rem; }
.cai-empty-sub   { font-size: .74rem; color: #6E6E73; line-height: 1.6; max-width: 280px; }
.cai-examples    { display: flex; flex-direction: column; gap: .3rem; margin-top: .85rem; width: 100%; }
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
.cai-msg.user    { align-items: flex-end; }
.cai-msg.assistant { align-items: flex-start; }
.cai-bubble {
  max-width: 87%; padding: .6rem .9rem; border-radius: 16px;
  font-size: .83rem; line-height: 1.65; word-break: break-word;
  white-space: pre-wrap;
}
.cai-msg.user .cai-bubble {
  background: #1B3F6E; color: #fff;
  border-bottom-right-radius: 4px;
}
.cai-msg.assistant .cai-bubble {
  background: #F5F5F7; color: #1C1C1E;
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
}
.cai-bubble sup { font-size: .65em; font-weight: 600; color: #0071E3; cursor: pointer; }
.cai-msg.user .cai-bubble sup { color: rgba(255,255,255,.75); }

/* Skeleton loading */
.cai-skeleton { max-width: 82%; display: flex; flex-direction: column; gap: .45rem; padding: .6rem .9rem; }
.cai-skel {
  height: 11px; border-radius: 6px;
  background: linear-gradient(90deg, #ECECEC 25%, #E0E0E5 50%, #ECECEC 75%);
  background-size: 200% 100%;
  animation: caiShimmer 1.5s infinite;
}
@keyframes caiShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.cai-skel:nth-child(1) { width: 84%; }
.cai-skel:nth-child(2) { width: 70%; }
.cai-skel:nth-child(3) { width: 56%; }
.cai-timer {
  display: flex; align-items: center; gap: .35rem;
  margin-top: .25rem; font-size: .68rem; color: #8E8E93; font-weight: 500;
}
.cai-timer-dot {
  width: 5px; height: 5px; border-radius: 50%; background: #8E8E93; flex-shrink: 0;
  animation: caiPulse 1s ease infinite;
}
@keyframes caiPulse { 0%,100%{opacity:1;} 50%{opacity:.25;} }

/* Citations */
.cai-cites { display: flex; flex-direction: column; gap: .22rem; max-width: 92%; padding-left: .1rem; }
.cai-cite {
  display: flex; align-items: flex-start; gap: .4rem;
  font-size: .69rem; color: #6E6E73; line-height: 1.45;
}
.cai-cite-n {
  width: 19px; height: 19px; border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
  font-size: .6rem; font-weight: 700; flex-shrink: 0; margin-top: .05rem;
}
.cai-cite-n.pubmed { background: rgba(11,122,62,.12); color: #0B7A3E; }
.cai-cite-n.trials { background: rgba(0,113,227,.12); color: #0071E3; }
.cai-cite-n.web    { background: rgba(120,80,10,.09);  color: #7A5000; }
.cai-cite-body { flex: 1; min-width: 0; }
.cai-cite-link { color: #1C1C1E; text-decoration: none; font-weight: 500; }
.cai-cite-link:hover { color: #1B3F6E; text-decoration: underline; }
.cai-cite-meta { color: #8E8E93; display: block; margin-top: .05rem; }

/* Input area */
.cai-input-row {
  border-top: 1px solid rgba(0,0,0,.07); padding: .65rem .75rem;
  display: flex; gap: .45rem; align-items: flex-end; flex-shrink: 0; background: #fff;
}
.cai-textarea {
  flex: 1; min-height: 38px; max-height: 96px;
  border: 1.5px solid rgba(0,0,0,.11); border-radius: 12px;
  padding: .52rem .8rem; font-family: inherit; font-size: .83rem;
  color: #1C1C1E; resize: none; outline: none; background: #F5F5F7;
  transition: border-color 140ms, background 140ms; line-height: 1.5; overflow-y: auto;
}
.cai-textarea:focus { border-color: #1B3F6E; background: #fff; box-shadow: 0 0 0 3px rgba(27,63,110,.1); }
.cai-textarea::placeholder { color: #8E8E93; }
.cai-send {
  width: 38px; height: 38px; border-radius: 10px;
  background: #1B3F6E; color: #fff; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  transition: opacity 140ms, transform 120ms;
}
.cai-send:hover { opacity: .87; }
.cai-send:active { transform: scale(.93); }
.cai-send:disabled { opacity: .3; cursor: not-allowed; transform: none; }

/* Footer */
.cai-foot {
  padding: .4rem 1rem; border-top: 1px solid rgba(0,0,0,.05);
  display: flex; align-items: center; justify-content: center;
  gap: .4rem; flex-shrink: 0;
}
.cai-foot-tag { font-size: .59rem; color: #AEAEB2; font-weight: 500; letter-spacing: .02em; }
.cai-foot-dot { width: 2px; height: 2px; border-radius: 50%; background: #D1D1D6; }

/* Mobile */
@media (max-width: 440px) {
  .cai-panel { width: 100vw; }
  .cai-fab { bottom: 20px; right: 18px; }
}
@media (prefers-reduced-motion: reduce) {
  .cai-panel, .cai-fab, .cai-skel { transition: none !important; animation: none !important; }
}
  `;

  // ── HTML ──────────────────────────────────────────────────────────────────
  const ICON_BRAIN = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
  </svg>`;

  const ICON_CLOSE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`;

  const ICON_SEND = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>`;

  const ICON_X = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`;

  const EXAMPLES = [
    'What is the diagnostic accuracy of HeartFlow FFRCT?',
    'HeartFlow vs Cleerly — how do they compare?',
    'Active clinical trials comparing FFRCT to invasive FFR',
    'SCCT 2025 consensus on CT-FFR use criteria',
  ];

  // ── Mount ─────────────────────────────────────────────────────────────────
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  const fab = document.createElement('button');
  fab.className = 'cai-fab';
  fab.setAttribute('aria-label', 'Open CCTA Knowledge Assistant');
  fab.innerHTML = `
    <span class="cai-fab-icon-open">${ICON_BRAIN}</span>
    <span class="cai-fab-icon-close">${ICON_X}</span>
  `;

  const panel = document.createElement('div');
  panel.className = 'cai-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'CCTA Knowledge Assistant');
  panel.innerHTML = `
    <div class="cai-hdr">
      <div class="cai-hdr-mark">${ICON_BRAIN}</div>
      <div class="cai-hdr-text">
        <div class="cai-hdr-title">CCTA Assistant</div>
        <div class="cai-hdr-sub">PubMed · Trials · Guidelines · β</div>
      </div>
      <button class="cai-close" aria-label="Close">${ICON_CLOSE}</button>
    </div>

    <div class="cai-msgs" id="cai-msgs">
      <div class="cai-empty" id="cai-empty">
        <div class="cai-empty-icon">${ICON_BRAIN}</div>
        <div class="cai-empty-title">Ask anything about CCTA</div>
        <div class="cai-empty-sub">FFRCT accuracy, vendor comparisons, clinical trials, and guideline recommendations — with live citations.</div>
        <div class="cai-examples" id="cai-examples"></div>
      </div>
    </div>

    <div class="cai-input-row">
      <textarea
        class="cai-textarea"
        id="cai-input"
        placeholder="Ask about CCTA, FFRCT, vendors…"
        rows="1"
        aria-label="Your question"
      ></textarea>
      <button class="cai-send" id="cai-send" aria-label="Send">${ICON_SEND}</button>
    </div>

    <div class="cai-foot">
      <span class="cai-foot-tag">PubMed</span>
      <span class="cai-foot-dot"></span>
      <span class="cai-foot-tag">ClinicalTrials.gov</span>
      <span class="cai-foot-dot"></span>
      <span class="cai-foot-tag">Web</span>
      <span class="cai-foot-dot"></span>
      <span class="cai-foot-tag">Claude</span>
    </div>
  `;

  document.body.appendChild(panel);
  document.body.appendChild(fab);

  // ── State ─────────────────────────────────────────────────────────────────
  let history  = [];
  let loading  = false;
  let isOpen   = false;

  const msgs    = panel.querySelector('#cai-msgs');
  const input   = panel.querySelector('#cai-input');
  const sendBtn = panel.querySelector('#cai-send');
  const empty   = panel.querySelector('#cai-empty');
  const exWrap  = panel.querySelector('#cai-examples');
  const closeBtn = panel.querySelector('.cai-close');

  // Populate example chips
  EXAMPLES.forEach(ex => {
    const btn = document.createElement('button');
    btn.className = 'cai-ex-btn';
    btn.innerHTML = `<span>${ex}</span><span class="cai-ex-arrow">→</span>`;
    btn.addEventListener('click', () => ask(ex));
    exWrap.appendChild(btn);
  });

  // ── Toggle ────────────────────────────────────────────────────────────────
  function open() {
    isOpen = true;
    panel.classList.add('open');
    fab.classList.add('open');
    setTimeout(() => input.focus(), 320);
  }
  function close() {
    isOpen = false;
    panel.classList.remove('open');
    fab.classList.remove('open');
  }

  fab.addEventListener('click', () => isOpen ? close() : open());
  closeBtn.addEventListener('click', close);

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen) close();
  });

  // ── Auto-resize textarea ──────────────────────────────────────────────────
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 96) + 'px';
  });

  // Send on Enter (Shift+Enter = newline)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  sendBtn.addEventListener('click', send);

  // ── Send flow ─────────────────────────────────────────────────────────────
  function send() {
    const q = input.value.trim();
    if (!q || loading) return;
    ask(q);
  }

  async function ask(question) {
    if (loading) return;

    // Clear input + hide empty state
    input.value = '';
    input.style.height = 'auto';
    empty.style.display = 'none';

    // Render user bubble
    appendBubble('user', question);
    history.push({ role: 'user', content: question });

    // Skeleton + elapsed timer
    const skelEl = appendSkeleton();
    const timerLabel = skelEl.querySelector('.cai-timer-label');
    let elapsed = 0;
    const timerInterval = setInterval(() => {
      elapsed++;
      if (timerLabel) timerLabel.textContent = `Searching sources · ${elapsed}s`;
    }, 1000);
    loading = true;
    sendBtn.disabled = true;
    scrollBottom();

    try {
      const res = await fetch(CCTA_CHAT_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ question, history: history.slice(0, -1) }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      skelEl.remove();
      const { el: msgEl } = appendBubble('assistant', data.answer || '');
      if (data.citations?.length) appendCitations(msgEl.parentElement, data.citations);
      history.push({ role: 'assistant', content: data.answer || '' });

    } catch (err) {
      skelEl.remove();
      const errMsg = err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')
        ? 'Could not reach the server. Make sure the API is deployed and the URL in chat.js is updated.'
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
    // Render inline [N] citations as superscripts
    bubble.innerHTML = escapeHtml(text).replace(/\[(\d+)\]/g, '<sup>[$1]</sup>');
    wrap.appendChild(bubble);
    msgs.appendChild(wrap);
    return { el: bubble, wrap };
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
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

})();
