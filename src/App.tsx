import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Link } from 'react-router-dom';
import { db, storage } from './firebase';
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, arrayUnion, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// --- メイン構成 ---
export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-100 pb-20 font-sans">
        <header className="bg-[#1a365d] text-white p-4 shadow-xl flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <img src="/kawara-icon.png" alt="logo" className="w-10 h-10 rounded-lg border-2 border-white shadow-sm" />
            <h1 className="text-xl font-black tracking-tighter">山西瓦店 写真台帳</h1>
          </div>
        </header>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<ProjectForm />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
        </Routes>

        <nav className="fixed bottom-0 w-full bg-white border-t-2 border-gray-200 flex justify-around p-3 shadow-[0_-5px_15px_rgba(0,0,0,0.1)] z-50">
          <Link to="/" className="flex flex-col items-center text-[#1a365d] font-bold text-xs gap-1">🏠 現場一覧</Link>
          <Link to="/new" className="flex flex-col items-center text-[#1a365d] font-bold text-xs gap-1">➕ 新規登録</Link>
        </nav>
      </div>
    </BrowserRouter>
  );
}

// --- 現場一覧（Home） ---
function Home() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    };
    fetch();
  }, []);

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold text-gray-800 border-l-4 border-[#1a365d] pl-2 uppercase tracking-wider">管理現場リスト</h2>
      {loading ? (
        <div className="text-center py-10 text-gray-400">読み込み中...</div>
      ) : projects.length === 0 ? (
        <div className="bg-white p-10 rounded-xl shadow-inner text-center text-gray-400 border-2 border-dashed border-gray-300">
          現場が登録されていません。<br/>「新規登録」から始めてください。
        </div>
      ) : (
        projects.map(p => (
          <Link key={p.id} to={`/project/${p.id}`} className="bg-white p-5 rounded-xl shadow-md border-l-[12px] border-[#1a365d] block hover:shadow-lg transition-shadow">
            <div className="font-black text-xl text-gray-900 mb-1">{p.clientName} 様 邸</div>
            <div className="text-sm text-gray-500 flex items-center gap-1">📍 {p.address || '住所未登録'}</div>
          </Link>
        ))
      )}
    </div>
  );
}

