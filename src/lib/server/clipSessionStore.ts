import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';

export type StoredClip = {
  step: number;
  mediaType: 'video' | 'audio';
  ext: 'webm' | 'mp4' | 'mov';
  filePath: string;
  size: number;
};

const SESSION_ROOT = path.join(process.cwd(), '.local-review-data', 'clip-sessions');
const MAX_CLIP_BYTES = 120 * 1024 * 1024;

function safeSessionId(sessionId: string) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(sessionId)) return null;
  return sessionId;
}

function safeExt(ext: string): StoredClip['ext'] {
  const normalized = ext.toLowerCase();
  if (normalized === 'mp4' || normalized === 'mov' || normalized === 'webm') return normalized;
  return 'webm';
}

function sessionDir(sessionId: string) {
  const safe = safeSessionId(sessionId);
  if (!safe) return null;

  const absolute = path.resolve(SESSION_ROOT, safe);
  const root = path.resolve(SESSION_ROOT);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) return null;
  return absolute;
}

export async function saveSessionClip(input: {
  sessionId: string;
  step: number;
  mediaType: 'video' | 'audio';
  ext: string;
  file: File;
}) {
  const dir = sessionDir(input.sessionId);
  if (!dir) throw new Error('Invalid upload session.');
  if (!Number.isInteger(input.step) || input.step < 1 || input.step > 20) {
    throw new Error('Invalid clip step.');
  }
  if (input.file.size <= 0) throw new Error('Clip was empty.');
  if (input.file.size > MAX_CLIP_BYTES) {
    throw new Error('Clip is too large. Please record shorter shots.');
  }

  const ext = safeExt(input.ext);
  await mkdir(dir, { recursive: true });

  const filePath = path.join(dir, `${input.step}-${input.mediaType}.${ext}`);
  const bytes = Buffer.from(await input.file.arrayBuffer());
  await writeFile(filePath, bytes);

  return {
    sessionId: input.sessionId,
    step: input.step,
    mediaType: input.mediaType,
    ext,
    size: bytes.length,
  };
}

export async function listSessionClips(sessionId: string) {
  const dir = sessionDir(sessionId);
  if (!dir) throw new Error('Invalid upload session.');

  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const clips: StoredClip[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = /^(\d+)-(video|audio)\.(webm|mp4|mov)$/.exec(entry.name);
    if (!match) continue;

    const filePath = path.join(dir, entry.name);
    const size = (await readFile(filePath)).byteLength;
    clips.push({
      step: Number(match[1]),
      mediaType: match[2] as 'video' | 'audio',
      ext: match[3] as StoredClip['ext'],
      filePath,
      size,
    });
  }

  return clips.sort((a, b) => a.step - b.step);
}

export async function cleanupSessionClips(sessionId: string) {
  const dir = sessionDir(sessionId);
  if (!dir) return;
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}
