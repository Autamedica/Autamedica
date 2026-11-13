/** Resolve only this doctor's private uploaded assets; never fetch arbitrary URLs. */
export function certificateAssetPath(
  value: string, storageOrigin: string, userId: string, doctorId: string,
  type: 'signature' | 'stamp',
): string {
  const url = new URL(value);
  const prefix = '/storage/v1/object/';
  if (url.origin !== new URL(storageOrigin).origin || !url.pathname.startsWith(prefix)) {
    throw new Error('certificate_asset_untrusted');
  }
  const path = decodeURIComponent(url.pathname.slice(prefix.length))
    .replace(/^(sign|public|authenticated)\/medical-documents\//, '');
  const expected = `${userId}/signatures/${doctorId}/${type}.`;
  if (!path.startsWith(expected) || !/\.(png|jpg|jpeg|webp)$/i.test(path) ||
      path.includes('..') || path.slice(expected.length).includes('/')) {
    throw new Error('certificate_asset_not_owned');
  }
  return path;
}

export async function certificateSha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Reject corrupt/oversized assets before PDF decoding, including decompression bombs. */
export function assertCertificateImage(bytes: Uint8Array): void {
  if (bytes.length < 12 || bytes.length > 500 * 1024) {
    throw new Error('certificate_asset_invalid_size');
  }
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const jpeg = bytes[0] === 255 && bytes[1] === 216;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!png && !jpeg && !webp) throw new Error('certificate_asset_invalid_format');
  if (png) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 24 || view.getUint32(16) * view.getUint32(20) > 8_000_000) {
      throw new Error('certificate_asset_dimensions_exceeded');
    }
    return;
  }
  let width = 0, height = 0;
  if (jpeg) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
        height = (bytes[offset + 3] << 8) | bytes[offset + 4];
        width = (bytes[offset + 5] << 8) | bytes[offset + 6];
        break;
      }
      offset += length;
    }
  } else if (webp && bytes.length >= 30) {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === 'VP8X') {
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (chunk === 'VP8L' && bytes[20] === 47) {
      width = 1 + bytes[21] + ((bytes[22] & 63) << 8);
      height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10);
    } else if (chunk === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) {
      width = (bytes[26] | (bytes[27] << 8)) & 16383;
      height = (bytes[28] | (bytes[29] << 8)) & 16383;
    }
  }
  if (!width || !height || width * height > 8_000_000) throw new Error('certificate_asset_dimensions_exceeded');
}
