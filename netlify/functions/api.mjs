import { getStore } from "@netlify/blobs";
import { refreshStalest, baseName } from "./news.mjs";
import { sendDigest, buildDigest } from "./digest-lib.mjs";
import companies from "./companies.mjs";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });

const FIELDS = ["status", "owner", "follow", "notes"];
const LABEL = { status: "Status", owner: "Owner", follow: "Follow-up", notes: "Notes" };

export default async (req, context) => {
  const pw = (globalThis.Netlify?.env?.get("TEAM_PASSWORD")) ?? process.env.TEAM_PASSWORD;
  if (!pw) return json({ error: "TEAM_PASSWORD is not set on this Netlify site" }, 500);
  if (req.headers.get("x-team-password") !== pw) return json({ error: "unauthorised" }, 401);

  const op = context.params?.op || new URL(req.url).pathname.split("/").pop();
  const store = getStore({ name: "bd-command-centre", consistency: "strong" });

  if (op === "data" && req.method === "GET") return json({ companies });

  if (op === "news" && req.method === "GET") {
    return json({ news: (await store.get("news", { type: "json" })) || {} });
  }

  if (op === "digest" && req.method === "POST") {
    try { return json({ ok: true, ...(await sendDigest(24)) }); }
    catch (e) { return json({ error: e.message }, 400); }
  }
  if (op === "digest-preview" && req.method === "GET") {
    const d = await buildDigest(24);
    return new Response(d.html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }

  if (op === "refresh" && req.method === "POST") {
    let body = {};
    try { body = await req.json(); } catch {}
    const known = companies.find((c) => c.id === body.id);
    // one company on demand, or the 15 stalest if none given (also used to seed on first open)
    const r = await refreshStalest(15, known ? baseName(known.company) : null);
    return json({ ...r, news: (await store.get("news", { type: "json" })) || {} });
  }

  if (op === "state" && req.method === "GET") {
    const [state, log] = await Promise.all([
      store.get("state", { type: "json" }),
      store.get("log", { type: "json" }),
    ]);
    return json({ state: state || {}, log: log || [] });
  }

  if (op === "state" && req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const known = companies.find((c) => c.id === body.id);
    if (!known) return json({ error: "unknown company" }, 400);
    let user = "Someone";
    try { user = decodeURIComponent(req.headers.get("x-user") || "Someone").slice(0, 40); } catch {}

    const state = (await store.get("state", { type: "json" })) || {};
    const cur = state[body.id] || {};
    const changed = [];
    for (const k of FIELDS) {
      if (body.patch && k in body.patch) {
        const v = String(body.patch[k] ?? "").slice(0, 4000);
        if (cur[k] !== v) { cur[k] = v; changed.push(k); }
      }
    }
    const at = new Date().toISOString();
    cur.by = user; cur.at = at;
    state[body.id] = cur;
    await store.setJSON("state", state);

    let log = (await store.get("log", { type: "json" })) || [];
    for (const k of changed) {
      const what = k === "notes" ? "Notes updated" : `${LABEL[k]} → ${cur[k] || "cleared"}`;
      // collapse rapid repeat note edits by the same person
      if (k === "notes" && log[0] && log[0].user === user && log[0].company === known.company && log[0].what === what) { log[0].at = at; continue; }
      log.unshift({ at, user, company: known.company, sector: known.sector, what });
    }
    log = log.slice(0, 60);
    await store.setJSON("log", log);
    return json({ ok: true, item: cur, log });
  }

  return json({ error: "not found" }, 404);
};

export const config = { path: "/api/:op" };
