// api/image.js
export default async function handler(req, res) {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).send('No URL provided');
    
    // Google倉庫から直接画像を引っ張ってくる
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    
    const buffer = await response.arrayBuffer();
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    
    // アプリに画像を安全に渡す
    res.send(Buffer.from(buffer));
  } catch (error) {
    res.status(500).send(error.message);
  }
}