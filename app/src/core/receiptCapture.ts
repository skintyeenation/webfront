import { Platform } from 'react-native';

// ----------------------------------------------------------------------------
// Receipt capture — one helper for the three ways a worker can attach a
// receipt to an expense item:
//
//   • takePhoto()   — device camera (expo-image-picker on native; an
//                     <input capture="environment"> on web).
//   • pickImage()   — photo library / gallery.
//   • pickFile()    — any PDF or image from the files app / disk.
//
// Returns the upload shim shape the ApiService expects ({ uri, name,
// mimeType }) or null when the user cancels. Native uses Expo modules;
// web falls back to a transient <input type="file"> read as a data URL
// (matches EditDocument's web picker). expo-image-picker is a dependency
// (added in the expenses slice); expo-document-picker already shipped.
// ----------------------------------------------------------------------------

export interface PickedReceipt {
  uri: string;
  name: string;
  mimeType: string;
}

// Web: spin up a throwaway <input>, optionally with the camera hint, and
// resolve the chosen file as a data URL.
function webPick(accept: string, capture?: boolean): Promise<PickedReceipt | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.setAttribute('capture', 'environment');
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const reader = new FileReader();
      reader.onload = () =>
        resolve({ uri: reader.result as string, name: f.name || 'receipt', mimeType: f.type || 'image/jpeg' });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(f);
    };
    // Some browsers never fire change on cancel — that just leaves the
    // promise pending, which is harmless (the picker is re-openable).
    input.click();
  });
}

// Derive a sensible filename + mime for an expo-image-picker asset, which
// often hands back only a cache uri.
function fromImageAsset(a: { uri: string; fileName?: string | null; mimeType?: string | null }): PickedReceipt {
  const ext = (a.uri.split('.').pop() || 'jpg').split('?')[0].toLowerCase();
  const mime = a.mimeType || (ext === 'png' ? 'image/png' : ext === 'heic' ? 'image/heic' : 'image/jpeg');
  return { uri: a.uri, name: a.fileName || `receipt-${Date.now()}.${ext}`, mimeType: mime };
}

export async function takePhoto(): Promise<PickedReceipt | null> {
  if (Platform.OS === 'web') return webPick('image/*', true);
  const ImagePicker = await import('expo-image-picker');
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Camera permission denied. Enable it in Settings to photograph receipts.');
  const res = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
  if (res.canceled || !res.assets?.[0]) return null;
  return fromImageAsset(res.assets[0] as any);
}

export async function pickImage(): Promise<PickedReceipt | null> {
  if (Platform.OS === 'web') return webPick('image/*');
  const ImagePicker = await import('expo-image-picker');
  const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: false });
  if (res.canceled || !res.assets?.[0]) return null;
  return fromImageAsset(res.assets[0] as any);
}

export async function pickFile(): Promise<PickedReceipt | null> {
  if (Platform.OS === 'web') return webPick('application/pdf,image/*');
  const DocumentPicker = await import('expo-document-picker');
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.name || 'receipt', mimeType: a.mimeType ?? 'application/octet-stream' };
}
