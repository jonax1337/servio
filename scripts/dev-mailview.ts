/**
 * Dev-only: fetch a delivered message from a GreenMail mailbox and render it as a
 * mail-client view (From / To / Cc / Subject + the real HTML body) to an .html file
 * you can open in a browser. This is exactly what the recipient sees.
 *
 *   pnpm exec tsx --env-file=.env scripts/dev-mailview.ts --user sabine.neu@example.com
 *   pnpm exec tsx --env-file=.env scripts/dev-mailview.ts --user kollege@example.com --index 0
 *
 * --index 0 = newest (default). --out overrides the output path.
 */
import { writeFileSync } from "node:fs";
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
function addrs(o: AddressObject | AddressObject[] | undefined): string {
  if (!o) return "";
  const arr = Array.isArray(o) ? o : [o];
  return arr.flatMap((a) => (a.value ?? []).map((v) => (v.name ? `${v.name} <${v.address}>` : v.address ?? ""))).join(", ");
}
const esc = (s: string) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function main() {
  const user = arg("user", "support@localhost")!;
  const index = Number(arg("index", "0"));
  const out = arg("out", ".playwright-mcp/mailview.html")!;

  const client = new ImapFlow({
    host: arg("host", "localhost")!,
    port: Number(arg("port", "3143")),
    secure: false,
    auth: { user, pass: arg("pass", "test")! },
    tls: { rejectUnauthorized: false },
    logger: false,
  });

  await client.connect();
  let raw: Buffer | null = null;
  const lock = await client.getMailboxLock("INBOX");
  try {
    const uids: number[] = [];
    for await (const m of client.fetch("1:*", { uid: true })) uids.push(m.uid);
    if (uids.length === 0) throw new Error(`Mailbox for ${user} is empty.`);
    uids.reverse(); // newest first
    const uid = uids[Math.min(index, uids.length - 1)];
    const dl = await client.download(String(uid), undefined, { uid: true });
    const chunks: Buffer[] = [];
    for await (const c of dl.content) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    raw = Buffer.concat(chunks);
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }

  const p = await simpleParser(raw!);
  const from = addrs(p.from);
  const to = addrs(p.to);
  const cc = addrs(p.cc);
  const subject = p.subject ?? "(no subject)";
  const bodyHtml = typeof p.html === "string" ? p.html : `<pre>${esc(p.text ?? "")}</pre>`;

  const page = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{margin:0;background:#e8eaed;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#202124}
  .wrap{max-width:760px;margin:24px auto;background:#fff;border-radius:12px;box-shadow:0 1px 6px rgba(0,0,0,.15);overflow:hidden}
  .hdr{padding:18px 24px;border-bottom:1px solid #e5e7eb}
  .subj{font-size:20px;font-weight:600;margin:0 0 10px}
  .row{font-size:13px;color:#5f6368;margin:2px 0}
  .row b{color:#202124;font-weight:600}
  .cc{color:#8430ce}
  iframe{width:100%;border:0;height:640px;background:#fff}
</style></head><body>
  <div class="wrap">
    <div class="hdr">
      <p class="subj">${esc(subject)}</p>
      <div class="row"><b>From:</b> ${esc(from)}</div>
      <div class="row"><b>To:</b> ${esc(to)}</div>
      ${cc ? `<div class="row cc"><b>Cc:</b> ${esc(cc)}</div>` : `<div class="row" style="color:#9aa0a6">Cc: —</div>`}
    </div>
    <iframe sandbox srcdoc="${bodyHtml.replace(/"/g, "&quot;")}"></iframe>
  </div>
</body></html>`;

  writeFileSync(out, page, "utf8");
  console.log(`✓ ${user} — newest[${index}]: "${subject}"`);
  console.log(`  From: ${from}`);
  console.log(`  To:   ${to}`);
  console.log(`  Cc:   ${cc || "—"}`);
  console.log(`  → wrote ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
