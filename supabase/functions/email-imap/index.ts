// Leitor IMAP da caixa do Chamô (Hostinger). Lista pastas, busca cabeçalhos (ENVELOPE)
// e corpo de uma mensagem. Trata literais IMAP {N} e decodifica MIME (=?utf-8?..?=).
// Acesso: admin (JWT) OU x-hook-secret. Reusa SMTP_USER/SMTP_PASS.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ADMINS = ["admin@appchamo.com", "suporte@appchamo.com"];
function json(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } }); }

class Imap {
  conn: Deno.TlsConn;
  enc = new TextEncoder();
  dec = new TextDecoder();
  buf = new Uint8Array(0);
  tag = 0;
  constructor(conn: Deno.TlsConn) { this.conn = conn; }
  private async fill() {
    const b = new Uint8Array(16384);
    const n = await this.conn.read(b);
    if (n === null) throw new Error("conn_closed");
    const merged = new Uint8Array(this.buf.length + n);
    merged.set(this.buf); merged.set(b.subarray(0, n), this.buf.length);
    this.buf = merged;
  }
  private async ensure(n: number) { while (this.buf.length < n) await this.fill(); }
  private async readLine(): Promise<string> {
    while (true) {
      for (let i = 0; i + 1 < this.buf.length; i++) {
        if (this.buf[i] === 13 && this.buf[i + 1] === 10) {
          const line = this.dec.decode(this.buf.subarray(0, i));
          this.buf = this.buf.subarray(i + 2);
          return line;
        }
      }
      await this.fill();
    }
  }
  private async readN(n: number): Promise<string> {
    await this.ensure(n);
    const out = this.dec.decode(this.buf.subarray(0, n));
    this.buf = this.buf.subarray(n);
    return out;
  }
  private async logicalLine(): Promise<string> {
    let result = "";
    while (true) {
      const line = await this.readLine();
      const m = line.match(/\{(\d+)\}$/);
      if (m) {
        const lit = await this.readN(Number(m[1]));
        result += line.slice(0, m.index) + '"' + lit.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ") + '"';
      } else { result += line; return result; }
    }
  }
  async greeting() { await this.logicalLine(); }
  async cmd(command: string): Promise<string[]> {
    const t = "a" + (++this.tag);
    await this.conn.write(this.enc.encode(`${t} ${command}\r\n`));
    const lines: string[] = [];
    while (true) { const l = await this.logicalLine(); lines.push(l); if (l.startsWith(t + " ")) return lines; }
  }
}

function tokenize(s: string): any {
  let i = 0;
  function parse(): any {
    const out: any[] = [];
    while (i < s.length) {
      const c = s[i];
      if (c === " ") { i++; continue; }
      if (c === "(") { i++; out.push(parse()); }
      else if (c === ")") { i++; return out; }
      else if (c === '"') {
        i++; let str = "";
        while (i < s.length && s[i] !== '"') { if (s[i] === "\\") i++; str += s[i++]; }
        i++; out.push(str);
      } else {
        let tok = "";
        while (i < s.length && s[i] !== " " && s[i] !== "(" && s[i] !== ")") tok += s[i++];
        out.push(tok === "NIL" ? null : tok);
      }
    }
    return out;
  }
  return parse();
}

function decodeMime(input: string | null): string {
  if (!input) return "";
  let s = input.replace(/\?=\s+=\?/g, "?==?"); // junta encoded-words adjacentes
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, cs, enc, data) => {
    try {
      let bytes: Uint8Array;
      if (enc.toUpperCase() === "B") {
        const bin = atob(data);
        bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      } else {
        const t = data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_x: string, h: string) => String.fromCharCode(parseInt(h, 16)));
        bytes = Uint8Array.from(t, (c) => c.charCodeAt(0));
      }
      return new TextDecoder(cs).decode(bytes);
    } catch { return data; }
  });
}

