import { describe, expect, it } from 'vitest';
import {
  attachmentRotation,
  detectedMimeType,
  safeDownloadFilename,
  sha256Hex,
  validateAttachmentFile,
} from './attachmentService';

describe('attachment validation', () => {
  it('detects each supported format from its signature', () => {
    expect(detectedMimeType(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(
      'image/jpeg',
    );
    expect(
      detectedMimeType(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
      ),
    ).toBe('image/png');
    expect(
      detectedMimeType(
        new TextEncoder().encode('RIFF1234WEBPsynthetic content'),
      ),
    ).toBe('image/webp');
    expect(detectedMimeType(new TextEncoder().encode('%PDF-1.7'))).toBe(
      'application/pdf',
    );
  });

  it('rejects a claimed type that does not match file contents', () => {
    expect(() =>
      validateAttachmentFile(
        'receipt.png',
        'image/png',
        new TextEncoder().encode('%PDF-1.7'),
      ),
    ).toThrow('contents do not match');
  });

  it('rejects empty files and filenames containing control characters', () => {
    expect(() =>
      validateAttachmentFile(
        'receipt.pdf',
        'application/pdf',
        new Uint8Array(),
      ),
    ).toThrow('must not be empty');
    expect(() =>
      validateAttachmentFile(
        'receipt\n.pdf',
        'application/pdf',
        new TextEncoder().encode('%PDF-1.7'),
      ),
    ).toThrow('Filename is invalid');
  });

  it('produces stable SHA-256 hashes and safe download filenames', async () => {
    expect(await sha256Hex(new TextEncoder().encode('business-records'))).toBe(
      '95a607b2ab9c3539a19d19cbce209820b57efb3d03ea3720cf52227bc266e119',
    );
    expect(safeDownloadFilename('receipt"\\name.pdf')).toBe(
      'receipt__name.pdf',
    );
  });

  it('accepts only quarter-turn display rotation metadata', () => {
    expect(attachmentRotation(null)).toBe(0);
    expect(attachmentRotation('90')).toBe(90);
    expect(attachmentRotation('270')).toBe(270);
    expect(() => attachmentRotation('45')).toThrow('rotation is invalid');
  });
});
