import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { zip } from "./zip";

/** Reads entries back by following the central directory, as unzip tools do. */
function unzip(archive: Buffer) {
  const end = archive.length - 22;
  expect(archive.readUInt32LE(end)).toBe(0x06054b50);
  const count = archive.readUInt16LE(end + 10);
  let at = archive.readUInt32LE(end + 16);
  const entries: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    expect(archive.readUInt32LE(at)).toBe(0x02014b50);
    const size = archive.readUInt32LE(at + 24);
    const nameLength = archive.readUInt16LE(at + 28);
    const crc = archive.readUInt32LE(at + 16);
    const local = archive.readUInt32LE(at + 42);
    const name = archive.subarray(at + 46, at + 46 + nameLength).toString();
    expect(archive.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
    const data = archive.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    entries[name] = data.toString();
    at += 46 + nameLength;
  }
  return entries;
}

describe("zip", () => {
  it("stores files that read back intact", () => {
    const archive = zip([
      { name: "plugin/plugin.php", data: "<?php // héllo" },
      { name: "plugin/readme.txt", data: Buffer.from("Read me\n") },
    ]);
    expect(unzip(archive)).toEqual({
      "plugin/plugin.php": "<?php // héllo",
      "plugin/readme.txt": "Read me\n",
    });
  });
});
