import { describe, expect, it } from 'vitest';
import { jpegBytes, PNG_BASE_BYTES, pngBytes } from './logo-fixtures.mock-spec.js';
import { checkLogo, LOGO_MAX_BYTES, LOGO_MAX_SIDE } from './logo-image.js';

describe('checkLogo (U5)', () => {
  it('acepta un PNG y lee sus dimensiones', () => {
    expect(checkLogo(pngBytes(120, 60))).toEqual({
      ok: true,
      format: 'png',
      width: 120,
      height: 60,
    });
  });

  it('acepta un JPEG y lee sus dimensiones del SOF', () => {
    expect(checkLogo(jpegBytes(300, 100))).toEqual({
      ok: true,
      format: 'jpg',
      width: 300,
      height: 100,
    });
  });

  it('rechaza SVG, GIF, PDF y texto como UNSUPPORTED', () => {
    for (const text of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<?xml version="1.0"?><svg/>',
      'GIF89a......',
      '%PDF-1.7',
      'hola',
    ]) {
      expect(checkLogo(Buffer.from(text))).toEqual({ ok: false, reason: 'UNSUPPORTED' });
    }
  });

  it('rechaza vacío y archivos de más de 512 KiB', () => {
    expect(checkLogo(Buffer.alloc(0))).toEqual({ ok: false, reason: 'EMPTY' });
    expect(checkLogo(pngBytes(10, 10, LOGO_MAX_BYTES))).toEqual({ ok: false, reason: 'TOO_LARGE' });
    expect(checkLogo(pngBytes(10, 10, LOGO_MAX_BYTES - PNG_BASE_BYTES)).ok).toBe(true);
  });

  it('rechaza un PNG truncado, sin IHDR, de 0 px o de más de 4096 px', () => {
    expect(checkLogo(pngBytes().subarray(0, 20))).toEqual({ ok: false, reason: 'INVALID' });
    const noIhdr = pngBytes();
    noIhdr.write('IDAT', 12, 'latin1');
    expect(checkLogo(noIhdr)).toEqual({ ok: false, reason: 'INVALID' });
    expect(checkLogo(pngBytes(0, 10)).ok).toBe(false);
    expect(checkLogo(pngBytes(LOGO_MAX_SIDE + 1, 10)).ok).toBe(false);
    expect(checkLogo(pngBytes(LOGO_MAX_SIDE, LOGO_MAX_SIDE)).ok).toBe(true);
  });

  it('rechaza un JPEG sin SOF, con longitud fuera del archivo o con basura entre segmentos', () => {
    expect(checkLogo(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toEqual({
      ok: false,
      reason: 'INVALID',
    });
    expect(checkLogo(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x7f, 0xff, 0x00]))).toEqual({
      ok: false,
      reason: 'INVALID',
    });
    const junk = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0x41])]);
    expect(checkLogo(junk).ok).toBe(false);
    // SOS antes de cualquier SOF: no hay dimensiones.
    expect(checkLogo(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02])).ok).toBe(false);
    expect(checkLogo(jpegBytes(0, 10)).ok).toBe(false);
  });

  describe('final exacto: nada pegado después de IEND o EOI (seguridad 5c)', () => {
    const payloads = [
      Buffer.from('<script>alert(1)</script>'),
      Buffer.from('PKzip-pegado'),
      Buffer.from([0x00]),
    ];

    it('PNG con bytes después de IEND → INVALID', () => {
      for (const p of payloads) {
        expect(checkLogo(Buffer.concat([pngBytes(), p]))).toEqual({ ok: false, reason: 'INVALID' });
      }
    });

    it('PNG sin IEND, con IEND no vacío o con un chunk que se sale del archivo → INVALID', () => {
      const png = pngBytes();
      expect(checkLogo(png.subarray(0, png.length - 12))).toEqual({ ok: false, reason: 'INVALID' });
      const fatEnd = Buffer.from(png);
      fatEnd.writeUInt32BE(4, png.length - 12);
      expect(checkLogo(fatEnd)).toEqual({ ok: false, reason: 'INVALID' });
      const overflow = pngBytes(10, 10, 20);
      overflow.writeUInt32BE(0xffff, 33);
      expect(checkLogo(overflow)).toEqual({ ok: false, reason: 'INVALID' });
    });

    it('PNG con chunks intermedios y IEND al final → válido', () => {
      expect(checkLogo(pngBytes(10, 10, 100)).ok).toBe(true);
    });

    it('JPEG con bytes después de FF D9 o sin FF D9 → INVALID', () => {
      for (const p of payloads) {
        expect(checkLogo(Buffer.concat([jpegBytes(), p]))).toEqual({
          ok: false,
          reason: 'INVALID',
        });
      }
      const jpg = jpegBytes();
      expect(checkLogo(jpg.subarray(0, jpg.length - 2))).toEqual({ ok: false, reason: 'INVALID' });
    });
  });
});
