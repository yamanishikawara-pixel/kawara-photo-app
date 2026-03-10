import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, Link } from 'react-router-dom';
import { db, storage } from './firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// --- メインのプログラム ---
export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-100 pb-20">
        <header className="bg-blue-900 text-white p-4 shadow-md flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/kawara-icon.png" alt="logo" className="w-8 h-8 rounded" />
            <h1 className="text-xl font-bold">山西瓦店 写真台帳</h1>
          </div>
        </header>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<ProjectForm />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
        </Routes>

        <nav className="fixed bottom-0 w-full bg-white border-t flex justify-around p-3 text-xs text-gray-600">
          <Link to="/" className="flex flex-col items-center gap-1">🏠 現場一覧</Link>
          <Link to="/new" className="flex flex-col items-center gap-1">➕ 新規作成</Link>
        </nav>
      </div>
    </BrowserRouter>
  );
}

// --- 現場一覧画面 ---
function Home() {
  const [projects, setProjects] = useState<any[]>([]);
  
  useEffect(() => {
    const fetchProjects = async () => {
      const querySnapshot = await getDocs(collection(db, "projects"));
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(data);
    };
    fetchProjects();
  }, []);

  return (
    <div className="p-4">
      <h2 className="font-bold mb-4 border-b-2 border-blue-900 pb-1">現場一覧</h2>
      {projects.length === 0 ? (
        <p className="text-center text-gray-500 mt-10">現場が登録されていません</p>
      ) : (
        <div className="grid gap-3">
          {projects.map(p => (
            <Link key={p.id} to={`/project/${p.id}`} className="bg-white p-4 rounded-lg shadow block border-l-4 border-blue-900">
              <div className="font-bold text-lg">{p.clientName} 様 邸</div>
              <div className="text-sm text-gray-600">📅 {p.date}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// --- 新規登録・位置図2枚対応 ---
function ProjectForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ clientName: '', address: '', date: new Date().toISOString().split('T')[0] });
  const [mapImages, setMapImages] = useState<File[]>([]);

  const handleSave = async () => {
    if (!formData.clientName) return alert("お名前を入力してください");
    setLoading(true);

    try {
      const mapUrls: string[] = [];
      // 画像をGoogle倉庫にアップロード
      for (const file of mapImages) {
        const storageRef = ref(storage, `maps/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        mapUrls.push(url);
      }

      // 文字データをGoogleデータベースに保存
      await addDoc(collection(db, "projects"), {
        ...formData,
        mapUrls,
        photos: []
      });

      navigate('/');
    } catch (e) {
      alert("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-white m-4 rounded-xl shadow-lg">
      <h2 className="font-bold text-lg mb-4 text-blue-900">現場の新規登録</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold mb-1">施主名 (様邸)</label>
          <input type="text" className="w-full border p-2 rounded" value={formData.clientName} onChange={e => setFormData({...formData, clientName: e.target.value})} placeholder="例：山田 太郎" />
        </div>
        <div>
          <label className="block text-sm font-bold mb-1">位置図 (最大2枚まで)</label>
          <input type="file" multiple accept="image/*" className="w-full text-sm" onChange={e => setMapImages(Array.from(e.target.files || []).slice(0, 2))} />
          <p className="text-xs text-red-500 mt-1">※広域地図と屋根図面など、2枚選べます</p>
        </div>
        <button 
          onClick={handleSave} 
          disabled={loading}
          className={`w-full p-3 rounded-lg font-bold text-white shadow-lg ${loading ? 'bg-gray-400' : 'bg-blue-700 active:bg-blue-900'}`}
        >
          {loading ? "送信中..." : "現場を登録する"}
        </button>
      </div>
    </div>
  );
}

// --- 現場詳細 ---
function ProjectDetail() {
  return <div className="p-4 text-center">現場詳細画面（ここから写真を更に追加する機能を作ります）</div>;
}