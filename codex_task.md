# workdir: /Users/yamanishikenta/kawara-photo-app

---

# tasks 03〜09: window.confirm / alert 置き換え + aria-label + TODO対応

以下の7タスクをすべて実施すること。各タスクは独立したファイル修正。
`ConfirmModal` は `src/shared/ConfirmModal.tsx` に存在する（props: `isOpen`, `title`, `message`, `confirmLabel`, `cancelLabel`, `variant('danger'|'default')`, `onConfirm`, `onCancel`）。
`ErrorMessage` は `src/shared/ErrorMessage.tsx` に存在する（props: `message`）。

---

## task-03: BeforeAfterPage.tsx — window.confirm を ConfirmModal に置き換え

対象ファイル: `src/pages/BeforeAfterPage.tsx`

### 修正1: import に ConfirmModal を追加

現在の import 末尾（8行目あたり）に追加:

```tsx
変更前（8行目）:
import { ErrorMessage } from '../shared/ErrorMessage';

変更後:
import { ErrorMessage } from '../shared/ErrorMessage';
import { ConfirmModal } from '../shared/ConfirmModal';
```

### 修正2: confirmDeletePairId state を追加

`const [editingPairId, setEditingPairId] = useState<number | null>(null);` の直後に追加:

```tsx
const [confirmDeletePairId, setConfirmDeletePairId] = useState<number | null>(null);
```

### 修正3: deletePair 関数を書き換え（86行目あたり）

```tsx
変更前:
  const deletePair = async (pairId: number) => {
    if (!id || !project) return;
    if (!window.confirm('このペアを削除しますか？')) return;
    const updated = pairs.filter(p => p.id !== pairId);

変更後:
  const deletePair = async (pairId: number) => {
    if (!id || !project) return;
    const updated = pairs.filter(p => p.id !== pairId);
```

ただし上記の変更だけでは削除が即実行されてしまうので、関数全体を以下のように置き換える:

```tsx
変更前:
  const deletePair = async (pairId: number) => {
    if (!id || !project) return;
    if (!window.confirm('このペアを削除しますか？')) return;
    const updated = pairs.filter(p => p.id !== pairId);
    try {
      await updateDoc(doc(db, 'projects', id), { beforeAfterPairs: updated });
      setProject(prev => prev ? { ...prev, beforeAfterPairs: updated } : prev);
    } catch {
      setError('削除に失敗しました。');
    }
  };

変更後:
  const deletePair = async (pairId: number) => {
    if (!id || !project) return;
    const updated = pairs.filter(p => p.id !== pairId);
    try {
      await updateDoc(doc(db, 'projects', id), { beforeAfterPairs: updated });
      setProject(prev => prev ? { ...prev, beforeAfterPairs: updated } : prev);
    } catch {
      setError('削除に失敗しました。');
    }
  };
```

そして削除ボタンの `onClick` を `() => deletePair(pair.id)` から `() => setConfirmDeletePairId(pair.id)` に変更する。

### 修正4: JSX 末尾（</> の直前）に ConfirmModal を追加

JSX の最後（return の閉じタグ直前）に追加:

```tsx
<ConfirmModal
  isOpen={confirmDeletePairId !== null}
  title="ペアを削除"
  message="このペアを削除しますか？"
  confirmLabel="削除"
  variant="danger"
  onConfirm={async () => {
    if (confirmDeletePairId !== null) {
      await deletePair(confirmDeletePairId);
      setConfirmDeletePairId(null);
    }
  }}
  onCancel={() => setConfirmDeletePairId(null)}
/>
```

---

## task-04: CoverPage.tsx — window.confirm を ConfirmModal に置き換え

対象ファイル: `src/pages/CoverPage.tsx`

### 修正1: import に ConfirmModal を追加

```tsx
変更前（10行目）:
import { ErrorMessage } from '../shared/ErrorMessage';

変更後:
import { ErrorMessage } from '../shared/ErrorMessage';
import { ConfirmModal } from '../shared/ConfirmModal';
```

