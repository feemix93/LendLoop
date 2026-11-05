export const CATEGORIES = ["power tools", "hand tools", "garden", "kitchen", "camping", "other"];

export function clean(value: string, max: number, field: string) {
  const t = value.trim();
  if (!t || t.length > max) throw new Error(`Invalid ${field}`);
  return t;
}

export function checkCategory(c: string) {
  if (!CATEGORIES.includes(c)) throw new Error("Invalid category");
  return c;
}

export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const today = () => new Date().toISOString().slice(0, 10);
