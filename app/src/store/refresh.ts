// Global "refresh everything role-gated" — dispatched when the user
// transitions from anonymous → signed-in so every screen reads from
// a freshly-authenticated apiFactory() call instead of the cached
// public/anonymous response from before sign-in.
//
// Each loader runs in parallel; errors are swallowed per-loader so one
// broken endpoint doesn't block the rest of the store from refreshing.

import { AppDispatch } from 'skintyee/store';
import moment from 'moment';

import { loadDirectory } from 'skintyee/store/modules/directory';
import { loadEvents } from 'skintyee/store/modules/events';
import { loadMeetings } from 'skintyee/store/modules/meetings';
import { loadNotifications } from 'skintyee/store/modules/notifications';
import { loadPolls } from 'skintyee/store/modules/polls';
// loadPublicRecords removed — the only caller was this refresh fn and
// the underlying /v1/transparency/public-records endpoint isn't a thing
// on the api/. The PublicRecords screen reads loadExpenditures +
// loadMajorProjects directly, both still wired below.
import { loadFeed } from 'skintyee/store/modules/feed';
import { loadRollup } from 'skintyee/store/modules/planner';
import { loadTimeEntries } from 'skintyee/store/modules/timekeeping';
import { loadExpenditures, loadMajorProjects } from 'skintyee/store/modules/transparency';
import { Role } from 'skintyee/models';

export function refreshStoreForSignedInUser(dispatch: AppDispatch, role: Role): void {
  // Fire-and-forget. The slices already manage their own loading state.
  const tryDispatch = (action: any) => {
    try {
      dispatch(action);
    } catch {
      // swallow — one bad loader shouldn't break the others
    }
  };

  // Cross-screen data the user will hit immediately
  tryDispatch(loadDirectory());
  tryDispatch(loadEvents());
  tryDispatch(loadMeetings());
  tryDispatch(loadNotifications());
  tryDispatch(loadPolls());

  // Homescreen "This week" feed needs an explicit window
  tryDispatch(loadFeed({
    role,
    from: moment().startOf('day').toISOString(),
    to:   moment().add(7, 'days').endOf('day').toISOString(),
  }));

  // Records (Financial Summary) data
  tryDispatch(loadExpenditures());
  tryDispatch(loadMajorProjects());

  // Admin/staff surfaces — slices below tolerate the calls even when
  // the role can't read; the api/'s RolesGuard returns 403 and the
  // slice keeps its previous state. Cheap to call, simpler than role
  // gating here.
  tryDispatch(loadRollup());
  tryDispatch(loadTimeEntries());
}