### 修正2: confirmDeletePdf state を追加

既存の state 宣言群の末尾に追加（`setAppendixProgress` の次あたり）:

```tsx
const [confirmDeletePdf, setConfirmDeletePdf] = useState(false);
```

### 修正3: handleAppendixDelete 関数を書き換え（108〜116行目）

```tsx
変更前:
  const handleAppendixDelete = async () => {
    if (!project?.appendixPdfUrl || !id) return;
    if (!window.confirm('添付PDFを削除しますか？')) return;
    try {
      await deleteObject(ref(storage, project.appendixPdfUrl));
    } catch { /* 無視 */ }
    await updateDoc(doc(db, 'projects', id), { appendixPdfUrl: null });
    setProject((prev) => prev ? { ...prev, appendixPdfUrl: undefined } : prev);
  };

変更後:
  const handleAppendixDelete = async () => {
    if (!project?.appendixPdfUrl || !id) return;
    try {
      await deleteObject(ref(storage, project.appendixPdfUrl));
    } catch { /* 無視 */ }
    await updateDoc(doc(db, 'projects', id), { appendixPdfUrl: null });
    setProject((prev) => prev ? { ...prev, appendixPdfUrl: undefined } : prev);
  };
```

### 修正4: PDF削除ボタンの onClick を変更

JSX 内の添付PDF削除ボタン（`onClick` に `handleAppendixDelete` が設定されているボタン）を探し:

```tsx
変更前:
onClick={handleAppendixDelete}

変更後:
onClick={() => setConfirmDeletePdf(true)}
```

### 修正5: JSX 末尾に ConfirmModal を追加

JSX の閉じタグ直前に追加:

```tsx
<ConfirmModal
  isOpen={confirmDeletePdf}
  title="添付PDFを削除"
  message="添付PDFを削除しますか？"
  confirmLabel="削除"
  variant="danger"
  onConfirm={async () => {
    setConfirmDeletePdf(false);
    await handleAppendixDelete();
  }}
  onCancel={() => setConfirmDeletePdf(false)}
/>
```

---

## task-05: MapPage.tsx — window.confirm を ConfirmModal に置き換え

対象ファイル: `src/pages/MapPage.tsx`

### 修正1: import に ConfirmModal を追加

現在の import 末尾あたりに追加（`LoadingSpinner` などの後）:

```tsx
import { ConfirmModal } from '../shared/ConfirmModal';
```

### 修正2: confirmDeleteMapIndex state を追加

既存 state 宣言群の適切な場所に追加:

```tsx
const [confirmDeleteMapIndex, setConfirmDeleteMapIndex] = useState<number | null>(null);
```

### 修正3: deleteMapPhoto 関数内の window.confirm を削除（748行目）

```tsx
変更前:
  const deleteMapPhoto = useCallback(async (mapIndex: number) => {
    if (!project || !id) return;
    if (!window.confirm('この位置図を削除しますか？ピンや凡例データも削除されます。')) return;

変更後:
  const deleteMapPhoto = useCallback(async (mapIndex: number) => {
    if (!project || !id) return;
```

### 修正4: deleteMapPhoto を呼ぶボタンの onClick を変更

JSX 内で `deleteMapPhoto(...)` を呼んでいる箇所を探し:

```tsx
変更前（例）:
onClick={() => deleteMapPhoto(currentMapIndex)}

変更後:
onClick={() => setConfirmDeleteMapIndex(currentMapIndex)}
```

### 修正5: JSX 末尾に ConfirmModal を追加

```tsx
<ConfirmModal
  isOpen={confirmDeleteMapIndex !== null}
  title="位置図を削除"
  message="この位置図を削除しますか？ピンや凡例データも削除されます。"
  confirmLabel="削除"
  variant="danger"
  onConfirm={async () => {
    if (confirmDeleteMapIndex !== null) {
      await deleteMapPhoto(confirmDeleteMapIndex);
      setConfirmDeleteMapIndex(null);
    }
  }}
  onCancel={() => setConfirmDeleteMapIndex(null)}
/>
```

