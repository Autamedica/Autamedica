const PARTNER_CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;
const QR_SOURCE_PATTERN = /^[A-Z0-9_-]{3,64}$/;

export interface PharmacyQrAttribution {
  referralCode: string | null;
  qrSourceCode: string | null;
}

/** Parse non-clinical QR attribution. Partner identity is still resolved server-side. */
export function parsePharmacyQrAttribution(searchParams: URLSearchParams): PharmacyQrAttribution {
  const rawPartner = searchParams.get('ref');
  const rawSource = searchParams.get('qr_source');
  const referralCode = rawPartner?.trim().toUpperCase() ?? null;
  const qrSourceCode = rawSource?.trim().toUpperCase() ?? null;

  return {
    referralCode: referralCode && PARTNER_CODE_PATTERN.test(referralCode) ? referralCode : null,
    qrSourceCode: qrSourceCode && QR_SOURCE_PATTERN.test(qrSourceCode) ? qrSourceCode : null,
  };
}
