import type { GlobalState } from '../types';
import type { NoirgramSettings } from '../types/sharedState';

const DEFAULT_NOIRGRAM_SETTINGS: NoirgramSettings = {};

export function selectSharedState<T extends GlobalState>(
  global: T,
) {
  return global.sharedState;
}

export function selectSharedSettings<T extends GlobalState>(
  global: T,
) {
  return selectSharedState(global).settings;
}

export function selectMessageTextSize<T extends GlobalState>(global: T) {
  return selectSharedSettings(global).messageTextSize;
}

export function selectNoirgramSettings<T extends GlobalState>(global: T) {
  return selectSharedSettings(global).noirgram || DEFAULT_NOIRGRAM_SETTINGS;
}

export function selectAnimationLevel<T extends GlobalState>(
  global: T,
) {
  return selectSharedSettings(global).animationLevel;
}