---

## task-06: MaterialPage.tsx — window.confirm / alert を全置き換え

対象ファイル: `src/pages/MaterialPage.tsx`

### 修正1: import に ConfirmModal と ErrorMessage を追加

```tsx
追加（既存 import の末尾）:
import { ConfirmModal } from '../shared/ConfirmModal';
import { ErrorMessage } from '../shared/ErrorMessage';
```

※ `ErrorMessage` がすでに import されていれば追加不要。

### 修正2: state を追加

`MaterialPage` コンポーネント内の state 宣言群に追加:

```tsx
const [confirmDeleteMaterialId, setConfirmDeleteMaterialId] = useState<number | null>(null);
const [confirmOverwriteMasterMaterial, setConfirmOverwriteMasterMaterial] = useState<Material | null>(null);
const [masterSaveSuccess, setMasterSaveSuccess] = useState<string | null>(null);
const [uploadError, setUploadError] = useState<string | null>(null);
const [saveError, setSaveError] = useState<string | null>(null);
```

（`Material` 型は既存 import に含まれているはず）

### 修正3: NameSuggest コンポーネント内の window.confirm を置き換え（56行目）

`NameSuggest` は MaterialPage.tsx 内の sub component。`handleSelect` 内の `window.confirm` を取り除いて直接 `onApply` を呼ぶだけにする。自動入力の確認ダイアログは削除（UX上問題ない）:

```tsx
変更前（56行目）:
  const handleSelect = (m: MaterialMaster) => {
    setOpen(false);
    const detail = [m.manufacturer, m.specification, m.remarks].filter(Boolean).join('　/　');
    if (window.confirm(`「${m.name}」のデータを自動入力しますか？${detail ? '\n' + detail : ''}`)) {
      onApply(m);
    }
  };

変更後:
  const handleSelect = (m: MaterialMaster) => {
    setOpen(false);
    onApply(m);
  };
```

### 修正4: removeMaterial の window.confirm を削除（207行目）

```tsx
変更前:
  const removeMaterial = async (materialId: number) => {
    if (!window.confirm('この材料データを削除しますか？')) return;

変更後:
  const removeMaterial = async (materialId: number) => {
```

削除ボタンの onClick を `() => removeMaterial(id)` から `() => setConfirmDeleteMaterialId(id)` に変更する（JSX 内で探して変更）。

### 修正5: saveToMaster の alert / window.confirm を置き換え（235〜257行目）

```tsx
変更前:
  const saveToMaster = async (material: Material) => {
    if (!uid) { alert('マスタに保存するにはログインが必要です。'); return; }
    const trimmedName = material.name.trim();
    if (!trimmedName) { alert('品名を入力してください。'); return; }

    const existing = masters.find((m) => m.name === trimmedName);
    if (existing) {
      if (!window.confirm(`「${material.name}」はすでにマスタにあります。上書きしますか？`)) return;
    }

    const newEntry: MaterialMaster = {
      id: existing?.id ?? Date.now(),
      name: trimmedName,
      manufacturer: material.manufacturer,
      specification: material.specification,
      remarks: material.remarks,
    };
    const newMasters = existing
      ? masters.map((m) => (m.id === existing.id ? newEntry : m))
      : [...masters, newEntry];

    setMasters(newMasters);
    await setDoc(doc(db, 'users', uid), { materialMaster: newMasters }, { merge: true });
    alert(`「${newEntry.name}」をマスタに保存しました。`);
  };

変更後:
  const saveToMaster = async (material: Material) => {
    if (!uid) { setSaveError('マスタに保存するにはログインが必要です。'); return; }
    const trimmedName = material.name.trim();
    if (!trimmedName) { setSaveError('品名を入力してください。'); return; }

    const existing = masters.find((m) => m.name === trimmedName);
    if (existing) {
      setConfirmOverwriteMasterMaterial(material);
      return;
    }

    await doSaveToMaster(material, undefined);
  };

  const doSaveToMaster = async (material: Material, existing: MaterialMaster | undefined) => {
    const trimmedName = material.name.trim();
    const newEntry: MaterialMaster = {
      id: existing?.id ?? Date.now(),
      name: trimmedName,
      manufacturer: material.manufacturer,
      specification: material.specification,
      remarks: material.remarks,
    };
    const newMasters = existing
      ? masters.map((m) => (m.id === existing.id ? newEntry : m))
      : [...masters, newEntry];

    setMasters(newMasters);
    await setDoc(doc(db, 'users', uid!), { materialMaster: newMasters }, { merge: true });
    setMasterSaveSuccess(`「${newEntry.name}」をマスタに保存しました。`);
    setTimeout(() => setMasterSaveSuccess(null), 3000);
  };
```

