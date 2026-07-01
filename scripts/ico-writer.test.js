import { describe, expect, it } from 'vitest';
import { createIcoBuffer } from './ico-writer.mjs';

function readDirectoryEntry(buffer, index) {
  const offset = 6 + index * 16;
  return {
    width: buffer.readUInt8(offset),
    height: buffer.readUInt8(offset + 1),
    planes: buffer.readUInt16LE(offset + 4),
    bitCount: buffer.readUInt16LE(offset + 6),
    bytesInResource: buffer.readUInt32LE(offset + 8),
    imageOffset: buffer.readUInt32LE(offset + 12),
  };
}

describe('createIcoBuffer', () => {
  it('creates deterministic ICO headers for PNG image entries', () => {
    // Given: PNG buffers supplied out of size order.
    const png16 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x10]);
    const png256 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]);

    // When: the ICO buffer is constructed.
    const ico = createIcoBuffer([
      { size: 256, buffer: png256 },
      { size: 16, buffer: png16 },
    ]);

    // Then: the directory is sorted and points at the original PNG payloads.
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(2);
    expect(readDirectoryEntry(ico, 0)).toEqual({
      width: 16,
      height: 16,
      planes: 1,
      bitCount: 32,
      bytesInResource: png16.length,
      imageOffset: 38,
    });
    expect(readDirectoryEntry(ico, 1)).toEqual({
      width: 0,
      height: 0,
      planes: 1,
      bitCount: 32,
      bytesInResource: png256.length,
      imageOffset: 38 + png16.length,
    });
    expect(ico.subarray(38, 38 + png16.length)).toEqual(png16);
    expect(ico.subarray(38 + png16.length)).toEqual(png256);
  });
});
