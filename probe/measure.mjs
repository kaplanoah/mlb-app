// Probe only: how much of each tenth of a screenshot, top to bottom, differs from its background.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

function readPng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 8;
  let colorType = 6;
  const data = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      depth = chunk[8];
      colorType = chunk[9];
      if (chunk[12] !== 0) throw new Error("Interlaced PNG");
    } else if (type === "IDAT") data.push(chunk);
    offset += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels || (depth !== 8 && depth !== 16))
    throw new Error(`Unsupported PNG ${colorType}/${depth}`);
  const bytesPerPixel = (channels * depth) / 8;
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * bytesPerPixel;
  const bytes = Buffer.alloc(height * stride);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)];
    const line = raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
    for (let index = 0; index < stride; index += 1) {
      const left = index >= bytesPerPixel ? bytes[row * stride + index - bytesPerPixel] : 0;
      const up = row > 0 ? bytes[(row - 1) * stride + index] : 0;
      const upLeft =
        row > 0 && index >= bytesPerPixel ? bytes[(row - 1) * stride + index - bytesPerPixel] : 0;
      let value = line[index];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const [toLeft, toUp, toUpLeft] = [left, up, upLeft].map((near) =>
          Math.abs(estimate - near),
        );
        value += toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
      }
      bytes[row * stride + index] = value & 255;
    }
  }
  const sample = (pixel, channel) =>
    bytes[pixel * bytesPerPixel + (channel * depth) / 8];
  const readColor = (pixel) =>
    channels >= 3
      ? [sample(pixel, 0), sample(pixel, 1), sample(pixel, 2)]
      : [sample(pixel, 0), sample(pixel, 0), sample(pixel, 0)];
  return { width, height, depth, colorType, readColor };
}

const [file] = process.argv.slice(2);
const { width, height, depth, colorType, readColor } = readPng(readFileSync(file));
const counts = new Map();
for (let pixel = 0; pixel < width * height; pixel += 1) {
  const key = readColor(pixel).join(",");
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
const [background] = [...counts].reduce((most, entry) => (entry[1] > most[1] ? entry : most));
const backgroundColor = background.split(",").map(Number);
const isDrawn = (pixel) =>
  readColor(pixel).some((value, channel) => Math.abs(value - backgroundColor[channel]) > 12);
const bands = [];
for (let band = 0; band < 10; band += 1) {
  const top = Math.floor((band * height) / 10);
  const bottom = Math.floor(((band + 1) * height) / 10);
  let drawn = 0;
  for (let row = top; row < bottom; row += 1)
    for (let column = 0; column < width; column += 1) if (isDrawn(row * width + column)) drawn += 1;
  const share = (100 * drawn) / ((bottom - top) * width);
  bands.push(`${band * 10}-${band * 10 + 10}%: ${share.toFixed(1)}`);
}
console.log(
  `MEASURE ${file} ${width}x${height} depth ${depth} type ${colorType} background rgb(${background})`,
);
console.log(`MEASURE drawn share by tenth, top to bottom: ${bands.join(" | ")}`);
