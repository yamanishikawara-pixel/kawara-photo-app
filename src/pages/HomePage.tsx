import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, Camera, FileText, Images, Map } from 'lucide-react';

import type { Project } from '../types';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { MenuButton } from '../shared/components';
import { List, BookOpen } from 'lucide-react';

export function HomePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'projects', id)).then((d) => {
      if (d.exists()) {
        setProject(d.data() as Project);
      }
    });
  }, [id]);

  if (!project) return <div className="p-10 text-center">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50 p-6 font-sans">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex flex-col items-center py-10 px-4 bg-white/80 backdrop-blur-sm rounded-3xl shadow-sm">
          <div className="w-[88px] h-[88px] bg-blue-100/50 rounded-full flex items-center justify-center mb-5">
            <Images className="w-10 h-10 text-blue-500" />
          </div>
          <h1 className="text-3xl font-bold mb-3 text-gray-900">
            瓦工事 写真台帳
          </h1>
          <p className="text-base text-gray-500 text-center mb-6">
            現場ごとに写真と位置図を管理
          </p>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm font-bold text-blue-700 bg-blue-100/80 px-6 py-3 rounded-full hover:bg-blue-200"
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
        </div>
      </div>
    </div>
  );
}

