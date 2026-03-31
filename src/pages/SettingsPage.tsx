import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, Settings, Image as ImageIcon, X } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { LoadingSpinner } from '../shared/LoadingSpinner';

const DEFAULT_PROCESSES = [
  "着工前", "下地・下葺き", "防水ルーフィング施工", "瓦桟施工",
  "流れ壁板金", "平行壁板金", "確認", "棟金具設置", "緊結状況", "施工中", "完成"
];

const DEFAULT_TEMPLATES = [
  { label: "基準/実測", text: "基準値：\n実測値：" },
  { label: "重ね幅(ヨコ)", text: "重ね幅（ヨコ）：" },
  { label: "重ね幅(タテ)", text: "重ね幅（タテ）：" },
  { label: "平行壁(立上)", text: "平行壁：立ち上げ高 " },
  { label: "流れ壁(立上)", text: "流れ壁：立ち上げ高 " },
  { label: "棟芯(重ね)", text: "棟芯：重ね（左右） " },
  { label: "棟部(増張り)", text: "棟部：増し張り " },
];

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
  const [templates, setTemplates] = useState<{label: string, text: string}[]>(DEFAULT_TEMPLATES);

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
          if (data.customDescTemplates && data.customDescTemplates.length > 0) setTemplates(data.customDescTemplates);
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
      setLogoUrl(url);
    } catch (error) {
      alert('ロゴのアップロードに失敗しました。');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!uid) {
      alert('設定を保存するにはログインが必要です。');
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', uid), {
        companyName,
        address,
        phone,
        logoUrl,
        customProcesses: processes,
        customDescTemplates: templates
      }, { merge: true });
      alert('設定を保存しました！\n（現場の写真入力画面やPDF出力に反映されます）');
    } catch (error) {
      console.error(error);
      alert('保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-xl mx-auto pb-12">
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-blue-500 font-bold text-lg hover:underline">
            <ArrowLeft className="w-6 h-6" /> ホームへ
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
            <Save className="w-5 h-5" /> {saving ? '保存中...' : '設定を保存'}
          </button>
        </div>

        <h1 className="text-3xl font-bold mb-8 text-gray-900 flex items-center gap-3">
          <Settings className="w-8 h-8 text-gray-700" /> 基本設定・カスタマイズ
        </h1>

        <div className="space-y-8">
          
          {/* 会社情報 */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-5">
            <h2 className="text-xl font-bold text-gray-800 border-b pb-2 mb-4">自社情報（PDF表紙用）</h2>
            
            {/* ロゴのアップロード */}
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-2">自社ロゴ画像</label>
              <div className="flex items-center gap-4">
                {logoUrl ? (
                  <div className="relative w-32 h-32 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-center p-2">
                    <img src={logoUrl} alt="ロゴ" className="max-w-full max-h-full object-contain" />
                    <button onClick={() => setLogoUrl('')} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600"><X className="w-4 h-4"/></button>
                  </div>
                ) : (
                  <label className="w-32 h-32 flex flex-col items-center justify-center bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                    {uploadingLogo ? <span className="text-blue-500 font-bold text-sm">送信中...</span> : (
                      <><ImageIcon className="w-8 h-8 text-gray-400 mb-2" /><span className="text-xs text-gray-500 font-bold">画像を選択</span></>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                  </label>
                )}
                <div className="flex-1 text-xs text-gray-500 leading-relaxed">
                  PDF出力時、表紙の一番上に表示されるロゴマークです。未設定の場合はデフォルトのロゴが表示されます。
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-600 mb-2">会社名・屋号</label>
              <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="例：吉田瓦店" className="w-full p-3 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-2">住所</label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="例：富山県魚津市〇〇1-2-3" className="w-full p-3 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-2">電話番号</label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="例：0765-00-0000" className="w-full p-3 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* 工程のカスタマイズ */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-800 mb-2">写真の「工程」プルダウン項目</h2>
            <p className="text-sm text-gray-500 mb-5">現場でよく使う工程名を自由に追加・編集できます。</p>
            <div className="space-y-3 mb-5">
              {processes.map((proc, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <span className="text-gray-400 font-bold w-6 text-right">{index + 1}.</span>
                  <input
                    type="text"
                    value={proc}
                    onChange={(e) => {
                      const newArr = [...processes];
                      newArr[index] = e.target.value;
                      setProcesses(newArr);
                    }}
                    className="flex-1 p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                  <button onClick={() => setProcesses(processes.filter((_, i) => i !== index))} className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setProcesses([...processes, "新しい工程"])} className="w-full py-3 bg-gray-50 text-blue-600 font-bold rounded-xl border-2 border-dashed border-blue-200 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
              <Plus className="w-5 h-5" /> 工程項目を追加
            </button>
          </div>

          {/* 定型文のカスタマイズ */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-800 mb-2">説明欄の「ワンタップ定型文」</h2>
            <p className="text-sm text-gray-500 mb-5">よく使う説明文をボタン一つで入力できるようにします。</p>
            <div className="space-y-4 mb-5">
              {templates.map((tmpl, index) => (
                <div key={index} className="flex gap-3 items-start bg-gray-50 p-4 rounded-2xl border border-gray-200">
                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">ボタンの名前（短く）</label>
                      <input
                        type="text"
                        value={tmpl.label}
                        // ★ バグ修正：オブジェクトの浅いコピー問題を setState の prev で安全に解決
                        onChange={(e) => setTemplates(prev => prev.map((t, i) => i === index ? { ...t, label: e.target.value } : t))}
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
                        placeholder="例：基準/実測"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">ボタンを押した時に挿入される文章</label>
                      <textarea
                        value={tmpl.text}
                        // ★ バグ修正：オブジェクトの浅いコピー問題を setState の prev で安全に解決
                        onChange={(e) => setTemplates(prev => prev.map((t, i) => i === index ? { ...t, text: e.target.value } : t))}
                        rows={2}
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
                        placeholder="例：基準値：&#13;&#10;実測値："
                      />
                    </div>
                  </div>
                  <button onClick={() => setTemplates(templates.filter((_, i) => i !== index))} className="p-2 mt-4 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setTemplates([...templates, { label: "新規ボタン", text: "新しい説明文" }])} className="w-full py-3 bg-gray-50 text-blue-600 font-bold rounded-xl border-2 border-dashed border-blue-200 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
              <Plus className="w-5 h-5" /> 定型文ボタンを追加
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}