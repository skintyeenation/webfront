// Feature flags — single file for runtime gates that aren't role- or
// auth-based. Each flag has a one-line description so the entire knob
// set is grep-able and changeable in one place.
//
// Why a separate file from config.ts:
//   - config.ts is environment-dependent (apiServer, isProd, tenant IDs).
//   - Feature flags are policy-dependent (do we want behaviour X right
//     now?) and tend to change independently of environments.
//
// To make any of these env-overridable later, add to app.config.js's
// `extra` block + read via expo-constants in this file. For now they're
// hardcoded — the audit trail lives in git history alongside the flip.

const FEATURES = {
  /**
   * Hide Microsoft 365–dependent Dashboard widgets (My projects,
   * My tasks) from external users (staff-auth path — no Entra
   * identity, no M365). When false, the widgets render for everyone
   * — externals will see empty states because Graph has nothing to
   * return for their UPN. When true (default), the widgets and the
   * data fetches behind them are skipped entirely for staff-auth
   * users, which also avoids the noisy Graph 404 warnings.
   * Flip to false if you want externals to see the same Dashboard
   * shape as Entra users (useful while shipping cross-cutting
   * widget changes — same surface for everyone simplifies QA).
   */
  hideM365WidgetsForExternals: true,
};

export default FEATURES;
