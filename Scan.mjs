
// scan.mjs — Otonom günlük tarayıcı (Node 20+, sıfır bağımlılık)
const UNIVERSE = {
  tr: ["THYAO","ASELS","KCHOL","BIMAS","EREGL","FROTO","TUPRS","SISE","AKBNK","GARAN","TCELL","KOZAL"],
  us: ["AAPL","MSFT","NVDA","GOOGL","AMZN","META","AVGO","JPM","LLY","COST","UNH","V"],
  eu: ["ASML.AS","SAP.DE","MC.PA","NESN.SW","OR.PA","SIE.DE","NOVN.SW","IBE.MC","ISP.MI","SHEL.L","AZN.L","AIR.PA"]
};
const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];

async function chart(symbol) {
  for (const h of HOSTS) {
    try {
      const u = `${h}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
      const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) continue;
      const j = await r.json();
      const res = j && j.chart && j.chart.result && j.chart.result[0];
      if (!res) continue;
      const q = res.indicators && res.indicators.quote && res.indicators.quote[0];
      const closes = ((q && q.close) || []).filter((x) => x != null);
      const meta = res.meta || {};
      if (closes.length > 30) return { closes, currency: meta.currency, price: meta.regularMarketPrice != null ? meta.regularMarketPrice : closes[closes.length - 1], hi52: meta.fiftyTwoWeekHigh, lo52: meta.fiftyTwoWeekLow };
    } catch (e) {}
  }
  return null;
}
function sma(a, n) { if (a.length < n) return null; let s = 0; for (let i = a.length - n; i < a.length; i++) s += a[i]; return s / n; }
function rsi(a, n = 14) { if (a.length < n + 1) return null; let g = 0, l = 0; for (let i = a.length - n; i < a.length; i++) { const d = a[i] - a[i - 1]; if (d >= 0) g += d; else l -= d; } const rs = l === 0 ? 100 : g / l; return 100 - 100 / (1 + rs); }
function score(d) {
  const c = d.closes, price = d.price != null ? d.price : c[c.length - 1];
  const first = c[0], last = c[c.length - 1];
  const m21 = c.length > 22 ? c[c.length - 22] : c[0];
  const chg1m = m21 ? (last / m21 - 1) * 100 : null;
  const chg1y = first ? (last / first - 1) * 100 : null;
  const hi = d.hi52 != null ? d.hi52 : Math.max(...c), lo = d.lo52 != null ? d.lo52 : Math.min(...c);
  const pos52 = hi > lo ? (last - lo) / (hi - lo) * 100 : null;
  const sc = (v, a, b, cc, dd) => v == null ? null : v >= a ? 100 : v >= b ? 75 : v >= cc ? 50 : v >= dd ? 28 : 12;
  const mS = [sc(chg1m, 8, 3, 0, -5), sc(chg1y, 40, 15, 0, -15), pos52 == null ? null : (pos52 >= 80 ? 90 : pos52 >= 60 ? 72 : pos52 >= 40 ? 52 : pos52 >= 20 ? 34 : 18)].filter((x) => x != null);
  const mom = mS.length ? Math.round(mS.reduce((a, b) => a + b, 0) / mS.length) : null;
  const s50 = sma(c, 50), s200 = sma(c, 200), r = rsi(c);
  let t = 50;
  if (s50 && s200) { if (price > s50 && s50 > s200) t = 85; else if (price > s50) t = 68; else if (price > s200) t = 52; else t = 30; }
  if (r != null) { if (r > 70) t -= 8; else if (r < 30) t += 6; else if (r >= 45 && r <= 65) t += 4; }
  const tech = Math.max(0, Math.min(100, Math.round(t)));
  const composite = Math.round((mom != null ? mom : 50) * 0.5 + tech * 0.5);
  return { score: composite, mom, tech, chg1m: chg1m == null ? null : +chg1m.toFixed(1), chg1y: chg1y == null ? null : +chg1y.toFixed(1), pos52: pos52 == null ? null : +pos52.toFixed(1), price, currency: d.currency };
}
async function aiNote(picks) {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) return null;
  try {
    const top = picks.slice(0, 8).map((p) => p.kod).join(", ");
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 600, messages: [{ role: "user", content: `Bugünün küresel piyasa/borsa durumunu web'de kısaca araştır ve 2-3 cümlede Türkçe özetle. Öne çıkan momentum hisseleri: ${top}. SADECE JSON döndür: {"note":"...","sentiment":"pozitif|notr|negatif"}` }], tools: [{ type: "web_search_20250305", name: "web_search" }] }) });
    if (!res.ok) return null;
    const j = await res.json(); const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const m = text.match(/\{[\s\S]*\}/); if (!m) return null; return JSON.parse(m[0]);
  } catch (e) { return null; }
}
async function main() {
  const entries = [];
  for (const mk of ["tr", "us", "eu"]) for (const k of UNIVERSE[mk]) entries.push({ kod: k, market: mk });
  const picks = [];
  for (let i = 0; i < entries.length; i += 5) {
    const batch = entries.slice(i, i + 5);
    const rs = await Promise.allSettled(batch.map((e) => chart(e.market === "tr" ? e.kod + ".IS" : e.kod)));
    rs.forEach((r, j) => {
      if (r.status === "fulfilled" && r.value) {
        const e = batch[j], s = score(r.value);
        const vals = {}; if (s.chg1m != null) vals.chg1m = String(s.chg1m); if (s.chg1y != null) vals.chg1y = String(s.chg1y); if (s.pos52 != null) vals.pos52 = String(s.pos52);
        picks.push({ kod: e.kod, market: e.market, currency: s.currency || (e.market === "us" ? "USD" : e.market === "eu" ? "EUR" : "TRY"), fiyat: s.price != null ? +(+s.price).toFixed(2) : null, score: s.score, mom: s.mom, tech: s.tech, chg1m: s.chg1m, chg1y: s.chg1y, vals });
      }
    });
  }
  picks.sort((a, b) => b.score - a.score);
  picks.forEach((p) => { p.bucket = p.score >= 66 ? "al" : p.score >= 46 ? "izle" : "zayif"; });
  const ai = await aiNote(picks);
  const report = { date: new Date().toISOString().slice(0, 10), generatedAt: new Date().toISOString(), count: picks.length, picks, note: ai ? ai.note : null, sentiment: ai ? ai.sentiment : null, disclaimer: "Otomatik momentum/teknik taraması. Yatırım tavsiyesi değildir." };
  const fs = await import("node:fs"); fs.writeFileSync("report.json", JSON.stringify(report, null, 2));
  console.log("wrote report.json with", picks.length, "picks");
}
main();
