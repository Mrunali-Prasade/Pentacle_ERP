import { useEffect, useState } from 'react';

export default function OverviewTab() {
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    fetch('/api/hr/dashboard/metrics')
      .then(res => res.json())
      .then(data => setMetrics(data))
      .catch(err => console.error("Failed to fetch metrics", err));
  }, []);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* HR Metrics Summary Cards */}
      {metrics && (() => {
        const overviewCards = [
          { title: 'Total Employees', icon: 'groups', value: metrics.totalEmployees },
          { title: 'Employees At Work', icon: 'work', value: metrics.employeesAtWork },
          { title: 'On Leave', icon: 'event_busy', value: metrics.onLeaveToday },
          { title: 'Leaves Request', icon: 'event_upcoming', value: metrics.pendingLeaveRequests },
          { title: 'Attendance (Month)', icon: 'calendar_month', value: metrics.attendanceMonthStr },
          { title: 'Leaves', icon: 'free_cancellation', value: metrics.leavesStr },
          { title: 'Pending Request', icon: 'pending_actions', value: metrics.pendingRequests },
          { title: 'Resolved Request', icon: 'fact_check', value: metrics.resolvedRequests },
        ];

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-fade-in">
            {overviewCards.map((card, idx) => (
              <div
                key={idx}
                className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group cursor-default"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-orange-50 to-transparent rounded-bl-full -mr-8 -mt-8 transition-transform duration-500 group-hover:scale-125 opacity-70"></div>
                <div className="relative z-10 flex flex-col h-full justify-between">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-white text-orange-600 rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm group-hover:bg-orange-600 group-hover:text-white transition-colors duration-300">
                      <span className="material-symbols-outlined text-2xl">{card.icon}</span>
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{card.title}</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 tracking-wider">As of today</p>
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="text-4xl font-black text-[#021934] group-hover:text-orange-600 transition-colors duration-300">
                      {card.value}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