### 修正6: handleImageUpload の alert を setError に置き換え（265〜279行目）

```tsx
変更前:
      if (!canUpload(storageUsedBytes, file.size)) {
        alert('ストレージ容量が上限（500MB）に達しています。不要な画像を削除してください。');
        return;
      }

変更後:
      if (!canUpload(storageUsedBytes, file.size)) {
        setUploadError('ストレージ容量が上限（500MB）に達しています。不要な画像を削除してください。');
        return;
      }
```

```tsx
変更前:
    } catch (err) {
      logFirebaseError(err, '材料画像アップロード');
      alert(firebaseErrorMessage(err, '画像のアップロード'));

変更後:
    } catch (err) {
      logFirebaseError(err, '材料画像アップロード');
      setUploadError(firebaseErrorMessage(err, '画像のアップロード'));
```

### 修正7: JSX 末尾付近に ConfirmModal ×2 とエラー・成功表示を追加

JSX 内の適切な場所（エラー表示エリアがあればその近く）に成功・エラーメッセージを追加:

```tsx
{masterSaveSuccess && (
  <div className="fixed bottom-4 right-4 px-4 py-2 rounded-lg text-sm font-bold" style={{ background: '#10b981', color: '#fff' }}>
    {masterSaveSuccess}
  </div>
)}
{(uploadError || saveError) && (
  <div className="fixed bottom-4 right-4 px-4 py-2 rounded-lg text-sm font-bold" style={{ background: '#ef4444', color: '#fff' }}>
    {uploadError || saveError}
    <button onClick={() => { setUploadError(null); setSaveError(null); }} className="ml-2">×</button>
  </div>
)}
```

JSX 閉じタグ直前に ConfirmModal を追加:

```tsx
<ConfirmModal
  isOpen={confirmDeleteMaterialId !== null}
  title="材料データを削除"
  message="この材料データを削除しますか？"
  confirmLabel="削除"
  variant="danger"
  onConfirm={async () => {
    if (confirmDeleteMaterialId !== null) {
      await removeMaterial(confirmDeleteMaterialId);
      setConfirmDeleteMaterialId(null);
    }
  }}
  onCancel={() => setConfirmDeleteMaterialId(null)}
/>
<ConfirmModal
  isOpen={confirmOverwriteMasterMaterial !== null}
  title="マスタを上書き"
  message={`「${confirmOverwriteMasterMaterial?.name}」はすでにマスタにあります。上書きしますか？`}
  confirmLabel="上書き"
  variant="default"
  onConfirm={async () => {
    if (confirmOverwriteMasterMaterial) {
      const existing = masters.find((m) => m.name === confirmOverwriteMasterMaterial.name.trim());
      await doSaveToMaster(confirmOverwriteMasterMaterial, existing);
      setConfirmOverwriteMasterMaterial(null);
    }
  }}
  onCancel={() => setConfirmOverwriteMasterMaterial(null)}
/>
```

---

## task-07: PhotoPage.tsx — window.confirm / alert を全置き換え

対象ファイル: `src/pages/PhotoPage.tsx`

### 修正1: import に ConfirmModal を追加

```tsx
追加（既存 import 末尾に）:
import { ConfirmModal } from '../shared/ConfirmModal';
```

