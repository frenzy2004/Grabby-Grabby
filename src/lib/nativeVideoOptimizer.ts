export type OptimizedNativeVideo = {
  blob: Blob;
  durationSeconds: number;
  ext: 'webm';
};

const OUTPUT_WIDTH = 540;
const OUTPUT_HEIGHT = 960;
const OUTPUT_FPS = 24;
const OUTPUT_VIDEO_BITRATE = 1_100_000;
const OUTPUT_AUDIO_BITRATE = 32_000;
const MAX_OPTIMIZED_SECONDS = 5;

const recorderMimePriority = [
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];

function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const mime of recorderMimePriority) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return undefined;
}

function drawContainedVideo(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
) {
  const sourceWidth = video.videoWidth || width;
  const sourceHeight = video.videoHeight || height;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const dx = (width - drawWidth) / 2;
  const dy = (height - drawHeight) / 2;

  ctx.fillStyle = '#0e0d0b';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(video, dx, dy, drawWidth, drawHeight);
}

function createSilentAudioTrack() {
  const AudioContextCtor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;

  const audioContext = new AudioContextCtor();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const destination = audioContext.createMediaStreamDestination();

  gain.gain.value = 0;
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start();

  const track = destination.stream.getAudioTracks()[0];
  if (!track) {
    oscillator.stop();
    void audioContext.close();
    return null;
  }

  return {
    track,
    close: () => {
      try {
        oscillator.stop();
      } catch {
        /* ignore */
      }
      track.stop();
      void audioContext.close();
    },
  };
}

async function probeDuration(blob: Blob, fallbackSeconds: number) {
  return await new Promise<number>((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    let settled = false;

    const finish = (duration: number) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(duration);
    };

    const timer = window.setTimeout(() => finish(fallbackSeconds), 3000);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      finish(Number.isFinite(video.duration) ? Math.max(0, video.duration) : fallbackSeconds);
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      finish(fallbackSeconds);
    };
    video.src = url;
  });
}

export async function optimizeNativeVideoClip(
  blob: Blob,
  maxSeconds: number,
  onProgress?: (progress: number) => void,
): Promise<OptimizedNativeVideo> {
  if (
    typeof MediaRecorder === 'undefined' ||
    typeof HTMLCanvasElement === 'undefined' ||
    typeof HTMLCanvasElement.prototype.captureStream !== 'function'
  ) {
    throw new Error('This phone cannot prepare the native video for stitching.');
  }

  const silentAudio = createSilentAudioTrack();
  if (!silentAudio) {
    throw new Error('This phone could not prepare audio for the native video.');
  }

  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });

  if (!ctx) {
    silentAudio.close();
    URL.revokeObjectURL(url);
    throw new Error('Could not prepare this shot for stitching.');
  }

  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;

  const waitForMetadata = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Video took too long to load.')), 5000);
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      resolve();
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('That shot could not be read. Please record it again.'));
    };
  });

  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  await waitForMetadata;

  const sourceDuration = Number.isFinite(video.duration) ? video.duration : maxSeconds;
  const durationLimit = Math.max(
    1,
    Math.min(sourceDuration, maxSeconds, MAX_OPTIMIZED_SECONDS),
  );
  const stream = canvas.captureStream(OUTPUT_FPS);
  stream.addTrack(silentAudio.track);

  const mimeType = pickRecorderMime();
  const recorder = mimeType
    ? new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: OUTPUT_VIDEO_BITRATE,
        audioBitsPerSecond: OUTPUT_AUDIO_BITRATE,
      })
    : new MediaRecorder(stream, {
        videoBitsPerSecond: OUTPUT_VIDEO_BITRATE,
        audioBitsPerSecond: OUTPUT_AUDIO_BITRATE,
      });
  const chunks: Blob[] = [];

  return await new Promise<OptimizedNativeVideo>((resolve, reject) => {
    let raf = 0;
    let timeout = 0;
    let forceFinishTimeout = 0;
    let settled = false;

    const cleanup = () => {
      if (raf) window.cancelAnimationFrame(raf);
      if (timeout) window.clearTimeout(timeout);
      if (forceFinishTimeout) window.clearTimeout(forceFinishTimeout);
      video.pause();
      stream.getTracks().forEach((track) => track.stop());
      silentAudio.close();
      URL.revokeObjectURL(url);
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const output = new Blob(chunks, { type: mimeType ?? 'video/webm' });
      if (output.size <= 0) {
        reject(new Error('That shot did not save cleanly. Please record it again.'));
        return;
      }
      onProgress?.(1);
      resolve({
        blob: output,
        durationSeconds: Math.max(1, Math.round(Math.min(video.currentTime, durationLimit))),
        ext: 'webm',
      });
    };

    const stopRecorder = () => {
      if (recorder.state === 'inactive') {
        finish();
        return;
      }

      try {
        recorder.requestData();
      } catch {
        /* ignore */
      }

      try {
        recorder.stop();
      } catch {
        finish();
        return;
      }

      forceFinishTimeout = window.setTimeout(finish, 1800);
    };

    const draw = () => {
      drawContainedVideo(ctx, video, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      onProgress?.(Math.min(0.98, video.currentTime / durationLimit));

      if (video.ended || video.currentTime >= durationLimit) {
        stopRecorder();
        return;
      }

      raf = window.requestAnimationFrame(draw);
    };

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Could not optimize this shot. Please record a shorter clip.'));
    };
    recorder.onstop = finish;

    timeout = window.setTimeout(stopRecorder, (durationLimit + 3) * 1000);
    recorder.start(500);
    void video.play().then(draw).catch(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Could not play this shot for stitching.'));
    });
  });
}

export async function estimateNativeVideoDuration(blob: Blob, fallbackSeconds: number) {
  return Math.max(1, Math.round(await probeDuration(blob, fallbackSeconds)));
}
