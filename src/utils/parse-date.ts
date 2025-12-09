export function formatDate(dateStr: string): string {
    if (!dateStr) return "";
    const cleaned = String(dateStr).replace(/\D/g, "");
    if (cleaned.length === 6) {
      const day = cleaned.substring(0, 2);
      const month = cleaned.substring(2, 4);
      const year = cleaned.substring(4, 6);
      const fullYear = parseInt(year) > 50 ? `19${year}` : `20${year}`;
      return `${day}/${month}/${fullYear}`;
    }
    return dateStr;
  }
