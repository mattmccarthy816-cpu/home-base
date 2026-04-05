// Vercel serverless proxy — browser → this → GAS (no CORS issues)
 
const GAS_URL = "https://script.google.com/macros/s/AKfycbwMgO1moxl7GgsKr7jzfLGXztXrZZGGYI6DNFPj6knE35K11Yza2fcfm0wY9EMuHUDv/exec";
 
// Manually parse body since Vercel doesn't auto-parse for all runtimes
async function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === "object") { resolve(req.body); return; }
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(raw)); }
      catch { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}
 
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
 
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Method not allowed" });
    return;
  }
 
  try {
    const body = await parseBody(req);
    console.log("Proxy received:", JSON.stringify(body));
 
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body || {})) {
      params.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
 
    const gasUrl = `${GAS_URL}?${params.toString()}`;
    console.log("Calling GAS:", gasUrl.slice(0, 200));
 
    // follow redirects — GAS always redirects once
    const gasRes = await fetch(gasUrl, { redirect: "follow" });
    const text = await gasRes.text();
    console.log("GAS response:", text.slice(0, 200));
 
    let json;
    try { json = JSON.parse(text); }
    catch { json = { success: false, error: "GAS returned non-JSON: " + text.slice(0, 200) }; }
 
    res.status(200).json(json);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
};
 
