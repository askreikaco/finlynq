import { rmSync } from "node:fs";

/** Start every run with an empty mail-capture file. */
export default async function globalSetup() {
  if (process.env.FINLYNQ_EMAIL_CAPTURE) rmSync(process.env.FINLYNQ_EMAIL_CAPTURE, { force: true });
}
