/**
 * Client-side video concatenation using ffmpeg.wasm.
 *
 * Why client-side: Humeo's existing /api/public/reviews/submit endpoint accepts
 * a single video file. To avoid backend changes for v1, we stitch the 5 clips
 * in the browser before upload.
 *
 * Cost: ~8MB of WASM lazy-loaded after the customer finishes recording.
 * Performance: ~50 seconds of total video concatenates in 5-10s on a modern phone.
 *
 * Future: if cafes complain about phone heat or battery, swap to multi-clip
 * upload + ffmpeg-on-server. The Humeo BE worker (processInterview.ts) already
 * uses ffmpeg.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

async function createFFmpeg(): Promise<FFmpeg> {
  const ffmpeg = new FFmpeg();
  // ffmpeg.wasm fetches its core from a CDN by default; for SharedArrayBuffer
  // support we need the COOP/COEP headers set in next.config.js.
  await ffmpeg.load();
  return ffmpeg;
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
 * MediaRecorder WebM clips can carry timestamp offsets from the live preview
 * stream. A fast stream-copy concat preserves those offsets, which can make the
 * produced video freeze while the timestamp keeps moving. Decode every clip,
 * reset audio/video PTS to zero, normalize to a vertical canvas, then concat.
 */
export async function concatClips(
  inputs: ConcatInput[],
  onProgress?: (progress: number) => void,
): Promise<ConcatResult> {
  if (inputs.length === 0) {
    throw new Error('No clips to concatenate');
  }

  const ffmpeg = await createFFmpeg();
  const logs: string[] = [];

  const logHandler = ({ message }: { message: string }) => {
    const trimmed = message.trim();
    if (trimmed) logs.push(trimmed);
    if (logs.length > 80) logs.splice(0, logs.length - 80);
  };
  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.max(0, Math.min(1, progress)));
  };

  ffmpeg.on('log', logHandler);
  ffmpeg.on('progress', progressHandler);

  const runId = Math.random().toString(36).slice(2, 8);
  const inputFiles: string[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]!;
    const ext = input.ext ?? 'webm';
    const filename = `input_${runId}_${i}.${ext}`;
    await ffmpeg.writeFile(filename, await fetchFile(input.blob));
    inputFiles.push(filename);
  }

  const outputName = `matcha-moments-${runId}.webm`;
  const listName = `list-${runId}.txt`;

  async function runOrThrow(args: string[], label: string) {
    logs.length = 0;
    const exitCode = await ffmpeg.exec(args);
    if (exitCode !== 0) {
      const detail = logs.slice(-12).join(' | ');
      throw new Error(
        detail
          ? `${label} failed with ffmpeg exit code ${exitCode}: ${detail}`
          : `${label} failed with ffmpeg exit code ${exitCode}`,
      );
    }
  }

  async function removeOutput() {
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      /* ignore */
    }
  }

  async function writeConcatList() {
    const listText = inputFiles.map((name) => `file '${name}'`).join('\n');
    await ffmpeg.writeFile(listName, new TextEncoder().encode(listText));
  }

  async function runSmoothConcat() {
    await writeConcatList();

    await runOrThrow([
      '-y',
      '-fflags',
      '+genpts',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listName,
      '-vf',
      'setpts=PTS-STARTPTS,scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30',
      '-af',
      'aresample=async=1:first_pts=0',
      '-c:v',
      'libvpx',
      '-b:v',
      '1.8M',
      '-deadline',
      'realtime',
      '-cpu-used',
      '6',
      '-c:a',
      'libopus',
      '-b:a',
      '96k',
      '-avoid_negative_ts',
      'make_zero',
      outputName,
    ], 'Smooth concat');
  }

  async function runCopyConcat() {
    await writeConcatList();

    await runOrThrow([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listName,
      '-c',
      'copy',
      '-avoid_negative_ts',
      'make_zero',
      outputName,
    ], 'Reliable concat');
  }

  let lastError: unknown = null;
  for (const strategy of [runSmoothConcat, runCopyConcat]) {
    try {
      await strategy();
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      await removeOutput();
    }
  }

  if (lastError) {
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
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
    await ffmpeg.deleteFile(listName);
    await ffmpeg.deleteFile(outputName);
  } catch {
    /* ignore */
  }
  ffmpeg.off('log', logHandler);
  ffmpeg.off('progress', progressHandler);
  ffmpeg.terminate();

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
