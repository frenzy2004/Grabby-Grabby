/**
 * Client-side video concatenation using ffmpeg.wasm.
 *
 * Why client-side: Humeo's existing /api/public/reviews/submit endpoint accepts
 * a single video file. To avoid backend changes for v1, we stitch the 5 clips
 * in the browser before upload.
 *
 * Cost: ~8MB of WASM lazy-loaded after the customer finishes recording.
 * Performance: ~50 seconds of total video concatenates in 3-6s on a modern phone.
 *
 * Future: if cafes complain about phone heat or battery, swap to multi-clip
 * upload + ffmpeg-on-server. The Humeo BE worker (processInterview.ts) already
 * uses ffmpeg.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpegSingleton: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    // ffmpeg.wasm fetches its core from a CDN by default; for SharedArrayBuffer
    // support we need the COOP/COEP headers set in next.config.js.
    await ffmpeg.load();
    ffmpegSingleton = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}

export type ConcatInput = {
  blob: Blob;
  /** Hint for input file extension; .webm fallback otherwise. */
  ext?: 'webm' | 'mp4' | 'mov';
};

export type ConcatResult = {
  blob: Blob;
  durationSeconds: number;
  filename: string;
};

/**
 * Concatenate an ordered list of recorded video Blobs into a single output blob.
 *
 * Strategy: write each input as inputN.<ext>, generate a concat list file,
 * run `ffmpeg -f concat -safe 0 -i list.txt -c copy out.webm`. If the `-c copy`
 * fast-path fails (codec mismatch between clips), retry with full re-encode.
 */
export async function concatClips(
  inputs: ConcatInput[],
  onProgress?: (progress: number) => void,
): Promise<ConcatResult> {
  if (inputs.length === 0) {
    throw new Error('No clips to concatenate');
  }

  const ffmpeg = await getFFmpeg();

  if (onProgress) {
    ffmpeg.on('progress', ({ progress }) => onProgress(Math.max(0, Math.min(1, progress))));
  }

  const inputFiles: string[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]!;
    const ext = input.ext ?? 'webm';
    const filename = `input_${i}.${ext}`;
    await ffmpeg.writeFile(filename, await fetchFile(input.blob));
    inputFiles.push(filename);
  }

  const listText = inputFiles.map((name) => `file '${name}'`).join('\n');
  await ffmpeg.writeFile('list.txt', new TextEncoder().encode(listText));

  const outputName = 'matcha-moments.webm';

  let succeeded = false;
  try {
    // Fast path: stream-copy concat. Works when codecs match across clips.
    await ffmpeg.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', 'list.txt',
      '-c', 'copy',
      outputName,
    ]);
    succeeded = true;
  } catch {
    // Fall through to re-encode path.
  }

  if (!succeeded) {
    // Re-encode path. Slower but tolerant of codec/format drift between clips.
    await ffmpeg.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', 'list.txt',
      '-c:v', 'libvpx-vp9',
      '-b:v', '1.5M',
      '-c:a', 'libopus',
      '-b:a', '128k',
      outputName,
    ]);
  }

  const data = await ffmpeg.readFile(outputName);
  // ffmpeg.readFile returns string | Uint8Array; for a binary file it's Uint8Array.
  // Copy into a fresh ArrayBuffer-backed view so TS / Blob APIs are happy
  // even if the underlying buffer was a SharedArrayBuffer.
  const bytes =
    typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const blob = new Blob([buf], { type: 'video/webm' });

  // Cleanup
  for (const name of inputFiles) {
    try {
      await ffmpeg.deleteFile(name);
    } catch {
      /* ignore */
    }
  }
  try {
    await ffmpeg.deleteFile('list.txt');
    await ffmpeg.deleteFile(outputName);
  } catch {
    /* ignore */
  }

  // Probe duration via the same helper used elsewhere.
  const duration = await probeDuration(blob);

  return {
    blob,
    durationSeconds: duration,
    filename: outputName,
  };
}

async function probeDuration(blob: Blob): Promise<number> {
  return await new Promise<number>((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      resolve(Number.isFinite(video.duration) ? Math.max(0, video.duration) : 0);
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      resolve(0);
      URL.revokeObjectURL(url);
    };
    video.src = url;
  });
}
