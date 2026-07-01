const ICO_HEADER_SIZE = 6;
const ICO_DIRECTORY_ENTRY_SIZE = 16;

function toIconDirectorySizeByte(size) {
  return size >= 256 ? 0 : size;
}

export function createIcoBuffer(images) {
  const sortedImages = [...images].sort((left, right) => left.size - right.size);
  const header = Buffer.alloc(ICO_HEADER_SIZE);
  const directory = Buffer.alloc(sortedImages.length * ICO_DIRECTORY_ENTRY_SIZE);

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sortedImages.length, 4);

  let imageOffset = ICO_HEADER_SIZE + directory.length;
  for (const [index, image] of sortedImages.entries()) {
    const entryOffset = index * ICO_DIRECTORY_ENTRY_SIZE;
    directory.writeUInt8(toIconDirectorySizeByte(image.size), entryOffset);
    directory.writeUInt8(toIconDirectorySizeByte(image.size), entryOffset + 1);
    directory.writeUInt8(0, entryOffset + 2);
    directory.writeUInt8(0, entryOffset + 3);
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(32, entryOffset + 6);
    directory.writeUInt32LE(image.buffer.length, entryOffset + 8);
    directory.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += image.buffer.length;
  }

  return Buffer.concat([header, directory, ...sortedImages.map((image) => image.buffer)]);
}
