// src/ProjectsScreen.jsx
import { useState, useMemo } from 'react';
import logoImg from './logo-clear.png';
import { db } from './firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAppDialog } from './appDialogContext';
import { getProjectStorageKeys, hasProjectNameConflict, projectStorageKey, validateProjectSlug } from './projectStorage';
import { I, useLocalStorage } from './utils';

const STATUS_LABELS = { draft: "📝 見積中", in_progress: "🔨 施工中", completed: "✅ 完了" };
const STATUS_COLORS = {
  draft:       { bg: "#1e3a5f", fg: "#bae6fd" },
  in_progress: { bg: "#5c3a0e", fg: "#fcd34d" },
  completed:   { bg: "#0f3a1e", fg: "#86efac" },
};

export function ProjectsScreen({ projectList, setProjectList, activeProject, setActiveProject, setMode, showToast, onNavigateToPhoto }) {
  const { showConfirm, showPrompt } = useAppDialog();
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sortMode, setSortMode] = useLocalStorage("global_project_sort_mode", "date_desc");
  const [statusFilter, setStatusFilter] = useLocalStorage("global_project_status_filter", "all");

  function readField(slug, field) {
    try {
      const raw = window.localStorage.getItem(projectStorageKey(slug, field));
      return raw ? JSON.parse(raw) : "";
    } catch { return ""; }
  }

  const projectsWithMeta = useMemo(() => projectList.map(slug => ({
    slug,
    koujiName: readField(slug, "koujiName") || slug,
    koujiAddress: readField(slug, "koujiAddress") || "",
    date: readField(slug, "date") || "",
    status: readField(slug, "status") || "draft",
    archived: readField(slug, "archived") || false,
  })), [projectList, refreshKey]);

  const sortedProjects = useMemo(() => {
    const list = [...projectsWithMeta];
    switch (sortMode) {
      case "name":
        list.sort((a, b) => a.koujiName.localeCompare(b.koujiName, "ja"));
        break;
      case "date_desc":
        list.sort((a, b) => (b.date || "0000-00-00").localeCompare(a.date || "0000-00-00"));
        break;
      case "date_asc":
        list.sort((a, b) => (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99"));
        break;
      default:
        break;
    }
    return list;
  }, [projectsWithMeta, sortMode]);

  const filteredProjects = useMemo(() => {
    const statusFiltered = sortedProjects.filter(({ status, archived }) => {
      if (!showArchived && archived) return false;
      if (statusFilter === "all") return true;
      if (statusFilter === "active") return status !== "completed";
      return status === statusFilter;
    });
    if (!searchQuery.trim()) return statusFiltered;
    const q = searchQuery.toLowerCase();
    return statusFiltered.filter(({ slug, koujiName, koujiAddress }) => {
      const name = (koujiName || slug).toLowerCase();
      const addr = (koujiAddress || "").toLowerCase();
      return name.includes(q) || addr.includes(q) || slug.toLowerCase().includes(q);
    });
  }, [searchQuery, showArchived, sortedProjects, statusFilter]);

  const openProject = (slug) => {
    setActiveProject(slug);
    setMode("input");
  };

  const addProject = async () => {
    const name = await showPrompt("工事名を入力してください");
    if (!name || !name.trim()) return;
    const slug = name.trim();
    const err = validateProjectSlug(slug);
    if (err) { showToast(err); return; }
    if (hasProjectNameConflict(projectList, slug)) {
      showToast("同じ名前の現場が既にあります");
      return;
    }
    // 工事名をlocalStorageに事前セット
    window.localStorage.setItem(projectStorageKey(slug, "koujiName"), JSON.stringify(slug));
    setProjectList([...projectList, slug]);
    setActiveProject(slug);
    setMode("input");
    showToast(`現場「${slug}」を作成しました`);
  };

  const deleteProject = async (slug) => {
    const ok = await showConfirm(`「${slug}」を削除しますか？\nこの操作は取り消せません。`);
    if (!ok) return;
    // localStorage から削除
    const keys = getProjectStorageKeys(window.localStorage, slug);
    keys.forEach(k => window.localStorage.removeItem(k));
    window.localStorage.removeItem(`cost_${slug}_localUpdatedAt`);
    const newList = projectList.filter(p => p !== slug);
    setProjectList(newList.length > 0 ? newList : []);
    // Firestore からも削除（復活防止）
    try {
      await deleteDoc(doc(db, "cost_projects", slug));
      if (newList.length > 0) {
        await setDoc(doc(db, "cost_system", "meta"), { projectList: newList });
      }
    } catch (e) {
      console.warn("クラウドの削除に失敗:", e.message);
    }
    if (activeProject === slug) {
      if (newList.length > 0) {
        setActiveProject(newList[0]);
      } else {
        setActiveProject("default");
        setMode("projects");
      }
    }
    showToast("削除しました");
  };

  const duplicateProject = async (slug) => {
    const newName = await showPrompt("複製先の工事名を入力してください", slug + "（コピー）");
    if (!newName || !newName.trim()) return;
    const newSlug = newName.trim();
    const err = validateProjectSlug(newSlug);
    if (err) { showToast(err); return; }
    if (hasProjectNameConflict(projectList, newSlug)) {
      showToast("同じ名前の現場が既にあります");
      return;
    }
    // すべてのフィールドをコピー
    const keys = getProjectStorageKeys(window.localStorage, slug);
    keys.forEach(k => {
      const field = k.slice(projectStorageKey(slug, "").length);
      const val = window.localStorage.getItem(k);
      if (val !== null) window.localStorage.setItem(projectStorageKey(newSlug, field), val);
    });
    // 工事名を新しい名前で上書き
    window.localStorage.setItem(projectStorageKey(newSlug, "koujiName"), JSON.stringify(newSlug));
    setProjectList([...projectList, newSlug]);
    setActiveProject(newSlug);
    setMode("input");
    showToast(`「${slug}」を複製しました`);
  };

  const renameProject = async (slug) => {
    const newName = await showPrompt("新しい工事名を入力してください", slug);
    if (!newName || !newName.trim() || newName.trim() === slug) return;
    const newSlug = newName.trim();
    const err = validateProjectSlug(newSlug);
    if (err) { showToast(err); return; }
    if (hasProjectNameConflict(projectList, newSlug, slug)) {
      showToast("同じ名前の現場が既にあります");
      return;
    }
    // localStorage のキーを一括移行
    const keys = getProjectStorageKeys(window.localStorage, slug);
    keys.forEach(k => {
      const field = k.slice(projectStorageKey(slug, "").length);
      const newKey = projectStorageKey(newSlug, field);
      const val = window.localStorage.getItem(k);
      if (val !== null) window.localStorage.setItem(newKey, val);
      window.localStorage.removeItem(k);
    });
    setProjectList(projectList.map(p => p === slug ? newSlug : p));
    if (activeProject === slug) setActiveProject(newSlug);
    showToast("工事名を変更しました");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#05111f", fontFamily: "'Noto Sans JP', sans-serif", color: "#dde8f2" }}>

      {/* ヘッダー */}
      <div style={{
        background: "linear-gradient(90deg,#064e3b,#022c22)",
        borderBottom: "1px solid #065f46",
        padding: "14px 24px",
        display: "flex", alignItems: "center", gap: 14,
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <button onClick={() => onNavigateToPhoto ? onNavigateToPhoto() : window.history.back()}
          style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,
                  color:"#ecfdf5",fontSize:12,fontWeight:700,padding:"5px 10px",cursor:"pointer"}}>
          ← 写真台帳
        </button>
        <img src={logoImg} alt="logo" style={{ width: 38, height: 38, objectFit: "contain" }} />
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 3, color: "#ecfdf5" }}>実行予算</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <select
            value={sortMode}
            onChange={e => setSortMode(e.target.value)}
            style={{
              background: "#0b1e30", border: "1px solid #1d3d5c", borderRadius: 6,
              color: "#dde8f2", fontSize: 12, padding: "6px 10px", cursor: "pointer",
            }}
          >
            <option value="date_desc">契約日（新しい順）</option>
            <option value="date_asc">契約日（古い順）</option>
            <option value="name">名前順</option>
            <option value="added">追加順</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{background:"#0b1e30",border:"1px solid #1d3d5c",borderRadius:6,color:"#dde8f2",fontSize:12,padding:"6px 10px",cursor:"pointer"}}>
            <option value="all">すべてのステータス</option>
            <option value="draft">📝 見積中のみ</option>
            <option value="in_progress">🔨 施工中のみ</option>
            <option value="completed">✅ 完了のみ</option>
            <option value="active">📝🔨 未完了のみ</option>
          </select>
          <button
            onClick={() => setMode("dashboard")}
            style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)", border: "none", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}
            title="全案件の原価率・粗利を一覧表示"
          >📊 ダッシュボード</button>
          <button
            onClick={() => onNavigateToPhoto ? onNavigateToPhoto() : window.history.back()}
            style={{ background: "linear-gradient(135deg,#ff6b35,#e85d2a)", border: "none", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}
            title="工事写真台帳を開く"
          >📷 写真帳</button>
          <button
            onClick={addProject}
            style={{ background: "#10b981", border: "none", color: "#fff", padding: "8px 18px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 700 }}
          >＋ 新規現場</button>
        </div>
      </div>

      {/* コンテンツ */}
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 16px" }}>

        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20, flexWrap:"wrap" }}>
          <div style={{ fontSize: 13, color: "#6ee7b7", fontWeight: 700, letterSpacing: 2 }}>
            現場一覧 — {filteredProjects.length}{searchQuery ? <span style={{color:"#64748b"}}>/{projectList.length}</span> : ""}件
          </div>
          <div style={{flex:1, minWidth:200, maxWidth:400, position:"relative"}}>
            <input type="search" placeholder="🔍 工事名・住所で検索..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} style={{...I, paddingRight: searchQuery ? 30 : 10}} />
            {searchQuery && <button onClick={()=>setSearchQuery("")} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:16,padding:"2px 6px"}}>×</button>}
          </div>
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#94a3b8",cursor:"pointer"}}>
            <input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)} />
            アーカイブを表示
          </label>
        </div>

        {filteredProjects.length === 0 ? (
          <div style={{ textAlign: "center", color: "#4a6a8a", padding: "80px 0", fontSize: 14 }}>
            {searchQuery ? `「${searchQuery}」に一致する現場はありません` : "現場がありません。「＋ 新規現場」から追加してください。"}
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}>
            {filteredProjects.map(({ slug, koujiName, koujiAddress, date, status, archived: isArchived }) => {
              const name = koujiName || (slug === "default" ? "デフォルト" : slug);
              const addr = koujiAddress || "工事場所 未入力";
              const isCurrent = slug === activeProject;

              return (
                <div
                  key={slug}
                  onClick={() => openProject(slug)}
                  style={{
                    background: isCurrent ? "#0a2a1e" : "#0b1e30",
                    border: `1px solid ${isCurrent ? "#10b981" : "#1d3d5c"}`,
                    borderRadius: 12,
                    padding: "18px 20px",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    position: "relative",
                    boxShadow: isCurrent ? "0 0 0 2px #10b98140" : "none",
                    opacity: isArchived ? 0.5 : 1,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#10b981"; e.currentTarget.style.background = "#0a2a1e"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = isCurrent ? "#10b981" : "#1d3d5c"; e.currentTarget.style.background = isCurrent ? "#0a2a1e" : "#0b1e30"; }}
                >
                  {/* 編集中バッジ */}
                  {isCurrent && (
                    <div style={{
                      position: "absolute", top: 12, right: 12,
                      background: "#10b981", color: "#fff",
                      fontSize: 9, fontWeight: 900, padding: "2px 7px", borderRadius: 4, letterSpacing: 1,
                    }}>編集中</div>
                  )}

                  {/* 工事名 */}
                  <div style={{ fontSize: 15, fontWeight: 900, color: "#ecfdf5", marginBottom: 6, paddingRight: isCurrent ? 48 : 0, lineHeight: 1.4 }}>
                    {name}
                  </div>
                  <span style={{
                    display: "inline-block",
                    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                    background: STATUS_COLORS[status]?.bg || STATUS_COLORS.draft.bg,
                    color: STATUS_COLORS[status]?.fg || STATUS_COLORS.draft.fg,
                    marginBottom: 8,
                  }}>
                    {STATUS_LABELS[status] || STATUS_LABELS.draft}
                  </span>

                  {/* 工事場所 */}
                  <div style={{ fontSize: 11, color: "#7aadcf", marginBottom: 16, lineHeight: 1.4 }}>
                    {addr}
                  </div>
                  {date && (
                    <div style={{ fontSize: 10, color: "#64748b", marginTop: 4, marginBottom: 12 }}>
                      📅 {date}
                    </div>
                  )}
                  {isArchived && (
                    <div style={{ fontSize: 10, color: "#cbd5e1", marginBottom: 12, fontWeight: 700 }}>
                      アーカイブ済み
                    </div>
                  )}

                  {/* アクションボタン */}
                  <div
                    style={{ display: "flex", gap: 6 }}
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={() => openProject(slug)}
                      style={{ flex: 1, background: "#064e3b", border: "1px solid #10b981", color: "#a7f3d0", padding: "6px 0", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                    >開く</button>
                    <button
                      onClick={() => onNavigateToPhoto ? onNavigateToPhoto(koujiName || slug) : window.history.back()}
                      style={{ background: "transparent", border: "1px solid #ff6b35", color: "#ff6b35", padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                      title="この現場の写真帳を開く"
                    >📷</button>
                    <button
                      onClick={() => duplicateProject(slug)}
                      style={{ background: "transparent", border: "1px solid #334155", color: "#94a3b8", padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                      title="複製"
                    >📋</button>
                    <button
                      onClick={() => renameProject(slug)}
                      style={{ background: "transparent", border: "1px solid #334155", color: "#94a3b8", padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                      title="工事名を変更"
                    >✏️</button>
                    {!isArchived && (
                      <button
                        onClick={async () => {
                          const ok = await showConfirm(`「${koujiName || slug}」をアーカイブしますか？\n後から復元できます。`);
                          if (!ok) return;
                          window.localStorage.setItem(projectStorageKey(slug, "archived"), JSON.stringify(true));
                          try { await setDoc(doc(db, "cost_projects", slug), { archived: true }, { merge: true }); } catch {}
                          setRefreshKey(k => k + 1);
                          showToast(`「${slug}」をアーカイブしました`);
                        }}
                        style={{ background: "transparent", border: "1px solid #92400e", color: "#fbbf24", padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                        title="アーカイブ"
                      >📦</button>
                    )}
                    {isArchived && (
                      <>
                        <button
                          onClick={async () => {
                            window.localStorage.setItem(projectStorageKey(slug, "archived"), JSON.stringify(false));
                            try { await setDoc(doc(db, "cost_projects", slug), { archived: false }, { merge: true }); } catch {}
                            setRefreshKey(k => k + 1);
                            showToast(`「${slug}」を復元しました`);
                          }}
                          style={{ background: "transparent", border: "1px solid #1d4ed8", color: "#93c5fd", padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                          title="復元"
                        >📂</button>
                        {projectList.length > 1 && (
                          <button
                            onClick={async () => {
                              const ok1 = await showConfirm(`「${slug}」を完全削除しますか？`);
                              if (!ok1) return;
                              const ok2 = await showConfirm("この操作は取り消せません。本当に削除しますか？");
                              if (!ok2) return;
                              await deleteProject(slug);
                            }}
                            style={{ background: "transparent", border: "1px solid #7f1d1d", color: "#f87171", padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                            title="完全削除"
                          >🗑</button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
