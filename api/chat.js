// CCTA Knowledge Assistant — Vercel serverless function
// POST /api/chat  →  { answer: string, citations: Citation[] }
//
// Required env vars (set in Vercel dashboard):
//   ANTHROPIC_API_KEY   — your Anthropic key
//   TAVILY_API_KEY      — your Tavily key (optional; web search disabled without it)
//   ALLOWED_ORIGIN      — comma-separated allowed origins, e.g. "https://aethernusnathan.github.io"
//                         or "*" for open access

export const config = { maxDuration: 30 };

// ── Rate limiting (cookie-based) ───────────────────────────────────────────
const RL_COOKIE   = 'ccta_rl';
const RL_LIMIT    = 20;              // max requests per window per browser
const RL_WINDOW   = 24 * 3600000;   // 24-hour rolling window

function parseRLCookie(cookieHeader) {
  const m = (cookieHeader || '').match(/ccta_rl=([A-Za-z0-9+/=]+)/);
  if (!m) return { count: 0, windowStart: Date.now() };
  try {
    const [ts, cnt] = Buffer.from(m[1], 'base64').toString().split(':').map(Number);
    if (isNaN(ts) || isNaN(cnt)) throw new Error();
    if (Date.now() - ts > RL_WINDOW) return { count: 0, windowStart: Date.now() };
    return { count: cnt, windowStart: ts };
  } catch {
    return { count: 0, windowStart: Date.now() };
  }
}

function setRLCookie(res, windowStart, count) {
  const val  = Buffer.from(`${windowStart}:${count}`).toString('base64');
  const age  = Math.ceil((windowStart + RL_WINDOW - Date.now()) / 1000);
  // SameSite=None;Secure required for cross-origin (GitHub Pages → Vercel)
  res.setHeader('Set-Cookie',
    `${RL_COOKIE}=${val}; Path=/api/chat; HttpOnly; Secure; SameSite=None; Max-Age=${age}`);
}

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  const origin = req.headers.origin || '';
  const allowed = (process.env.ALLOWED_ORIGIN || '*').split(',').map(s => s.trim());
  // Always allow the project's own front-ends, regardless of the ALLOWED_ORIGIN
  // env var — the GitHub Pages host must get an Access-Control-Allow-Origin
  // header or every browser blocks the cross-origin chat request.
  const KNOWN_ORIGINS = [
    'https://aethernusnathan.github.io',
    'https://ccta-ai-guide.vercel.app',
  ];
  // Also allow any *.vercel.app subdomain (preview deployments) and localhost
  const isVercelPreview = /^https?:\/\/[^/]+\.vercel\.app$/.test(origin);
  const isLocalhost     = /^https?:\/\/localhost(:\d+)?$/.test(origin);
  const corsOrigin =
    allowed.includes('*') || allowed.includes(origin) ||
    KNOWN_ORIGINS.includes(origin) || isVercelPreview || isLocalhost
      ? (origin || '*') : '';
  if (corsOrigin) res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Rate limit check ──────────────────────────────────────────────────────
  const { count, windowStart } = parseRLCookie(req.headers.cookie);
  if (count >= RL_LIMIT) {
    const resetIn = Math.ceil((windowStart + RL_WINDOW - Date.now()) / 3600000);
    return res.status(429).json({
      error: `Daily limit of ${RL_LIMIT} queries reached. Resets in ~${resetIn} hour${resetIn !== 1 ? 's' : ''}.`,
    });
  }
  setRLCookie(res, windowStart, count + 1);

  // Body may arrive as a parsed object (application/json) or a raw string
  // (text/plain — used by the client to avoid a CORS preflight in Safari).
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { question, history = [] } = body || {};
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({ error: 'Missing question' });
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const TAVILY_KEY    = process.env.TAVILY_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Server not configured' });

  try {
    const q = question.trim();

    // ── Step 1: Fast keyword routing (no LLM call) ─────────────────────────
    const qLow = q.toLowerCase();
    const wantsTrials = /trial|recruiting|ongoing|active stud|registered|nct\d/i.test(qLow);
    // Always run a live web pass (when Tavily is configured) so vendor, news,
    // approval, pricing and other real-time questions get current results —
    // PubMed alone often returns nothing relevant for these.
    const wantsWeb    = true;
    const pubmedQ = q.length > 80 ? q.substring(0, 80) : q;
    const routing = {
      sources: ['pubmed', ...(wantsTrials ? ['trials'] : []), ...(wantsWeb ? ['web'] : [])],
      queries: {
        pubmed: `${pubmedQ} CCTA coronary CT`,
        trials: q,
        web:    q,   // use the raw question for the most relevant live results
      },
    };

    // ── Step 2: Parallel fetch from relevant sources ───────────────────────
    const [pubmedResult, trialsResult, webResult] = await Promise.all([
      fetchPubMed(routing.queries.pubmed),
      wantsTrials ? fetchTrials(routing.queries.trials) : { cites: [], text: '' },
      (wantsWeb && TAVILY_KEY) ? fetchTavily(routing.queries.web, TAVILY_KEY) : { cites: [], text: '' },
    ]);

    // Merge and number all citations
    const allCites = [
      ...pubmedResult.cites,
      ...trialsResult.cites,
      ...webResult.cites,
    ].map((c, i) => ({ ...c, n: i + 1 }));

    // Build context block for synthesis
    const pubCtx   = pubmedResult.text  ? `[PubMed abstracts]\n${pubmedResult.text}`   : '';
    const trCtx    = trialsResult.text  ? `[ClinicalTrials.gov]\n${trialsResult.text}` : '';
    const webCtx   = webResult.text     ? `[Web search]\n${webResult.text}`            : '';
    const citeList = allCites.map(c =>
      `[${c.n}] ${c.title}${c.authors ? ` — ${c.authors}` : ''}${c.journal ? `, ${c.journal}` : ''}${c.year ? ` (${c.year})` : ''}${c.status ? ` [${c.status}]` : ''} · ${c.url}`
    ).join('\n');
    const context = [pubCtx, trCtx, webCtx, citeList ? `\nCitation list:\n${citeList}` : '']
      .filter(Boolean).join('\n\n');

    if (allCites.length === 0) {
      // Nothing found — synthesise from Claude's knowledge only, scoped to CCTA
      const answer = await synthesizeFromKnowledge(question.trim(), history, ANTHROPIC_KEY);
      return res.status(200).json({ answer, citations: [] });
    }

    // ── Step 3: Synthesise ─────────────────────────────────────────────────
    const answer = await synthesize(question.trim(), history, context, ANTHROPIC_KEY);
    return res.status(200).json({ answer, citations: allCites });

  } catch (err) {
    console.error('chat handler error:', err);
    return res.status(500).json({ error: 'Something went wrong — please try again.' });
  }
}