### 修正2: state を追加

既存 state 宣言群（`batchDate` の後あたり）に追加:

```tsx
const [confirmDeletePhotoId, setConfirmDeletePhotoId] = useState<number | null>(null);
const [confirmDeleteSelectedPhotos, setConfirmDeleteSelectedPhotos] = useState(false);
const [confirmBatchDate, setConfirmBatchDate] = useState(false);
const [confirmOverwritePhotoMaster, setConfirmOverwritePhotoMaster] = useState<{ name: string; photo: Photo } | null>(null);
const [masterSaveSuccess, setMasterSaveSuccess] = useState<string | null>(null);
const [uploadError, setUploadError] = useState<string | null>(null);
```

### 修正3: NameSuggestコンポーネント（PhotoPage内）の window.confirm を削除（392行目）

`PhotoPage` ファイル内の `NameSuggest`（またはインライン `handleSelect`）の `window.confirm` を削除して直接 `onApply` を呼ぶ:

```tsx
変更前（handleSelect 内、392行目）:
  const handleSelect = (m: PhotoMaster) => {
    setOpen(false);
    const detail = [m.process, m.description ? m.description.slice(0, 30) + (m.description.length > 30 ? '…' : '') : ''].filter(Boolean).join('　/　');
    if (window.confirm(`「${m.name}」を自動入力しますか？${detail ? '\n' + detail : ''}`)) {
      onApply(m);
    }
  };

変更後:
  const handleSelect = (m: PhotoMaster) => {
    setOpen(false);
    onApply(m);
  };
```

### 修正4: saveToPhotoMaster の alert / window.confirm を置き換え（502〜512行目）

```tsx
変更前:
  const saveToPhotoMaster = async (photo: Photo) => {
    if (!uid) { alert('マスタに保存するにはログインが必要です。'); return; }
    const name = prompt('テンプレート名を入力してください:', photo.process || '');
    if (!name?.trim()) return;
    const existing = photoMasters.find((m) => m.name === name.trim());
    if (existing && !window.confirm(`「${name.trim()}」はすでに存在します。上書きしますか？`)) return;
    const entry: PhotoMaster = { id: existing?.id ?? Date.now(), name: name.trim(), process: photo.process, description: photo.description };
    const newMasters = existing ? photoMasters.map((m) => m.id === existing.id ? entry : m) : [...photoMasters, entry];
    setPhotoMasters(newMasters);
    await setDoc(doc(db, 'users', uid), { photoMaster: newMasters }, { merge: true });
    alert(`「${entry.name}」をマスタに保存しました。`);
  };

変更後:
  const saveToPhotoMaster = async (photo: Photo) => {
    if (!uid) { setUploadError('マスタに保存するにはログインが必要です。'); return; }
    const name = prompt('テンプレート名を入力してください:', photo.process || '');
    if (!name?.trim()) return;
    const existing = photoMasters.find((m) => m.name === name.trim());
    if (existing) {
      setConfirmOverwritePhotoMaster({ name: name.trim(), photo });
      return;
    }
    await doSaveToPhotoMaster(name.trim(), photo, undefined);
  };

  const doSaveToPhotoMaster = async (name: string, photo: Photo, existing: PhotoMaster | undefined) => {
    const entry: PhotoMaster = { id: existing?.id ?? Date.now(), name, process: photo.process, description: photo.description };
    const newMasters = existing ? photoMasters.map((m) => m.id === existing.id ? entry : m) : [...photoMasters, entry];
    setPhotoMasters(newMasters);
    await setDoc(doc(db, 'users', uid!), { photoMaster: newMasters }, { merge: true });
    setMasterSaveSuccess(`「${entry.name}」をマスタに保存しました。`);
    setTimeout(() => setMasterSaveSuccess(null), 3000);
  };
```

### 修正5: deletePhotoSlot の window.confirm を削除（524行目）