// --- 新規登録 ---
function ProjectForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [addr, setAddr] = useState('');
  const [maps, setMaps] = useState<File[]>([]);

  const save = async () => {
    if (!name) return alert("施主名（様邸）を入力してください");
    setLoading(true);
    try {
      const urls = [];
      for (const f of maps) {
        const r = ref(storage, `maps/${Date.now()}_${f.name}`);
        await uploadBytes(r, f);
        urls.push(await getDownloadURL(r));
      }
      await addDoc(collection(db, "projects"), { 
        clientName: name, 
        address: addr, 
        mapUrls: urls, 
        photos: [],
        createdAt: new Date().toISOString()
      });
      navigate('/');
    } catch (e) { alert("送信エラーが発生しました"); }
    finally { setLoading(false); }
  };

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-200">
        <h2 className="font-black text-2xl mb-6 text-[#1a365d] text-center border-b pb-4">現場の新規登録</h2>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-black text-gray-700 mb-2">施主名（〇〇様 邸）</label>
            <input type="text" placeholder="例：富山 太郎" className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-[#1a365d] outline-none" onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-black text-gray-700 mb-2">現場住所</label>
            <input type="text" placeholder="例：富山市..." className="w-full border-2 border-gray-200 p-4 rounded-xl focus:border-[#1a365d] outline-none" onChange={e => setAddr(e.target.value)} />
          </div>
          <div className="bg-blue-50 p-4 rounded-xl">
            <label className="block text-sm font-black text-blue-900 mb-2">位置図・屋根図（最大2枚）</label>
            <input type="file" multiple accept="image/*" className="w-full text-sm" onChange={e => setMaps(Array.from(e.target.files || []).slice(0, 2))} />
            <p className="text-[10px] text-blue-700 mt-2 italic font-bold">※広域地図と詳細図面など。2枚まで同時選択OK</p>
          </div>
          <button onClick={save} disabled={loading} className={`w-full p-5 rounded-2xl font-black text-white text-lg shadow-lg transform transition active:scale-95 ${loading ? 'bg-gray-400' : 'bg-[#1a365d] hover:bg-[#2c5282]'}`}>
            {loading ? "Google倉庫へ保存中..." : "現場を登録して開始"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- 詳細 & 写真 & PDF ---
function ProjectDetail() {
  const { id } = useParams();
  const [p, setP] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  const fetch = async () => {
    const d = await getDoc(doc(db, "projects", id!));
    if (d.exists()) setP({ id: d.id, ...d.data() });
  };
  useEffect(() => { fetch(); }, [id]);

  const addPhoto = async (e: any) => {
    const files = Array.from(e.target.files as FileList);
    setUploading(true);
    try {
      for (const f of files) {
        const r = ref(storage, `photos/${id}/${Date.now()}_${f.name}`);
        await uploadBytes(r, f);
        const url = await getDownloadURL(r);
        await updateDoc(doc(db, "projects", id!), { photos: arrayUnion({ url, date: new Date().toLocaleDateString() }) });
      }
      fetch();
    } finally { setUploading(false); }
  };

  const exportPDF = async () => {
    const el = document.getElementById('pdf-area');
    const canvas = await html2canvas(el!, { scale: 2, useCORS: true });
    const pdf = new jsPDF('p', 'mm', 'a4');
    pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, 210, 297);
    pdf.save(`${p.clientName}_工事写真台帳.pdf`);
  };

  if (!p) return <div className="p-10 text-center font-bold text-gray-400">現場データを読み込んでいます...</div>;

  return (
    <div className="p-4 pb-32 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-black text-gray-900">{p.clientName} 様 邸</h2>
        <button onClick={exportPDF} className="bg-green-600 text-white px-6 py-3 rounded-xl font-black shadow-lg active:scale-95 transition">PDF作成</button>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-md mb-8 border-t-4 border-green-500">
        <p className="font-black text-green-800 mb-3 flex items-center gap-2">📸 現場写真を撮影・追加</p>
        <input type="file" multiple accept="image/*" onChange={addPhoto} className="w-full text-sm block" />
        {uploading && <p className="text-blue-600 font-black mt-3 animate-pulse italic">🚀 Google倉庫へアップロード中...</p>}
      </div>

      <div id="pdf-area" className="bg-white p-[10mm] w-[210mm] min-h-[297mm] mx-auto border-2 shadow-inner text-black font-serif overflow-hidden">
        <div className="border-[3px] border-black p-4 mb-6 text-center">
          <h1 className="text-4xl font-black mb-3 tracking-[10px]">工 事 写 真 台 帳</h1>
          <p className="text-right font-black text-2xl mt-4">施工業者名：山西瓦店</p>
        </div>
        <table className="w-full border-collapse border-[2px] border-black mb-8 text-xl">
          <tr><td className="border-[2px] border-black p-3 font-black w-1/4 bg-gray-50">工事件名</td><td className="border-[2px] border-black p-3 font-bold">{p.clientName} 様邸 屋根工事</td></tr>
          <tr><td className="border-[2px] border-black p-3 font-black bg-gray-50">施工場所</td><td className="border-[2px] border-black p-3 font-bold">{p.address}</td></tr>
        </table>
        
        <div className="grid grid-cols-2 gap-6">
          {p.mapUrls?.map((url: string, i: number) => (
            <div key={url} className="border-[2px] border-black p-1">
              <img src={url} className="w-full h-72 object-contain" />
              <p className="text-center font-black border-t-2 border-black p-1 bg-gray-50">位置図・図面 {i+1}</p>
            </div>
          ))}
          {p.photos?.map((ph: any, i: number) => (
            <div key={i} className="border-[2px] border-black p-1">
              <img src={ph.url} className="w-full h-64 object-cover" />
              <p className="text-center font-black border-t-2 border-black p-1 text-sm bg-gray-50">施工日：{ph.date}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}