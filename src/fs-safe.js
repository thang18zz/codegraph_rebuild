import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";

async function rejectSymbolicLink(path) {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink()) {
    const error = new Error(`Refusing to follow symbolic link: ${path}`);
    error.code = "UNSAFE_SOURCE_PATH";
    throw error;
  }
}

export async function readFileNoFollow(path) {
  await rejectSymbolicLink(path);
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
  await rejectSymbolicLink(path);
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
