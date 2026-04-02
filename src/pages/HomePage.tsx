import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, Camera, FileText, Images, Map, Package, QrCode, Copy, Check, X } from 'lucide-react';
import { List, BookOpen } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

import type { Project } from '../types';
import { db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { MenuButton } from '../shared/components';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';

function QrModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full flex flex-col items-center gap-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between w-full">
          <h2 className="text-lg font-bold text-gray-800">報告書を共有</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
          <QRCodeSVG value={url} size={200} level="M" />
        </div>

        <p className="text-sm text-gray-500 text-center leading-relaxed">
          施主や元請けのスマホでこのQRを読み取ると、ログイン不要で写真報告書を閲覧できます。
        </p>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-2 w-full justify-center px-4 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'コピーしました！' : 'URLをコピー'}
        </button>

        <p className="text-xs text-gray-300 break-all text-center">{url}</p>
      </div>
    </div>
  );
}

export function HomePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [generatingQr, setGeneratingQr] = useState(false);

  useEffect(() => {
    if (!id) return;
    setError(null);
    getDoc(doc(db, 'projects', id))
      .then((d) => {
        if (d.exists()) setProject(d.data() as Project);
      })
      .catch(() => setError('現場データの読み込みに失敗しました。'));
  }, [id]);

  const handleShowQr = async () => {
    if (!id || !project) return;
    let token = project.shareToken;
    if (!token) {
      setGeneratingQr(true);
      token = crypto.randomUUID();
      try {
        await updateDoc(doc(db, 'projects', id), { shareToken: token });
        setProject({ ...project, shareToken: token });
      } catch {
        setError('共有リンクの生成に失敗しました。');
        setGeneratingQr(false);
        return;
      }
      setGeneratingQr(false);
    }
    setShowQr(true);
  };

  if (error && !project) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 font-sans flex flex-col items-center justify-center">
        <ErrorMessage message={error} onDismiss={() => setError(null)} />
      </div>
    );
  }

  if (!project) return <LoadingSpinner />;

  const shareUrl = project.shareToken
    ? `${window.location.origin}/share/${id}/${project.shareToken}`
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50 p-6 font-sans">
      {showQr && shareUrl && <QrModal url={shareUrl} onClose={() => setShowQr(false)} />}

      <div className="max-w-md mx-auto space-y-6">
        {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}
        <div className="flex flex-col items-center py-10 px-4 bg-white/80 backdrop-blur-sm rounded-3xl shadow-sm">
          <div className="w-[88px] h-[88px] bg-blue-100/50 rounded-full flex items-center justify-center mb-5">
            <Images className="w-10 h-10 text-blue-500" aria-hidden />
          </div>
          <h1 className="text-3xl font-bold mb-3 text-gray-900">
            瓦工事 写真台帳
          </h1>
          <p className="text-base text-gray-500 text-center mb-6">
            現場ごとに写真と位置図を管理
          </p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm font-bold text-blue-700 bg-blue-100/80 px-6 py-3 rounded-full hover:bg-blue-200"
            aria-label="現場一覧を開く"
          >
            <Building2 className="w-4 h-4" /> 現場切替: {project.projectName}
          </button>
        </div>
        <div className="space-y-4">
          <MenuButton
            title="現場一覧"
            subtitle="現場の切り替え・新規追加・削除"
            icon={List}
            colorClass="bg-teal-100/30"
            onClick={() => navigate('/')}
          />
          <MenuButton
            title="表紙"
            subtitle="現場名・住所・工期の入力"
            icon={BookOpen}
            colorClass="bg-purple-100/30"
            onClick={() => navigate(`/project/${id}/cover`)}
          />
          <MenuButton
            title="材料"
            subtitle="材料報告書（使用部材）の登録"
            icon={Package}
            colorClass="bg-indigo-100/30"
            onClick={() => navigate(`/project/${id}/material`)}
          />
          <MenuButton
            title="写真"
            subtitle="赤丸マーカー付き写真の登録"
            icon={Camera}
            colorClass="bg-blue-100/30"
            onClick={() => navigate(`/project/${id}/photo`)}
          />
          <MenuButton
            title="位置図"
            subtitle="図面登録と赤丸・矢印の配置"
            icon={Map}
            colorClass="bg-green-100/30"
            onClick={() => navigate(`/project/${id}/map`)}
          />
          <MenuButton
            title="PDF出力"
            subtitle="黄金比レイアウトで書き出し"
            icon={FileText}
            colorClass="bg-orange-100/30"
            onClick={() => navigate(`/project/${id}/pdf`)}
          />

          {/* QR共有ボタン */}
          <button
            type="button"
            onClick={handleShowQr}
            disabled={generatingQr}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-60"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <QrCode className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-left">
              <div className="font-bold text-emerald-800 text-base">
                {generatingQr ? 'QRコード生成中...' : 'QRで共有'}
              </div>
              <div className="text-sm text-emerald-600">
                施主・元請けがスマホで閲覧
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
