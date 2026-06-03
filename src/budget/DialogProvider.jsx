import { useCallback, useEffect, useState } from 'react';
import { DialogContext } from './appDialogContext';
import { I } from './utils';

function DialogModal({ state, onClose }) {
  const [inputValue, setInputValue] = useState(state.defaultValue || '');

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose(state.type === 'confirm' ? false : null);
      if (e.key === 'Enter' && state.type === 'prompt') onClose(inputValue.trim() || null);
      if (e.key === 'Enter' && state.type === 'confirm') onClose(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [inputValue, state.type, onClose]);

  const okBtnStyle = { flex:1, background:"#0ea5e9", border:"none", color:"#fff", padding:"10px", borderRadius:6, cursor:"pointer", fontWeight:700, fontSize:14 };
  const cancelBtnStyle = { flex:1, background:"transparent", border:"1px solid #334155", color:"#94a3b8", padding:"10px", borderRadius:6, cursor:"pointer", fontWeight:700 };

  return (
    <div className="modal-overlay" onClick={() => onClose(state.type === 'confirm' ? false : null)}>
      <div className="modal-content" style={{maxWidth:400}} onClick={e => e.stopPropagation()}>
        <p style={{color:'#dde8f2', marginTop:0, lineHeight:1.6}}>{state.message}</p>
        {state.type === 'prompt' && (
          <input
            autoFocus
            style={I}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
          />
        )}
        <div style={{display:'flex', gap:8, marginTop:16}}>
          <button onClick={() => onClose(state.type === 'confirm' ? false : null)} style={cancelBtnStyle}>キャンセル</button>
          <button
            onClick={() => onClose(state.type === 'confirm' ? true : (inputValue.trim() || null))}
            style={okBtnStyle}
          >OK</button>
        </div>
      </div>
    </div>
  );
}

export function DialogProvider({ children }) {
  const [state, setState] = useState(null);

  const showConfirm = useCallback((message) => new Promise(resolve => {
    setState({ type: 'confirm', message, resolve });
  }), []);

  const showPrompt = useCallback((message, defaultValue = '') => new Promise(resolve => {
    setState({ type: 'prompt', message, defaultValue, resolve });
  }), []);

  const handleClose = useCallback((value) => {
    setState(prev => { prev?.resolve(value); return null; });
  }, []);

  return (
    <DialogContext.Provider value={{ showConfirm, showPrompt }}>
      {children}
      {state && <DialogModal state={state} onClose={handleClose} />}
    </DialogContext.Provider>
  );
}
