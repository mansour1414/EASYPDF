/**
 * fileValidation.ts
 *
 * Security/correctness fix (Convert tool hardening, Sept 2026): the
 * "Images → PDF" conversion previously trusted `File.type` (the browser's
 * MIME guess, itself usually derived from the file extension) to decide
 * whether an uploaded file was really a JPEG/PNG. A renamed file
 * (e.g. `malware.exe` renamed to `photo.png`) would pass that check and
 * be handed straight to @cantoo/pdf-lib's embedPng/embedJpg, which would
 * then throw on garbage bytes anyway — but only after doing real work, and
 * with a confusing low-level error instead of a clear "this isn't really
 * an image" message.
 *
 * sniffImageType() inspects the actual first bytes of the file (the
 * standard PNG/JPEG magic numbers) so validation is based on real file
 * content, not just the extension/MIME string the browser reports.
 */

export type SniffedImageType = 'png' | 'jpg' | null;

/**
 * Returns 'png' or 'jpg' if `bytes` genuinely starts with a PNG or JPEG
 * signature, or null if it doesn't look like either (regardless of what
 * the file's name or reported MIME type claimed).
 */
export function sniffImageType(bytes: Uint8Array): SniffedImageType {
  if (!bytes || bytes.length < 4) return null;

  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 &&
    bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    return 'png';
  }

  // JPEG signature: FF D8 FF (every valid JPEG/JFIF/EXIF file starts here)
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpg';
  }

  return null;
}