```tsx
変更前:
  const deletePhotoSlot = async (photoId: number) => {
    if (!project || !id) return;
    if (window.confirm('この写真枠を完全に削除しますか？')) {
      const target = project.photos.find((p) => p.id === photoId);
      ...（削除処理）
    }
  };

変更後:
  const deletePhotoSlot = async (photoId: number) => {
    if (!project || !id) return;
    const target = project.photos.find((p) => p.id === photoId);
    if (target?.image) {
      const bytes = await getRemoteFileSize(target.image);
      try {
        await deleteObject(ref(storage, target.image));
        if (uid && bytes && Number.isFinite(bytes)) {
          await trackDelete(uid, bytes);
          setStorageUsedBytes((prev) => Math.max(0, prev - bytes));
        }
      } catch (err) {
        logFirebaseError(err, '写真ファイル削除');
      }
    }
    const newPhotos = project.photos.filter((p) => p.id !== photoId);
    const renumbered = newPhotos.map((p, i) => ({ ...p, photoNumber: String(i + 1) }));
    setProject((prev) => prev ? { ...prev, photos: renumbered } : null);
    await updateDoc(doc(db, "projects", id), { photos: renumbered });
  };
```

削除ボタンの onClick を `() => deletePhotoSlot(photoId)` から `() => setConfirmDeletePhotoId(photoId)` に変更（JSX 内を探して変更）。

### 修正6: deleteSelectedPhotos の window.confirm を削除（552行目）

```tsx
変更前:
  const deleteSelectedPhotos = async () => {
    if (!project || !id || selectedPhotoIds.length === 0) return;
    if (window.confirm(`選択した ${selectedPhotoIds.length} 件の写真枠を完全に削除しますか？`)) {
      ...（削除処理）
    }
  };

変更後（if ブロックを外して処理をフラットにする）:
  const deleteSelectedPhotos = async () => {
    if (!project || !id || selectedPhotoIds.length === 0) return;
    const targets = project.photos.filter((p) => selectedPhotoIds.includes(p.id) && p.image);
    for (const target of targets) {
      if (!target.image) continue;
      const bytes = await getRemoteFileSize(target.image);
      try {
        await deleteObject(ref(storage, target.image));
        if (uid && bytes && Number.isFinite(bytes)) {
          await trackDelete(uid, bytes);
          setStorageUsedBytes((prev) => Math.max(0, prev - bytes));
        }
      } catch (err) {
        logFirebaseError(err, '写真ファイル削除');
      }
    }
    const newPhotos = project.photos.filter((p) => !selectedPhotoIds.includes(p.id));
    const renumbered = newPhotos.map((p, i) => ({ ...p, photoNumber: String(i + 1) }));
    setProject((prev) => prev ? { ...prev, photos: renumbered } : null);
    await updateDoc(doc(db, "projects", id), { photos: renumbered });
    setSelectedPhotoIds([]);
    setIsSelectMode(false);
  };
```

「一括削除」ボタンの onClick を `deleteSelectedPhotos` から `() => setConfirmDeleteSelectedPhotos(true)` に変更（JSX 内を探して変更）。

### 修正7: applyBatchDate の window.confirm と alert を削除（579〜585行目）

```tsx
変更前:
  const applyBatchDate = async () => {
    if (!project || !id || !batchDate) return;
    if (window.confirm(`すべての写真の撮影日を ${batchDate.replace(/-/g, '/')} に統一しますか？`)) {
      const formatted = formatToYMDSlash(batchDate);
      const newPhotos = project.photos.map(p => ({ ...p, shootingDate: formatted }));
      setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
      await updateDoc(doc(db, "projects", id), { photos: newPhotos });
      setBatchDate("");
      alert('撮影日を一括設定しました！');
    }
  };

変更後:
  const applyBatchDate = async () => {
    if (!project || !id || !batchDate) return;
    const formatted = formatToYMDSlash(batchDate);
    const newPhotos = project.photos.map(p => ({ ...p, shootingDate: formatted }));
    setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
    await updateDoc(doc(db, "projects", id), { photos: newPhotos });
    setBatchDate("");
  };
```

