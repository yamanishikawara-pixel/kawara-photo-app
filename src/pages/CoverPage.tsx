import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

import { db } from '../firebase';
import type { Project } from '../types';
import { InputField } from '../shared/components';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';

export function CoverPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setError(null);
    getDoc(doc(db, 'projects', id))
      .then((d) => {
        if (d.exists()) setProject(d.data() as Project);
      })
      .catch(() => setError('表紙データの読み込みに失敗しました。'));
  }, [id]);

  const update = async (field: keyof Project, value: string) => {
    if (!project || !id) return;
    const updated: Project = { ...project, [field]: value };
    setProject(updated);
    try {
      await updateDoc(doc(db, 'projects', id), { [field]: value });
    } catch {
      setError('保存に失敗しました。');
    }
  };

  if (error && !project) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 font-sans flex flex-col items-center justify-center">
        <ErrorMessage message={error} onDismiss={() => setError(null)} />
        <button
          type="button"
          onClick={() => navigate(`/project/${id}`)}
          className="mt-4 text-blue-500 font-bold flex items-center gap-2"
        >
          <ArrowLeft className="w-5 h-5" /> もどる
        </button>
      </div>
    );
  }

  if (!project) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-md mx-auto pb-12">
        {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}
        <button
          type="button"
          onClick={() => navigate(`/project/${id}`)}
          className="flex items-center gap-2 text-blue-500 mb-6 font-bold text-lg"
          aria-label="現場メニューにもどる"
        >
          <ArrowLeft className="w-6 h-6" /> もどる
        </button>
        <h1 className="text-3xl font-bold mb-8 text-gray-900">表紙の入力</h1>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5">
          <InputField
            label="工事件名"
            value={project.projectName}
            onChange={(v: string) => update('projectName', v)}
            bgColor="bg-blue-50/50"
            id="cover-projectName"
          />
          <InputField
            label="工事場所"
            value={project.projectLocation}
            onChange={(v: string) => update('projectLocation', v)}
            bgColor="bg-green-50/50"
            id="cover-projectLocation"
          />
          <InputField
            label="工期"
            value={project.constructionPeriod}
            onChange={(v: string) => update('constructionPeriod', v)}
            bgColor="bg-purple-50/50"
            id="cover-constructionPeriod"
          />
          <InputField
            label="施工業者"
            value={project.contractorName}
            onChange={(v: string) => update('contractorName', v)}
            bgColor="bg-orange-50/50"
            id="cover-contractorName"
          />
          <InputField
            label="作成年月日"
            value={project.creationDate}
            onChange={(v: string) => update('creationDate', v)}
            bgColor="bg-gray-50/50"
            id="cover-creationDate"
          />
        </div>
      </div>
    </div>
  );
}
