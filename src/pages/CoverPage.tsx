import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

import { db } from '../firebase';
import type { Project } from '../types';
import { InputField } from '../shared/components';

export function CoverPage() {
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

  const update = async (field: keyof Project, value: string) => {
    if (!project || !id) return;
    const updated: Project = { ...project, [field]: value };
    setProject(updated);
    await updateDoc(doc(db, 'projects', id), { [field]: value });
  };

  if (!project) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-md mx-auto pb-12">
        <button
          onClick={() => navigate(`/project/${id}`)}
          className="flex items-center gap-2 text-blue-500 mb-6 font-bold text-lg"
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
          />
          <InputField
            label="工事場所"
            value={project.projectLocation}
            onChange={(v: string) => update('projectLocation', v)}
            bgColor="bg-green-50/50"
          />
          <InputField
            label="工期"
            value={project.constructionPeriod}
            onChange={(v: string) => update('constructionPeriod', v)}
            bgColor="bg-purple-50/50"
          />
          <InputField
            label="施工業者"
            value={project.contractorName}
            onChange={(v: string) => update('contractorName', v)}
            bgColor="bg-orange-50/50"
          />
          <InputField
            label="作成年月日"
            value={project.creationDate}
            onChange={(v: string) => update('creationDate', v)}
            bgColor="bg-gray-50/50"
          />
        </div>
      </div>
    </div>
  );
}

