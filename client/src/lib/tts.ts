let activeAudio: HTMLAudioElement | null = null;
let soundQueue = Promise.resolve();

const playAudioUrl = async (audioUrl: string) => {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
  }

  activeAudio = new Audio(audioUrl);

  try {
    await activeAudio.play();
    await new Promise<void>((resolve, reject) => {
      if (!activeAudio) {
        resolve();
        return;
      }
      activeAudio.onended = () => resolve();
      activeAudio.onerror = () => reject(new Error('Audio playback failed'));
    });
  } finally {
    activeAudio = null;
  }
};

export const stopPosSound = () => {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};

export const playPosSound = (audioUrl: string) => {
  if (!audioUrl) {
    return soundQueue;
  }

  soundQueue = soundQueue
    .then(async () => {
      await playAudioUrl(audioUrl);
    })
    .catch((error) => {
      console.warn('POS sound failed:', error);
    });

  return soundQueue;
};

export const playPosSounds = (audioUrls: string[]) => {
  const playableUrls = audioUrls.filter(Boolean);
  if (playableUrls.length === 0) {
    return soundQueue;
  }

  soundQueue = soundQueue
    .then(async () => {
      for (const audioUrl of playableUrls) {
        await playAudioUrl(audioUrl);
      }
    })
    .catch((error) => {
      console.warn('POS sound failed:', error);
    });

  return soundQueue;
};
