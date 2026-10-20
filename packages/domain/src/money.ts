/** Money is always an integer number of minor units (pence). */
export type Pence = number;

export function toPence(pounds: string | number): Pence {
  const s = String(pounds).replace(/[£,\s]/g, "");
  if (s === "" || s === "-") return 0;
  if (!/^-?\d*(\.\d*)?$/.test(s)) throw new Error(`Invalid money amount: ${pounds}`);
  const negative = s.startsWith("-");
  const [whole = "0", frac = ""] = s.replace("-", "").split(".");
  const pence = Number(whole || "0") * 100 + Math.round(Number((frac + "000").slice(0, 3)) / 10);
  return negative ? -pence : pence;
}

export function formatPence(p: Pence, symbol = "£"): string {
  const sign = p < 0 ? "-" : "";
  const abs = Math.abs(p);
  const pounds = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${symbol}${pounds}.${String(abs % 100).padStart(2, "0")}`;
}

/** Round half away from zero, as accountants expect. */
function roundHalfAway(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/** rate is a fraction, e.g. 0.2 for 20% VAT. */
export function grossFromNet(net: Pence, rate: number): Pence {
  return roundHalfAway(net * (1 + rate));
}

export function netFromGross(gross: Pence, rate: number): Pence {
  return roundHalfAway(gross / (1 + rate));
}

/** Round to the nearest multiple of `step` pence (e.g. 50 for 50p). */
export function roundToStep(p: Pence, step: Pence): Pence {
  if (step <= 0) return p;
  return roundHalfAway(p / step) * step;
}
