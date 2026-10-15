/*
 * Short beeps so the librarian knows the result of a scan without looking at the screen:
 * one high tone for success, two low tones for a problem. Generated, so no audio files.
 */

let context: AudioContext | undefined;

function tone(frequency: number, startAt: number, duration: number) {
  context ??= new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.15, context.currentTime + startAt);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + startAt + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(context.currentTime + startAt);
  oscillator.stop(context.currentTime + startAt + duration);
}

export function playFeedback(kind: 'success' | 'error') {
  try {
    if (kind === 'success') tone(880, 0, 0.12);
    else {
      tone(220, 0, 0.15);
      tone(220, 0.2, 0.15);
    }
  } catch {
    // No audio available (e.g. blocked by the browser): the screen still shows the result.
  }
}
