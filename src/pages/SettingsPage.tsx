import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Building2, MapPin, Phone, Image as ImageIcon } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // 入力データ
  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);

  // 画面を開いた時に、保存されている設定を読み込む
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const docRef = doc(db, 'users', user.uid);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setCompanyName(data.companyName || '');
          setAddress(data.address || '');
          setPhone(data.phone || '');
          setLogoUrl(data.logoUrl || '');
        }
      } catch (err) {
        console.error(err);
        setError('設定の読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  // 保存ボタンを押した時の処理
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('ログインしていません');

      let currentLogoUrl = logoUrl;

      // 新しいロゴ画像が選ばれていたら、倉庫（Storage）にアップロード
      if (logoFile) {
        const logoRef = ref(storage, `logos/${user.uid}/${Date.now()}_${logoFile.name}`);
        await uploadBytes(logoRef, logoFile);
        currentLogoUrl = await getDownloadURL(logoRef);
        setLogoUrl(currentLogoUrl); // 画面の表示も更新
      }

      // データベース（Firestore）に会社情報を保存
      await setDoc(doc(db, 'users', user.uid), {
        companyName,
        address,
        phone,
        logoUrl: currentLogoUrl,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setSuccess(true);
      // 3秒後に成功メッセージを消す
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setError('設定の保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans flex flex-col items-center">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate('/')} className="text-gray-500 hover:text-blue-600 p-2 bg-white rounded-full shadow-sm transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">自社情報の設定</h1>
        </div>

        {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}
        {success && (
          <div className="bg-green-100 border border-green-200 text-green-700 p-4 rounded-xl mb-6 font-bold flex items-center justify-center shadow-sm">
            ✅ 設定を保存しました！
          </div>
        )}

        <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          
          {/* ロゴ画像の設定 */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">会社ロゴ（PDFの表紙に表示されます）</label>
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden shrink-0">
                {logoFile ? (
                  <img src={URL.createObjectURL(logoFile)} alt="preview" className="w-full h-full object-contain" />
                ) : logoUrl ? (
                  <img src={logoUrl} alt="logo" className="w-full h-full object-contain" />
                ) : (
                  <ImageIcon className="w-8 h-8 text-gray-400" />
                )}
              </div>
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-colors cursor-pointer"
                />
                <p className="text-xs text-gray-500 mt-2">※正方形または横長の画像がおすすめです</p>
              </div>
            </div>
          </div>

          {/* 会社名 */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">会社名（屋号）</label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                placeholder="例：有限会社 山西瓦店"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
          </div>

          {/* 住所 */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">住所</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                placeholder="例：富山県魚津市〇〇 1-2-3"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>

          {/* 電話番号 */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">電話番号</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="tel"
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                placeholder="例：0765-12-3456"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-colors shadow-md disabled:opacity-50 text-lg flex items-center justify-center gap-2 mt-4"
          >
            {saving ? <LoadingSpinner /> : <><Save className="w-6 h-6" /> この内容で保存する</>}
          </button>
        </form>
      </div>
    </div>
  );
}