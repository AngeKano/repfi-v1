export function parseAmount(value: any): number {
    if (!value) return 0;
    const strValue = String(value).trim();
    if (!strValue || strValue === "-" || strValue === "") return 0;
    const cleaned = strValue
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  