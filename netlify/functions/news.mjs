// Shared: pull Google News RSS per company, tag signals, store in Netlify Blobs.
import { getStore } from "@netlify/blobs";
import companies from "./companies.mjs";

export const store = () => getStore({ name: "bd-command-centre", consistency: "strong" });

// One feed per company name (sectors share companies).
export const baseName = (c) => c.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
export const uniqueNames = () => [...new Set(companies.map((c) => baseName(c.company)))];

const TAGS = [
  ["Funding", /\b(raises?|raised|funding|series [a-f]\b|seed round|investment round|valuation|ipo|listing|acquir\w*|acquisition|merger|stake)\b/i],
  ["Leadership", /\b(appoint\w*|names? new|new (ceo|cto|cio|cfo|coo|chief)|steps? down|resign\w*|joins as|promoted|succeed\w*|retire\w*)\b/i],
  ["Hiring", /\b(hiring|jobs|recruit\w*|retrench\w*|layoffs?|job cuts|headcount|expan\w*|new office|opens)\b/i],
  ["Tech", /\b(ai|cloud|migrat\w*|platform|sap|data|digital transformation|core banking|cyber\w*|outage)\b/i],
];
export const tag = (t) => TAGS.filter(([, re]) => re.test(t)).map(([n]) => n);

const decode = (s) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
   .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();
const pick = (xml, tagName) => { const m = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`)); return m ? decode(m[1]) : ""; };

export function parseRss(xml, name) {
  const items = [];
  const first = name.toLowerCase().split(" ")[0];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    let title = pick(it, "title");
    const source = pick(it, "source");
    if (source && title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3));
    if (!title.toLowerCase().includes(first)) continue; // drop loose matches
    const d = new Date(pick(it, "pubDate"));
    items.push({ title, link: pick(it, "link"), source, date: isNaN(d) ? null : d.toISOString(), tags: tag(title) });
  }
  const seen = new Set();
  return items
    .filter((i) => { const k = i.title.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 8);
}

export async function fetchNews(name) {
  const q = encodeURIComponent(`"${name}" South Africa when:60d`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-ZA&gl=ZA&ceid=ZA:en`;
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 SaltBD/1.0" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return parseRss(await r.text(), name);
}

// Refresh the N stalest companies (keeps each run well inside function time limits).
export async function refreshStalest(n = 15, only = null) {
  const s = store();
  const news = (await s.get("news", { type: "json" })) || {};
  const names = only ? [only] : uniqueNames().sort((a, b) => (news[a]?.at || "").localeCompare(news[b]?.at || "")).slice(0, n);
  const done = [], failed = [];
  for (let i = 0; i < names.length; i += 5) {
    await Promise.all(names.slice(i, i + 5).map(async (name) => {
      try { news[name] = { at: new Date().toISOString(), items: await fetchNews(name) }; done.push(name); }
      catch (e) { failed.push(name + ": " + e.message); }
    }));
  }
  await s.setJSON("news", news);
  return { done, failed };
}
