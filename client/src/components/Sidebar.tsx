import { NavLink, useNavigate } from 'react-router-dom';
import { Package, ClipboardList, Settings, LogOut, Home, Radio } from 'lucide-react';
import { clearAdminSession, getAdminSession } from '@/lib/auth';
import { printerText } from '@/lib/desktop';
import { cn } from '@/lib/utils';

const navItems = [
    { icon: Settings, label: printerText.title, path: '/admin/printer' },
    { icon: Radio, label: 'ຄວບຄຸມ RFID', path: '/admin/rfid' },
    { icon: Package, label: 'ຈັດການສິນຄ້າ', path: '/admin/products' },
    { icon: ClipboardList, label: 'ສາງສິນຄ້າ', path: '/admin/inventory' },
];

export const Sidebar = () => {
    const navigate = useNavigate();
    const session = getAdminSession();

    const handleLogout = () => {
        clearAdminSession();
        navigate('/login', { replace: true });
    };

    return (
        <div className="flex flex-col h-screen w-72 bg-white border-r border-slate-200 p-5">
            <div className="flex items-center gap-2 px-2 py-4 mb-8">
                <img src="/logo.jpeg" alt="4B For Business" className="w-12 h-12 object-contain" />
                <div>
                    <h1 className="text-lg font-black tracking-tight text-slate-900">4B-easy-POS</h1>
                    <p className="text-xs text-slate-500">ລະບົບຈັດການ Admin</p>
                </div>
            </div>

            <nav className="flex-1 space-y-1">
                <NavLink
                    to="/"
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <Home className="h-5 w-5" />
                    <span className="font-bold">ໄປໜ້າ POS</span>
                </NavLink>
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            cn(
                                "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                                isActive
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )
                        }
                    >
                        <item.icon className="w-5 h-5" />
                        <span className="font-bold">{item.label}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="pt-4 border-t border-border mt-auto space-y-1">
                {session && (
                    <div className="px-3 py-2 text-xs text-slate-500">
                        <p className="font-bold text-slate-700">{session.admin.displayName}</p>
                        <p>@{session.admin.username}</p>
                    </div>
                )}
                <button className="flex items-center gap-3 px-3 py-2 w-full text-muted-foreground hover:bg-muted hover:text-foreground rounded-md transition-colors">
                    <Settings className="w-5 h-5" />
                    <span className="font-medium">ຕັ້ງຄ່າ</span>
                </button>
                <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 w-full text-destructive hover:bg-destructive/10 rounded-md transition-colors">
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">ອອກຈາກລະບົບ</span>
                </button>
            </div>
        </div>
    );
};
