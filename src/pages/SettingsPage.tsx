import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, Settings } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
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
          if (data.customProcesses && data.customProcesses.length > 0) setProcesses(data.customProcesses);
          if (data.customDescTemplates && data.customDescTemplates.length > 0) setTemplates(data.customDescTemplates);
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleSave = async () => {
    if (!uid) {
      alert('設定を保存するにはログインが必要です。');
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', uid), {
        companyName,
        customProcesses: processes,
        customDescTemplates: templates
      }, { merge: true });
      alert('自社専用のカスタマイズ設定を保存しました！\n（現場の写真入力画面に反映されます）');
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
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-blue-500 font-bold text-lg">
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
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-800 mb-4">自社情報</h2>
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-2">会社名・屋号</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="例：吉田瓦店"
                className="w-full p-3 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-2">※ここで設定した会社名が、PDF出力時の「施工業者」に反映されます。</p>
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
                        onChange={(e) => {
                          const newArr = [...templates];
                          newArr[index].label = e.target.value;
                          setTemplates(newArr);
                        }}
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
                        placeholder="例：基準/実測"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">ボタンを押した時に挿入される文章</label>
                      <textarea
                        value={tmpl.text}
                        onChange={(e) => {
                          const newArr = [...templates];
                          newArr[index].text = e.target.value;
                          setTemplates(newArr);
                        }}
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