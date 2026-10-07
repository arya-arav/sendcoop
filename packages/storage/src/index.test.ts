import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exists, FileTooLargeError, putStream, readHead, remove } from "./index";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "sendcoop-storage-test-"));
  process.env.STORAGE_DIR = dir;
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("local storage", () => {
  it("stores a stream and reads back the head", async () => {
    const size = await putStream(
      "imports/ws/a.csv",
      Readable.from([Buffer.from("email\na@x.com\n")]),
    );
    expect(size).toBe(14);
    expect((await readHead("imports/ws/a.csv", 5)).toString()).toBe("email");
    expect(await exists("imports/ws/a.csv")).toBe(true);
    await remove("imports/ws/a.csv");
    expect(await exists("imports/ws/a.csv")).toBe(false);
  });

  it("accepts web streams", async () => {
    const web = new Blob(["hello"]).stream();
    expect(await putStream("x/web.txt", web)).toBe(5);
  });

  it("stops at the size limit and leaves no partial file", async () => {
    const big = Readable.from([Buffer.alloc(600), Buffer.alloc(600)]);
    await expect(putStream("x/big.bin", big, { maxBytes: 1000 })).rejects.toBeInstanceOf(
      FileTooLargeError,
    );
    expect(await exists("x/big.bin")).toBe(false);
  });

  it("refuses keys that escape the storage folder", async () => {
    await expect(putStream("../outside.txt", Readable.from(["x"]))).rejects.toThrow(
      "Invalid storage key",
    );
    await expect(readHead("x/../../etc/passwd", 10)).rejects.toThrow("Invalid storage key");
  });
});
