import { readFileSync, writeFileSync } from 'node:fs';
import { buildCAS, buildHeader } from '../../../cassette.js';

// DECB records can be discontiguous; CLOADM loads one contiguous tape file.
// Fill only the gap between the program's RAM segments with zeroes.
export function cassetteImage(binary) {
    const segments = [];
    let offset = 0, entry;
    while (offset < binary.length) {
        if (offset + 5 > binary.length) throw new Error('Truncated DECB record');
        const type = binary[offset];
        const length = binary.readUInt16BE(offset + 1);
        const address = binary.readUInt16BE(offset + 3);
        offset += 5;
        if (type === 0xff) {
            if (length || offset !== binary.length) throw new Error('Invalid DECB trailer');
            entry = address;
            break;
        }
        if (type !== 0 || !length || address + length > 0x8000 || offset + length > binary.length)
            throw new Error('Invalid DECB RAM segment');
        segments.push({ address, data: binary.subarray(offset, offset + length) });
        offset += length;
    }
    if (!segments.length || !segments.some(s => entry >= s.address && entry < s.address + s.data.length))
        throw new Error('Missing loaded execution address');
    const load = Math.min(...segments.map(s => s.address));
    const end = Math.max(...segments.map(s => s.address + s.data.length));
    const payload = new Uint8Array(end - load);
    const occupied = new Uint8Array(payload.length);
    for (const segment of segments) {
        const start = segment.address - load;
        if (occupied.subarray(start, start + segment.data.length).some(Boolean))
            throw new Error('Overlapping DECB segments');
        payload.set(segment.data, start);
        occupied.fill(1, start, start + segment.data.length);
    }
    const blocks = [{ type: 0, data: buildHeader('INTBASIC', 2, 0, entry, load) }];
    for (let i = 0; i < payload.length; i += 255)
        blocks.push({ type: 1, data: payload.slice(i, i + 255) });
    blocks.push({ type: 0xff, data: new Uint8Array() });
    return buildCAS(blocks);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
    writeFileSync(process.argv[3], cassetteImage(readFileSync(process.argv[2])));
}
