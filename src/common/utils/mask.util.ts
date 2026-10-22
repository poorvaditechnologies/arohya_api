/** "rajesh.gowda@example.com" -> "ra***@example.com" (used for maskedEmail). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

/** "ABCDE1234F" -> "ABCDE****F" (used for panMasked). */
export function maskPan(pan: string): string {
  if (pan.length < 6) return pan;
  return `${pan.slice(0, 5)}****${pan.slice(-1)}`;
}

/** "AAACB1234F1Z5" -> "AAACB****F1Z5" (used for gstinMasked). */
export function maskGstin(gstin: string): string {
  if (gstin.length < 9) return gstin;
  return `${gstin.slice(0, 5)}****${gstin.slice(-4)}`;
}
