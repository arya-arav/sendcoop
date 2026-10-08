/** An amount in a currency, e.g. "$1,250.00" or "€80.00"; odd codes fall back to "80.00 XYZ". */
export function formatMoney(value: number, currency = "USD") {
  try {
    return value.toLocaleString("en", { style: "currency", currency });
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}
