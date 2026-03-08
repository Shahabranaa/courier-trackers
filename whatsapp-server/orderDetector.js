const NAME_LABELS = ["name", "customer", "naam", "customer name"];
const ADDRESS_LABELS = ["address", "pata", "shipping address", "delivery address", "addr"];
const CITY_LABELS = ["city", "shehar", "shehr"];
const PHONE_LABELS = ["phone", "mobile", "contact", "number", "ph", "cell", "whatsapp", "#", "mob"];
const PRODUCT_LABELS = ["product", "item", "order", "plan", "product name"];
const PRICE_LABELS = ["price", "amount", "total", "rs", "pkr", "qeemat"];

function parseField(text, labels) {
    const lines = text.split("\n");
    for (const line of lines) {
        const lower = line.toLowerCase().trim();
        for (const label of labels) {
            const patterns = [
                new RegExp(`^${label}\\s*[:\\-=]\\s*(.+)`, "i"),
                new RegExp(`${label}\\s*[:\\-=]\\s*(.+)`, "i"),
            ];
            for (const pattern of patterns) {
                const match = lower.match(pattern);
                if (match) {
                    return line.substring(line.toLowerCase().indexOf(match[1].trim().substring(0, 5))).trim();
                }
            }
        }
    }
    return "";
}

function extractPhone(text) {
    const phoneRegex = /(?:\+?92|0)?3\d{2}[\s\-]?\d{7}/g;
    const matches = text.match(phoneRegex);
    return matches ? matches[0].replace(/[\s\-]/g, "") : "";
}

function extractPrice(text) {
    const lines = text.split("\n");
    for (const line of lines) {
        const lower = line.toLowerCase();
        for (const label of PRICE_LABELS) {
            if (lower.includes(label)) {
                const priceMatch = line.match(/[\d,]+/);
                if (priceMatch) {
                    return parseInt(priceMatch[0].replace(/,/g, ""), 10) || 0;
                }
            }
        }
    }
    return 0;
}

function detectOrder(messageText) {
    if (!messageText || messageText.length < 15) {
        return { isOrder: false, parsed: null };
    }

    const name = parseField(messageText, NAME_LABELS);
    const address = parseField(messageText, ADDRESS_LABELS);
    const city = parseField(messageText, CITY_LABELS);
    const product = parseField(messageText, PRODUCT_LABELS);
    const price = extractPrice(messageText);

    let phone = parseField(messageText, PHONE_LABELS);
    if (!phone) {
        phone = extractPhone(messageText);
    }

    let fieldsFound = 0;
    if (name) fieldsFound++;
    if (phone) fieldsFound++;
    if (address) fieldsFound++;
    if (city) fieldsFound++;
    if (product) fieldsFound++;

    const isOrder = fieldsFound >= 2 && (!!name || !!phone);

    return {
        isOrder,
        parsed: isOrder ? { name, phone, address, city, product, price } : null,
    };
}

module.exports = { detectOrder };