// ── PubMed ─────────────────────────────────────────────────────────────────

async function fetchPubMed(query) {
  try {
    const term = encodeURIComponent(query);
    const base = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

    // Search
    const searchRes  = await fetch(`${base}/esearch.fcgi?db=pubmed&term=${term}&retmax=4&retmode=json&sort=relevance`);
    const searchData = await searchRes.json();
    const ids        = searchData.esearchresult?.idlist || [];
    if (ids.length === 0) return { cites: [], text: '' };

    // Metadata
    const summaryRes  = await fetch(`${base}/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`);
    const summaryData = await summaryRes.json();

    // Abstracts for top 4
    const abstractRes  = await fetch(`${base}/efetch.fcgi?db=pubmed&id=${ids.slice(0, 4).join(',')}&rettype=abstract&retmode=text`);
    const abstractText = await abstractRes.text();

    const cites = ids.map(pmid => {
      const doc = summaryData.result?.[pmid];
      if (!doc) return null;
      const authors = (doc.authors || []).slice(0, 3).map(a => a.name).join(', ')
        + (doc.authors?.length > 3 ? ' et al.' : '');
      return {
        source:  'pubmed',
        title:   stripHtml(doc.title || `PMID ${pmid}`),
        url:     `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        authors,
        journal: doc.source || '',
        year:    (doc.pubdate || '').split(' ')[0],
      };
    }).filter(Boolean);

    return { cites, text: abstractText.substring(0, 6000) };
  } catch (e) {
    console.error('PubMed error:', e);
    return { cites: [], text: '' };
  }
}

// ── ClinicalTrials.gov ─────────────────────────────────────────────────────

async function fetchTrials(query) {
  try {
    const term = encodeURIComponent(query);
    const url  = `https://clinicaltrials.gov/api/v2/studies?query.term=${term}&fields=NCTId,BriefTitle,OverallStatus,Phase,BriefSummary&pageSize=5&format=json`;
    const res  = await fetch(url);
    const data = await res.json();

    const cites = (data.studies || []).map(s => {
      const id  = s.protocolSection;
      const nct = id?.identificationModule?.nctId;
      return {
        source:  'trials',
        title:   id?.identificationModule?.briefTitle || nct || 'Clinical trial',
        url:     `https://clinicaltrials.gov/study/${nct}`,
        status:  id?.statusModule?.overallStatus || '',
        summary: id?.descriptionModule?.briefSummary || '',
      };
    });

    const text = cites.map(c =>
      `${c.title} [${c.status}]\n${c.url}\n${c.summary.substring(0, 300)}`
    ).join('\n\n');

    return { cites, text };
  } catch (e) {
    console.error('Trials error:', e);
    return { cites: [], text: '' };
  }
}

// ── Tavily ─────────────────────────────────────────────────────────────────

async function fetchTavily(query, apiKey) {
  try {
    const res  = await fetch('https://api.tavily.com/search', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        api_key:       apiKey,
        query:         query,
        search_depth:  'basic',
        max_results:   5,
        include_answer: false,
      }),
    });
    const data = await res.json();

    const cites = (data.results || []).map(r => ({
      source:  'web',
      title:   r.title || 'Web result',
      url:     r.url,
      summary: r.content || '',
    }));

    const text = cites.map(c =>
      `${c.title}\n${c.url}\n${c.summary.substring(0, 400)}`
    ).join('\n\n');

    return { cites, text };
  } catch (e) {
    console.error('Tavily error:', e);
    return { cites: [], text: '' };
  }
}

