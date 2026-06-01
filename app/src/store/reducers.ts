import { combineReducers } from '@reduxjs/toolkit';

import app from 'skintyee/store/modules/appState';
import auth from 'skintyee/store/modules/auth';
import directory from 'skintyee/store/modules/directory';
import events from 'skintyee/store/modules/events';
import meetings from 'skintyee/store/modules/meetings';
import publicRecords from 'skintyee/store/modules/publicRecords';
import timekeeping from 'skintyee/store/modules/timekeeping';
import financials from 'skintyee/store/modules/financials';
import polls from 'skintyee/store/modules/polls';
import notifications from 'skintyee/store/modules/notifications';
import transparency from 'skintyee/store/modules/transparency';
import planner from 'skintyee/store/modules/planner';
import feed from 'skintyee/store/modules/feed';

export const rootReducer = combineReducers({
  app,
  auth,
  directory,
  events,
  meetings,
  publicRecords,
  timekeeping,
  financials,
  polls,
  notifications,
  transparency,
  planner,
  feed,
});
