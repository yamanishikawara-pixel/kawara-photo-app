import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Paperclip, Trash2, Upload } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

import { db, auth, storage } from '../firebase';
import type { Project } from '../types';
import { InputField } from '../shared/components';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { canUpload, trackUpload } from '../shared/storageUtils';

export function CoverPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appendixUploading, setAppendixUploading] = useState(false);
  const [appendixProgress, setAppendixProgress] = useState(0);
  const appendixInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    setError(null);
    getDoc(doc(db, 'projects', id))
      .then((d) => {
        if (d.exists()) setProject(d.data() as Project);
        else setError('表紙データが見つかりません。');
      })
      .catch(() => setError('表紙データの読み込みに失敗しました。'));
  }, [id]);

  const update = async (field: keyof Project, value: string) => {
    if (!project || !id) return;
    const previous = project;
    setProject({ ...project, [field]: value });
    try {
      await updateDoc(doc(db, 'projects', id), { [field]: value });
    } catch {
      setProject(previous);
      setError('保存に失敗しました。');
    }
  };

  const handleAppendixUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    if (file.type !== 'application/pdf') { setError('PDFファイルを選択してください。'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('ファイルサイズは20MB以下にしてください。'); return; }
    const uid = auth.currentUser?.uid;
    if (!uid) { setError('ログインが必要です。'); return; }
    const storageUsed = (await getDoc(doc(db, 'users', uid))).data()?.storageUsedBytes ?? 0;
    if (!canUpload(storageUsed, file.size)) { setError('ストレージ容量が不足しています。'); return; }

    setAppendixUploading(true);
    setAppendixProgress(0);
    try {
      // 既存ファイルを削除
      if (project?.appendixPdfUrl) {
        try { await deleteObject(ref(storage, project.appendixPdfUrl)); } catch { /* 無視 */ }
      }
      const storageRef = ref(storage, `users/${uid}/projects/${id}/appendix.pdf`);
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, file);
        task.on('state_changed',
          (snap) => setAppendixProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
          reject,
          () => resolve(),
        );
      });
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'projects', id), { appendixPdfUrl: url });
      await trackUpload(uid, file.size);
      setProject((prev) => prev ? { ...prev, appendixPdfUrl: url } : prev);
    } catch {
      setError('PDFのアップロードに失敗しました。');
    } finally {
      setAppendixUploading(false);
      setAppendixProgress(0);
      if (appendixInputRef.current) appendixInputRef.current.value = '';
    }
  };

  const handleAppendixDelete = async () => {
    if (!project?.appendixPdfUrl || !id) return;
    if (!window.confirm('添付PDFを削除しますか？')) return;
    try {
      await deleteObject(ref(storage, project.appendixPdfUrl));
    } catch { /* Storage削除失敗は無視 */ }
    await updateDoc(doc(db, 'projects', id), { appendixPdfUrl: null });
    setProject((prev) => prev ? { ...prev, appendixPdfUrl: undefined } : prev);
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

        {/* 添付PDF */}
        <div className="mt-6 bg-white p-6 rounded-3xl shadow-sm border border-black/5">
          <h2 className="text-base font-bold text-gray-700 mb-4 flex items-center gap-2">
            <Paperclip className="w-4 h-4" /> 添付資料PDF（最終ページに追加）
          </h2>
          {project.appendixPdfUrl ? (
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-200">
              <Paperclip className="w-5 h-5 text-blue-500 shrink-0" />
              <span className="text-sm text-blue-700 font-bold flex-1 truncate">PDF添付済み</span>
              <button
                type="button"
                onClick={handleAppendixDelete}
                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => appendixInputRef.current?.click()}
              disabled={appendixUploading}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-4 text-gray-500 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              <Upload className="w-5 h-5" />
              {appendixUploading ? `アップロード中... ${appendixProgress}%` : 'PDFを選択'}
            </button>
          )}
          <input
            ref={appendixInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleAppendixUpload}
          />
          {appendixUploading && (
            <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${appendixProgress}%` }} />
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2">最大20MB・PDF形式のみ</p>
        </div>
      </div>
    </div>
  );
}