// ── Synthesis ──────────────────────────────────────────────────────────────

const SYSTEM = `You are a CCTA clinical knowledge assistant for cardiologists. You answer questions about:
coronary CT angiography (CCTA), FFRCT, CT-derived FFR, AI plaque analysis, coronary CTA vendors
(HeartFlow, Cleerly, Keya Medical, Caristo, Elucid, Circle CVI, Artrya, Siemens, Spimed-AI, etc.),
and related cardiac imaging topics.

Answer concisely and helpfully (2–5 sentences). When the provided sources are
relevant, ground your answer in them and add inline [N] citations that map to the
source list. When the sources do NOT cover the question, answer directly from your
established knowledge of CCTA, FFRCT, plaque AI, and the named vendors — be genuinely
useful, do not refuse, and do not say things like "the provided sources do not
contain…". The only hard rule: never fabricate specific statistics, trial results,
regulatory clearances, or citation numbers — state those only when a source supports
them, otherwise speak in general terms. Do not add preamble like "Based on the
sources…"; just answer.

For off-topic (non-cardiac-CT) questions reply only: "I'm focused on CCTA and cardiac CT topics — try asking about vendor evidence, FFRCT accuracy, plaque imaging, or clinical trials."`;

async function synthesize(question, history, context, apiKey) {
  const prior = history.slice(-6).map(m => ({ role: m.role, content: m.content }));
  const res = await anthropic(apiKey, {
    model:      'claude-sonnet-4-6',
    max_tokens: 450,
    system:     SYSTEM,
    messages:   [
      ...prior,
      {
        role:    'user',
        content: `Question: ${question}\n\nSources:\n${context}\n\nAnswer concisely with [N] inline citations.`,
      },
    ],
  });
  return res.content[0].text.trim();
}

async function synthesizeFromKnowledge(question, history, apiKey) {
  const prior = history.slice(-6).map(m => ({ role: m.role, content: m.content }));
  const res = await anthropic(apiKey, {
    model:      'claude-sonnet-4-6',
    max_tokens: 500,
    system:     SYSTEM,
    messages:   [
      ...prior,
      { role: 'user', content: question },
    ],
  });
  return res.content[0].text.trim();
}

// ── Anthropic helper ───────────────────────────────────────────────────────

async function anthropic(apiKey, body) {
  // Retry on transient overload / rate-limit / upstream errors so a brief
  // Anthropic hiccup doesn't surface as a 500 to the chat user.
  const RETRYABLE = new Set([429, 500, 502, 503, 529]);
  const MAX_ATTEMPTS = 3;
  let lastErr;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastErr = e; // network error — retry
      if (attempt < MAX_ATTEMPTS) { await sleep(400 * attempt); continue; }
      throw e;
    }

    if (res.ok) return res.json();

    const errText = await res.text();
    lastErr = new Error(`Anthropic ${res.status}: ${errText}`);
    if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS) {
      await sleep(400 * attempt);
      continue;
    }
    throw lastErr;
  }
  throw lastErr;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
