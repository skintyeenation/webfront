import { Platform, StyleSheet } from 'react-native';
import { MD2DarkTheme as DarkTheme } from 'react-native-paper';

/**
 * Theme — kept in sync with @skintyee/app/src/styles.tsx so the Skin Tyee Lookup
 * tool looks and feels like the band app: cyan/orange dark palette, zero
 * roundness, sans-serif everywhere.
 */
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
    secondary: '#444444',
    default: '#BDC1C6',
    darkDefault: '#1D1D1D',
    defaultBorder: 'rgba(255,255,255,0.29)',
    accent: '#EC6A37',
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
    maxWidth: Platform.OS === 'web' ? ('1100px' as any) : '100%',
    // Centre the bounded content area in the viewport on web.
    alignSelf: 'center',
    colorScheme: 'dark',
    height: '100%',
    flex: 1,
    overflowY: 'auto',
  } as any,
  visibleContent: { padding: 15 },
  sectionTitle: { fontSize: 18, color: theme.colors.text, marginBottom: 4 },
  metaText: { color: theme.colors.textDarker, fontSize: 13 },
  textField: {
    marginBottom: 10,
    backgroundColor: theme.colors.surface,
    fontSize: 13,
    fontFamily: theme.fonts.thin.fontFamily,
  },
} as any);

export default styles;
export { theme };
