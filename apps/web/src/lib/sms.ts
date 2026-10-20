// SMS character and segment counting, and phone normalisation. Pure: safe in client components.

/** GSM 03.38 basic character set (one septet each). */
const GSM7_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);
/** GSM 03.38 extension table (escape + char, two septets each). */
const GSM7_EXT = new Set("^{}\\[~]|€\f");

export interface SmsCount {
  encoding: "GSM-7" | "UCS-2";
  /** Characters as the network counts them (septets for GSM-7, UTF-16 units for UCS-2). */
  units: number;
  segments: number;
  /** Units left before another segment is needed. */
  remaining: number;
}

/**
 * Count an SMS the way networks bill it: GSM-7 fits 160 per single message or
 * 153 per part when concatenated; anything outside GSM-7 switches the whole
 * message to UCS-2 at 70 / 67.
 */
export function smsSegments(text: string): SmsCount {
  let septets = 0;
  let gsm = true;
  for (const ch of text) {
    if (GSM7_BASIC.has(ch)) septets += 1;
    else if (GSM7_EXT.has(ch)) septets += 2;
    else { gsm = false; break; }
  }
  if (gsm) {
    const segments = septets === 0 ? 0 : septets <= 160 ? 1 : Math.ceil(septets / 153);
    const cap = segments <= 1 ? 160 : segments * 153;
    return { encoding: "GSM-7", units: septets, segments, remaining: cap - septets };
  }
  const units = text.length; // UTF-16 code units; emoji take two.
  const segments = units <= 70 ? 1 : Math.ceil(units / 67);
  const cap = segments <= 1 ? 70 : segments * 67;
  return { encoding: "UCS-2", units, segments, remaining: cap - units };
}

/** Normalise a UK (or already international) phone number to E.164, or null if it can't be. */
export function toE164(phone: string, defaultCountry = "44"): string | null {
  const raw = phone.replace(/[\s\-().]/g, "");
  let digits: string;
  if (raw.startsWith("+")) digits = raw.slice(1);
  else if (raw.startsWith("00")) digits = raw.slice(2);
  else if (raw.startsWith("0")) digits = defaultCountry + raw.slice(1);
  else digits = raw;
  if (!/^\d{8,15}$/.test(digits)) return null;
  return `+${digits}`;
}
