/**
 * Data minimization for the native Argentina RENAPER preview.
 * The response never carries provider photo bytes to Android; it only
 * indicates whether the provider supplied an image.
 */
export function maskOfficialAddress(input: string | null | undefined): string {
  if (!input) return '';
  return input.trim().slice(0, 240).split(',').map((part) => {
    let visibleLetters = 0;
    return part.replace(/[\p{L}\p{N}]/gu, (character) => {
      if (/\p{L}/u.test(character) && visibleLetters < 3) {
        visibleLetters += 1;
        return character;
      }
      return '*';
    });
  }).join(',');
}

export function isOfficialPhotoAvailable(value: string | null | undefined): boolean {
  // Do not decode, forward, persist, log or generate any image bytes here.
  return typeof value === 'string' && value.trim().length > 0;
}