function addr(a: any): string {
  if (!Array.isArray(a) || a.length === 0) return "";
  const one = a[0];
  if (!Array.isArray(one)) return "";
  const name = decodeMime(one[0]); const mailbox = one[2]; const host = one[3];
  const email = mailbox && host ? `${mailbox}@${host}` : (mailbox || "");
  return name ? `${name} <${email}>` : email;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const hook = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();
  const gotHook = (req.headers.get("x-hook-secret") || "").trim();
  let authed = false;
  if (hook && gotHook === hook) authed = true;
  else {
    const jwt = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
    if (jwt) {
      const app = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user } } = await app.auth.getUser(jwt);
      if (user && ADMINS.includes((user.email || "").toLowerCase())) authed = true;
    }
  }
  if (!authed) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "fetch");
  const folder = String(body.folder || "INBOX");
  const limit = Math.min(Number(body.limit || 30), 60);
  const host = String(body.host || "imap.hostinger.com");
  const user2 = Deno.env.get("SMTP_USER") || "";
  const pass = Deno.env.get("SMTP_PASS") || "";
  if (!user2 || !pass) return json({ error: "smtp_creds_missing" }, 500);

  let conn: Deno.TlsConn | null = null;
  try {
    conn = await Deno.connectTls({ hostname: host, port: 993 });
    const im = new Imap(conn);
    await im.greeting();
    const login = await im.cmd(`LOGIN "${user2}" "${pass.replace(/"/g, '\\"')}"`);
    if (!login.some((l) => /a\d+ OK/.test(l))) { conn.close(); return json({ error: "login_failed", detail: login.slice(-2) }, 200); }

    if (action === "list") {
      const res = await im.cmd('LIST "" "*"');
      const folders = res.filter((l) => l.startsWith("* LIST")).map((l) => { const m = l.match(/"([^"]*)"\s*$/) || l.match(/([^ ]+)\s*$/); return m ? m[1] : l; });
      await im.cmd("LOGOUT"); conn.close();
      return json({ ok: true, folders });
    }

    if (action === "body") {
      const uid = String(body.uid || "");
      await im.cmd(`SELECT "${folder}"`);
      const res = await im.cmd(`UID FETCH ${uid} (BODY.PEEK[TEXT])`);
      await im.cmd("LOGOUT"); conn.close();
      // o corpo veio como literal -> está entre aspas no logical line
      const joined = res.join("\n");
      const m = joined.match(/"([\s\S]*)"/);
      let text = m ? m[1] : "";
      text = text.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_x, h) => String.fromCharCode(parseInt(h, 16)));
      return json({ ok: true, text: text.slice(0, 20000) });
    }

    const sel = await im.cmd(`SELECT "${folder}"`);
    if (!sel.some((l) => /a\d+ OK/.test(l))) { await im.cmd("LOGOUT"); conn.close(); return json({ error: "select_failed", detail: sel.slice(-2) }, 200); }
    const total = Number(sel.find((l) => /EXISTS/.test(l))?.match(/\* (\d+) EXISTS/)?.[1] || 0);
    if (total === 0) { await im.cmd("LOGOUT"); conn.close(); return json({ ok: true, total: 0, messages: [] }); }
    const from = Math.max(1, total - limit + 1);
    const fetchRes = await im.cmd(`FETCH ${from}:${total} (UID FLAGS ENVELOPE)`);
    await im.cmd("LOGOUT"); conn.close();

    const messages: any[] = [];
    for (const line of fetchRes) {
      if (!line.startsWith("* ") || !/FETCH/.test(line)) continue;
      const tok = tokenize(line.replace(/^\* \d+ FETCH /, ""));
      const arr = Array.isArray(tok) && Array.isArray(tok[0]) ? tok[0] : tok;
      let uid = null, flags: any[] = [], env: any = null;
      for (let k = 0; k < arr.length; k++) {
        if (arr[k] === "UID") uid = arr[k + 1];
        if (arr[k] === "FLAGS") flags = arr[k + 1] || [];
        if (arr[k] === "ENVELOPE") env = arr[k + 1];
      }
      if (env) messages.push({
        uid, date: env[0] || null, subject: decodeMime(env[1]) || "(sem assunto)",
        from: addr(env[2]), to: addr(env[5]),
        seen: Array.isArray(flags) && flags.includes("\\Seen"),
      });
    }
    messages.reverse();
    return json({ ok: true, total, messages });
  } catch (e) {
    try { conn?.close(); } catch (_) { /* */ }
    return json({ error: "imap_error", detail: String((e as Error)?.message || e) }, 200);
  }
});
