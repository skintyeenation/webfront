import { createAction, createSlice } from '@reduxjs/toolkit';
import { Role } from 'skintyee/models';

/**
 * STUB AUTH. The diagram shows three actors — Public, Band Members, and
 * Band Admins/Staff. Real auth is not wired yet.
 *
 * Chosen real provider: Microsoft Entra ID (Azure AD), to match the Azure /
 * Microsoft Teams / Outlook infrastructure (not AWS Cognito, which is what the
 * ppt app used). The intended path is an OIDC / MSAL flow via expo-auth-session,
 * mapping Entra app roles or group claims onto the `Role` union below.
 *
 * For now this slice just holds the active `role` and a display name, and exposes
 * a `setRole` action used by the dev Role Switcher on the Account screen so every
 * role-gated menu can be demoed without an identity provider. See STUBS.md.
 */
export const setRole = createAction<Role>('set_role');
export const setSignedInName = createAction<string>('set_signed_in_name');

export interface AuthState {
  role: Role;
  name: string;
}

export const authInitialState: AuthState = {
  // STUB: default to 'public'; flip via the Account screen Role Switcher.
  role: 'public',
  name: 'Guest',
};

const authSlice = createSlice({
  name: 'auth',
  initialState: authInitialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(setRole, (state, action) => {
      const role = action.payload;
      // STUB: derive a display name from the chosen role for demo purposes. The
      // name doubles as the "logged-in worker" for timesheets (staff).
      const nameByRole: Record<string, string> = {
        admin: 'Sandra Williams (Admin)',
        staff: 'Joseph Alec (Staff)',
        member: 'Rita Thomas (Member)',
        public: 'Guest',
      };
      return { ...state, role, name: nameByRole[role] ?? 'Guest' };
    });
    builder.addCase(setSignedInName, (state, action) => ({ ...state, name: action.payload }));
  },
});

export default authSlice.reducer;
