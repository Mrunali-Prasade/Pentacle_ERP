import React from 'react';
import { Payslip, UserProfile } from '../../types';

interface PentaclePayslipProps {
  payslip: Payslip;
  user: any; // Using any here because we fetch all employee details not just the summary UserProfile
}

export default function PentaclePayslip({ payslip, user }: PentaclePayslipProps) {
  const numberToWords = (num: number): string => {
    if (num === 0) return 'Zero';
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const inWords = (n: number) => {
      let str = '';
      if (n > 99) {
        str += a[Math.floor(n / 100)] + 'Hundred ';
        n %= 100;
      }
      if (n > 19) {
        str += b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : ' ');
      } else if (n > 0) {
        str += a[n];
      }
      return str;
    };
    let words = '';
    if (Math.floor(num / 10000000) > 0) {
      words += inWords(Math.floor(num / 10000000)) + 'Crore ';
      num %= 10000000;
    }
    if (Math.floor(num / 100000) > 0) {
      words += inWords(Math.floor(num / 100000)) + 'Lakh ';
      num %= 100000;
    }
    if (Math.floor(num / 1000) > 0) {
      words += inWords(Math.floor(num / 1000)) + 'Thousand ';
      num %= 1000;
    }
    if (num > 0) words += inWords(num);
    return words.trim();
  };

  return (
    <div className="bg-white text-[#021934] p-8 max-w-4xl mx-auto border border-slate-300 font-sans text-sm shadow-xl mt-8">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold uppercase">PENTACLE CONSULTANTS (I) PVT LTD</h1>
        <p className="text-xs text-slate-600 mt-1">Unit no 1709, A-wing, One Lodha Place, Senapati Bapat Marg, Lower Parel, Mumbai - 400013</p>
        <h2 className="text-md font-bold mt-4 bg-[#021934] text-white py-1 inline-block px-4">
          SALARY SLIP FOR THE MONTH OF {payslip.payPeriod.toUpperCase()}
        </h2>
      </div>

      {/* Employee Details Table */}
      <table className="w-full border-collapse border border-[#021934] mb-6 text-xs">
        <thead>
          <tr className="bg-[#021934] text-white">
            <th className="p-2 border border-[#021934] text-left w-1/2">Employee details</th>
            <th className="p-2 border border-[#021934] text-left w-1/2">Statutory & bank details</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="p-2 border border-[#021934]"><strong>Employee Code:</strong> {user.employeeId || 'N/A'}</td>
            <td className="p-2 border border-[#021934]"><strong>Date of Joining:</strong> {user.joinDate || 'N/A'}</td>
          </tr>
          <tr>
            <td className="p-2 border border-[#021934]"><strong>Name:</strong> {user.name}</td>
            <td className="p-2 border border-[#021934]"><strong>Work Location:</strong> {user.location || 'N/A'}</td>
          </tr>
          <tr>
            <td className="p-2 border border-[#021934]"><strong>Designation:</strong> {user.designation}</td>
            <td className="p-2 border border-[#021934]"><strong>State:</strong> {user.state || 'N/A'}</td>
          </tr>
          <tr>
            <td className="p-2 border border-[#021934]"><strong>Calendar Days:</strong> {payslip.calendarDays}</td>
            <td className="p-2 border border-[#021934]"><strong>UAN No.:</strong> {user.uanNumber || 'N/A'}</td>
          </tr>
          <tr>
            <td className="p-2 border border-[#021934]"><strong>Paid Days:</strong> {payslip.paidDays}</td>
            <td className="p-2 border border-[#021934]"><strong>PAN No.:</strong> {user.panNumber || 'N/A'}</td>
          </tr>
          <tr>
            <td className="p-2 border border-[#021934]"><strong>Leaves / Absent Days:</strong> {payslip.calendarDays - payslip.paidDays}</td>
            <td className="p-2 border border-[#021934]"><strong>Bank Name:</strong> {user.bankName || 'N/A'}</td>
          </tr>
          <tr>
            <td className="p-2 border border-[#021934]"><strong>Arrear Days:</strong> Nil</td>
            <td className="p-2 border border-[#021934]"><strong>Account No.:</strong> {user.bankAccount || 'N/A'}</td>
          </tr>
          <tr>
            <td className="p-2 border border-[#021934]" colSpan={2}>
              <div className="flex justify-between items-center">
                <span><strong>CTC Per Month:</strong> {payslip.monthlySalary ? payslip.monthlySalary.toLocaleString() : (payslip.grossAmount + payslip.employerPf).toLocaleString()}</span>
                <span className="text-xs text-gray-500">(Gross Earning: {payslip.grossAmount.toLocaleString()})</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Earnings and Deductions Table */}
      <table className="w-full border-collapse border border-[#021934] mb-2 text-xs">
        <thead>
          <tr className="bg-[#021934] text-white">
            <th className="p-2 border border-[#021934] text-left w-1/4">Earning heads</th>
            <th className="p-2 border border-[#021934] text-right w-1/4">Amount</th>
            <th className="p-2 border border-[#021934] text-left w-1/4">Deduction heads</th>
            <th className="p-2 border border-[#021934] text-right w-1/4">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="p-2 border border-[#021934]">Basic Salary</td>
            <td className="p-2 border border-[#021934] text-right">{payslip.basicSalary.toLocaleString()}</td>
            <td className="p-2 border border-[#021934]">Professional Tax</td>
            <td className="p-2 border border-[#021934] text-right">{payslip.professionalTax.toLocaleString()}</td>
          </tr>
          <tr>
            <td className="p-2 border border-[#021934]">House Rent Allowance</td>
            <td className="p-2 border border-[#021934] text-right">{payslip.hra.toLocaleString()}</td>
            <td className="p-2 border border-[#021934]">Employer PF</td>
            <td className="p-2 border border-[#021934] text-right">{payslip.employerPf.toLocaleString()}</td>
          </tr>
          <tr>
            <td className="p-2 border border-[#021934]">Conveyance Allowance</td>
            <td className="p-2 border border-[#021934] text-right">{payslip.conveyanceAllowance.toLocaleString()}</td>
            <td className="p-2 border border-[#021934]">Pension</td>
            <td className="p-2 border border-[#021934] text-right">{payslip.pension.toLocaleString()}</td>
          </tr>
          <tr>
            <td className="p-2 border border-[#021934]">Other Allowance</td>
            <td className="p-2 border border-[#021934] text-right">{payslip.otherAllowance.toLocaleString()}</td>
            <td className="p-2 border border-[#021934]">Employee PF</td>
            <td className="p-2 border border-[#021934] text-right">{payslip.providentFund.toLocaleString()}</td>
          </tr>
          <tr>
            <td className="p-2 border border-[#021934]">Special Allowance</td>
            <td className="p-2 border border-[#021934] text-right">{payslip.specialAllowance.toLocaleString()}</td>
            <td className="p-2 border border-[#021934]">Tax Deducted at Source</td>
            <td className="p-2 border border-[#021934] text-right">{payslip.incomeTax > 0 ? payslip.incomeTax.toLocaleString() : '—'}</td>
          </tr>
          {payslip.overtimeAmount > 0 && (
            <tr>
              <td className="p-2 border border-[#021934] italic">Overtime</td>
              <td className="p-2 border border-[#021934] text-right font-bold">{payslip.overtimeAmount.toLocaleString()}</td>
              <td className="p-2 border border-[#021934]"></td>
              <td className="p-2 border border-[#021934] text-right"></td>
            </tr>
          )}
          {payslip.incomeTax > 0 && (
            <tr>
              <td className="p-2 border border-[#021934]"></td>
              <td className="p-2 border border-[#021934] text-right"></td>
              <td className="p-2 border border-[#021934]">Income Tax (TDS)</td>
              <td className="p-2 border border-[#021934] text-right">{payslip.incomeTax.toLocaleString()}</td>
            </tr>
          )}
            
          {/* The Leave / Late Penalty (LOP) row has been removed as per requirement */}
          <tr className="font-bold bg-slate-50">
            <td className="p-2 border border-[#021934]">GROSS EARNING</td>
            <td className="p-2 border border-[#021934] text-right">{payslip.grossAmount.toLocaleString()}</td>
            <td className="p-2 border border-[#021934]">GROSS DEDUCTION</td>
            <td className="p-2 border border-[#021934] text-right">{payslip.grossDeduction.toLocaleString()}</td>
          </tr>
          <tr className="font-bold text-blue-900 bg-blue-50">
            <td className="p-2 border border-[#021934]">NET SALARY</td>
            <td className="p-2 border border-[#021934] text-right">{payslip.netAmount.toLocaleString()}</td>
            <td className="p-2 border border-[#021934] text-[10px] text-slate-500 font-normal italic leading-tight" colSpan={2}>
              (Net = Gross Earning - Gross Deduction)
            </td>
          </tr>
        </tbody>
      </table>


      {/* Footer */}
      <div className="mt-2 text-[10px] text-slate-500 italic">
        (In words) {numberToWords(payslip.netAmount)}. "This is a computer generated payslip & doesn't require any signature."
      </div>
    </div>
  );
}
