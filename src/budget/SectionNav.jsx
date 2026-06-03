import { useState, useEffect } from 'react';

const SECTIONS = [
  { id: "section-info", label: "案件情報" },
  { id: "section-tile", label: "瓦" },
  { id: "section-material", label: "副資材" },
  { id: "section-expense", label: "経費" },
  { id: "section-profit", label: "粗利・見積" },
  { id: "section-biko", label: "備考" },
];

export function SectionNav() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const [hidden, setHidden] = useState(typeof window !== 'undefined' && window.innerWidth < 900);

  useEffect(() => {
    const onResize = () => setHidden(window.innerWidth < 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const positions = SECTIONS.map(s => {
        const el = document.getElementById(s.id);
        if (!el) return { id: s.id, top: Infinity };
        return { id: s.id, top: el.getBoundingClientRect().top };
      });
      const above = positions.filter(p => p.top <= 200);
      const current = above.length > 0 ? above[above.length - 1] : positions[0];
      setActiveId(current.id);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (hidden) return null;

  const onJump = (id) => (e) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav style={{
      position: 'fixed',
      right: 16,
      top: 100,
      zIndex: 50,
      background: 'rgba(13, 25, 40, 0.95)',
      border: '1px solid #1e3a5f',
      borderRadius: 8,
      padding: 8,
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      minWidth: 110,
    }}>
      <div style={{ fontSize: 10, color: '#64748b', padding: '4px 8px', fontWeight: 700 }}>セクション</div>
      {SECTIONS.map(s => (
        <a
          key={s.id}
          href={`#${s.id}`}
          onClick={onJump(s.id)}
          style={{
            display: 'block',
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 4,
            textDecoration: 'none',
            color: activeId === s.id ? '#bae6fd' : '#94a3b8',
            background: activeId === s.id ? '#0c4a6e' : 'transparent',
            cursor: 'pointer',
          }}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
