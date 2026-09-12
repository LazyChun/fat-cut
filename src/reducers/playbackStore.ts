import { useSyncExternalStore } from "react";

interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  rate: number;
}

const initialState: PlaybackState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  rate: 1,
};

let state = initialState;
const listeners = new Set<() => void>();

const emitChange = () => {
  listeners.forEach((listener) => listener());
};

const setState = (updater: (prev: PlaybackState) => PlaybackState) => {
  const next = updater(state);
  if (next === state) {
    return;
  }
  state = next;
  emitChange();
};

const play = () => {
  setState((prev) => {
    if (prev.isPlaying) {
      return prev;
    }
    if (prev.currentTime >= prev.duration && prev.duration > 0) {
      return { ...prev, isPlaying: true, currentTime: 0 };
    }
    return { ...prev, isPlaying: true };
  });
};

const pause = () => {
  setState((prev) => (prev.isPlaying ? { ...prev, isPlaying: false } : prev));
};

const seek = (time: number) => {
  setState((prev) => {
    const clamped = Math.max(0, Math.min(time, prev.duration));
    return { ...prev, currentTime: clamped };
  });
};

const tick = (dt: number) => {
  setState((prev) => {
    if (!prev.isPlaying) {
      return prev;
    }
    const nextTime = prev.currentTime + dt * prev.rate;
    if (nextTime >= prev.duration) {
      return { ...prev, currentTime: prev.duration, isPlaying: false };
    }
    return { ...prev, currentTime: nextTime };
  });
};

const setDuration = (duration: number) => {
  setState((prev) => {
    const clamped = Math.max(0, duration);
    const currentTime = Math.min(prev.currentTime, clamped);
    return { ...prev, duration: clamped, currentTime };
  });
};

const setRate = (rate: number) => {
  setState((prev) => ({ ...prev, rate: rate > 0 ? rate : 1 }));
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => state;

const playbackStore = {
  getState: getSnapshot,
  play,
  pause,
  seek,
  tick,
  setDuration,
  setRate,
  subscribe,
};

const usePlaybackStore = () => useSyncExternalStore(subscribe, getSnapshot);
const usePlaybackCurrentTime = () => useSyncExternalStore(subscribe, () => state.currentTime);
const usePlaybackDuration = () => useSyncExternalStore(subscribe, () => state.duration);
const usePlaybackIsPlaying = () => useSyncExternalStore(subscribe, () => state.isPlaying);

export type { PlaybackState };
export { playbackStore, usePlaybackStore, usePlaybackCurrentTime, usePlaybackDuration, usePlaybackIsPlaying };
