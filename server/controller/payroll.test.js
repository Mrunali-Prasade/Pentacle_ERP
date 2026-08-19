import { describe, it, expect } from 'vitest';
import { calculatePayslip, estimateMonthlyTDS } from './payroll.controller.js';

// Characterization tests: these freeze the EXACT payroll numbers the app produces today.
// The two full-month cases below use values captured from a real end-to-end payroll run, so if
// any future change alters a paycheck, a test here fails immediately. Do not "adjust" an expected
// number to make a test pass — a changed number means the calculation changed, which is the whole
// thing we are guarding against. (The tax RULES themselves still need a CA's sign-off; these tests
// only guarantee the code keeps computing what it computes today.)

describe('calculatePayslip — full month, no absence', () => {
  it('₹30,000/month employee (31-day month)', () => {
    const p = calculatePayslip({ monthlySalary: 30000, calendarDays: 31, absentDays: 0, isFebruary: false });
    expect(p).toEqual({
      paidDays: 31,
      earnedGrossAmount: 30000,
      basicSalary: 15000,
      hra: 3000,
      conveyanceAllowance: 1500,
      otherAllowance: 6000,
      specialAllowance: 4500,
      providentFund: 1800,
      employerPf: 550,
      pension: 1250,
      professionalTax: 200,
      incomeTax: 0,
      grossDeduction: 3800,
      netAmount: 26200,
    });
  });

  it('₹1,20,000/month employee (31-day month)', () => {
    const p = calculatePayslip({ monthlySalary: 120000, calendarDays: 31, absentDays: 0, isFebruary: false });
    expect(p).toEqual({
      paidDays: 31,
      earnedGrossAmount: 120000,
      basicSalary: 60000,
      hra: 12000,
      conveyanceAllowance: 6000,
      otherAllowance: 24000,
      specialAllowance: 18000,
      providentFund: 7200,
      employerPf: 5950,
      pension: 1250,
      professionalTax: 200,
      incomeTax: 10660,
      grossDeduction: 25260,
      netAmount: 94740,
    });
  });
});

describe('calculatePayslip — absence reduces paid days', () => {
  it('₹30,000/month, 30-day month, 3 absent days', () => {
    const p = calculatePayslip({ monthlySalary: 30000, calendarDays: 30, absentDays: 3, isFebruary: false });
    expect(p.paidDays).toBe(27);
    expect(p.earnedGrossAmount).toBe(27000);
    expect(p.basicSalary).toBe(13500);
    expect(p.pension).toBe(1125);
    expect(p.employerPf).toBe(495);
    expect(p.grossDeduction).toBe(3440);
    expect(p.netAmount).toBe(23560);
  });

  it('clamps paid days to zero when absence exceeds the month', () => {
    const p = calculatePayslip({ monthlySalary: 30000, calendarDays: 31, absentDays: 40, isFebruary: false });
    expect(p.paidDays).toBe(0);
    expect(p.earnedGrossAmount).toBe(0);
  });
});

describe('calculatePayslip — professional tax rule', () => {
  it('is 300 in February', () => {
    const p = calculatePayslip({ monthlySalary: 30000, calendarDays: 28, absentDays: 0, isFebruary: true });
    expect(p.professionalTax).toBe(300);
  });
  it('is 0 when earned gross is below 7500', () => {
    const p = calculatePayslip({ monthlySalary: 6000, calendarDays: 30, absentDays: 0, isFebruary: false });
    expect(p.professionalTax).toBe(0);
  });
});

describe('estimateMonthlyTDS — new-regime slabs', () => {
  it('is 0 at/below the ₹7L rebate (₹60,000/month)', () => {
    expect(estimateMonthlyTDS(60000)).toBe(0);
  });
  it('₹65,000/month -> 2210', () => {
    expect(estimateMonthlyTDS(65000)).toBe(2210);
  });
  it('₹1,20,000/month -> 10660', () => {
    expect(estimateMonthlyTDS(120000)).toBe(10660);
  });
});
