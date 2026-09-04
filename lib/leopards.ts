import * as cheerio from "cheerio";

const REQUEST_TIMEOUT_MS = 15000;
const BASE_URL = "https://www.leopardscourier.com";

export interface LeopardsTrackingResult {
  currentStatus: string;
  lastUpdate: string;
  consigneeName: string;
  destination: string;
  shipper: string;
  origin: string;
  trackingHistory: { date: string; status: string }[];
}

function extractCookies(response: Response): string {
  const cookies: string[] = [];
  const setCookieHeaders = response.headers.getSetCookie?.() || [];
  for (const header of setCookieHeaders) {
    const cookiePart = header.split(";")[0];
    if (cookiePart) cookies.push(cookiePart);
  }
  return cookies.join("; ");
}

function extractToken(html: string): string | null {
  const tokenMatch = html.match(/name="_token"\s+value="([^"]+)"/);
  if (tokenMatch) return tokenMatch[1];
  const livewireMatch = html.match(/livewire_token\s*=\s*'([^']+)'/);
  if (livewireMatch) return livewireMatch[1];
  return null;
}

function parseTrackingHtml(html: string): LeopardsTrackingResult | null {
  const $ = cheerio.load(html);

  const consignmentHeader = $("td:contains('Consignment No.')").first().text();
  if (!consignmentHeader || consignmentHeader.includes("invalid") || consignmentHeader.includes("not found")) {
    return null;
  }

  let shipper = "";
  let origin = "";
  let consigneeName = "";
  let destination = "";

  $("table.table-striped td").each((_, el) => {
    const text = $(el).text().trim();
    if (text === "Origin :") {
      const next = $(el).next("td");
      if (next.length) origin = next.text().trim();
    } else if (text === "Destination :") {
      const next = $(el).next("td");
      if (next.length) destination = next.text().trim();
    } else if (text === "Shipper :") {
      const next = $(el).next("td");
      if (next.length) shipper = next.text().trim();
    } else if (text === "Consignee :") {
      const next = $(el).next("td");
      if (next.length) consigneeName = next.text().trim();
    }
  });

  const trackingHistory: { date: string; status: string }[] = [];
  $(".tracking-item").each((_, el) => {
    const dateEl = $(el).find(".tracking-date");
    const dateText = dateEl.clone().children().remove().end().text().trim();
    const timeText = dateEl.find("span").text().trim().replace(/[()]/g, "");
    const fullDate = timeText ? `${dateText} ${timeText}` : dateText;
    const status = $(el).find(".tracking-content").text().trim();
    if (fullDate && status) {
      trackingHistory.push({ date: fullDate, status });
    }
  });

  if (trackingHistory.length === 0 && !shipper && !consigneeName) {
    return null;
  }

  const currentStatus = trackingHistory.length > 0
    ? trackingHistory[0].status
    : "Unknown";

  const lastUpdate = trackingHistory.length > 0
    ? trackingHistory[0].date
    : "";

  return { currentStatus, lastUpdate, consigneeName, destination, shipper, origin, trackingHistory };
}

export async function scrapeLeopardsTracking(trackingNumber: string): Promise<LeopardsTrackingResult | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    };

    const step1 = await fetch(`${BASE_URL}/shipment_tracking_view`, {
      signal: controller.signal,
      headers,
      redirect: "manual",
    });
    const step1Html = await step1.text();
    const cookies = extractCookies(step1);
    const token = extractToken(step1Html);

    if (!token) {
      console.error("Leopards: Failed to extract CSRF token");
      return null;
    }

    const step2Url = `${BASE_URL}/shipment_tracking-new?cn_number=${encodeURIComponent(trackingNumber)}&_token=${encodeURIComponent(token)}`;
    const step2 = await fetch(step2Url, {
      signal: controller.signal,
      headers: {
        ...headers,
        "Cookie": cookies,
        "Referer": `${BASE_URL}/shipment_tracking_view`,
      },
    });

    const step2Body = await step2.text();
    let step2Json: any;
    try {
      step2Json = JSON.parse(step2Body);
    } catch {
      console.error("Leopards: Step 2 response not JSON:", step2Body.slice(0, 200));
      return null;
    }

    if (!step2Json.success) {
      return null;
    }

    const step2Cookies = extractCookies(step2);
    const mergedCookies = step2Cookies ? `${cookies}; ${step2Cookies}` : cookies;

    const step3 = await fetch(`${BASE_URL}/shipment_tracking_view`, {
      signal: controller.signal,
      headers: {
        ...headers,
        "Cookie": mergedCookies,
        "Referer": `${BASE_URL}/shipment_tracking_view`,
      },
    });

    if (!step3.ok) {
      console.error("Leopards: Step 3 failed with status:", step3.status);
      return null;
    }

    const trackingHtml = await step3.text();
    return parseTrackingHtml(trackingHtml);
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.error(`Leopards: Timeout scraping ${trackingNumber}`);
    } else {
      console.error(`Leopards: Error scraping ${trackingNumber}:`, err.message);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
