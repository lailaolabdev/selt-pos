import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, LockKeyhole, LogIn } from 'lucide-react';
import { api } from '@/lib/api';
import { saveAdminSession } from '@/lib/auth';

interface AdminLoginResponse {
  accessToken: string;
  expiresIn: number;
  admin: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  };
}

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await api.post<AdminLoginResponse>('/auth/admin/login', {
        username: username.trim(),
        password,
      });

      saveAdminSession({
        accessToken: response.data.accessToken,
        expiresAt: Date.now() + response.data.expiresIn * 1000,
        admin: response.data.admin,
      });

      const destination = (location.state as { from?: string } | null)?.from || '/admin/products';
      navigate(destination, { replace: true });
      return;
    } catch {
      setError('ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-10">
          <div className="flex justify-center mb-8">
            <img src="/logo.jpeg" alt="4B For Business" className="w-32 h-32 object-contain" />
          </div>
          <div className="text-center mb-8">
            <p className="text-sm font-semibold text-indigo-600 tracking-[0.2em] uppercase">4B-easy-POS</p>
            <h1 className="text-3xl font-black text-slate-900 mt-2">ເຂົ້າສູ່ລະບົບ Admin</h1>
        
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block space-y-2">
              <span className="text-sm font-bold text-slate-700">ຊື່ຜູ້ໃຊ້</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500" placeholder="admin" autoComplete="username" disabled={isSubmitting} />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-bold text-slate-700">ລະຫັດຜ່ານ</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500" placeholder="••••••••" autoComplete="current-password" disabled={isSubmitting} />
            </label>
            {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}
            <button type="submit" disabled={isSubmitting} className="w-full rounded-xl bg-indigo-600 py-3.5 text-white font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors disabled:cursor-not-allowed disabled:bg-indigo-300">
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              {isSubmitting ? 'ກຳລັງເຂົ້າລະບົບ...' : 'ເຂົ້າສູ່ Admin'}
            </button>
          </form>

          <div className="mt-8 flex items-center justify-between text-sm">
            <Link to="/" className="text-slate-500 hover:text-indigo-600 flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> ກັບໄປໜ້າ POS</Link>
            <span className="text-slate-400 flex items-center gap-1"><LockKeyhole className="w-4 h-4" /> ສຳລັບພະນັກງານ</span>
          </div>
      
        </div>
      </div>
    </main>
  );
};
