import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

export type AudioInput = {
  blob: Blob;
  ext?: 'webm' | 'mp4' | 'mov';
};

export type VoiceoverResult = {
  blob: Blob;
  durationSeconds: number;
  filename: string;
};

async function createFFmpeg(): Promise<FFmpeg> {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load();
  return ffmpeg;
}

export async function addVoiceoverToVideo(
  video: { blob: Blob; filename?: string },
  audioInputs: AudioInput[],
  onProgress?: (progress: number) => void,
): Promise<VoiceoverResult> {
  if (audioInputs.length === 0) {
    return {
      blob: video.blob,
      durationSeconds: await probeDuration(video.blob),
      filename: video.filename ?? 'matcha-moments.webm',
    };
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
  const videoName = `food-video-${runId}.webm`;
  const audioFiles: string[] = [];
  const voiceName = `voiceover-${runId}.webm`;
  const outputName = `matcha-voiceover-${runId}.webm`;

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

  try {
    await ffmpeg.writeFile(videoName, await fetchFile(video.blob));

    for (let i = 0; i < audioInputs.length; i++) {
      const input = audioInputs[i]!;
      const filename = `voice-${runId}-${i}.${input.ext ?? 'webm'}`;
      await ffmpeg.writeFile(filename, await fetchFile(input.blob));
      audioFiles.push(filename);
    }

    const inputArgs = audioFiles.flatMap((name) => ['-i', name]);
    const normalizedAudio = audioFiles
      .map((_, i) => `[${i}:a]aresample=48000,asetpts=PTS-STARTPTS[a${i}]`)
      .join(';');
    const concatInputs = audioFiles.map((_, i) => `[a${i}]`).join('');
    const filterComplex = `${normalizedAudio};${concatInputs}concat=n=${audioFiles.length}:v=0:a=1[a]`;

    await runOrThrow([
      '-y',
      ...inputArgs,
      '-filter_complex',
      filterComplex,
      '-map',
      '[a]',
      '-c:a',
      'libopus',
      '-b:a',
      '96k',
      voiceName,
    ], 'Voiceover concat');

    await runOrThrow([
      '-y',
      '-i',
      videoName,
      '-i',
      voiceName,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'copy',
      '-c:a',
      'copy',
      outputName,
    ], 'Voiceover mux');

    const data = await ffmpeg.readFile(outputName);
    const bytes =
      typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);
    const blob = new Blob([buf], { type: 'video/webm' });

    return {
      blob,
      durationSeconds: await probeDuration(blob),
      filename: outputName,
    };
  } finally {
    for (const name of [videoName, voiceName, outputName, ...audioFiles]) {
      try {
        await ffmpeg.deleteFile(name);
      } catch {
        /* ignore */
      }
    }
    ffmpeg.off('log', logHandler);
    ffmpeg.off('progress', progressHandler);
    ffmpeg.terminate();
  }
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
