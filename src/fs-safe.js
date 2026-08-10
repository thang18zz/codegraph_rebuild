import { constants } from "node:fs";
import { open } from "node:fs/promises";

export async function readFileNoFollow(path) {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const handle = await open(path, constants.O_RDONLY | noFollow);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) {
      const error = new Error(`Not a regular file: ${path}`);
      error.code = "UNSAFE_SOURCE_PATH";
      throw error;
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

export async function readPrefixNoFollow(path, length) {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const handle = await open(path, constants.O_RDONLY | noFollow);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) {
      const error = new Error(`Not a regular file: ${path}`);
      error.code = "UNSAFE_SOURCE_PATH";
      throw error;
    }
    const bytes = Buffer.alloc(Math.min(metadata.size, length));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    return bytes.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
