/**
 * Minimal asar writer (Electron's archive format).
 * We only need a tiny app.asar with index.js + package.json that redirects Discord
 * to the VEYA patcher on startup – just like the official Vencord installer.
 *
 * Format: [UInt32 4][UInt32 headerLen] [Pickle(String(JSON header))] [file contents...]
 */

function pickleString(str) {
    const data = Buffer.from(str, "utf8");
    const pad = (4 - (data.length % 4)) % 4;
    const payload = Buffer.alloc(4 + data.length + pad);
    payload.writeUInt32LE(data.length, 0);
    data.copy(payload, 4);
    const out = Buffer.alloc(4 + payload.length);
    out.writeUInt32LE(payload.length, 0);
    payload.copy(out, 4);
    return out;
}

/** @param {Record<string, Buffer|string>} files */
function createAsar(files) {
    const header = { files: {} };
    const buffers = [];
    let offset = 0;
    for (const [name, content] of Object.entries(files)) {
        const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
        header.files[name] = { size: buf.length, offset: String(offset) };
        offset += buf.length;
        buffers.push(buf);
    }
    const headerBuf = pickleString(JSON.stringify(header));
    const sizeBuf = Buffer.alloc(8);
    sizeBuf.writeUInt32LE(4, 0);
    sizeBuf.writeUInt32LE(headerBuf.length, 4);
    return Buffer.concat([sizeBuf, headerBuf, ...buffers]);
}

/** Reads back file names + contents (for tests and to recognize our patch file) */
function readAsar(buf) {
    const headerLen = buf.readUInt32LE(4);
    const strLen = buf.readUInt32LE(12);
    const header = JSON.parse(buf.subarray(16, 16 + strLen).toString("utf8"));
    const base = 8 + headerLen;
    const out = {};
    for (const [name, info] of Object.entries(header.files)) {
        if (info.size === undefined) continue;
        const start = base + Number(info.offset);
        out[name] = buf.subarray(start, start + info.size).toString("utf8");
    }
    return out;
}

module.exports = { createAsar, readAsar };
