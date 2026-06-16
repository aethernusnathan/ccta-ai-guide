// CCTA Knowledge Assistant — Vercel serverless function
// POST /api/chat  →  { answer: string, citations: Citation[] }
//
// Required env vars (set in Vercel dashboard):
//   ANTHROPIC_API_KEY   — your Anthropic key
//   TAVILY_API_KEY      — your Tavily key (optional; web search disabled without it)
//   ALLOWED_ORIGIN      — comma-separated allowed origins, e.g. "https://aethernusnathan.github.io"
//                         or "*" for open access

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  const origin = req.headers.origin || '';
  const allowed = (process.env.ALLOWED_ORIGIN || '*').split(',').map(s => s.trim());
  // Also allow any *.vercel.app subdomain (preview deployments) and localhost
  const isVercelPreview = /^https?:\/\/[^/]+\.vercel\.app$/.test(origin);
  const isLocalhost     = /^https?:\/\/localhost(:\d+)?$/.test(origin);
  const corsOrigin = allowed.includes('*') || allowed.includes(origin) || isVercelPreview || isLocalhost
    ? (origin || '*') : '';
  if (corsOrigin) res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question, history = [] } = req.body || {};
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({ error: 'Missing question' });
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const TAVILY_KEY    = process.env.TAVILY_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Server not configured' });

  try {
    // ── Step 1: Route — classify intent and extract optimised search queries ──
    const routing = await route(question.trim(), ANTHROPIC_KEY);

    // ── Step 2: Parallel fetch from relevant sources ───────────────────────
    const [pubmedResult, trialsResult, webResult] = await Promise.all([
      routing.sources.includes('pubmed') ? fetchPubMed(routing.queries.pubmed) : { cites: [], text: '' },
      routing.sources.includes('trials') ? fetchTrials(routing.queries.trials) : { cites: [], text: '' },
      (routing.sources.includes('web') && TAVILY_KEY) ? fetchTavily(routing.queries.web, TAVILY_KEY) : { cites: [], text: '' },
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

// ── Router ─────────────────────────────────────────────────────────────────

async function route(question, apiKey) {
  const defaultRouting = {
    sources: ['pubmed', 'web'],
    queries: {
      pubmed: question + ' CCTA FFRCT coronary',
      trials: question,
      web: question + ' CCTA guidelines 2024 2025',
    },
  };
  try {
    const res = await anthropic(apiKey, {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: 'You route CCTA/cardiology literature queries. Respond ONLY with valid JSON, no markdown, no explanation.',
      messages: [{
        role: 'user',
        content: `Question: "${question}"

Return JSON with these exact keys:
{
  "sources": ["pubmed"],              // array — include only relevant: "pubmed", "trials", "web"
  "queries": {
    "pubmed": "optimised PubMed search string (MeSH-style if possible)",
    "trials": "ClinicalTrials.gov search string",
    "web": "web search string for guidelines, consensus, vendor news"
  }
}

Rules:
- Always include "pubmed" unless the question is purely about ongoing trial status.
- Include "trials" if the question asks about active/ongoing/recruiting studies.
- Include "web" if about guidelines, consensus statements, recent vendor news, or regulatory approvals.
- Keep each query string under 10 words.`,
      }],
    });
    return JSON.parse(res.content[0].text);
  } catch (_) {
    return defaultRouting;
  }
}

// ── PubMed ─────────────────────────────────────────────────────────────────

async function fetchPubMed(query) {
  try {
    const term = encodeURIComponent(query);
    const base = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

    // Search
    const searchRes  = await fetch(`${base}/esearch.fcgi?db=pubmed&term=${term}&retmax=5&retmode=json&sort=relevance`);
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

Answer in 2–4 concise sentences. Use inline [N] citations that map to the provided source list.
Never speculate beyond what the sources state. Do not add preamble like "Based on the sources..."

For off-topic questions reply only: "I'm focused on CCTA and cardiac CT topics — try asking about vendor evidence, FFRCT accuracy, plaque imaging, or clinical trials."`;

async function synthesize(question, history, context, apiKey) {
  const prior = history.slice(-6).map(m => ({ role: m.role, content: m.content }));
  const res = await anthropic(apiKey, {
    model:      'claude-sonnet-4-6',
    max_tokens: 600,
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
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic ${res.status}: ${err}`);
  }
  return res.json();
}

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
