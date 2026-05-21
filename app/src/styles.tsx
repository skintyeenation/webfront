import { Platform, StyleSheet } from 'react-native';
import { MD2DarkTheme as DarkTheme } from 'react-native-paper';

/**
 * Theme copied from the ppt (Mediashare / PocketPT) app so the look and feel
 * carry over: the cyan/orange dark palette, zero roundness.
 *
 * Fonts: a sans-serif (NON-serif) system stack is used everywhere. The ppt app
 * used CircularStd (also sans-serif); those .otf files are not bundled here, so
 * we explicitly pin a sans-serif system stack rather than risk a serif fallback.
 * To match ppt exactly later, drop the CircularStd-*.otf files into assets/fonts/
 * and load them via useFonts in Application.tsx. See STUBS.md.
 */
// Sans-serif everywhere: a system stack on web, the (sans-serif) system font on native.
const sansSerif =
  Platform.select({
    web: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    default: 'System',
  }) || 'System';
const theme = {
  ...DarkTheme,
  roundness: 0,
  colors: {
    ...DarkTheme.colors,
    background: 'rgba(30,30,30,1)',
    success: '#9ECD3B',
    primary: '#00B8EC',
    secondary: '#444444', // Custom property
    default: '#BDC1C6',
    darkDefault: '#1D1D1D',
    defaultBorder: 'rgba(255,255,255,0.29)',
    accent: '#EC6A37', // mandarin orange
    textDarker: '#BDC1C6',
    text: 'rgba(255,255,255,1)',
    error: 'rgba(242,22,81,1)',
    errorDark: 'rgba(242,22,81,0.5)',
    white: '#ffffff',
  },
  fonts: {
    bold: { fontFamily: sansSerif, fontWeight: '700' },
    medium: { fontFamily: sansSerif, fontWeight: '500' },
    regular: { fontFamily: sansSerif, fontWeight: '400' },
    light: { fontFamily: sansSerif, fontWeight: '300' },
    thin: { fontFamily: sansSerif, fontWeight: '300' },
  },
} as const;

const styles: any = StyleSheet.create({
  pageContainer: {
    height: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  pageContent: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? ('1200px' as any) : '100%',
    colorScheme: 'dark',
    height: '100%',
    flex: 1,
    overflowY: 'auto', // This only works in web
  } as any,
  pageActions: {
    display: 'flex',
    width: '100%',
    height: 41,
    backgroundColor: 'transparent',
  },
  visibleContent: {
    padding: 15,
  },
  listItem: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabContent: {
    backgroundColor: theme.colors.background,
    padding: 5,
  },
  container: {
    height: '100%',
  },
  flexContainer: {
    flex: 1,
  },
  row: {
    flex: 1,
    alignItems: 'center',
  },
  mt: {
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 18,
    color: theme.colors.text,
    marginBottom: 4,
  },
  metaText: {
    color: theme.colors.textDarker,
    fontSize: 13,
  },
  textField: {
    marginBottom: 10,
    backgroundColor: theme.colors.surface,
    fontSize: 13,
    fontFamily: theme.fonts.thin.fontFamily,
  },
  itemControls: {
    display: 'flex',
    flexDirection: 'row',
    borderTopColor: theme.colors.defaultBorder,
    borderTopWidth: 1,
  },
} as any);

export default styles;

export { theme };