「一括設定」ボタンの onClick を `applyBatchDate` から `() => setConfirmBatchDate(true)` に変更（JSX 内を探して変更）。

### 修正8: uploadPhoto / bulkUpload の alert を setUploadError に置き換え

bulkUpload 内（649行目）:
```tsx
変更前:
        alert('ストレージ容量が上限（500MB）に達しています。不要な写真を削除してください。');
変更後:
        setUploadError('ストレージ容量が上限（500MB）に達しています。不要な写真を削除してください。');
```

bulkUpload 内（664行目）:
```tsx
変更前:
        alert(`${i + 1}枚目：${firebaseErrorMessage(error, 'アップロード')}`);
変更後:
        setUploadError(`${i + 1}枚目：${firebaseErrorMessage(error, 'アップロード')}`);
```

uploadPhoto 内（684行目）:
```tsx
変更前:
        alert('ストレージ容量が上限（500MB）に達しています。不要な写真を削除してください。');
変更後:
        setUploadError('ストレージ容量が上限（500MB）に達しています。不要な写真を削除してください。');
```

uploadPhoto 内（699行目）:
```tsx
変更前:
      alert(firebaseErrorMessage(err, '写真のアップロード'));
変更後:
      setUploadError(firebaseErrorMessage(err, '写真のアップロード'));
```

### 修正9: JSX 末尾付近にトースト通知と ConfirmModal ×4 を追加

JSX の閉じタグ直前に追加:

```tsx
{masterSaveSuccess && (
  <div className="fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-bold" style={{ background: '#10b981', color: '#fff' }}>
    {masterSaveSuccess}
  </div>
)}
{uploadError && (
  <div className="fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-bold" style={{ background: '#ef4444', color: '#fff' }}>
    {uploadError}
    <button onClick={() => setUploadError(null)} className="ml-2">×</button>
  </div>
)}
<ConfirmModal
  isOpen={confirmDeletePhotoId !== null}
  title="写真枠を削除"
  message="この写真枠を完全に削除しますか？"
  confirmLabel="削除"
  variant="danger"
  onConfirm={async () => {
    if (confirmDeletePhotoId !== null) {
      await deletePhotoSlot(confirmDeletePhotoId);
      setConfirmDeletePhotoId(null);
    }
  }}
  onCancel={() => setConfirmDeletePhotoId(null)}
/>
<ConfirmModal
  isOpen={confirmDeleteSelectedPhotos}
  title="選択写真を削除"
  message={`選択した ${selectedPhotoIds.length} 件の写真枠を完全に削除しますか？`}
  confirmLabel="削除"
  variant="danger"
  onConfirm={async () => {
    setConfirmDeleteSelectedPhotos(false);
    await deleteSelectedPhotos();
  }}
  onCancel={() => setConfirmDeleteSelectedPhotos(false)}
/>
<ConfirmModal
  isOpen={confirmBatchDate}
  title="撮影日を一括設定"
  message={`すべての写真の撮影日を ${batchDate.replace(/-/g, '/')} に統一しますか？`}
  confirmLabel="設定する"
  variant="default"
  onConfirm={async () => {
    setConfirmBatchDate(false);
    await applyBatchDate();
  }}
  onCancel={() => setConfirmBatchDate(false)}
/>
<ConfirmModal
  isOpen={confirmOverwritePhotoMaster !== null}
  title="テンプレートを上書き"
  message={`「${confirmOverwritePhotoMaster?.name}」はすでに存在します。上書きしますか？`}
  confirmLabel="上書き"
  variant="default"
  onConfirm={async () => {
    if (confirmOverwritePhotoMaster) {
      const existing = photoMasters.find((m) => m.name === confirmOverwritePhotoMaster.name);
      await doSaveToPhotoMaster(confirmOverwritePhotoMaster.name, confirmOverwritePhotoMaster.photo, existing);
      setConfirmOverwritePhotoMaster(null);
    }
  }}
  onCancel={() => setConfirmOverwritePhotoMaster(null)}
/>
```

