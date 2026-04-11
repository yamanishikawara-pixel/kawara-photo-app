import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { Lock, Mail, HardHat } from 'lucide-react';

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
    } catch (err: any) {
      const code: string = err.code || '';
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
        // ログイン処理
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        // 新規登録処理
        await createUserWithEmailAndPassword(auth, email, password);
      }
      navigate('/'); // 成功したら現場一覧へGO！
   } catch (err: any) {
      console.error(err);
      const code: string = err.code || '';
      if (code === 'auth/invalid-email') setError('メールアドレスの形式が正しくありません。');
      else if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') setError('メールアドレスまたはパスワードが違います。');
      else if (code === 'auth/wrong-password') setError('パスワードが間違っています。');
      else if (code === 'auth/email-already-in-use') setError('このメールアドレスはすでに登録されています。');
      else if (code === 'auth/weak-password') setError('パスワードは6文字以上で設定してください。');
      else if (code === 'auth/too-many-requests') setError('ログイン試行が多すぎます。しばらく待ってから再試行してください。');
      else setError('ログインに失敗しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 shadow-inner">
            <HardHat className="w-8 h-8" />
          </div>
        </div>
        <h1 className="text-2xl font-black text-center text-gray-800 mb-8">
          {isLogin ? '現場システムにログイン' : '新規アカウント登録'}
        </h1>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-bold mb-6 text-center border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">メールアドレス</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                required
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                placeholder="oyakata@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">パスワード（6文字以上）</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="password"
                required
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-colors shadow-lg disabled:opacity-50 text-lg mt-2"
          >
            {loading ? '通信中...' : isLogin ? 'ログインする' : '登録して始める'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-100 text-center space-y-2">
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setEmail('');
              setPassword('');
            }}
            className="text-sm font-bold text-gray-500 hover:text-blue-600 transition-colors block w-full"
          >
            {isLogin ? '初めての方はこちら（新規登録）' : 'すでにアカウントをお持ちの方（ログイン）'}
          </button>
          {isLogin && (
            <button
              type="button"
              onClick={() => { setShowReset(true); setResetMsg(''); setResetEmail(''); }}
              className="text-sm text-gray-400 hover:text-blue-500 transition-colors"
            >
              パスワードをお忘れの方
            </button>
          )}
        </div>
      </div>

      {showReset && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-black text-gray-800 mb-4">パスワードリセット</h2>
            <p className="text-sm text-gray-500 mb-4">登録済みのメールアドレスを入力してください。リセット用のリンクをお送りします。</p>
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                  placeholder="oyakata@example.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
              </div>
              {resetMsg && (
                <p className={`text-sm font-bold text-center ${resetMsg.includes('送信しました') ? 'text-green-600' : 'text-red-500'}`}>
                  {resetMsg}
                </p>
              )}
              <button
                type="submit"
                disabled={resetLoading}
                className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {resetLoading ? '送信中...' : 'リセットメールを送信'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setShowReset(false)}
              className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}