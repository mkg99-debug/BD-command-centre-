// Scheduled: weekdays 07:00 SAST (05:00 UTC), email the BD digest to Gmail.
import { sendDigest } from "./digest-lib.mjs";

export default async () => {
  try { console.log("digest sent", JSON.stringify(await sendDigest(24))); }
  catch (e) { console.log("digest skipped:", e.message); }
};

export const config = { schedule: "0 5 * * 1-5" };
