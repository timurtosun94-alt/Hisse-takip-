
// scan.mjs — Otonom günlük tarayıcı v2 (Node 20+, sıfır bağımlılık)
// Daha geniş evren + derin kantitatif metrikler (getiri/oynaklık/drawdown/RSI/trend).
const UNIVERSE = {
  tr: ["THYAO","ASELS","KCHOL","SAHOL","BIMAS","EREGL","FROTO","TUPRS","SISE","AKBNK","GARAN","YKBNK","ISCTR","TCELL","TTKOM","PETKM","KOZAL","KOZAA","PGSUS","SASA","HEKTS","TOASO","ARCLK","EKGYO","ENKAI","TAVHL","GUBRF","KONTR","ALARK","MGROS","ULKER","TTRAK"],
  us: ["AAPL","MSFT","NVDA","GOOGL","AMZN","META","AVGO","TSLA","JPM","V","MA","LLY","UNH","COST","HD","PG","KO","ABBV","WMT","XOM","CVX","JNJ","ORCL","NFLX","AMD","CRM","ADBE","PEP","MRK","BAC","QCOM","TXN"],
  eu: ["ASML.AS","SAP.DE","MC.PA","NESN.SW","OR.PA","SIE.DE","NOVN.SW","ROG.SW","IBE.MC","ISP.MI","ENEL.MI","SHEL.L","AZN.L","HSBA.L","ULVR.L","AIR.PA","SAN.PA","BNP.PA","ALV.DE","DTE.DE","BAS.DE","ENI.MI","SAN.MC","BBVA.MC","RMS.PA","VOW3.DE","MBG.DE","ADS.DE","BN.PA","AI.PA","SU.PA","DG.PA"]
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
const sma = (a, n) => { if (a.length < n) return null; let s = 0; for (let i = a.length - n; i < a.length; i++) s += a[i]; return s / n; };
const rsi = (a, n = 14) => { if (a.length < n + 1) return null; let g = 0, l = 0; for (let i = a.length - n; i < a.length; i++) { const d = a[i] - a[i - 1]; if (d >= 0) g += d; else l -= d; } const rs = l === 0 ? 100 : g / l; return 100 - 100 / (1 + rs); };
const r1 = (x) => x == null ? null : +x.toFixed(1);

function calc(d) {
  const c = d.closes, price = d.price != null ? d.price : c[c.length - 1], last = c[c.length - 1];
  const retN = (n) => { if (c.length <= n) return null; const p = c[c.length - 1 - n]; return p ? (last / p - 1) * 100 : null; };
  const ret1m = retN(21), ret3m = retN(63), ret6m = retN(126), ret1y = c[0] ? (last / c[0] - 1) * 100 : null;
  const rets = []; for (let i = 1; i < c.length; i++) if (c[i - 1] > 0) rets.push(c[i] / c[i - 1] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const variance = rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / ((rets.length - 1) || 1);
  const vol = Math.sqrt(variance) * Math.sqrt(252) * 100;
  let peak = c[0], mdd = 0; for (const x of c) { if (x > peak) peak = x; const dd = (x - peak) / peak; if (dd < mdd) mdd = dd; } const maxDD = mdd * 100;
  const hi = d.hi52 != null ? d.hi52 : Math.max(...c), lo = d.lo52 != null ? d.lo52 : Math.min(...c);
  const pos52 = hi > lo ? (last - lo) / (hi - lo) * 100 : null;
  const s20 = sma(c, 20), s50 = sma(c, 50), s200 = sma(c, 200), r = rsi(c);
  let trend = "belirsiz", trendScore = 50;
  if (s20 && s50 && s200) { if (price > s20 && s20 > s50 && s50 > s200) { trend = "güçlü yükseliş"; trendScore = 92; } else if (price > s50 && s50 > s200) { trend = "yükseliş"; trendScore = 76; } else if (price > s200) { trend = "nötr-pozitif"; trendScore = 58; } else if (price < s50 && s50 < s200) { trend = "düşüş"; trendScore = 22; } else { trend = "zayıf"; trendScore = 40; } }
  const sc = (v, a, b, cc, dd) => v == null ? null : v >= a ? 100 : v >= b ? 75 : v >= cc ? 52 : v >= dd ? 30 : 14;
  const momParts = [sc(ret1m, 8, 3, 0, -6), sc(ret3m, 18, 7, 0, -10), sc(ret6m, 30, 12, 0, -15), pos52 == null ? null : (pos52 >= 80 ? 92 : pos52 >= 60 ? 72 : pos52 >= 40 ? 52 : pos52 >= 20 ? 32 : 16)].filter((x) => x != null);
  const mom = momParts.length ? Math.round(momParts.reduce((a, b) => a + b, 0) / momParts.length) : null;
  let rsiAdj = 0; if (r != null) { if (r > 75) rsiAdj = -8; else if (r < 30) rsiAdj = 5; else if (r >= 45 && r <= 65) rsiAdj = 3; }
  const volPen = vol == null ? 50 : vol < 25 ? 90 : vol < 40 ? 70 : vol < 60 ? 50 : vol < 80 ? 32 : 18;
  const composite = Math.max(0, Math.min(100, Math.round((mom != null ? mom : 50) * 0.45 + trendScore * 0.40 + volPen * 0.15 + rsiAdj)));
  return { score: composite, mom, trend, rsi: r == null ? null : Math.round(r), vol: r1(vol), maxDD: r1(maxDD), pos52: r1(pos52), ret1m: r1(ret1m), ret3m: r1(ret3m), ret6m: r1(ret6m), ret1y: r1(ret1y), price, currency: d.currency };
}
async function aiNote(picks) {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) return null;
  try {
    const top = picks.slice(0, 8).map((p) => p.kod).join(", ");
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 700, messages: [{ role: "user", content: `Bugünün küresel piyasa/borsa durumunu web'de kısaca araştır ve 3-4 cümlede Türkçe özetle. Öne çıkan momentum hisseleri: ${top}. SADECE JSON: {"note":"...","sentiment":"pozitif|notr|negatif"}` }], tools: [{ type: "web_search_20250305", name: "web_search" }] }) });
    if (!res.ok) return null;
    const j = await res.json(); const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const m = text.match(/\{[\s\S]*\}/); if (!m) return null; return JSON.parse(m[0]);
  } catch (e) { return null; }
}
async function main() {
  const entries = [];
  for (const mk of ["tr", "us", "eu"]) for (const k of UNIVERSE[mk]) entries.push({ kod: k, market: mk });
  const picks = [];
  for (let i = 0; i < entries.length; i += 6) {
    const batch = entries.slice(i, i + 6);
    const rs = await Promise.allSettled(batch.map((e) => chart(e.market === "tr" ? e.kod + ".IS" : e.kod)));
    rs.forEach((r, j) => {
      if (r.status === "fulfilled" && r.value) {
        const e = batch[j], s = calc(r.value);
        const vals = {}; if (s.ret1m != null) vals.chg1m = String(s.ret1m); if (s.ret1y != null) vals.chg1y = String(s.ret1y); if (s.pos52 != null) vals.pos52 = String(s.pos52);
        picks.push({ kod: e.kod, market: e.market, currency: s.currency || (e.market === "us" ? "USD" : e.market === "eu" ? "EUR" : "TRY"), fiyat: s.price != null ? +(+s.price).toFixed(2) : null, score: s.score, mom: s.mom, trend: s.trend, rsi: s.rsi, vol: s.vol, maxDD: s.maxDD, pos52: s.pos52, ret1m: s.ret1m, ret3m: s.ret3m, ret6m: s.ret6m, chg1m: s.ret1m, chg1y: s.ret1y, vals });
      }
    });
  }
  picks.sort((a, b) => b.score - a.score);
  picks.forEach((p) => { p.bucket = p.score >= 66 ? "al" : p.score >= 46 ? "izle" : "zayif"; });
  const ai = await aiNote(picks);
  const report = { date: new Date().toISOString().slice(0, 10), generatedAt: new Date().toISOString(), count: picks.length, universe: { tr: UNIVERSE.tr.length, us: UNIVERSE.us.length, eu: UNIVERSE.eu.length }, picks, note: ai ? ai.note : null, sentiment: ai ? ai.sentiment : null, disclaimer: "Otomatik momentum/teknik taraması. Yatırım tavsiyesi değildir." };
  const fs = await import("node:fs"); fs.writeFileSync("report.json", JSON.stringify(report, null, 2));
  console.log("wrote report.json:", picks.length, "picks");
}
main();
