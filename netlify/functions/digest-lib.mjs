// Builds and sends the BD digest email through Gmail (SMTP + App Password).
import nodemailer from "nodemailer";
import companies from "./companies.mjs";
import { store, baseName } from "./news.mjs";

const env = (k) => (globalThis.Netlify?.env?.get(k)) ?? process.env[k];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hours = (d) => (d ? (Date.now() - new Date(d)) / 36e5 : 1e9);
const today = () => new Date().toISOString().slice(0, 10);

export async function buildDigest(windowHours = 24) {
  const s = store();
  const [state, log, news] = await Promise.all([
    s.get("state", { type: "json" }).then((x) => x || {}),
    s.get("log", { type: "json" }).then((x) => x || []),
    s.get("news", { type: "json" }).then((x) => x || {}),
  ]);

  const due = companies
    .map((c) => ({ c, st: state[c.id] || {} }))
    .filter(({ st }) => st.follow && st.follow <= today() && !["Client", "Not now"].includes(st.status))
    .sort((a, b) => a.st.follow.localeCompare(b.st.follow));

  const signals = [];
  const seen = new Set();
  for (const [name, n] of Object.entries(news)) {
    for (const i of n.items || []) {
      const t = (i.tags || []).filter((x) => x !== "Tech");
      if (!t.length || hours(i.date) > windowHours || seen.has(i.title)) continue;
      seen.add(i.title);
      signals.push({ name, ...i, t });
    }
  }
  signals.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const activity = log.filter((l) => hours(l.at) <= windowHours);
  const url = env("URL") || "";

  const section = (title, rows) => `<h3 style="font:600 15px Arial;color:#0f2a3d;margin:22px 0 8px">${title}</h3>${rows}`;
  const none = (t) => `<p style="font:13px Arial;color:#5b6b78;margin:0">${t}</p>`;
  const li = (html) => `<li style="font:13px/1.45 Arial;color:#14212b;margin:0 0 7px">${html}</li>`;

  const html = `<div style="max-width:640px;margin:0 auto;padding:8px">
  <div style="background:#0f2a3d;color:#fff;padding:16px 18px;border-radius:10px">
    <div style="font:700 17px Arial">Salt BD Command Centre · SA SMEs</div>
    <div style="font:12px Arial;color:#b7c7d3;margin-top:3px">Daily digest · ${new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Johannesburg" })}</div>
  </div>
  ${section(`Follow-ups due (${due.length})`, due.length ? `<ul style="padding-left:18px;margin:0">${due.map(({ c, st }) => li(`<b>${esc(c.company)}</b> · ${esc(c.sector)} · ${esc(st.status || "Not started")}${st.owner ? " · " + esc(st.owner) : ""} · due ${esc(st.follow)}${st.notes ? `<br><span style="color:#5b6b78">${esc(st.notes.slice(0, 160))}</span>` : ""}`)).join("")}</ul>` : none("Nothing due."))}
  ${section(`New signals, last ${windowHours}h (${signals.length})`, signals.length ? `<ul style="padding-left:18px;margin:0">${signals.slice(0, 25).map((i) => li(`<b>${esc(i.name)}</b> <span style="color:#0e8f8a">[${i.t.join(", ")}]</span><br><a href="${esc(i.link)}" style="color:#14212b">${esc(i.title)}</a> <span style="color:#5b6b78">· ${esc(i.source)}</span>`)).join("")}</ul>` : none("No funding, leadership or hiring news."))}
  ${section(`Team updates, last ${windowHours}h (${activity.length})`, activity.length ? `<ul style="padding-left:18px;margin:0">${activity.slice(0, 30).map((l) => li(`<b>${esc(l.user)}</b> · ${esc(l.company)}: ${esc(l.what)}`)).join("")}</ul>` : none("No team updates."))}
  ${url ? `<p style="margin:24px 0 0"><a href="${esc(url)}" style="background:#0e8f8a;color:#fff;padding:10px 16px;border-radius:8px;font:600 13px Arial;text-decoration:none">Open the dashboard</a></p>` : ""}
</div>`;

  const subject = `BD digest: ${due.length} follow-up${due.length === 1 ? "" : "s"}, ${signals.length} signal${signals.length === 1 ? "" : "s"}, ${activity.length} team update${activity.length === 1 ? "" : "s"}`;
  return { subject, html, counts: { due: due.length, signals: signals.length, activity: activity.length } };
}

export async function sendDigest(windowHours = 24) {
  const user = env("GMAIL_USER"), pass = env("GMAIL_APP_PASSWORD");
  if (!user || !pass) throw new Error("Gmail isn't set up yet: add GMAIL_USER and GMAIL_APP_PASSWORD in Netlify");
  const to = env("DIGEST_TO") || user;
  const d = await buildDigest(windowHours);
  const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass: pass.replace(/\s+/g, "") } });
  await t.sendMail({ from: `"Salt BD Command Centre" <${user}>`, to, subject: d.subject, html: d.html });
  return { to, ...d.counts };
}
