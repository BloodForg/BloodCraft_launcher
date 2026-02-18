import type { ServerStatus } from '../types';

const map: Record<ServerStatus, { bg: string; text: string }> = {
  Online: { bg: '#1B3523', text: '#6DE39A' },
  Offline: { bg: '#3A1A1D', text: '#FF7B87' },
  Maintenance: { bg: '#3C3218', text: '#FFD166' }
};

export const StatusBadge = ({ status }: { status: ServerStatus }) => {
  return (
    <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: map[status].bg, color: map[status].text }}>
      {status}
    </span>
  );
};
