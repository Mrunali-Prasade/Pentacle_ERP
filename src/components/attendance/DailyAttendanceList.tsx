import React, { useState, useEffect } from 'react';

interface EmployeeAttendance {
  id: string;
  employeeId: string;
  name: string;
  department: string;
  role: string;
  status: 'At Work' | 'Punched Out' | 'On Leave' | 'Absent';
  firstPunchTime: string | null;
  lastPunchTime: string | null;
  firstPunchLocation?: { lat: number, lng: number, address?: string | null } | null;
  lastPunchLocation?: { lat: number, lng: number, address?: string | null } | null;
}

export default function DailyAttendanceList({ onClose }: { onClose: () => void }) {
  const [employees, setEmployees] = useState<EmployeeAttendance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/hr/attendance/today')
      .then(res => res.json())
      .then(data => {
        setEmployees(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch attendance', err);
        setLoading(false);
      });
  }, []);

  const formatTime = (ts: string | null) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderTimeWithLocation = (ts: string | null, loc: {lat: number, lng: number, address?: string | null} | null | undefined) => {
    if (!ts) return '-';
    const timeStr = formatTime(ts);
    if (!loc) return timeStr;
    
    const mapUrl = loc.address 
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.address)}`
        : `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
        
    return (
      <div className="flex items-center gap-2">
        <span>{timeStr}</span>
        <a 
          href={mapUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          title={loc.address ? `Location: ${loc.address}` : "View Location on Map"}
          className="text-orange-500 hover:text-orange-600 flex items-center"
        >
          <span className="material-symbols-outlined text-[16px]">location_on</span>
        </a>
      </div>
    );
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'At Work': return 'text-green-600 bg-green-50 border-green-200';
      case 'Punched Out': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'On Leave': return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'Absent': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/95 flex flex-col items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-[#021934]">Daily Live Attendance</h2>
            <p className="text-sm text-slate-500">Real-time view of employee punch statuses for {new Date().toLocaleDateString()}</p>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <span className="material-symbols-outlined animate-spin text-4xl text-slate-300">sync</span>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-4 font-bold">Employee</th>
                    <th className="px-6 py-4 font-bold">Department</th>
                    <th className="px-6 py-4 font-bold">First IN</th>
                    <th className="px-6 py-4 font-bold">Latest OUT</th>
                    <th className="px-6 py-4 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.map(emp => (
                    <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-[#021934]">{emp.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{emp.employeeId}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{emp.department || 'N/A'}</td>
                      <td className="px-6 py-4 text-sm font-mono text-slate-600">{renderTimeWithLocation(emp.firstPunchTime, emp.firstPunchLocation)}</td>
                      <td className="px-6 py-4 text-sm font-mono text-slate-600">{renderTimeWithLocation(emp.lastPunchTime, emp.lastPunchLocation)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(emp.status)}`}>
                          {emp.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {employees.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                        No active employees found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
