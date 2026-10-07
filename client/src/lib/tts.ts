let activeAudio: HTMLAudioElement | null = null;
let buttonAudio: HTMLAudioElement | null = null;
let soundQueue = Promise.resolve();
let clickAudioContext: AudioContext | null = null;

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

// Button feedback plays immediately and does not wait behind guidance sounds.
export const playPosClick = () => {
  try {
    buttonAudio?.pause();
    buttonAudio = new Audio('/sound/button-press.mp3');
    buttonAudio.volume = 0.7;
    void buttonAudio.play().catch(() => undefined);
  } catch {
    // Audio feedback is optional; never interrupt a payment action.
  }
};

const playTagTone = (frequency: number, endFrequency: number) => {
  try {
    const AudioContextClass = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    clickAudioContext ||= new AudioContextClass();
    const play = () => {
      if (!clickAudioContext) return;
      const oscillator = clickAudioContext.createOscillator();
      const gain = clickAudioContext.createGain();
      const now = clickAudioContext.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + 0.09);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      oscillator.connect(gain);
      gain.connect(clickAudioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.11);
    };
    if (clickAudioContext.state === 'suspended') {
      void clickAudioContext.resume().then(play).catch(() => undefined);
    } else {
      play();
    }
  } catch {
    // Audio feedback is optional; never interrupt RFID scanning.
  }
};

export const playPosTagAdded = () => playTagTone(660, 1040);
export const playPosTagRemoved = () => playTagTone(420, 220);
