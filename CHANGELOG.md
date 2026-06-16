# Changelog

## 2026-06-16

### Fixed
- **Chat widget broken on all browsers and mobile** — browser sends `credentials: 'include'` for rate-limit cookie handling; server was missing `Access-Control-Allow-Credentials: true` in CORS headers. Browser blocked the POST after OPTIONS preflight silently — requests never reached the server. Added the header to `api/chat.js`. ([687de01](../../commit/687de01))

### Changed
- **Removed signup gate** — replaced the full email/name/role/region form with a clean access card. All CTAs (hero, nav, card) now link directly to `/guide`. No friction, no Formspree dependency for guide access. ([4f1b37f](../../commit/4f1b37f))

### Added
- **Evidence Alerts signup** — single email field below the guide CTA, Formspree-backed, subject-tagged as `CCTA Guide — Evidence Alerts signup`. Copy positions it as a utility ("notified when trial results, CPT codes, or consensus statements change — 2–3 emails a year") not a newsletter. ([89f7089](../../commit/89f7089))
- **LinkedIn share button** — secondary outlined button alongside the primary guide CTA; opens LinkedIn's share-offsite dialog with the canonical URL. ([89f7089](../../commit/89f7089))

### Landing page stat corrections (earlier this session)
- Stat block "Clinically Cleared" updated 2 → 7 to reflect current cleared platform count ([31d5de6](../../commit/31d5de6))
- SCCT badge year updated 2025 → 2026 ([31d5de6](../../commit/31d5de6))
- Footer copyright updated 2025 → 2026 ([31d5de6](../../commit/31d5de6))

---

## Stack reference
- Frontend: `index.html` (landing) + `ccta-ai-clinical-guide.html` (guide) — vanilla JS, no framework
- Chat API: `api/chat.js` — Vercel serverless, Claude Sonnet 4.6, PubMed, ClinicalTrials.gov, Tavily
- Hosting: Vercel (production) · Repo: github.com/aethernusnathan/ccta-ai-guide
