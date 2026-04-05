// Vercel serverless proxy — receives writes from the browser (same origin)
// and forwards them to Google Apps Script server-side (no CORS restriction)
 
const GAS_URL = "https://script.google.com/macros/s/AKfycbwMgO1moxl7GgsKr7jzfLGXztXrZZGGYI6DNFPj6knE35K11Yza2fcfm0wY9EMuHUDv/exec";
 
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
 
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ success: false, error: "Method not allowed" }); return; }
 
  try {
    // req.body is parsed automatically by Vercel when Content-Type is application/json
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
 
    // Forward to GAS as a GET request with query params (GAS reads from e.parameter)
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body || {})) {
      params.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
 
    const gasRes = await fetch(`${GAS_URL}?${params.toString()}`);
    const text = await gasRes.text();
 
    let json;
    try { json = JSON.parse(text); }
    catch { json = { success: false, error: "GAS non-JSON response: " + text.slice(0, 300) }; }
 
    res.status(200).json(json);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
};
 
