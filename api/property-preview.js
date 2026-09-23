export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { url } = req.body || {};

    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({
        error: "A valid property URL is required."
      });
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      },
      redirect: "follow"
    });

    if (!response.ok) {
      return res.status(502).json({
        error: `Could not fetch the listing (HTTP ${response.status}).`
      });
    }

    const html = await response.text();

    const title = extractTitle(html);
    const image = extractImage(html, url);
    const location = extractLocation(html);

    if (!title && !image) {
      return res.status(422).json({
        error: "Could not extract property information from this listing."
      });
    }

    const finalTitle = title || "Property Listing";
    const finalLocation = location || "Location";

    const map =
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(finalLocation);

    return res.status(200).json({
      url,
      title: finalTitle,
      location: finalLocation,
      map,
      image: image || ""
    });

  } catch (error) {
    return res.status(500).json({
      error: "Unable to process this property listing.",
      details: error?.message || String(error)
    });
  }
}


function extractTitle(html) {
  const ogTitle = getMeta(html, "property", "og:title");

  if (ogTitle) {
    return cleanText(ogTitle);
  }

  const twitterTitle = getMeta(html, "name", "twitter:title");

  if (twitterTitle) {
    return cleanText(twitterTitle);
  }

  const titleMatch = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  return titleMatch
    ? cleanText(decodeHtml(titleMatch[1]))
    : "";
}


function extractImage(html, pageUrl) {
  const candidates = [
    getMeta(html, "property", "og:image"),
    getMeta(html, "name", "twitter:image"),
    getMeta(html, "property", "og:image:url")
  ].filter(Boolean);

  const imgMatches = html.matchAll(
    /<img[^>]+(?:src|data-src|data-original)=["']([^"']+)["']/gi
  );

  for (const match of imgMatches) {
    candidates.push(match[1]);
  }

  for (const candidate of candidates) {
    const imageUrl = makeAbsoluteUrl(candidate, pageUrl);

    if (
      imageUrl &&
      /^https?:\/\//i.test(imageUrl)
    ) {
      return imageUrl;
    }
  }

  return "";
}


function extractLocation(html) {
  const address =
    getMeta(html, "property", "og:locality") ||
    getMeta(html, "name", "address");

  if (address) {
    return cleanText(address);
  }

  const addressMatch = html.match(
    /<meta[^>]+(?:name|property)=["'](?:address|og:street-address|og:locality)["'][^>]+content=["']([^"']+)["']/i
  );

  if (addressMatch) {
    return cleanText(
      decodeHtml(addressMatch[1])
    );
  }

  return "";
}


function getMeta(html, attribute, value) {
  const pattern = new RegExp(
    `<meta[^>]+${attribute}=["']${escapeRegExp(value)}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );

  const reversePattern = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+${attribute}=["']${escapeRegExp(value)}["'][^>]*>`,
    "i"
  );

  const match =
    html.match(pattern) ||
    html.match(reversePattern);

  return match
    ? decodeHtml(match[1])
    : "";
}


function makeAbsoluteUrl(value, pageUrl) {
  try {
    return new URL(value, pageUrl).href;
  } catch {
    return "";
  }
}


function cleanText(value) {
  return decodeHtml(String(value))
    .replace(/\s+/g, " ")
    .trim();
}


function decodeHtml(value) {
  return String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}


function escapeRegExp(value) {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}