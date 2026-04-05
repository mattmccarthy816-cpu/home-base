// Vercel serverless function — proxies write requests to Google Apps Script
// Deployed at /api/sheets — same origin as the app, so no CORS issues
// Reads go directly from the browser to GAS (GET, no CORS problem)
// Writes go: browser → this proxy → GAS

const GAS_URL = "https://script.google.com/macros/s/AKfycbwMgO1moxl7GgsKr7jzfLGXztXrZZGGYI6DNFPj6knE35K11Yza2fcfm0wY9EMuHUDv/exec";

export default async function handler(req, res) {
  // Allow all origins (same-origin calls from the app)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Method not allowed" });
    return;
  }

  try {
    const body = req.body; // Vercel parses JSON body automatically
    // Build GAS URL with all params as query string (GET to GAS works perfectly)
    const params = new URLSearchParams();
    Object.entries(body).forEach(([k, v]) => params.append(k, typeof v === "object" ? JSON.stringify(v) : String(v)));

    const gasRes = await fetch(`${GAS_URL}?${params.toString()}`);
    const text = await gasRes.text();

    try {
      const json = JSON.parse(text);
      res.status(200).json(json);
    } catch {
      res.status(200).json({ success: false, error: "GAS returned non-JSON: " + text.slice(0, 200) });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
}
