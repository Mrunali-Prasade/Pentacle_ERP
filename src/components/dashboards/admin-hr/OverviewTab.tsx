import { PunchClock } from '../../attendance/PunchClock';

interface OverviewTabProps {
  metrics: any;
  resignationsToProcess: any[];
  onUpdateEmployee: (employeeId: string, data: any) => Promise<void>;
  onShowLiveAttendance: () => void;
}

export default function OverviewTab({ metrics, resignationsToProcess, onUpdateEmployee, onShowLiveAttendance }: OverviewTabProps) {
  const overviewCards = [
    { title: 'Total Employees', icon: 'groups', value: metrics.totalEmployees },
    { title: 'Employees At Work', icon: 'work', value: metrics.employeesAtWork, onClick: onShowLiveAttendance },
    { title: 'On Leave', icon: 'event_busy', value: metrics.onLeaveToday },
    { title: 'Leaves Request', icon: 'event_upcoming', value: metrics.pendingLeaveRequests },
    { title: 'Attendance (Month)', icon: 'calendar_month', value: metrics.attendanceMonthStr },
    { title: 'Leaves', icon: 'free_cancellation', value: metrics.leavesStr },
    { title: 'Pending Request', icon: 'pending_actions', value: metrics.pendingRequests },
    { title: 'Resolved Request', icon: 'fact_check', value: metrics.resolvedRequests },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Alerts Section */}
      {resignationsToProcess.length > 0 && (
        <div className="flex flex-col gap-3 mb-6">
          {resignationsToProcess.map(emp => (
            <div key={emp.id} className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-red-500">warning</span>
                <div>
                  <p className="text-sm font-semibold text-red-900">Resignation Process Period Over for {emp.name}</p>
                  <p className="text-xs text-red-700">Exit Date: {new Date(emp.exit_date).toLocaleDateString()} has been reached.</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-red-800">Change status to resigned?</span>
                <button
                  onClick={async () => {
                    if (window.confirm(`Are you sure you want to change ${emp.name}'s status to Resigned? This will revoke their access.`)) {
                      await onUpdateEmployee(emp.id, { ...emp, status: 'resigned' });
                    }
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition-colors"
                >
                  Yes, Change Status
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {overviewCards.map((card, idx) => (
          <div
            key={idx}
            className={`bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group ${card.onClick ? 'cursor-pointer border-orange-200' : 'cursor-default'}`}
            onClick={card.onClick}
          >
            {/* Decorative Background */}
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
                {card.onClick && (
                  <span className="material-symbols-outlined text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300 -translate-x-2 group-hover:translate-x-0">arrow_forward</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-4">
          <PunchClock />
        </div>
      </div>
    </div>
  );
}
