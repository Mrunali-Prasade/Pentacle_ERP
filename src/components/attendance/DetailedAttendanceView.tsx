import React, { useState, useEffect, useMemo } from 'react';

interface TimelineEvent {
  time: string;
  action: string;
  source: string;
  location: string;
  mode: string;
}

interface DetailedAttendance {
  userId: string;
  name: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  checkInLocation: string;
  checkOutLocation: string;
  checkInMode: string;
  checkOutMode: string;
  hours: string;
  date: string;
  status: string;
  timeline?: TimelineEvent[];
}

interface DetailedAttendanceViewProps {

  penaltiesPanel?: React.ReactNode;
  penaltiesCount?: number;
}

export function DetailedAttendanceView({ penaltiesPanel, penaltiesCount }: DetailedAttendanceViewProps) {
  const [data, setData] = useState<DetailedAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [activeTab, setActiveTab] = useState<'All' | 'Pending' | 'Penalties'>('All');
  const [search, setSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showNotCheckedIn, setShowNotCheckedIn] = useState(true);

  // Modal State
  const [viewingEmployee, setViewingEmployee] = useState<{ id: string, name: string } | null>(null);
  const [viewingTimeline, setViewingTimeline] = useState<DetailedAttendance | null>(null);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  
  // Editing State
  const [editingTiming, setEditingTiming] = useState<{
    userId: string,
    date: string,
    inTime: string,
    outTime: string,
    name: string
  } | null>(null);

  // Date controls
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState(now.getDate());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const fetchMonthlyData = () => {
    if (viewingEmployee) {
      setLoadingMonthly(true);
      fetch(`/api/hr/attendance/employee/${viewingEmployee.id}/monthly?month=${selectedYear}-${String(selectedMonth).padStart(2, '0')}`)
        .then(res => res.json())
        .then(data => {
          setMonthlyData(data);
          setLoadingMonthly(false);
        });
    }
  };

  useEffect(() => {
    fetchMonthlyData();
  }, [viewingEmployee, selectedMonth, selectedYear]);

  const handleSaveTiming = async () => {
    if (!editingTiming) return;
    try {
      const res = await fetch(`/api/hr/attendance/employee/${editingTiming.userId}/timing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editingTiming.date,
          inTime: editingTiming.inTime,
          outTime: editingTiming.outTime
        })
      });
      if (res.ok) {
        setEditingTiming(null);
        fetchAttendance();
        if (viewingEmployee) {
          fetchMonthlyData();
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
      const res = await fetch(`/api/hr/attendance/detailed?date=${dateStr}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error('Failed to fetch detailed attendance', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [selectedMonth, selectedDay, selectedYear]);

  // Unique employees for dropdown
  const uniqueEmployees = useMemo(() => {
    const map = new Map<string, string>();
    data.forEach(d => map.set(d.userId, d.name));
    return Array.from(map.entries());
    }, [data]);

  const handleDownloadHistory = () => {
    if (selectedDay === 0) {
      // No specific day selected, download the whole month in the matrix format
      window.location.href = `/api/attendance/punches/export?month=${selectedYear}-${String(selectedMonth).padStart(2, '0')}&employee=${encodeURIComponent(employeeFilter)}&search=${encodeURIComponent(search)}`;
      return;
    }

    let csv = 'Name,Check In,Check Out,Check In Location,Check Out Location,Check In Mode,Check Out Mode,Hours,Date,Status,Check In Selfie,Check Out Selfie\n';
    
    filteredData.forEach(row => {
      // Quote for CSV structure AND defuse spreadsheet formula injection: a location/name a
      // user controls that starts with = + - @ is executed by Excel/Sheets unless forced to text.
      const escape = (str: string | null) => {
        if (str === null || str === undefined || str === '') return '-';
        let s = String(str);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return `"${s.replace(/"/g, '""')}"`;
      };

      csv += `${escape(row.name)},${escape(row.checkInTime)},${escape(row.checkOutTime)},${escape(row.checkInLocation)},${escape(row.checkOutLocation)},${escape(row.checkInMode)},${escape(row.checkOutMode)},${escape(row.hours)},${escape(row.date)},${escape(row.status)},${escape((row as any).checkInSelfie)},${escape((row as any).checkOutSelfie)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Attendance_History_${selectedYear}_${selectedMonth}_${selectedDay}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const filteredData = useMemo(() => {
    return data.filter(item => {
      if (activeTab === 'Pending' && item.status !== 'Incomplete') return false;
      if (!showNotCheckedIn && item.status === 'Absent') return false;
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (employeeFilter && item.userId !== employeeFilter) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      return true;
    });
  }, [data, activeTab, search, employeeFilter, statusFilter, showNotCheckedIn]);

  const formatTime = (ts: string | null) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const formatDateLabel = (ts: string | null) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const displayDate = `${selectedDay}-${new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'short' })}-${selectedYear}`;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full min-h-[700px]">
      
      {/* Header Tabs */}
      <div className="px-8 pt-6 border-b border-slate-200 bg-white">
        <h2 className="text-2xl font-bold text-[#021934] mb-6 tracking-tight">Attendance</h2>
        <div className="flex gap-6">
          <button
            className={`pb-4 text-sm font-bold transition-colors relative ${activeTab === 'All' ? 'text-orange-500' : 'text-slate-500 hover:text-slate-800'}`}
            onClick={() => setActiveTab('All')}
          >
            All Attendance
            {activeTab === 'All' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-orange-500 rounded-t-full"></div>}
          </button>
          <button 
            className={`pb-4 text-sm font-bold transition-colors relative ${activeTab === 'Pending' ? 'text-orange-500' : 'text-slate-500 hover:text-slate-800'}`}
            onClick={() => setActiveTab('Pending')}
          >
            Pending Checkout
            {activeTab === 'Pending' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-orange-500 rounded-t-full"></div>}
          </button>


          {penaltiesPanel && (
            <button 
              className={`pb-4 text-sm font-bold transition-colors relative flex items-center ${activeTab === 'Penalties' ? 'text-orange-500' : 'text-slate-500 hover:text-slate-800'}`}
              onClick={() => setActiveTab('Penalties')}
            >
              Penalty Approvals
              {penaltiesCount && penaltiesCount > 0 ? (
                <span className="ml-1.5 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {penaltiesCount}
                </span>
              ) : null}
              {activeTab === 'Penalties' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-orange-500 rounded-t-full"></div>}
            </button>
          )}
        </div>
      </div>

      {activeTab === 'Penalties' && penaltiesPanel ? (
        <div className="flex-1 overflow-auto bg-slate-50/30 p-6">
          {penaltiesPanel}
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="p-4 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center flex-wrap gap-3">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
            <input 
              type="text" 
              placeholder="Search" 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 w-48 shadow-sm"
            />
          </div>
          <select 
            value={employeeFilter} 
            onChange={e => setEmployeeFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"
          >
            <option value="">Employee</option>
            {uniqueEmployees.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <select 
            value={statusFilter} 
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"
          >
            <option value="">Status</option>
            <option value="Complete">Complete</option>
            <option value="Incomplete">Incomplete</option>
            <option value="Absent">Absent</option>
          </select>
          <select 
            value={selectedMonth} 
            onChange={e => setSelectedMonth(Number(e.target.value))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"
          >
            {Array.from({length: 12}, (_, i) => (
              <option key={i+1} value={i+1}>{new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}</option>
            ))}
          </select>
          <select 
            value={selectedDay} 
            onChange={e => setSelectedDay(Number(e.target.value))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"
          >
            <option value="">Day</option>
            {Array.from({length: 31}, (_, i) => (
              <option key={i+1} value={i+1}>{i+1}</option>
            ))}
          </select>
          <select 
            value={selectedYear} 
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <button 
              onClick={handleDownloadHistory}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors"
            >
              Download History <span className="material-symbols-outlined text-[16px]">download</span>
            </button>
            <button 
              onClick={fetchAttendance}
              className="p-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              title="Refresh Data"
            >
              <span className="material-symbols-outlined text-[20px]">sync</span>
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 border-b border-slate-100 bg-white flex items-center gap-3">
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" className="sr-only peer" checked={showNotCheckedIn} onChange={e => setShowNotCheckedIn(e.target.checked)} />
          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-slate-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
          <span className="ml-3 text-sm font-medium text-slate-600">Show employees not checked in (selected day)</span>
        </label>
      </div>

      {/* Data Grid */}
      <div className="flex-1 overflow-auto bg-white">
        <div className="overflow-x-auto"><table className="w-full text-left whitespace-nowrap min-w-max">
          <thead className="sticky top-0 bg-slate-50/80 backdrop-blur-sm z-10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <tr className="text-[10px] text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
              <th className="px-6 py-4">NAME</th>
              <th className="px-4 py-4">CHECK IN <span className="material-symbols-outlined text-[14px] align-middle ml-1">expand_more</span></th>
              <th className="px-4 py-4">CHECK OUT</th>
              <th className="px-4 py-4">CHECK IN LOCATION</th>
              <th className="px-4 py-4">CHECK OUT LOCATION</th>
              <th className="px-4 py-4 leading-tight">CHECK IN<br/>OFFICE TYPE <span className="material-symbols-outlined text-[14px] align-middle ml-1">expand_more</span></th>
              <th className="px-4 py-4 leading-tight">CHECK OUT<br/>OFFICE TYPE</th>
              <th className="px-4 py-4">OFFICE VISIT</th>
              <th className="px-4 py-4">HOURS</th>
              <th className="px-4 py-4">DATE</th>
              <th className="px-6 py-4">STATUS</th>
              <th className="px-4 py-4 text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {loading ? (
              <tr>
                <td colSpan={12} className="px-6 py-12 text-center text-slate-500">
                  <div className="flex justify-center mb-2">
                    <span className="material-symbols-outlined animate-spin text-[32px] text-orange-500">sync</span>
                  </div>
                  Loading attendance records...
                </td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-6 py-12 text-center text-slate-500">
                  No attendance records found.
                </td>
              </tr>
            ) : (
              filteredData.map((row, idx) => (
                <tr key={`${row.userId}-${idx}`} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div 
                      className="font-semibold text-blue-600 hover:text-blue-800 cursor-pointer hover:underline"
                      onClick={() => setViewingEmployee({ id: row.userId, name: row.name })}
                    >
                      {row.name}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {row.checkInTime ? (
                      <div className="text-slate-600">
                        <div>{formatDateLabel(row.checkInTime)}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{formatTime(row.checkInTime)}</div>
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {row.checkOutTime ? (
                      <div className="text-slate-600">
                        <div>{formatDateLabel(row.checkOutTime)}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{formatTime(row.checkOutTime)}</div>
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-slate-600 max-w-[150px] truncate" title={row.checkInLocation}>{row.checkInLocation}</td>
                  <td className="px-4 py-4 text-slate-600 max-w-[150px] truncate" title={row.checkOutLocation}>{row.checkOutLocation}</td>
                  <td className="px-4 py-4 text-slate-600">{row.checkInMode}</td>
                  <td className="px-4 py-4 text-slate-600">{row.checkOutMode}</td>
                  <td className="px-4 py-4 text-slate-400">-</td>
                  <td className="px-4 py-4 text-slate-600 font-mono">{row.hours}</td>
                  <td className="px-4 py-4 text-slate-600">{displayDate}</td>
                  <td className="px-6 py-4">
                    <span className={`font-medium text-xs ${
                      row.status === 'Incomplete' ? 'text-orange-500' :
                      row.status === 'Complete' ? 'text-green-600' :
                      'text-slate-400'
                    }`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right flex items-center justify-end">
                    <button
                      onClick={() => setViewingTimeline(row)}
                      className="p-1.5 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded opacity-0 group-hover:opacity-100 transition-all mr-1"
                      title="View Timeline"
                    >
                      <span className="material-symbols-outlined text-[18px]">history</span>
                    </button>
                    <button 
                      onClick={() => setEditingTiming({
                        userId: row.userId,
                        name: row.name,
                        date: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`,
                        inTime: row.checkInTime ? new Date(row.checkInTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
                        outTime: row.checkOutTime ? new Date(row.checkOutTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
                      })}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                      title="Edit Timing"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table></div>
      </div>
      </>
      )}

      
      {/* Timeline Modal */}
      {viewingTimeline && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Hybrid Timeline</h3>
                <p className="text-sm text-slate-500">{viewingTimeline.name} - {new Date(viewingTimeline.date).toLocaleDateString()}</p>
              </div>
              <button 
                onClick={() => setViewingTimeline(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              {!viewingTimeline.timeline || viewingTimeline.timeline.length === 0 ? (
                <div className="text-center py-8 text-slate-500">No punch records found for this day.</div>
              ) : (
                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                  {viewingTimeline.timeline.map((event, idx) => (
                    <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      {/* Icon */}
                      <div className="flex items-center justify-center w-8 h-8 rounded-full border-4 border-white bg-slate-100 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                        <span className="material-symbols-outlined text-[14px]">
                          {event.action === 'IN' ? 'login' : 'logout'}
                        </span>
                      </div>
                      
                      {/* Card */}
                      <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2rem)] p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider ${event.action === 'IN' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {event.action}
                          </span>
                          <span className="text-xs font-medium text-slate-500">
                            {new Date(event.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-slate-700 mt-2">
                          Source: {event.source}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                          <span className="material-symbols-outlined text-[14px]">location_on</span>
                          {event.location} ({event.mode})
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {viewingEmployee && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{viewingEmployee.name}</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  Monthly Attendance &middot; {new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                </p>
              </div>
              <button 
                onClick={() => setViewingEmployee(null)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-0">
              <div className="overflow-x-auto"><table className="w-full text-left whitespace-nowrap min-w-max">
                <thead className="sticky top-0 bg-slate-50/90 backdrop-blur-sm shadow-[0_1px_2px_rgba(0,0,0,0.05)] z-10">
                  <tr className="text-[10px] text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                    <th className="px-6 py-3">Date</th>
                    <th className="px-4 py-3">Check In</th>
                    <th className="px-4 py-3">Check Out</th>
                    <th className="px-4 py-3">Hours</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loadingMonthly ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                        <div className="flex justify-center mb-2">
                          <span className="material-symbols-outlined animate-spin text-[32px] text-orange-500">sync</span>
                        </div>
                        Loading...
                      </td>
                    </tr>
                  ) : (
                    monthlyData.map((day, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-3 font-medium text-slate-700">{day.date}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {day.checkInTime ? <span className="text-slate-600">{day.checkInTime}</span> : <span className="text-slate-400">-</span>}
                            {day.checkInMode !== '-' && <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{day.checkInMode}</span>}
                            {day.checkInSelfie && (
                              <a href={day.checkInSelfie} target="_blank" rel="noopener noreferrer" className="shrink-0 hover:scale-110 transition-transform">
                                <img src={day.checkInSelfie} alt="Check-in" className="w-5 h-5 rounded-full object-cover border border-slate-200" title="View Selfie" />
                              </a>
                            )}
                            {day.checkInLocation && day.checkInLocation !== '-' && day.checkInLocation !== 'Office' && (
                              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(day.checkInLocation)}`} target="_blank" rel="noopener noreferrer" title={`Location: ${day.checkInLocation}`}>
                                <span className="material-symbols-outlined text-[14px] text-blue-500 hover:text-blue-700 transition-colors mt-0.5">location_on</span>
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {day.checkOutTime ? <span className="text-slate-600">{day.checkOutTime}</span> : <span className="text-slate-400">-</span>}
                            {day.checkOutMode !== '-' && <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{day.checkOutMode}</span>}
                            {day.checkOutSelfie && (
                              <a href={day.checkOutSelfie} target="_blank" rel="noopener noreferrer" className="shrink-0 hover:scale-110 transition-transform">
                                <img src={day.checkOutSelfie} alt="Check-out" className="w-5 h-5 rounded-full object-cover border border-slate-200" title="View Selfie" />
                              </a>
                            )}
                            {day.checkOutLocation && day.checkOutLocation !== '-' && day.checkOutLocation !== 'Office' && (
                              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(day.checkOutLocation)}`} target="_blank" rel="noopener noreferrer" title={`Location: ${day.checkOutLocation}`}>
                                <span className="material-symbols-outlined text-[14px] text-blue-500 hover:text-blue-700 transition-colors mt-0.5">location_on</span>
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600">{day.hours}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium text-xs ${
                              day.status === 'Incomplete' ? 'text-orange-500' :
                              day.status === 'Complete' ? 'text-green-600' :
                              'text-slate-400'
                            }`}>
                              {day.status}
                            </span>
                            {day.isLate && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium border border-red-200">Late</span>}
                            {day.isEarly && <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-medium border border-orange-200">Early</span>}
                          </div>
                          {day.regularisedBy && (
                            <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1" title={`Attendance corrected by ${day.regularisedBy}`}>
                              <span className="material-symbols-outlined text-[12px] text-blue-500">verified</span>
                              Regularised by {day.regularisedBy}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button 
                            onClick={() => setEditingTiming({
                              userId: viewingEmployee.id,
                              name: viewingEmployee.name,
                              date: day.date,
                              inTime: day.checkInTime || '',
                              outTime: day.checkOutTime || ''
                            })}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                            title="Edit Timing"
                          >
                            <span className="material-symbols-outlined text-[16px]">edit</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table></div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Timing Modal */}
      {editingTiming && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Edit Timing</h3>
              <button 
                onClick={() => setEditingTiming(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm font-medium text-slate-700 mb-1">{editingTiming.name}</p>
              <p className="text-xs text-slate-500 mb-6">Date: {editingTiming.date}</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Check In Time</label>
                  <input 
                    type="time" 
                    value={editingTiming.inTime}
                    onChange={(e) => setEditingTiming({ ...editingTiming, inTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Check Out Time</label>
                  <input 
                    type="time" 
                    value={editingTiming.outTime}
                    onChange={(e) => setEditingTiming({ ...editingTiming, outTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button 
                onClick={() => setEditingTiming(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveTiming}
                className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
