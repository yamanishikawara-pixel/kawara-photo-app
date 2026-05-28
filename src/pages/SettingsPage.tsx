import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, Settings, Image as ImageIcon, X, Package, Camera, HardDrive, RefreshCw, Map } from 'lucide-react';
import { doc, getDoc, setDoc, updateDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, getMetadata, listAll } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { formatBytes, storageUsageRatio, STORAGE_LIMIT_BYTES, trackUpload, storagePathFromUrl, deleteStorageFileWithAccounting } from '../shared/storageUtils';
import { firebaseErrorMessage, logFirebaseError } from '../shared/firebaseError';
import type { MaterialMaster, PhotoMaster, Project } from '../types';
import { ErrorMessage } from '../shared/ErrorMessage';
import { isLegacyMapCoord as isLegacyMap, migrateMapToImageAspect } from '../shared/mapCoords';

let _idCounter = 0;
const nextId = () => Date.now() + (++_idCounter);

const DEFAULT_PROCESSES = [
  "着工前", "下地・下葺き", "防水ルーフィング施工", "瓦桟施工",
  "流れ壁板金", "平行壁板金", "確認", "棟金具設置", "緊結状況", "施工中", "完成"
];

// セクションカード
function Section({ title, icon, accent = '#ff6b35', children }: {
  title: string;
  icon: React.ReactNode;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border" style={{ background: '#1c1c30', borderColor: '#2e2e50' }}>
      <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: '#3d3d60' }}>
        <div className="w-1 h-5 rounded-full shrink-0" style={{ background: accent }} />
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${accent}20` }}>
          <span style={{ color: accent }}>{icon}</span>
        </div>
        <h2 className="text-sm font-black tracking-wide" style={{ color: '#f0ede8' }}>{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ダークなインプット
const inputCls = "w-full p-3 rounded-xl text-sm font-bold outline-none transition-colors";
const inputStyle = { background: '#12122a', border: '1px solid #2e2e50', color: '#f0ede8' };

export default function SettingsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uid, setUid] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [processes, setProcesses] = useState<string[]>(DEFAULT_PROCESSES);
  const [materialMaster, setMaterialMaster] = useState<MaterialMaster[]>([]);
  const [photoMaster, setPhotoMaster] = useState<PhotoMaster[]>([]);
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [bulkMigrating, setBulkMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<string | null>(null);
  const [orphanResult, setOrphanResult] = useState<string | null>(null);
  const [orphanPaths, setOrphanPaths] = useState<string[]>([]);
  const [deletingOrphans, setDeletingOrphans] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        const d = await getDoc(doc(db, 'users', user.uid));
        if (d.exists()) {
          const data = d.data();
          if (data.companyName) setCompanyName(data.companyName);
          if (data.address) setAddress(data.address);
          if (data.phone) setPhone(data.phone);
          if (data.logoUrl) setLogoUrl(data.logoUrl);
          if (data.customProcesses && data.customProcesses.length > 0) setProcesses(data.customProcesses);
          if (Array.isArray(data.materialMaster)) setMaterialMaster(data.materialMaster);
          if (Array.isArray(data.photoMaster)) setPhotoMaster(data.photoMaster);
          if (typeof data.storageUsedBytes === 'number') setStorageUsedBytes(data.storageUsedBytes);
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!uid || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setUploadingLogo(true);
    try {
      const storageRef = ref(storage, `logos/${uid}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await trackUpload(uid, file.size);
      setStorageUsedBytes((prev) => prev + file.size);
      setLogoUrl(url);
    } catch (err) {
      logFirebaseError(err, 'ロゴアップロード');
      setError(firebaseErrorMessage(err, 'ロゴのアップロード'));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!uid) { setError('設定を保存するにはログインが必要です。'); return; }
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', uid), {
        companyName, address, phone, logoUrl,
        customProcesses: processes,
        materialMaster,
        photoMaster,
      }, { merge: true });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      logFirebaseError(err, '設定保存');
      setError(firebaseErrorMessage(err, '設定の保存'));
    } finally {
      setSaving(false);
    }
  };

  // ストレージ使用量を全プロジェクトから実際に集計して Firestore を更新する
  const handleRecalcStorage = async () => {
    if (!uid) return;
    setRecalculating(true);
    setError(null);
    try {
      const snap = await getDocs(query(collection(db, 'projects'), where('userId', '==', uid)));
      let total = 0;

      const addSize = async (url: string | null | undefined) => {
        if (!url) return;
        try {
          const path = storagePathFromUrl(url);
          if (!path) return;
          const meta = await getMetadata(ref(storage, path));
          total += meta.size ?? 0;
        } catch { /* ファイルが存在しない場合は無視 */ }
      };

      for (const docSnap of snap.docs) {
        const p = docSnap.data() as Project;
        for (const photo of p.photos ?? []) await addSize(photo.image);
        for (const u of p.mapUrls ?? []) await addSize(u);
        for (const m of p.materials ?? []) await addSize(m.image);
        await addSize(p.appendixPdfUrl);
        for (const item of p.beforeAfterItems ?? []) {
          await addSize(item.beforeImage);
          await addSize(item.afterImage);
        }
      }
      // ロゴ
      await addSize(logoUrl);

      await updateDoc(doc(db, 'users', uid), { storageUsedBytes: total });
      setStorageUsedBytes(total);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      logFirebaseError(err, 'ストレージ再計算');
      setError(firebaseErrorMessage(err, 'ストレージ使用量の再計算'));
    } finally {
      setRecalculating(false);
    }
  };

  // Firestore に参照されていない孤立 Storage ファイルを検出する（削除はしない）
  const handleDetectOrphans = async () => {
    if (!uid) return;
    setOrphanResult(null);
    setRecalculating(true);
    setError(null);
    try {
      const snap = await getDocs(query(collection(db, 'projects'), where('userId', '==', uid)));

      // Firestore に参照されている全パスを収集
      const referencedPaths = new Set<string>();
      const addRef = (url: string | null | undefined) => {
        if (!url) return;
        const path = storagePathFromUrl(url);
        if (path) referencedPaths.add(path);
      };
      for (const docSnap of snap.docs) {
        const p = docSnap.data() as Project;
        for (const photo of p.photos ?? []) addRef(photo.image);
        for (const u of p.mapUrls ?? []) addRef(u);
        for (const m of p.materials ?? []) addRef(m.image);
        addRef(p.appendixPdfUrl);
        for (const item of p.beforeAfterItems ?? []) {
          addRef(item.beforeImage);
          addRef(item.afterImage);
        }
      }
      addRef(logoUrl);

      // Storage 上の実ファイルと比較して孤立を検出
      let orphanCount = 0;
      let orphanBytes = 0;
      const foundPaths: string[] = [];
      for (const docSnap of snap.docs) {
        const projectId = docSnap.id;
        for (const folder of ['photos', 'maps', 'materials'] as const) {
          try {
            const list = await listAll(ref(storage, `${folder}/${projectId}`));
            for (const item of list.items) {
              if (!referencedPaths.has(item.fullPath)) {
                orphanCount++;
                foundPaths.push(item.fullPath);
                try {
                  const meta = await getMetadata(item);
                  orphanBytes += meta.size ?? 0;
                } catch { /* サイズ取得失敗は無視 */ }
              }
            }
          } catch { /* フォルダが存在しない場合は無視 */ }
        }
      }
      setOrphanPaths(foundPaths);

      setOrphanResult(
        orphanCount === 0
          ? '孤立ファイルは見つかりませんでした ✓'
          : `⚠ 孤立ファイル ${orphanCount}件（${formatBytes(orphanBytes)}）が Storage に残っています。ストレージ使用量を消費しています。`
      );
    } catch (err) {
      logFirebaseError(err, '孤立ファイル検出');
      setError(firebaseErrorMessage(err, '孤立ファイル検出'));
    } finally {
      setRecalculating(false);
    }
  };

  // 検出済みの孤立ファイルを削除する（確認ダイアログ付き）
  const handleDeleteOrphans = async () => {
    if (orphanPaths.length === 0) return;
    const ok = window.confirm(
      `孤立ファイル ${orphanPaths.length}件を削除します。\nこの操作は元に戻せません。続行しますか?`
    );
    if (!ok) return;
    setDeletingOrphans(true);
    let deleted = 0;
    let failed = 0;
    for (const path of orphanPaths) {
      try {
        await deleteStorageFileWithAccounting(path, uid ?? undefined);
        deleted++;
      } catch {
        failed++;
      }
    }
    setOrphanPaths([]);
    setOrphanResult(
      failed === 0
        ? `✓ ${deleted}件の孤立ファイルを削除しました`
        : `${deleted}件削除、${failed}件失敗`
    );
    setDeletingOrphans(false);
    // ストレージ使用量を再計算して反映
    void handleRecalcStorage();
  };

  // 全現場の位置図座標を旧形式(194:120基準)から画像アスペクト基準に一括変換する
  const handleBulkMigration = async () => {
    if (!uid) return;
    setBulkMigrating(true);
    setMigrationResult(null);
    setError(null);
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    try {
      const snap = await getDocs(query(collection(db, 'projects'), where('userId', '==', uid)));

      for (const docSnap of snap.docs) {
        let project = docSnap.data() as Project;
        const projectId = docSnap.id;
        if (!project.mapUrls || project.mapUrls.length === 0) continue;

        for (let mapIndex = 0; mapIndex < project.mapUrls.length; mapIndex++) {
          if (!isLegacyMap(project.mapImageAspects, mapIndex)) {
            skippedCount++;
            continue;
          }
          const url = project.mapUrls[mapIndex];
          if (!url) continue;

          try {
            // 画像を読み込んで自然アスペクト比を取得
            const naturalAspect = await new Promise<number>((resolve, reject) => {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => resolve(img.naturalWidth / img.naturalHeight);
              img.onerror = () => reject(new Error('画像読み込み失敗'));
              img.src = url;
            });

            const migrated = migrateMapToImageAspect(project, mapIndex, naturalAspect);

            await updateDoc(doc(db, 'projects', projectId), {
              mapPins: migrated.mapPins,
              mapDimensionLines: migrated.mapDimensionLines,
              mapLines: migrated.mapLines ?? [],
              whiteoutBoxes: migrated.whiteoutBoxes,
              mapImageAspects: migrated.mapImageAspects,
            });

            // 次のループイテレーション用にローカルも更新
            project = {
              ...project,
              mapPins: migrated.mapPins,
              mapDimensionLines: migrated.mapDimensionLines,
              mapLines: migrated.mapLines ?? project.mapLines,
              whiteoutBoxes: migrated.whiteoutBoxes,
              mapImageAspects: migrated.mapImageAspects,
            };
            migratedCount++;
          } catch (err) {
            logFirebaseError(err, `マイグレーション(${projectId}, map:${mapIndex})`);
            errorCount++;
          }
        }
      }
      setMigrationResult(
        `完了: ${migratedCount}件移行 / ${skippedCount}件スキップ済み${errorCount > 0 ? ` / ${errorCount}件エラー` : ''}`
      );
    } catch (err) {
      logFirebaseError(err, '一括マイグレーション');
      setError(firebaseErrorMessage(err, '一括マイグレーション'));
    } finally {
      setBulkMigrating(false);
    }
  };

  const usageRatio = storageUsageRatio(storageUsedBytes);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen font-sans pb-16" style={{ background: '#0f0f1a', color: '#f0ede8' }}>
      <div className="max-w-xl mx-auto px-4 sm:px-6">

        {/* ヘッダー */}
        <div className="flex items-center justify-between py-5 border-b" style={{ borderColor: '#2e2e50' }}>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 font-bold text-sm transition-colors"
            style={{ color: '#8b8ba8' }}
            onPointerEnter={e => (e.currentTarget.style.color = '#ff6b35')}
            onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
          >
            <ArrowLeft className="w-4 h-4" /> ホームへ
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
            style={{ background: '#ff6b35', color: '#fff', boxShadow: '0 0 16px rgba(255,107,53,0.35)' }}
            onPointerEnter={e => !saving && ((e.currentTarget as HTMLButtonElement).style.background = '#e85d2a')}
            onPointerLeave={e => !saving && ((e.currentTarget as HTMLButtonElement).style.background = '#ff6b35')}
          >
            <Save className="w-4 h-4" /> {saving ? '保存中...' : '設定を保存'}
          </button>
        </div>

        {error && (
          <div className="mt-4">
            <ErrorMessage message={error} />
          </div>
        )}
        {saveSuccess && (
          <div
            className="fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-bold shadow-xl"
            style={{ background: '#10b981', color: '#fff' }}
          >
            設定を保存しました
          </div>
        )}

        {/* タイトル */}
        <div className="mt-6 mb-7">
          <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: '#f0ede8' }}>
            <Settings className="w-6 h-6" style={{ color: '#8b8ba8' }} /> 基本設定・カスタマイズ
          </h1>
          <div className="mt-1.5 h-0.5 w-12 rounded-full" style={{ background: '#ff6b35' }} />
        </div>

        <div className="space-y-5">

          {/* ストレージ使用量 */}
          <Section title="ストレージ使用量" icon={<HardDrive className="w-4 h-4" />} accent="#6b7280">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold" style={{ color: '#8b8ba8' }}>
                <span>{formatBytes(storageUsedBytes)} 使用中</span>
                <span>上限 {formatBytes(STORAGE_LIMIT_BYTES)}</span>
              </div>
              <div className="w-full rounded-full h-2.5 overflow-hidden" style={{ background: '#12122a' }}>
                <div
                  className="h-2.5 rounded-full transition-all"
                  style={{
                    width: `${usageRatio * 100}%`,
                    background: usageRatio > 0.9 ? '#ef4444' : usageRatio > 0.7 ? '#eab308' : '#3b82f6',
                  }}
                />
              </div>
              <p className="text-xs" style={{ color: '#6b7280' }}>写真・位置図・材料画像などすべての画像データの合計です。</p>
              <button
                onClick={handleRecalcStorage}
                disabled={recalculating}
                className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all disabled:opacity-50"
                style={{ background: '#12122a', color: recalculating ? '#6b7280' : '#3b82f6', border: '1px solid #2e2e50' }}
                onPointerEnter={e => { if (!recalculating) (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82f6'; }}
                onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2e2e50'; }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin' : ''}`} />
                {recalculating ? '集計中...' : '使用量を再計算'}
              </button>
              <button
                onClick={handleDetectOrphans}
                disabled={recalculating}
                className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all disabled:opacity-50"
                style={{ background: '#12122a', color: recalculating ? '#6b7280' : '#f59e0b', border: '1px solid #2e2e50' }}
                onPointerEnter={e => { if (!recalculating) (e.currentTarget as HTMLButtonElement).style.borderColor = '#f59e0b'; }}
                onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2e2e50'; }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin' : ''}`} />
                {recalculating ? '検索中...' : '孤立ファイルを検出'}
              </button>
              {orphanResult && (
                <p className="mt-2 text-xs font-bold" style={{ color: orphanResult.startsWith('⚠') ? '#f59e0b' : '#10b981' }}>
                  {orphanResult}
                </p>
              )}
              {orphanPaths.length > 0 && (
                <button
                  onClick={handleDeleteOrphans}
                  disabled={deletingOrphans}
                  className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all disabled:opacity-50"
                  style={{ background: 'rgba(239,68,68,0.10)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {deletingOrphans ? '削除中...' : `孤立ファイル ${orphanPaths.length}件を削除`}
                </button>
              )}
            </div>
          </Section>

          {/* 自社情報 */}
          <Section title="自社情報（PDF表紙用）" icon={<Settings className="w-4 h-4" />} accent="#ff6b35">
            {/* ロゴ */}
            <div className="mb-5">
              <label className="block text-xs font-bold mb-2" style={{ color: '#6b7280' }}>自社ロゴ画像</label>
              <div className="flex items-center gap-4">
                {logoUrl ? (
                  <div className="relative w-28 h-28 rounded-xl flex items-center justify-center p-2" style={{ background: '#12122a', border: '1px solid #2e2e50' }}>
                    <img src={logoUrl} alt="ロゴ" className="max-w-full max-h-full object-contain" />
                    <button
                      onClick={() => setLogoUrl('')}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3.5 h-3.5"/>
                    </button>
                  </div>
                ) : (
                  <label className="w-28 h-28 flex flex-col items-center justify-center rounded-xl cursor-pointer transition-colors border-2 border-dashed" style={{ background: '#12122a', borderColor: '#3d3d60' }} onPointerEnter={e => (e.currentTarget.style.borderColor = '#ff6b35')} onPointerLeave={e => (e.currentTarget.style.borderColor = '#3d3d60')}>
                    {uploadingLogo ? (
                      <span className="text-xs font-bold animate-pulse" style={{ color: '#ff6b35' }}>送信中...</span>
                    ) : (
                      <>
                        <ImageIcon className="w-7 h-7 mb-1.5" style={{ color: '#3d3d60' }} />
                        <span className="text-xs font-bold" style={{ color: '#6b7280' }}>画像を選択</span>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                  </label>
                )}
                <p className="flex-1 text-xs leading-relaxed" style={{ color: '#6b7280' }}>
                  PDF出力時、表紙の一番上に表示されます。未設定の場合はデフォルトロゴが使われます。
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { label: '会社名・屋号', val: companyName, set: setCompanyName, ph: '例：吉田瓦店' },
                { label: '住所', val: address, set: setAddress, ph: '例：富山県魚津市〇〇1-2-3' },
                { label: '電話番号', val: phone, set: setPhone, ph: '例：0765-00-0000' },
              ].map(({ label, val, set, ph }) => (
                <div key={label}>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: '#6b7280' }}>{label}</label>
                  <input
                    type="text"
                    value={val}
                    onChange={e => set(e.target.value)}
                    placeholder={ph}
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
          </Section>

          {/* 工程プルダウン */}
          <Section title="写真の「工程」プルダウン項目" icon={<Camera className="w-4 h-4" />} accent="#ff6b35">
            <p className="text-xs mb-4" style={{ color: '#6b7280' }}>現場でよく使う工程名を自由に追加・編集できます。</p>
            <div className="space-y-2 mb-4">
              {processes.map((proc, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <span className="text-xs font-bold w-5 text-right shrink-0" style={{ color: '#6b7280' }}>{index + 1}.</span>
                  <input
                    type="text"
                    value={proc}
                    onChange={(e) => {
                      const newArr = [...processes];
                      newArr[index] = e.target.value;
                      setProcesses(newArr);
                    }}
                    className={inputCls}
                    style={inputStyle}
                  />
                  <button
                    onClick={() => setProcesses(processes.filter((_, i) => i !== index))}
                    className="p-2 rounded-xl transition-colors shrink-0"
                    style={{ color: '#3d3d60' }}
                    onPointerEnter={e => (e.currentTarget.style.color = '#ef4444')}
                    onPointerLeave={e => (e.currentTarget.style.color = '#3d3d60')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <AddButton onClick={() => setProcesses([...processes, "新しい工程"])} label="工程項目を追加" />
          </Section>

          {/* 写真テンプレートマスタ */}
          <Section title="写真テンプレートマスタ" icon={<Camera className="w-4 h-4" />} accent="#10b981">
            <p className="text-xs mb-4" style={{ color: '#6b7280' }}>よく使う工程と説明文の組み合わせを登録しておくと、写真ページでワンタップで自動入力できます。</p>
            <div className="space-y-3 mb-4">
              {photoMaster.map((m, index) => (
                <div key={m.id} className="p-3 rounded-xl border space-y-2" style={{ background: '#12122a', borderColor: '#2e2e50' }}>
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-bold w-4 mt-2.5 shrink-0" style={{ color: '#6b7280' }}>{index + 1}</span>
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        placeholder="テンプレート名（例：着工前確認）"
                        value={m.name}
                        onChange={(e) => setPhotoMaster(prev => prev.map((item, i) => i === index ? { ...item, name: e.target.value } : item))}
                        className={inputCls}
                        style={{ ...inputStyle, background: '#1c1c30' }}
                      />
                      <input
                        type="text"
                        placeholder="工程"
                        value={m.process}
                        onChange={(e) => setPhotoMaster(prev => prev.map((item, i) => i === index ? { ...item, process: e.target.value } : item))}
                        className={inputCls}
                        style={{ ...inputStyle, background: '#1c1c30' }}
                      />
                      <textarea
                        placeholder="説明文"
                        rows={2}
                        value={m.description}
                        onChange={(e) => setPhotoMaster(prev => prev.map((item, i) => i === index ? { ...item, description: e.target.value } : item))}
                        className={`${inputCls} resize-none`}
                        style={{ ...inputStyle, background: '#1c1c30' }}
                      />
                    </div>
                    <button
                      onClick={() => setPhotoMaster(prev => prev.filter((_, i) => i !== index))}
                      className="p-1.5 mt-1 rounded-lg transition-colors shrink-0"
                      style={{ color: '#3d3d60' }}
                      onPointerEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onPointerLeave={e => (e.currentTarget.style.color = '#3d3d60')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <AddButton onClick={() => setPhotoMaster(prev => [...prev, { id: nextId(), name: '', process: '', description: '' }])} label="テンプレートを追加" accent="#10b981" />
          </Section>

          {/* 材料マスタ */}
          <Section title="材料マスタ" icon={<Package className="w-4 h-4" />} accent="#8b5cf6">
            <p className="text-xs mb-4" style={{ color: '#6b7280' }}>よく使う材料を登録しておくと、材料ページで品名を入力した際に自動入力できます。</p>
            <div className="space-y-3 mb-4">
              {materialMaster.map((m, index) => (
                <div key={m.id} className="p-3 rounded-xl border space-y-2" style={{ background: '#12122a', borderColor: '#2e2e50' }}>
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-bold w-4 mt-2.5 shrink-0" style={{ color: '#6b7280' }}>{index + 1}</span>
                    <div className="flex-1 space-y-2">
                      {[
                        { ph: '品名', key: 'name' as keyof MaterialMaster },
                        { ph: 'メーカー', key: 'manufacturer' as keyof MaterialMaster },
                        { ph: '規格 / 寸法 / 数量', key: 'specification' as keyof MaterialMaster },
                        { ph: '備考', key: 'remarks' as keyof MaterialMaster },
                      ].map(({ ph, key }) => (
                        <input
                          key={key}
                          type="text"
                          placeholder={ph}
                          value={m[key] as string}
                          onChange={(e) => setMaterialMaster(prev => prev.map((item, i) => i === index ? { ...item, [key]: e.target.value } : item))}
                          className={inputCls}
                          style={{ ...inputStyle, background: '#1c1c30' }}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => setMaterialMaster(prev => prev.filter((_, i) => i !== index))}
                      className="p-1.5 mt-1 rounded-lg transition-colors shrink-0 self-start"
                      style={{ color: '#3d3d60' }}
                      onPointerEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onPointerLeave={e => (e.currentTarget.style.color = '#3d3d60')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <AddButton onClick={() => setMaterialMaster(prev => [...prev, { id: nextId(), name: '', manufacturer: '', specification: '', remarks: '' }])} label="材料を追加" accent="#8b5cf6" />
          </Section>

          {/* 位置図 一括マイグレーション */}
          <Section title="位置図 座標系アップグレード" icon={<Map className="w-4 h-4" />} accent="#10b981">
            <p className="text-xs mb-4" style={{ color: '#6b7280' }}>
              旧形式（固定コンテナ基準）の位置図ピン・寸法線を、画像の自然アスペクト基準に一括変換します。
              変換済みの現場はスキップされます。通常は編集画面を開いた際に自動変換されますが、
              このボタンで全現場を一度に変換できます。
            </p>
            <button
              onClick={handleBulkMigration}
              disabled={bulkMigrating}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
              style={{ background: '#0f2e25', color: bulkMigrating ? '#6b7280' : '#10b981', border: '1px solid #1a4a3a' }}
              onPointerEnter={e => { if (!bulkMigrating) (e.currentTarget as HTMLButtonElement).style.borderColor = '#10b981'; }}
              onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1a4a3a'; }}
            >
              <Map className={`w-4 h-4 ${bulkMigrating ? 'animate-pulse' : ''}`} />
              {bulkMigrating ? '変換中... しばらくお待ちください' : '全現場の位置図を一括アップグレード'}
            </button>
            {migrationResult && (
              <p className="mt-3 text-xs font-bold" style={{ color: '#10b981' }}>{migrationResult}</p>
            )}
          </Section>

        </div>
      </div>
    </div>
  );
}

function AddButton({ onClick, label, accent = '#ff6b35' }: { onClick: () => void; label: string; accent?: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-4 font-bold text-sm rounded-xl border-2 border-dashed flex items-center justify-center gap-2 transition-colors"
      style={{ borderColor: '#2e2e50', color: '#8b8ba8' }}
      onPointerEnter={e => { (e.currentTarget.style.borderColor = accent); (e.currentTarget.style.color = accent); }}
      onPointerLeave={e => { (e.currentTarget.style.borderColor = '#2e2e50'); (e.currentTarget.style.color = '#8b8ba8'); }}
    >
      <Plus className="w-4 h-4" /> {label}
    </button>
  );
}
