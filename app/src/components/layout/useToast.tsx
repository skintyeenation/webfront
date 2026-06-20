import React, { useCallback, useState } from 'react';
import { Portal, Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from 'skintyee/styles';

// ----------------------------------------------------------------------------
// App-wide toast. One hook used by every screen that saves, so toasts behave
// identically everywhere:
//
//   • Anchored ABSOLUTELY just below the app's top navbar (Appbar.Header) via
//     a Portal — not inside the page ScrollView, so it never scrolls away.
//   • Re-fires on EVERY call, even when the message is identical to the last
//     one (a bumped key remounts the Snackbar) — so two Save clicks toast twice.
//   • success (green) / error (red) variants.
//
// Usage:
//   const { showToast, toastNode } = useToast();
//   ... showToast('Saved');  /  showToast('Save failed', 'error');
//   return (<PageContainer>… {toastNode}</PageContainer>);
// ----------------------------------------------------------------------------

const APPBAR_HEIGHT = 56; // react-native-paper MD2 Appbar.Header

export type ToastKind = 'success' | 'error';

export function useToast(duration = 2000) {
  const [state, setState] = useState<{ msg: string; kind: ToastKind } | null>(null);
  const [key, setKey] = useState(0);

  const showToast = useCallback((msg: string, kind: ToastKind = 'success') => {
    setState({ msg, kind });
    setKey((k) => k + 1);
  }, []);

  const toastNode = (
    <TopToast toastKey={key} state={state} duration={duration} onDismiss={() => setState(null)} />
  );

  return { showToast, toastNode };
}

function TopToast({
  toastKey, state, duration, onDismiss,
}: {
  toastKey: number;
  state: { msg: string; kind: ToastKind } | null;
  duration: number;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Portal>
      <Snackbar
        key={toastKey}
        visible={state !== null}
        onDismiss={onDismiss}
        duration={duration}
        // Pin just below the top navbar instead of the default bottom.
        wrapperStyle={{ top: insets.top + APPBAR_HEIGHT + 8, bottom: undefined, alignItems: 'center' }}
        style={{
          backgroundColor: state?.kind === 'error' ? theme.colors.error : theme.colors.success,
          alignSelf: 'center',
          width: '100%',
          maxWidth: 420,
        }}
      >
        <Text style={{ color: state?.kind === 'error' ? '#fff' : '#000', textAlign: 'center', width: '100%' }}>
          {state?.msg ?? ''}
        </Text>
      </Snackbar>
    </Portal>
  );
}
