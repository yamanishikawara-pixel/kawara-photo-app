import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import type { FirebaseError } from 'firebase/app';
import { auth } from '../firebase';
import { Lock, Mail, HardHat, ArrowRight } from 'lucide-react';

// ==========================================
// カラーパレット（他ページと統一）
// ==========================================
const ACCENT = '#ff6b35';
const BG = '#0f0f1a';
const CARD = '#1c1c30';
const INPUT_BG = '#12122a';
const BORDER = '#2e2e50';
const TEXT = '#f0ede8';
const TEXT_MUTED = '#8b8ba8';
const TEXT_DIM = '#4b4b70';

export default function LoginPage() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMsg('');
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetMsg('リセットメールを送信しました。メールボックスをご確認ください。');
    } catch (err: unknown) {
      const code = (err as Partial<FirebaseError>).code || '';
      if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
        setResetMsg('入力されたメールアドレスは登録されていません。');
      } else {
        setResetMsg('送信に失敗しました。もう一度お試しください。');
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      navigate('/');
    } catch (err: unknown) {
      console.error(err);
      const code = (err as Partial<FirebaseError>).code || '';
      if (code === 'auth/invalid-email') setError('メールアドレスの形式が正しくありません。');
      else if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') setError('メールアドレスまたはパスワードが違います。');
      else if (code === 'auth/wrong-password') setError('パスワードが間違っています。');
      else if (code === 'auth/email-already-in-use') setError('このメールアドレスはすでに登録されています。');
      else if (code === 'auth/weak-password') setError('パスワードは6文字以上で設定してください。');
      else if (code === 'auth/too-many-requests') setError('ログイン試行が多すぎます。しばらく待ってから再試行してください。');
      else if (code === 'auth/network-request-failed') setError('ネットワーク接続を確認してください。');
      else setError('ログインに失敗しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 font-sans"
      style={{
        background: BG,
        color: TEXT,
        // さりげない背景グラデーション（夜の現場感）
        backgroundImage: `radial-gradient(circle at 20% 20%, rgba(255,107,53,0.08) 0%, transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,107,53,0.05) 0%, transparent 40%)`,
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-8"
        style={{ background: CARD, borderColor: BORDER, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
      >
        {/* ── ロゴアイコン ── */}
        <div className="flex justify-center mb-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: ACCENT, boxShadow: '0 0 24px rgba(255,107,53,0.35)' }}
          >
            <HardHat className="w-8 h-8 text-white" />
          </div>
        </div>

        {/* ── タイトル ── */}
        <h1 className="text-xl font-bold text-center mb-2 tracking-wide" style={{ color: TEXT }}>
          {isLogin ? 'ログイン' : 'アカウント作成'}
        </h1>
        <div className="mx-auto h-0.5 w-12 rounded-full mb-6" style={{ background: ACCENT }} />

        {/* ── エラー表示 ── */}
        {error && (
          <div
            className="text-sm font-bold mb-6 text-center p-3 rounded-xl border"
            style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}
          >
            {error}
          </div>
        )}

        {/* ── 入力フォーム ── */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* メール */}
          <div>
            <label className="block text-xs font-bold mb-2 tracking-wide" style={{ color: TEXT_MUTED }}>
              メールアドレス
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: TEXT_DIM }} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="oyakata@example.com"
                className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-medium transition-colors outline-none"
                style={{ background: INPUT_BG, border: `1.5px solid ${BORDER}`, color: TEXT }}
                onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
                onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
              />
            </div>
          </div>

          {/* パスワード */}
          <div>
            <label className="block text-xs font-bold mb-2 tracking-wide" style={{ color: TEXT_MUTED }}>
              パスワード（6文字以上）
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: TEXT_DIM }} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-medium transition-colors outline-none"
                style={{ background: INPUT_BG, border: `1.5px solid ${BORDER}`, color: TEXT }}
                onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
                onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
              />
            </div>
          </div>

          {/* 送信ボタン */}
          <button
            type="submit"
            disabled={loading}
            className="w-full font-bold py-4 rounded-xl transition-all disabled:opacity-50 text-base flex items-center justify-center gap-2 mt-2"
            style={{ background: ACCENT, color: '#fff', boxShadow: '0 0 16px rgba(255,107,53,0.35)' }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = '#e85d2a';
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = ACCENT)}
          >
            {loading ? (
              '通信中...'
            ) : (
              <>
                {isLogin ? 'ログインする' : '登録して始める'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* ── フッターリンク ── */}
        <div className="mt-6 pt-6 border-t text-center space-y-3" style={{ borderColor: BORDER }}>
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setEmail('');
              setPassword('');
            }}
            className="text-sm font-bold block w-full transition-colors"
            style={{ color: TEXT_MUTED }}
            onMouseEnter={(e) => (e.currentTarget.style.color = ACCENT)}
            onMouseLeave={(e) => (e.currentTarget.style.color = TEXT_MUTED)}
          >
            {isLogin ? '初めての方はこちら（新規登録）' : 'すでにアカウントをお持ちの方（ログイン）'}
          </button>
          {isLogin && (
            <button
              type="button"
              onClick={() => {
                setShowReset(true);
                setResetMsg('');
                setResetEmail('');
              }}
              className="text-xs transition-colors"
              style={{ color: TEXT_DIM }}
              onMouseEnter={(e) => (e.currentTarget.style.color = ACCENT)}
              onMouseLeave={(e) => (e.currentTarget.style.color = TEXT_DIM)}
            >
              パスワードをお忘れの方
            </button>
          )}
        </div>
      </div>

      {/* ── フッタークレジット ── */}
      <p className="text-xs mt-6 tracking-widest" style={{ color: TEXT_DIM }}>
        瓦工事写真台帳システム
      </p>

      {/* ── パスワードリセットモーダル ── */}
      {showReset && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div className="rounded-2xl border p-6 w-full max-w-sm" style={{ background: CARD, borderColor: BORDER }}>
            <h2 className="text-base font-bold mb-2" style={{ color: TEXT }}>
              パスワードリセット
            </h2>
            <p className="text-xs mb-4" style={{ color: TEXT_MUTED }}>
              登録済みのメールアドレスを入力してください。リセット用のリンクをお送りします。
            </p>
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: TEXT_DIM }} />
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="oyakata@example.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-medium transition-colors outline-none"
                  style={{ background: INPUT_BG, border: `1.5px solid ${BORDER}`, color: TEXT }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
                />
              </div>
              {resetMsg && (
                <p
                  className="text-sm font-bold text-center"
                  style={{ color: resetMsg.includes('送信しました') ? '#10b981' : '#f87171' }}
                >
                  {resetMsg}
                </p>
              )}
              <button
                type="submit"
                disabled={resetLoading}
                className="w-full font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
                style={{ background: ACCENT, color: '#fff' }}
                onMouseEnter={(e) => {
                  if (!resetLoading) e.currentTarget.style.background = '#e85d2a';
                }}
                onMouseLeave={(e) => (e.currentTarget.style.background = ACCENT)}
              >
                {resetLoading ? '送信中...' : 'リセットメールを送信'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setShowReset(false)}
              className="mt-4 w-full text-xs transition-colors"
              style={{ color: TEXT_DIM }}
              onMouseEnter={(e) => (e.currentTarget.style.color = TEXT_MUTED)}
              onMouseLeave={(e) => (e.currentTarget.style.color = TEXT_DIM)}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
