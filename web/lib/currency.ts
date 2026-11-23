/** Currencies offered in the search form; Skyscanner prices and links in any of them. */
export const CURRENCIES = [
  "INR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "SGD", "JPY", "CNY", "HKD", "CHF", "NZD", "SAR",
  "QAR", "THB", "MYR", "IDR", "PHP", "KRW", "ZAR", "SEK", "NOK", "DKK", "BRL", "MXN", "TRY",
] as const;

const FALLBACK_CURRENCY = "USD";
const EURO_REGIONS = ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"];
const REGION_CURRENCY: Record<string, string> = {
  ...Object.fromEntries(EURO_REGIONS.map((region) => [region, "EUR"])),
  IN: "INR", US: "USD", GB: "GBP", AE: "AED", AU: "AUD", CA: "CAD", SG: "SGD", JP: "JPY", CN: "CNY",
  HK: "HKD", CH: "CHF", LI: "CHF", NZ: "NZD", SA: "SAR", QA: "QAR", TH: "THB", MY: "MYR", ID: "IDR",
  PH: "PHP", KR: "KRW", ZA: "ZAR", SE: "SEK", NO: "NOK", DK: "DKK", BR: "BRL", MX: "MXN", TR: "TRY",
};

/** The currency of a two-letter country code, e.g. `IN` → INR. */
export const regionCurrency = (region: string | null | undefined) =>
  (region && REGION_CURRENCY[region.toUpperCase()]) || null;

/** The currency of the browser's first language with a known region, e.g. `en-IN` → INR, `de` → EUR. */
export function browserCurrency(): string {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const language of languages) {
    const currency = regionCurrency(new Intl.Locale(language).maximize().region);
    if (currency) return currency;
  }
  return FALLBACK_CURRENCY;
}

const currencyNames = new Intl.DisplayNames("en", { type: "currency" });
export const currencyName = (code: string) => currencyNames.of(code) ?? code;

const formatters = new Map<string, Intl.NumberFormat>();
export function formatPrice(amount: number, currency: string): string {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 });
    formatters.set(currency, formatter);
  }
  return formatter.format(amount);
}
