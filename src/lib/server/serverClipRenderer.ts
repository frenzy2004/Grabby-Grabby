import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

type ClipFile = {
  file?: File;
  filePath?: string;
  ext: string;
};

export type ServerRenderInput = {
  videoClips: ClipFile[];
  audioClips: ClipFile[];
};

export type ServerRenderResult = {
  bytes: Buffer;
  durationSeconds: number;
  filename: string;
};

const WORK_DIR = path.join(process.cwd(), '.local-review-data', 'server-renders');
const VIDEO_WIDTH = 540;
const VIDEO_HEIGHT = 960;
const VIDEO_FPS = 24;
const MIN_VIDEO_CLIP_SECONDS = 5;
const MAX_VIDEO_CLIP_SECONDS = 7;
const MAX_AUDIO_CLIP_SECONDS = 12;
const FINAL_VIDEO_MAX_SECONDS = 17;

function safeExt(ext: string) {
  const normalized = ext.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized === 'mp4' || normalized === 'mov' || normalized === 'webm') return normalized;
  if (normalized === 'm4a' || normalized === 'mp3' || normalized === 'wav') return normalized;
  return 'webm';
}

async function runCommand(command: string, args: string[], label: string) {
  return await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const logs: string[] = [];
    const collect = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed) logs.push(trimmed);
      }
      if (logs.length > 80) logs.splice(0, logs.length - 80);
    };

    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (err) => {
      reject(new Error(`${label} failed to start: ${err.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          logs.length
            ? `${label} failed with exit code ${code}: ${logs.slice(-10).join(' | ')}`
            : `${label} failed with exit code ${code}`,
        ),
      );
    });
  });
}

async function writeClip(file: File, filePath: string) {
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length <= 0) throw new Error('One of the clips was empty.');
  await writeFile(filePath, bytes);
}

async function prepareClipSource(clip: ClipFile, fallbackPath: string) {
  if (clip.filePath) return clip.filePath;
  if (!clip.file) throw new Error('Clip source is missing.');
  await writeClip(clip.file, fallbackPath);
  return fallbackPath;
}

async function probeDuration(filePath: string) {
  try {
    const args = [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ];
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn('ffprobe', args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`ffprobe exited with ${code}`));
      });
    });
    const duration = Number(output);
    return Number.isFinite(duration) ? Math.max(0, duration) : 0;
  } catch {
    return 0;
  }
}

function formatDuration(seconds: number) {
  return seconds.toFixed(3).replace(/\.?0+$/, '');
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export async function renderClipsOnServer(input: ServerRenderInput): Promise<ServerRenderResult> {
  if (input.videoClips.length === 0) {
    throw new Error('No video clips were uploaded.');
  }

  const runId = Math.random().toString(36).slice(2, 10);
  const runDir = path.join(WORK_DIR, runId);
  await mkdir(runDir, { recursive: true });

  const videoPaths: string[] = [];
  const audioPaths: string[] = [];
  const outputPath = path.join(runDir, `matcha-server-${runId}.mp4`);

  try {
    for (let i = 0; i < input.videoClips.length; i++) {
      const clip = input.videoClips[i]!;
      const filePath = path.join(runDir, `video-${i}.${safeExt(clip.ext)}`);
      videoPaths.push(await prepareClipSource(clip, filePath));
    }

    for (let i = 0; i < input.audioClips.length; i++) {
      const clip = input.audioClips[i]!;
      const filePath = path.join(runDir, `audio-${i}.${safeExt(clip.ext)}`);
      audioPaths.push(await prepareClipSource(clip, filePath));
    }

    const [videoDurations, audioDurations] = await Promise.all([
      Promise.all(videoPaths.map(probeDuration)),
      Promise.all(audioPaths.map(probeDuration)),
    ]);

    const hasVoiceover = audioPaths.length > 0;
    const audioDurationSeconds = audioDurations.reduce((total, duration) => total + duration, 0);
    const videoClipSeconds =
      hasVoiceover
        ? MAX_VIDEO_CLIP_SECONDS
        : audioDurationSeconds > 0
          ? clamp(
              Math.ceil(audioDurationSeconds / videoPaths.length),
              MIN_VIDEO_CLIP_SECONDS,
              MAX_VIDEO_CLIP_SECONDS,
            )
          : MIN_VIDEO_CLIP_SECONDS;
    const cappedVideoDurations = videoDurations.map((duration) =>
      duration > 0 ? Math.min(duration, videoClipSeconds) : videoClipSeconds,
    );
    const baseVideoDurationSeconds = cappedVideoDurations.reduce((total, duration) => total + duration, 0);
    const renderTargetSeconds =
      hasVoiceover ? FINAL_VIDEO_MAX_SECONDS : Math.max(1, baseVideoDurationSeconds);
    const loopFrameCount = Math.max(1, Math.ceil(baseVideoDurationSeconds * VIDEO_FPS));

    const inputArgs = [
      ...videoPaths.flatMap((filePath) => [
        '-t',
        formatDuration(videoClipSeconds),
        '-i',
        filePath,
      ]),
      ...audioPaths.flatMap((filePath) => [
        '-t',
        String(MAX_AUDIO_CLIP_SECONDS),
        '-i',
        filePath,
      ]),
    ];

    const videoFilters = videoPaths
      .map((_, i) => {
        return (
          `[${i}:v]trim=duration=${formatDuration(videoClipSeconds)},setpts=PTS-STARTPTS,` +
          `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,` +
          `pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2,` +
          `setsar=1,fps=${VIDEO_FPS},format=yuv420p[v${i}]`
        );
      })
      .join(';');
    const videoInputs = videoPaths.map((_, i) => `[v${i}]`).join('');
    const videoConcat = `${videoInputs}concat=n=${videoPaths.length}:v=1:a=0[vcat]`;
    const videoFinalize = hasVoiceover
      ? `[vcat]loop=loop=-1:size=${loopFrameCount}:start=0,trim=duration=${formatDuration(
          renderTargetSeconds,
        )},setpts=PTS-STARTPTS[v]`
      : `[vcat]trim=duration=${formatDuration(renderTargetSeconds)},setpts=PTS-STARTPTS[v]`;

    const audioOffset = videoPaths.length;
    const audioFilters = audioPaths
      .map((_, i) => {
        return (
          `[${audioOffset + i}:a]atrim=duration=${MAX_AUDIO_CLIP_SECONDS},` +
          `aresample=48000,asetpts=PTS-STARTPTS[a${i}]`
        );
      })
      .join(';');
    const audioInputs = audioPaths.map((_, i) => `[a${i}]`).join('');
    const audioConcat = audioPaths.length
      ? `${audioInputs}concat=n=${audioPaths.length}:v=0:a=1[acat]`
      : '';
    const audioFinalize = audioPaths.length
      ? `[acat]atrim=duration=${FINAL_VIDEO_MAX_SECONDS},asetpts=PTS-STARTPTS[a]`
      : '';

    // Cap every voiceover render to a short-form 17 seconds. The b-roll loops
    // only to that cap, and -shortest ends the file with the actual audio.
    const filterComplex = [videoFilters, videoConcat, videoFinalize, audioFilters, audioConcat, audioFinalize]
      .filter(Boolean)
      .join(';');

    const outputArgs = audioPaths.length
      ? ['-map', '[v]', '-map', '[a]']
      : ['-map', '[v]'];

    await runCommand(
      'ffmpeg',
      [
        '-y',
        ...inputArgs,
        '-filter_complex',
        filterComplex,
        ...outputArgs,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-tune',
        'zerolatency',
        '-crf',
        '30',
        '-r',
        String(VIDEO_FPS),
        ...(audioPaths.length ? ['-shortest', '-c:a', 'aac', '-b:a', '96k'] : ['-an']),
        '-movflags',
        '+faststart',
        '-avoid_negative_ts',
        'make_zero',
        outputPath,
      ],
      'Server clip render',
    );

    const bytes = await readFile(outputPath);
    if (bytes.length <= 0) throw new Error('Server render produced an empty video.');

    return {
      bytes,
      durationSeconds: Math.round(await probeDuration(outputPath)),
      filename: `matcha-server-${runId}.mp4`,
    };
  } finally {
    await rm(runDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
