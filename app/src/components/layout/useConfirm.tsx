import React, { useState } from 'react';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { theme } from 'skintyee/styles';

interface ConfirmOpts {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * Reusable confirmation dialog. Returns `confirm(opts)` to open it and a
 * `ConfirmHost` element to render once per screen.
 */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const confirm = (o: ConfirmOpts) => setOpts(o);
  const close = () => setOpts(null);

  const ConfirmHost = () => (
    <Portal>
      <Dialog visible={!!opts} onDismiss={close} style={{ backgroundColor: theme.colors.darkDefault }}>
        <Dialog.Title style={{ color: theme.colors.text, fontSize: 18 }}>{opts?.title}</Dialog.Title>
        <Dialog.Content>
          <Text style={{ color: theme.colors.textDarker }}>{opts?.message}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={close} textColor={theme.colors.text}>
            {opts?.cancelLabel ?? 'Keep'}
          </Button>
          <Button
            onPress={() => {
              opts?.onConfirm();
              close();
            }}
            textColor={opts?.destructive ? theme.colors.error : theme.colors.primary}
          >
            {opts?.confirmLabel ?? 'Confirm'}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );

  return { confirm, ConfirmHost };
}
