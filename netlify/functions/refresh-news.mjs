// Scheduled: every hour refresh the 15 stalest companies, so every company is re-scanned every ~6 hours.
import { refreshStalest } from "./news.mjs";

export default async () => {
  const r = await refreshStalest(15);
  console.log("news refresh", JSON.stringify(r));
};

export const config = { schedule: "17 * * * *" };
