import { TrendingUp, BrainCircuit, PieChart } from 'lucide-react';

interface Props {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: Props) {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full space-y-10">
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-black" />
            </div>
          </div>
          <h1 className="text-6xl font-black tracking-tighter uppercase italic">Investology</h1>
          <p className="text-gray-400 text-lg">Your personal portfolio, powered by AI.</p>
        </div>

        <button
          onClick={onLogin}
          className="w-full bg-white text-black py-4 rounded-2xl font-bold text-base hover:bg-gray-100 transition-all flex items-center justify-center gap-3"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>

        <div className="grid grid-cols-3 gap-4 pt-4 opacity-40">
          {[
            { icon: TrendingUp, label: 'Real-time' },
            { icon: BrainCircuit, label: 'AI Insights' },
            { icon: PieChart, label: 'Visuals' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="p-4 border border-white/20 rounded-2xl">
              <Icon className="w-6 h-6 mx-auto mb-2" />
              <div className="text-[10px] uppercase font-bold tracking-widest">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
