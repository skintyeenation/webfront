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

// Web webcam capture via getUserMedia — a real live-camera overlay, because
// desktop browsers IGNORE the <input capture> hint (it's a mobile-only thing,
// so on a laptop it just opens the file picker). Builds a vanilla-DOM overlay
// (react-native-web can't render a <video>), streams the camera into it, and
// resolves a JPEG data URL on capture. Falls back to the file <input> when
// getUserMedia is unavailable or permission is denied.
function webcamCapture(): Promise<PickedReceipt | null> {
  const md: any = typeof navigator !== 'undefined' ? (navigator as any).mediaDevices : undefined;
  if (!md?.getUserMedia) return webPick('image/*', true);

  return new Promise<PickedReceipt | null>((resolve) => {
    let stream: MediaStream | null = null;
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;';

    const video = document.createElement('video');
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    video.style.cssText = 'max-width:100%;max-height:80%;object-fit:contain;background:#000;';

    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;bottom:0;left:0;right:0;display:flex;gap:16px;justify-content:center;padding:20px;';

    const mkBtn = (label: string, bg: string, fg: string) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText =
        `font:600 15px sans-serif;padding:12px 22px;border:0;border-radius:8px;cursor:pointer;background:${bg};color:${fg};`;
      return b;
    };
    const capBtn = mkBtn('● Capture', '#00bcd4', '#000');
    const cancelBtn = mkBtn('Cancel', 'rgba(255,255,255,0.15)', '#fff');

    const cleanup = () => {
      try { stream?.getTracks().forEach((t) => t.stop()); } catch {}
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };
    const finish = (result: PickedReceipt | null) => { cleanup(); resolve(result); };

    cancelBtn.onclick = () => finish(null);
    capBtn.onclick = () => {
      try {
        const w = video.videoWidth || 1280, h = video.videoHeight || 720;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return finish(null);
        ctx.drawImage(video, 0, 0, w, h);
        finish({ uri: canvas.toDataURL('image/jpeg', 0.8), name: `receipt-${w}x${h}.jpg`, mimeType: 'image/jpeg' });
      } catch { finish(null); }
    };

    bar.appendChild(cancelBtn); bar.appendChild(capBtn);
    overlay.appendChild(video); overlay.appendChild(bar);
    document.body.appendChild(overlay);

    md.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s: MediaStream) => { stream = s; video.srcObject = s; return video.play(); })
      .catch(() => { cleanup(); resolve(webPick('image/*', true)); });
  });
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
  if (Platform.OS === 'web') return webcamCapture();
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
