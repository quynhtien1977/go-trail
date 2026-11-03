// Script discovery URLs từ gotrail.vn
async function fetchUrl(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) return { ok: false, status: res.status };
    const text = await res.text();
    return { ok: true, status: res.status, text };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function main() {
  const sitemapRes = await fetchUrl("https://gotrail.vn/sitemap_index.xml");
  console.log("Sitemap index:", sitemapRes.text);
}

main();
