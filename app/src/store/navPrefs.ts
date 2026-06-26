import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_NAV_POSITION, DEFAULT_NAV_EXPANDED, NavPosition } from 'skintyee/store/modules/appState';

// Per-user persistence for the nav-placement preference.
//
// AsyncStorage is the one cross-platform store: on web + Electron it sits on top
// of localStorage; on iOS/Android it uses native storage. So this works on every
// target without per-platform branching.
//
// Keyed by the signed-in user's UPN so each user keeps their own choice on a
// shared device. The toggle is only shown when signed in, so we never persist an
// anonymous value — logged-out always falls back to DEFAULT_NAV_POSITION ('left'
// → left rail on desktop, bottom on phones via the width check in the navigator).

const keyFor = (upn?: string | null) => `navPosition:${(upn ?? '').toLowerCase() || 'default'}`;

/** Load a user's saved nav position, or the default ('left') if none/invalid. */
export async function loadNavPosition(upn?: string | null): Promise<NavPosition> {
  try {
    const v = await AsyncStorage.getItem(keyFor(upn));
    return v === 'left' || v === 'bottom' ? v : DEFAULT_NAV_POSITION;
  } catch {
    return DEFAULT_NAV_POSITION;
  }
}

/** Persist a user's nav position under their own key. Best-effort. */
export async function saveNavPosition(upn: string | null | undefined, pos: NavPosition): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(upn), pos);
  } catch {
    /* best-effort; non-fatal if storage is unavailable */
  }
}

// Per-user persistence for the left-rail expanded/collapsed preference. Same
// pattern + storage as nav position, keyed separately.
const expandedKeyFor = (upn?: string | null) => `navExpanded:${(upn ?? '').toLowerCase() || 'default'}`;

/** Load a user's saved rail expanded state (default collapsed). */
export async function loadNavExpanded(upn?: string | null): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(expandedKeyFor(upn));
    return v === null ? DEFAULT_NAV_EXPANDED : v === '1';
  } catch {
    return DEFAULT_NAV_EXPANDED;
  }
}

/** Persist a user's rail expanded state under their own key. Best-effort. */
export async function saveNavExpanded(upn: string | null | undefined, expanded: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(expandedKeyFor(upn), expanded ? '1' : '0');
  } catch {
    /* best-effort; non-fatal if storage is unavailable */
  }
}