---

## task-08: aria-label をアイコンのみボタンに追加

以下のファイルのアイコンのみボタン（テキストなし、aria-label なし）に `aria-label` を追加する。
対象は `<button>` タグ内にアイコンコンポーネントのみあり、`aria-label` がないもの。

対象ファイルと主な追加箇所:

### src/pages/BeforeAfterPage.tsx
- Pencil アイコンボタン → `aria-label="編集"`
- Trash2 アイコンボタン → `aria-label="削除"`
- ArrowLeft アイコンボタン → `aria-label="戻る"`

### src/pages/CoverPage.tsx
- Trash2 アイコンボタン → `aria-label="削除"`
- Upload アイコンボタン → `aria-label="アップロード"`

### src/pages/MapPage.tsx
- Trash2 アイコンボタン → `aria-label="削除"`
- RotateCcw/RotateCw アイコンボタン → `aria-label="左回転"` / `aria-label="右回転"`

### src/pages/MaterialPage.tsx
- Trash2 アイコンボタン → `aria-label="削除"`
- BookmarkPlus アイコンボタン → `aria-label="マスタに保存"`
- RotateCcw/RotateCw アイコンボタン → `aria-label="左回転"` / `aria-label="右回転"`
- ArrowUp/ArrowDown アイコンボタン → `aria-label="上へ移動"` / `aria-label="下へ移動"`

### src/pages/PhotoPage.tsx
- Trash2 アイコンボタン → `aria-label="削除"`
- BookmarkPlus アイコンボタン → `aria-label="テンプレートに保存"`
- RotateCcw/RotateCw アイコンボタン → `aria-label="左回転"` / `aria-label="右回転"`

---

## task-09: PhotoPage.tsx — TODO コメントを対処

対象ファイル: `src/pages/PhotoPage.tsx`

以下の2箇所の TODO コメントを削除し、できる限り正確なストレージ追跡を行う。
現状のコメント（534・563行目あたり）:
```
// TODO: 既存写真にはfileSizeがないため、HEADでサイズを取得できない環境では使用量を減算できない。
```

このコメントは既に `getRemoteFileSize` で HEAD リクエストをしている（`target.image` に対して）ため、
コメントが現状を誤説明している。コメントを削除するだけでよい。

---

## 実装手順

1. task-03（BeforeAfterPage.tsx）を修正・保存
2. task-04（CoverPage.tsx）を修正・保存
3. task-05（MapPage.tsx）を修正・保存
4. task-06（MaterialPage.tsx）を修正・保存
5. task-07（PhotoPage.tsx）を修正・保存
6. task-08（各ファイルに aria-label 追加）
7. task-09（PhotoPage.tsx TODO 削除）
8. `npm run build` を実行してエラーがないことを確認

---

## 実行コマンド

```bash
npm run build
```

エラーなく完了することを確認する。

---

## 完了後に codex_result.md に書く内容

```markdown
# codex_result — task-03〜09

## 変更ファイル
- src/pages/BeforeAfterPage.tsx (task-03)
- src/pages/CoverPage.tsx (task-04)
- src/pages/MapPage.tsx (task-05)
- src/pages/MaterialPage.tsx (task-06)
- src/pages/PhotoPage.tsx (task-07, task-09)
- 複数ファイル (task-08)

## 実施した修正
- [x/空] task-03: BeforeAfterPage window.confirm → ConfirmModal
- [x/空] task-04: CoverPage window.confirm → ConfirmModal
- [x/空] task-05: MapPage window.confirm → ConfirmModal
- [x/空] task-06: MaterialPage window.confirm/alert → ConfirmModal/state
- [x/空] task-07: PhotoPage window.confirm/alert → ConfirmModal/state
- [x/空] task-08: aria-label 追加
- [x/空] task-09: TODO コメント削除

## npm run build 結果
- 結果: 成功 / 失敗
- エラーログ（失敗時のみ）:
- ビルド時間:

## 備考
```
