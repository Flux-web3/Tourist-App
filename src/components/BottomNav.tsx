import { useApp } from '@/context/AppContext';
import { Compass, CalendarDays, Search, Receipt } from 'lucide-react';

export function BottomNav() {
  const { navigate, screen } = useApp();
  const items = [
    { label: 'Overview', icon: Compass, screen: 'overview' as const },
    { label: 'Itinerary', icon: CalendarDays, screen: 'itinerary' as const },
    { label: 'Explore', icon: Search, screen: 'explore' as const },
    { label: 'Budget', icon: Receipt, screen: 'budget' as const },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 bg-surface/90 backdrop-blur-md border-t border-app px-2 py-1.5">
      <div className="max-w-3xl mx-auto flex items-center justify-around">
        {items.map(item => {
          const active = screen === item.screen;
          return (
            <button key={item.label} onClick={() => navigate(item.screen)}
              className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-colors min-w-[64px] ${active ? 'text-primary-action' : 'text-muted-c'}`}
              style={{ color: active ? 'var(--primary)' : 'var(--text-muted)' }}
              aria-current={active ? 'page' : undefined}>
              <item.icon size={20} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
