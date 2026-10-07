import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

// File storage for uploads (CSV imports now, images later). Local disk for
// development; an S3-compatible driver replaces it before production (D28),
// behind the same functions. Keys look like "imports/<workspace>/<id>.csv".

export class FileTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super(`File is larger than ${limitBytes} bytes`);
  }
}

function root() {
  // Runtime location, not part of the build: tell the bundler not to trace it.
  return resolve(
    /*turbopackIgnore: true*/ process.env.STORAGE_DIR || join(tmpdir(), "sendcoop-storage"),
  );
}

/** Absolute path for a key, refusing keys that would escape the storage root. */
function pathFor(key: string) {
  const base = root();
  const full = resolve(base, key);
  if (!full.startsWith(base + sep)) throw new Error(`Invalid storage key: ${key}`);
  return full;
}

/** Streams a web or Node stream into storage, stopping at maxBytes. Returns the size. */
export async function putStream(
  key: string,
  body: ReadableStream<Uint8Array> | Readable,
  { maxBytes = Number.POSITIVE_INFINITY }: { maxBytes?: number } = {},
): Promise<number> {
  const path = pathFor(key);
  await mkdir(dirname(path), { recursive: true });

  let size = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > maxBytes) callback(new FileTooLargeError(maxBytes));
      else callback(null, chunk);
    },
  });
  const source = body instanceof Readable ? body : Readable.fromWeb(body as never);

  try {
    await pipeline(source, limit, createWriteStream(path));
  } catch (error) {
    await rm(path, { force: true });
    throw error;
  }
  return size;
}

export function getStream(key: string): Readable {
  return createReadStream(pathFor(key));
}

/** The first `bytes` of an object, for previews and format detection. */
export async function readHead(key: string, bytes: number): Promise<Buffer> {
  const file = await open(pathFor(key), "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await file.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

export async function exists(key: string): Promise<boolean> {
  return stat(pathFor(key)).then(
    () => true,
    () => false,
  );
}

export async function remove(key: string): Promise<void> {
  await rm(pathFor(key), { force: true });
}
