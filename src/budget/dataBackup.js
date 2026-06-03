import { db } from './firebase';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { PROJECT_FIELDS, projectStorageKey } from './projectStorage';

export async function exportAllData(currentMaster, projectList) {
  const projects = {};
  for (const slug of projectList) {
    const docRef = await getDoc(doc(db, "cost_projects", slug));
    const data = docRef.exists() ? docRef.data() : {};
    const localData = {};
    PROJECT_FIELDS.forEach(f => {
      const raw = window.localStorage.getItem(projectStorageKey(slug, f));
      if (raw != null) {
        try { localData[f] = JSON.parse(raw); } catch {}
      }
    });
    projects[slug] = { data: { ...localData, ...data } };
  }
  const payload = {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    master: currentMaster,
    projectList,
    projects,
  };
  return JSON.stringify(payload, null, 2);
}

export async function importAllData(jsonStr, mode, onProgress) {
  let payload;
  try { payload = JSON.parse(jsonStr); } catch { throw new Error("JSONの形式が正しくありません"); }
  if (!payload.master || !payload.projects) throw new Error("バックアップファイルの形式が不正です");
  if (payload.schemaVersion === 1) {
    Object.values(payload.projects).forEach(p => {
      if (p.data && p.data.status === undefined) p.data.status = "draft";
    });
  }
  const slugs = Object.keys(payload.projects);
  if (mode === "overwrite") {
    for (const slug of slugs) {
      try { await deleteDoc(doc(db, "cost_projects", slug)); } catch {}
    }
    Object.keys(window.localStorage)
      .filter(k => k.startsWith("cost_"))
      .forEach(k => window.localStorage.removeItem(k));
  }
  const suffix = mode === "merge" ? `_imported_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}` : "";
  const newProjectList = [];
  for (let i = 0; i < slugs.length; i++) {
    const origSlug = slugs[i];
    const slug = mode === "merge" && window.localStorage.getItem(projectStorageKey(origSlug, "koujiName")) != null
      ? origSlug + suffix
      : origSlug;
    onProgress?.(`復元中: ${slug} (${i + 1}/${slugs.length})`);
    const { data } = payload.projects[origSlug];
    await setDoc(doc(db, "cost_projects", slug), { ...data, koujiName: slug });
    PROJECT_FIELDS.forEach(f => {
      const val = f === "koujiName" ? slug : data[f];
      if (val !== undefined) {
        try { window.localStorage.setItem(projectStorageKey(slug, f), JSON.stringify(val)); } catch {}
      }
    });
    newProjectList.push(slug);
  }
  if (mode === "overwrite") {
    await setDoc(doc(db, "cost_master", "settings"), payload.master);
    Object.entries(payload.master).forEach(([k, v]) => {
      try { window.localStorage.setItem(`global_master_${k}`, JSON.stringify(v)); } catch {}
    });
  }
  const allSlugs = mode === "merge"
    ? [...new Set([...(JSON.parse(window.localStorage.getItem("cost_projectList") || "[]")), ...newProjectList])]
    : newProjectList;
  window.localStorage.setItem("cost_projectList", JSON.stringify(allSlugs));
  await setDoc(doc(db, "cost_system", "meta"), { projectList: allSlugs });
}
