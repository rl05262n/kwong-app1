import { useState, useCallback } from "react";
import lasLogo from './The_Legal_Aid_Society_logo.png';
// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
const DISASTER_START = new Date(2020, 0, 20);
const DISASTER_END = new Date(2023, 6, 10);
const KWONG_DUE = new Date(2023, 6, 10);
const CLAIM_DEADLINE = new Date(2026, 6, 10);

const RATES = [
  [2019,1,0.06],[2019,2,0.06],[2019,3,0.05],[2019,4,0.05],
  [2020,1,0.05],[2020,2,0.05],[2020,3,0.03],[2020,4,0.03],
  [2021,1,0.03],[2021,2,0.03],[2021,3,0.03],[2021,4,0.03],
  [2022,1,0.03],[2022,2,0.04],[2022,3,0.05],[2022,4,0.06],
  [2023,1,0.07],[2023,2,0.07],[2023,3,0.07],[2023,4,0.08],
  [2024,1,0.08],[2024,2,0.08],[2024,3,0.08],[2024,4,0.08],
  [2025,1,0.07],[2025,2,0.07],[2025,3,0.07],[2025,4,0.07],
  [2026,1,0.07],[2026,2,0.06],
];

const DUE_DATES = {"1040-2019":"2020-07-15","1040-2020":"2021-05-17","1040-2021":"2022-04-18","1040-2022":"2023-04-18"};
const MIN_PENALTY = {2020:435,2021:435,2022:435,2023:450,2024:485,2025:510,2026:530};

const TC_MAP = {
  "150":{type:"tax"},"300":{type:"tax"},"290":{type:"tax_adj",sign:1},"291":{type:"tax_adj",sign:-1},
  "806":{type:"credit"},"766":{type:"credit"},"846":{type:"credit_offset"},
  "160":{type:"pen",code:"FTF",sign:1},"166":{type:"pen",code:"FTF",sign:1},"270":{type:"pen",code:"FTF",sign:1},
  "161":{type:"pen",code:"FTF",sign:-1},"167":{type:"pen",code:"FTF",sign:-1},
  "176":{type:"pen",code:"FTP",sign:1},"276":{type:"pen",code:"FTP",sign:1},
  "177":{type:"pen",code:"FTP",sign:-1},"271":{type:"pen",code:"FTP",sign:-1},"277":{type:"pen",code:"FTP",sign:-1},
  "170":{type:"pen",code:"EST",sign:1},"173":{type:"pen",code:"EST",sign:1},"171":{type:"pen",code:"EST",sign:-1},
  "196":{type:"int",sign:1},"197":{type:"int",sign:-1},"336":{type:"int",sign:1},"337":{type:"int",sign:-1},
  "340":{type:"pen_int",sign:1},"341":{type:"pen_int",sign:-1},
  "610":{type:"pay"},"670":{type:"pay"},"680":{type:"pay"},"706":{type:"pay"},
  "671":{type:"pay_rev"},"672":{type:"acct_adj"},"460":{type:"ext"},"960":{type:"info"},"971":{type:"info"},"582":{type:"info"},"360":{type:"info"},"530":{type:"info"},
};
// ═══════════════════════════════════════════════════════════════
// LOGO COMPONENT
// ═══════════════════════════════════════════════════════════════
function LASLogo({ size = 120 }) {
  return (
    <img
      src={lasLogo}
      alt="The Legal Aid Society"
      style={{ height: size, width: 'auto', objectFit: 'contain' }}
      onError={(e) => { e.target.style.display = 'none'; console.error('Logo not found'); }}
    />
  );
}
// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
const d = (s) => { if(!s)return null; if(s instanceof Date)return s; let p=String(s).match(/(\d{4})-(\d{2})-(\d{2})/); if(p)return new Date(+p[1],+p[2]-1,+p[3]); p=String(s).match(/(\d{2})[-/](\d{2})[-/](\d{4})/); return p?new Date(+p[3],+p[1]-1,+p[2]):null; };
const fmt = (dt) => dt?`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`:'';
const diffDays = (a,b) => Math.round((b-a)/86400000);
const isLeap = (y) => (y%4===0&&y%100!==0)||y%400===0;
const daysInYear = (y) => isLeap(y)?366:365;
const inDisaster = (dt) => dt>=DISASTER_START && dt<=DISASTER_END;
const $ = (n) => n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
function getRate(dt) { const y=dt.getFullYear(),q=Math.floor(dt.getMonth()/3)+1; const r=RATES.find(([ry,rq])=>ry===y&&rq===q); return r?r[2]:0.07; }
function addMonth(dt) { let m=dt.getMonth()+1,y=dt.getFullYear(); if(m>11){m=0;y++;} return new Date(y,m,Math.min(dt.getDate(),28)); }

// ═══════════════════════════════════════════════════════════════
// PARSER
// ═══════════════════════════════════════════════════════════════
function parseTranscript(text) {
  const lines = text.split('\n');
  const h = {taxYear:'',formType:'1040',rrd:null,dueDate:null,accruedInt:0,accruedPen:0,accruedAsOf:null,iaDate:null,taxPerReturn:0,processingDate:null};
  const pens = {FTF:{a:0,r:0,dates:[]},FTP:{a:0,r:0,dates:[]},EST:{a:0,r:0,dates:[]}};
  let interest={a:0,r:0}, penInterest={a:0,r:0}, taxGross=0, credits=0, tc150date=null;
  const payments=[], unmatchedLines=[];

  for (const line of lines) {
    const lc = line.trim(); let m;
    // Tax year — try many formats
    if (!h.taxYear&&(m=lc.match(/(?:Tax Period|Period Ending)[:\s]+\w+\.?\s*\d+,?\s*(\d{4})/i))) h.taxYear=m[1];
    if (!h.taxYear&&(m=lc.match(/Tax\s+Period\s+Ending[:\s]+\d{2}-\d{2}-(\d{4})/i))) h.taxYear=m[1];
    if (!h.taxYear&&(m=lc.match(/Period\s+Ending[:\s]*(\d{2}[-/]\d{2}[-/]\d{4})/i))) { const pd=m[1].split(/[-/]/); h.taxYear=pd[2]; }
    if (!h.taxYear&&(m=lc.match(/Tax\s+(?:Year|Period)[:\s]+(\d{4})/i))) h.taxYear=m[1];
    if (!h.taxYear&&(m=lc.match(/12[-/]31[-/](\d{4})/))&&/period|ending|tax year/i.test(lc)) h.taxYear=m[1];
    if ((m=lc.match(/Return\s+Received\s+Date[:\s]+(\d{2}[-/]\d{2}[-/]\d{4})/i))) h.rrd=d(m[1]);
    if (!h.rrd&&(m=lc.match(/return\s+received\s+date\s*\(whichever\s+is\s+later\)[:\s]+(\d{2}[-/]\d{2}[-/]\d{4})/i))) h.rrd=d(m[1]);
    if ((m=lc.match(/Return\s+Due\s+Date[:\s]+(\d{2}[-/]\d{2}[-/]\d{4})/i))) h.dueDate=d(m[1]);
    if ((m=lc.match(/Accrued\s+interest[:\s]+\$?([\d,]+\.?\d*)/i))) h.accruedInt=parseFloat(m[1].replace(/,/g,''));
    if ((m=lc.match(/Accrued\s+penalty[:\s]+\$?([\d,]+\.?\d*)/i))) h.accruedPen=parseFloat(m[1].replace(/,/g,''));
    // Parse "As of:" date from accrued lines (e.g., "Accrued interest: $5,962.57 As of: 01-19-2026")
    if (!h.accruedAsOf&&(m=lc.match(/As\s+of[:\s]+(\d{2}[-/]\d{2}[-/]\d{4})/i))) h.accruedAsOf=d(m[1]);
    if ((m=lc.match(/Form\s+Number[:\s]+(\d{4})/i))) h.formType=m[1];
    if ((m=lc.match(/Tax\s+per\s+return[:\s]+\$?([\d,]+\.?\d*)/i))) h.taxPerReturn=parseFloat(m[1].replace(/,/g,''));
    if ((m=lc.match(/Processing\s+date[:\s]+(\d{2}[-/]\d{2}[-/]\d{4})/i))) h.processingDate=d(m[1]);
    if (/[Ii]nstallment\s+agreement/i.test(lc)) { const dm=lc.match(/(\d{2}[-/]\d{2}[-/]\d{4})/); if(dm)h.iaDate=d(dm[1]); }

    let txm=lc.match(/^(\d{3})\s+.+?\s+(?:\d{8}\s+)?(\d{2}-\d{2}-\d{4})\s+(-?\$?[\d,]+\.\d{2})$/);
    if(!txm) txm=lc.match(/^(\d{3})\s+.+?(\d{2}-\d{2}-\d{4})\s+(-?\$?[\d,]+\.\d{2})/);
    if(!txm) txm=lc.match(/^(\d{3})[|\t]\s*.+?(\d{2}-\d{2}-\d{4})\s+(-?\$?[\d,]+\.\d{2})/);
    if(!txm){const t4=lc.match(/^(\d{3})\s+.+?(\d{2}-\d{2}-\d{4})\s+(-?\$?[\d,]+)$/);if(t4&&!t4[3].match(/\d{4}$/))txm=[null,t4[1],t4[2],t4[3]+'.00'];}
    if(!txm){const t5=lc.match(/^(\d{3})\s+.+?(\d{2}\/\d{2}\/\d{4})\s+(-?\$?[\d,]+\.?\d*)/);if(t5)txm=[null,t5[1],t5[2].replace(/\//g,'-'),t5[3]];}
    if(!txm){if(/^\d{3}\s+/.test(lc)&&/\d{2}.\d{2}.\d{4}/.test(lc))unmatchedLines.push(lc);continue;}

    const tc=txm[1],txDate=d(txm[2]); let as=txm[3].replace(/[$,]/g,''); if(!as.includes('.'))as+='.00';
    const amt=parseFloat(as); const info=TC_MAP[tc]; if(!info)continue;

    if(info.type==='pen'){const b=pens[info.code]||{a:0,r:0,dates:[]};if(info.sign>0)b.a+=Math.abs(amt);else b.r+=Math.abs(amt);if(txDate)b.dates.push(txDate);pens[info.code]=b;}
    else if(info.type==='int'){if(info.sign>0)interest.a+=Math.abs(amt);else interest.r+=Math.abs(amt);}
    else if(info.type==='pen_int'){if(info.sign>0)penInterest.a+=Math.abs(amt);else penInterest.r+=Math.abs(amt);}
    else if(info.type==='tax'){if(tc==='150'){taxGross=Math.abs(amt);tc150date=txDate;}else taxGross+=Math.abs(amt);}
    else if(info.type==='tax_adj'){taxGross+=amt*(info.sign||1);}
    else if(info.type==='credit'){credits+=Math.abs(amt);}
    else if(info.type==='credit_offset'){credits-=Math.abs(amt);}
    else if(info.type==='pay'){if(txDate&&amt!==0)payments.push({date:txDate,amount:Math.abs(amt)});}
    else if(info.type==='pay_rev'){if(txDate&&amt!==0)payments.push({date:txDate,amount:-Math.abs(amt)});}
  }

  if(taxGross===0&&h.taxPerReturn>0) taxGross=h.taxPerReturn;
  let filedDate=h.rrd||tc150date;
  if(!filedDate){const p=payments.find(p=>p.amount>0);if(p)filedDate=p.date;}
  const netTax=Math.max(0,Math.round((taxGross-credits)*100)/100);

  // Tax year inference fallbacks
  if (!h.taxYear && tc150date) {
    // Processing date is typically in the year after the tax year
    h.taxYear = String(tc150date.getFullYear() - 1);
  }
  if (!h.taxYear && filedDate) {
    // Filed date is typically in the year after the tax year (or same year for extensions)
    const fy = filedDate.getFullYear();
    const fm = filedDate.getMonth();
    h.taxYear = String(fm < 6 ? fy - 1 : fy); // If filed Jan-Jun, likely prior year
  }

  // Due date: lookup table first (has correct statutory dates with COVID extensions),
  // then fall back to transcript header if tax year not in table
  const dueKey=`${h.formType}-${h.taxYear}`;
  let statutoryDue = d(DUE_DATES[dueKey]);
  if (!statutoryDue && h.dueDate) {
    statutoryDue = h.dueDate;
  }
  // If still no due date, construct one for 1040 based on tax year
  if (!statutoryDue && h.taxYear) {
    const ty = parseInt(h.taxYear);
    if (ty >= 2019 && ty <= 2025) {
      // Default to April 15 of following year (will be slightly off for EmancDay years)
      statutoryDue = new Date(ty + 1, 3, 15);
    }
  }
  const parseWarnings=[];
  if(taxGross===0&&(h.accruedPen>0||h.accruedInt>0))parseWarnings.push('TC 150 not found. Check extracted text.');
  if(h.taxPerReturn>0&&!tc150date)parseWarnings.push(`Using "Tax per return" ($${h.taxPerReturn.toLocaleString()}) from header.`);
  if(unmatchedLines.length>0)parseWarnings.push(`${unmatchedLines.length} transaction line(s) didn't parse.`);

  return {...h,taxGross,credits,netTax,filedDate,tc150date,statutoryDue,
    ftf:{assessed:Math.round((pens.FTF.a-pens.FTF.r)*100)/100,dates:pens.FTF.dates},
    ftp:{assessed:Math.round((pens.FTP.a-pens.FTP.r)*100)/100,dates:pens.FTP.dates},
    est:{assessed:Math.round((pens.EST.a-pens.EST.r)*100)/100,dates:pens.EST.dates},
    interest:{assessed:Math.round((interest.a-interest.r)*100)/100},
    penInterest:{assessed:Math.round((penInterest.a-penInterest.r)*100)/100},
    payments:payments.sort((a,b)=>a.date-b.date), parseWarnings, unmatchedLines};
}

// ═══════════════════════════════════════════════════════════════
// COMPUTATION ENGINE
// ═══════════════════════════════════════════════════════════════
function countCalendarMonths(start,end,max=999){let months=0,cursor=new Date(start);while(cursor<end&&months<max){cursor=addMonth(cursor);months++;if(cursor>=end)break;}return months;}

function computeInterestOnAmount(principal, startDate, endDate) {
  // Daily compound interest per §6622 on a fixed amount
  if (!startDate||!endDate||principal<=0||endDate<=startDate) return {total:0,work:[]};
  let balance=principal, cursor=new Date(startDate);
  const work=[];
  let segStart=new Date(cursor), segRate=getRate(cursor), segDays=0, segStartBal=balance;
  while(cursor<endDate){
    const creditDate=new Date(cursor); creditDate.setDate(creditDate.getDate()+1);
    const rate=getRate(creditDate);
    const yd=daysInYear(cursor.getFullYear());
    if(rate!==segRate&&segDays>0){
      work.push({from:fmt(segStart),to:fmt(cursor),rate:`${(segRate*100).toFixed(0)}%`,days:segDays,
        startBal:Math.round(segStartBal*100)/100,endBal:Math.round(balance*100)/100,
        interest:Math.round((balance-segStartBal)*100)/100});
      segStart=new Date(cursor);segStartBal=balance;segRate=rate;segDays=0;
    }
    balance*=(1+rate/yd); segDays++;
    cursor.setDate(cursor.getDate()+1);
  }
  if(segDays>0) work.push({from:fmt(segStart),to:fmt(endDate),rate:`${(segRate*100).toFixed(0)}%`,days:segDays,
    startBal:Math.round(segStartBal*100)/100,endBal:Math.round(balance*100)/100,
    interest:Math.round((balance-segStartBal)*100)/100});
  return {total:Math.round((balance-principal)*100)/100, work};
}

function computeInterestWithPayments(principal,startDate,endDate,payments,excludeDisaster){
  if(!startDate||!endDate||principal<=0||endDate<=startDate)return{total:0,daysExcluded:0,work:[]};
  let balance=principal,cursor=new Date(startDate);
  const sorted=[...payments].sort((a,b)=>a.date-b.date);
  let payIdx=0,excluded=0,totalPaid=0;
  const work=[];
  let segStart=new Date(cursor),segRate=getRate(cursor),segDays=0,segStartBal=balance,segExcl=0;
  while(cursor<endDate){
    // Apply payments on or before this date — close segment first (matches Python)
    while(payIdx<sorted.length&&sorted[payIdx].date<=cursor){
      if(segDays>0){
        work.push({from:fmt(segStart),to:fmt(cursor),rate:`${(segRate*100).toFixed(0)}%`,days:segDays,excluded:segExcl,
          startBal:Math.round(segStartBal*100)/100,endBal:Math.round(balance*100)/100});
      }
      balance=Math.max(0,balance-sorted[payIdx].amount);
      totalPaid+=sorted[payIdx].amount;
      payIdx++;
      segStart=new Date(cursor);segStartBal=balance;segDays=0;segExcl=0;
    }
    if(balance<=0.001)break;
    const creditDate=new Date(cursor);creditDate.setDate(creditDate.getDate()+1);
    const rate=getRate(creditDate);const yd=daysInYear(cursor.getFullYear());
    if(rate!==segRate&&segDays>0){
      work.push({from:fmt(segStart),to:fmt(cursor),rate:`${(segRate*100).toFixed(0)}%`,days:segDays,excluded:segExcl,
        startBal:Math.round(segStartBal*100)/100,endBal:Math.round(balance*100)/100});
      segStart=new Date(cursor);segStartBal=balance;segRate=rate;segDays=0;segExcl=0;
    }
    if(excludeDisaster&&inDisaster(cursor)){excluded++;segExcl++;}
    else{balance*=(1+rate/yd);segDays++;}
    cursor.setDate(cursor.getDate()+1);
  }
  if(segDays>0)work.push({from:fmt(segStart),to:fmt(endDate),rate:`${(segRate*100).toFixed(0)}%`,days:segDays,excluded:segExcl,
    startBal:Math.round(segStartBal*100)/100,endBal:Math.round(balance*100)/100});
  // Total interest = balance growth above principal, adding back payments (matches Python line 568)
  return{total:Math.max(0,Math.round((balance-principal+totalPaid)*100)/100),daysExcluded:excluded,work};
}

// Simplified model: interest on TAX PRINCIPAL only (no interest-on-interest).
// Payments reduce the principal directly. Used for conservative Form 843 estimate.
// The full §6622 model (above) is more accurate; the IRS's own system compounds
// interest-on-interest. This simplified model produces a lower, defensible floor.
function computeInterestSimplified(principal,startDate,endDate,payments,excludeDisaster){
  if(!startDate||!endDate||principal<=0||endDate<=startDate)return{total:0,daysExcluded:0};
  let taxOwed=principal,cursor=new Date(startDate);
  const sorted=[...payments].sort((a,b)=>a.date-b.date);
  let payIdx=0,excluded=0,interest=0;
  while(cursor<endDate){
    while(payIdx<sorted.length&&sorted[payIdx].date<=cursor){taxOwed=Math.max(0,taxOwed-sorted[payIdx].amount);payIdx++;}
    if(taxOwed<=0.001)break;
    const creditDate=new Date(cursor);creditDate.setDate(creditDate.getDate()+1);
    const rate=getRate(creditDate);const yd=daysInYear(cursor.getFullYear());
    if(excludeDisaster&&inDisaster(cursor)){excluded++;}
    else{interest+=taxOwed*rate/yd;}
    cursor.setDate(cursor.getDate()+1);
  }
  return{total:Math.max(0,Math.round(interest*100)/100),daysExcluded:excluded};
}

function computeFTPDecliningBalance(taxDue,dueDate,payments,iaDate,returnTimely,excludeDisaster,cutoffDate){
  if(!dueDate||taxDue<=0)return{total:0,detail:[],note:''};
  let balance=taxDue,total=0,cumRate=0;
  const sorted=[...payments].sort((a,b)=>a.date-b.date);
  let payIdx=0,cursor=new Date(dueDate);
  const detail=[],cutoff=cutoffDate||new Date();
  let disasterSkipped=0,activeMonths=0;
  for(let month=1;balance>0.01&&cumRate<0.25&&month<600;month++){
    if(cursor>cutoff)break;
    let paid=0;
    while(payIdx<sorted.length&&sorted[payIdx].date<=cursor){paid+=sorted[payIdx].amount;payIdx++;}
    balance=Math.max(0,balance-paid);if(balance<=0.01)break;
    const isIA=iaDate&&returnTimely&&cursor>=iaDate;
    const rate=isIA?0.0025:0.005;
    const inD=inDisaster(cursor);
    if(excludeDisaster&&inD){disasterSkipped++;detail.push({month,date:fmt(cursor),balance:Math.round(balance*100)/100,rate:isIA?'0.25%':'0.5%',ftp:0,disaster:true,paid:Math.round(paid*100)/100});}
    else{const ftpRaw=balance*rate;const ftpDisp=Math.round(ftpRaw*100)/100;cumRate+=rate;total+=ftpRaw;activeMonths++;
      detail.push({month,date:fmt(cursor),balance:Math.round(balance*100)/100,rate:isIA?'0.25%':'0.5%',ftp:ftpDisp,disaster:false,paid:Math.round(paid*100)/100});}
    cursor=addMonth(cursor);
  }
  return{total:Math.round(total*100)/100,detail,disasterSkipped,activeMonths,
    note:`${disasterSkipped} disaster mo skipped, ${activeMonths} active${iaDate?`, IA 0.25% from ${fmt(iaDate)}`:''}`};
}

// ═══════════════════════════════════════════════════════════════
// FULL ANALYSIS
// ═══════════════════════════════════════════════════════════════
function runAnalysis(p) {
  const results = {items:[], totalLine2:0, warnings:[], notes:[]};
  if (!p.statutoryDue) {results.warnings.push('Could not determine statutory due date');return results;}
  const filingYear = p.statutoryDue.getFullYear();
  // Use the transcript's "As of" date as the computation cutoff.
  // The accrued amounts are computed through that date, so the Kwong
  // recomputation must use the same endpoint for apples-to-apples comparison.
  const accrualEnd = p.accruedAsOf || new Date();
  const assessmentDate = p.processingDate || p.tc150date;
  const returnTimely = (p.filedDate && p.statutoryDue && p.filedDate <= p.statutoryDue) || !!p.iaDate;

  // ── FTF ──
  if (p.ftf.assessed > 0) {
    const work = [];
    const filedBeforeKwong = p.filedDate && p.filedDate <= KWONG_DUE;
    let kwongFTF = 0, abate = 0;
    if (filedBeforeKwong) {
      work.push(`Due date: ${fmt(p.statutoryDue)}`);
      work.push(`Filed: ${fmt(p.filedDate)} — BEFORE Kwong due date (${fmt(KWONG_DUE)})`);
      work.push(`Under Kwong, the return was filed TIMELY`);
      work.push(`Kwong FTF = $0.00`);
      abate = p.ftf.assessed;
    } else {
      const months = countCalendarMonths(KWONG_DUE, p.filedDate, 5);
      const rate = Math.min(months*0.05, 0.25);
      kwongFTF = Math.round(p.netTax*rate*100)/100;
      work.push(`Kwong due: ${fmt(KWONG_DUE)} → Filed: ${fmt(p.filedDate)}`);
      work.push(`${months} months × 5% = ${(rate*100).toFixed(0)}%, $${$(p.netTax)} × ${(rate*100).toFixed(1)}% = $${$(kwongFTF)}`);
      const daysLate = diffDays(KWONG_DUE, p.filedDate);
      if (daysLate > 60) {
        const cap = MIN_PENALTY[filingYear]||435;
        const min = Math.min(cap, p.netTax);
        if (kwongFTF < min) { work.push(`§6651(a)(3) minimum: filed ${daysLate}d late, min($${cap}, $${$(p.netTax)}) = $${$(min)}`); kwongFTF = min; }
      }
      abate = Math.max(0, Math.round((p.ftf.assessed - kwongFTF)*100)/100);
    }
    // IRS verification
    const irsDaysLate = p.filedDate ? diffDays(p.statutoryDue, p.filedDate) : 0;
    const irsMonths = Math.min(Math.max(1, Math.ceil(irsDaysLate/30)), 5);
    work.unshift(`IRS: ${irsDaysLate} days late = ${irsMonths} month(s), 5% - 0.5% (§6651(c)(1)) = 4.5%`);
    work.unshift(`Net tax: $${$(p.netTax)} (gross $${$(p.taxGross)} - withholding $${$(p.credits)})`);
    work.unshift(`IRS assessed: $${$(p.ftf.assessed)}`);
    results.items.push({code:'§6651(a)(1) FTF', irsAssessed:p.ftf.assessed, recomputed:kwongFTF, abatement:abate, work});
    results.totalLine2 += abate;
  }

  // ── FTP ──
  // Compute BOTH IRS and Kwong FTP independently using the same engine.
  // The abatement is the difference — precisely the disaster-period months.
  // Do NOT use transcript accrued penalty as the IRS baseline; it includes
  // §6651(d) rate increases and other adjustments that inflate the claim.
  if (p.netTax > 0 && p.statutoryDue) {
    const irsDB = computeFTPDecliningBalance(p.netTax, p.statutoryDue, p.payments, p.iaDate, returnTimely, false, accrualEnd);
    const kwongDB = computeFTPDecliningBalance(p.netTax, p.statutoryDue, p.payments, p.iaDate, returnTimely, true, accrualEnd);
    const abate = Math.max(0, Math.round((irsDB.total - kwongDB.total)*100)/100);
    if (abate > 0) {
   // Pre-disaster payment total and starting balance
      const preDisasterPayments = p.payments.filter(pay => pay.date <= DISASTER_END);
      const preDisasterTotal = preDisasterPayments.reduce((s, pay) => s + pay.amount, 0);
      const balanceAtDisasterEnd = Math.max(0, p.netTax - preDisasterTotal);
 
      const work = [
        `── IRS-Normal FTP ──`,
        `Net tax due: $${$(p.netTax)}`,
        `Due date: ${fmt(p.statutoryDue)}`,
        `IRS FTP rate: 0.5%/mo${p.iaDate ? `, reduced to 0.25%/mo from IA date (${fmt(p.iaDate)}) per §6651(h)` : ''}`,
        `IRS FTP (computed): $${$(irsDB.total)} over ${irsDB.activeMonths + irsDB.disasterSkipped} months`,
        ``,
        `── Kwong-Adjusted FTP ──`,
        `Payments through disaster end (${fmt(DISASTER_END)}): ${preDisasterPayments.length} payments, $${$(preDisasterTotal)}`,
        `Balance at ${fmt(new Date(DISASTER_END.getTime() + 86400000))}: $${$(balanceAtDisasterEnd)}`,
        `Kwong FTP (disaster months excluded): $${$(kwongDB.total)}`,
        `  ${kwongDB.disasterSkipped} months skipped (disaster), ${kwongDB.activeMonths} months active`,
        `  ${p.iaDate ? `IA rate 0.25%/mo from ${fmt(p.iaDate)}` : 'Standard rate 0.5%/mo'}`,
        ``,
        `── Abatement ──`,
        `$${$(irsDB.total)} (IRS) − $${$(kwongDB.total)} (Kwong) = $${$(abate)}`,
      ];
      const transcriptFTP = Math.max(p.ftp.assessed, 0) + (p.accruedPen > 0 ? p.accruedPen : 0);
      if (transcriptFTP > 0) {
        work.push(``);
        work.push(`── Transcript Cross-Check ──`);
        work.push(`TC 276 net assessed: $${$(p.ftp.assessed)}`);
        work.push(`Accrued penalty (unassessed): $${$(p.accruedPen)}`);
        work.push(`Transcript total FTP: $${$(transcriptFTP)}`);
        work.push(`Computed IRS FTP: $${$(irsDB.total)}`);
        const ftpVariance = Math.abs(irsDB.total - transcriptFTP);
        const ftpPct = transcriptFTP > 0 ? (ftpVariance / transcriptFTP * 100).toFixed(1) : '0';
        work.push(`Variance: $${$(ftpVariance)} (${ftpPct}%)${ftpVariance > 500 ? ' — see note below' : ''}`);
        if (ftpVariance > 500) {
          work.push(`NOTE: Variance likely due to IRS internal payment-application splits`);
          work.push(`(IRS allocates payments across tax/penalty/interest sub-accounts;`);
          work.push(` this model applies payments to tax principal first).`);
          if (p.iaDate && irsDB.total > transcriptFTP) {
            work.push(`Also: IRS retroactively adjusted FTP rate to 0.25% when IA was`);
            work.push(`established (TC 271 reversal). Computed IRS FTP uses statutory`);
            work.push(`0.5% for pre-IA months per §6651(a)(2).`);
          }
        }
      }
      results.items.push({code:'§6651(a)(2) FTP', irsAssessed:irsDB.total, recomputed:kwongDB.total, abatement:abate, work, ftpDetail:kwongDB.detail});
      results.totalLine2 += abate;
    }
  }

  // ── §6654 ──
  if (p.est.assessed > 0) {
    const ty = parseInt(p.taxYear);
    const dls = [new Date(ty,3,15),new Date(ty,5,15),new Date(ty,8,15),new Date(ty+1,0,15)];
    const inD = dls.filter(dl=>dl>=DISASTER_START&&dl<=DISASTER_END).length;
    const abate = inD===4 ? p.est.assessed : Math.round(p.est.assessed*inD/4*100)/100;
    const work = [
      `Quarterly deadlines: ${dls.map(dl=>`${fmt(dl)} (${dl>=DISASTER_START&&dl<=DISASTER_END?'IN':'OUT'})`).join(', ')}`,
      `${inD}/4 deadlines in disaster period → ${inD===4?'full':'proportional'} abatement`,
      `Abatement: $${$(abate)}`,
    ];
    results.items.push({code:'§6654 Est. Tax', irsAssessed:p.est.assessed, recomputed:Math.round((p.est.assessed-abate)*100)/100, abatement:abate, work});
    results.totalLine2 += abate;
  }

  // ── INTEREST ON TAX ──
  // Compute both full §6622 (interest-on-interest) and simplified (interest on
  // declining principal only). The simplified model is the conservative floor;
  // full §6622 is what the IRS's own systems produce.
  let intAbateSimplified = 0;
  if (p.netTax > 0 && p.statutoryDue) {
    const taxPaidDate = (()=>{let c=0;for(const pay of p.payments){c+=pay.amount;if(c>=p.netTax-0.01)return pay.date;}return null;})();
    const endDate = taxPaidDate || accrualEnd;
    const irsInt = computeInterestWithPayments(p.netTax, p.statutoryDue, endDate, p.payments, false);
    const kwongInt = computeInterestWithPayments(p.netTax, p.statutoryDue, endDate, p.payments, true);
    const abate = Math.max(0, Math.round((irsInt.total - kwongInt.total)*100)/100);
    // Simplified model (conservative): interest on declining principal only
    const irsSimp = computeInterestSimplified(p.netTax, p.statutoryDue, endDate, p.payments, false);
    const kwongSimp = computeInterestSimplified(p.netTax, p.statutoryDue, endDate, p.payments, true);
    const abateSimp = Math.max(0, Math.round((irsSimp.total - kwongSimp.total)*100)/100);
    intAbateSimplified = abateSimp;
    if (abate > 0) {
        const intTranscriptTotal = Math.max(p.interest.assessed, 0) + (p.accruedInt > 0 ? p.accruedInt : 0);
        const work = [
          `── IRS-Normal Interest (full §6622) ──`,
          `Start: ${fmt(p.statutoryDue)} (statutory/extended due date)`,
          `End: ${fmt(endDate)}${taxPaidDate ? ' (tax fully paid)' : ' (balance unpaid — accrual date)'}`,
          `Method: Daily compounding per §6622, quarterly rates per §6621`,
          `Starting balance: $${$(p.netTax)}`,
          `IRS interest: $${$(irsInt.total)}`,
        ];
        // Add IRS segment breakdown
        if (irsInt.work && irsInt.work.length > 0) {
          work.push(``);
          work.push(`── IRS Rate Segments ──`);
          for (const seg of irsInt.work) {
            const segInt = Math.round((seg.endBal - seg.startBal) * 100) / 100;
            work.push(`  ${seg.from} → ${seg.to}: ${seg.rate}, ${seg.days}d, bal $${$(seg.startBal)}→$${$(seg.endBal)} (+$${$(Math.abs(segInt))})`);
          }
        }
        work.push(``);
        work.push(`── Kwong-Adjusted Interest ──`);
        work.push(`Same parameters, but ${kwongInt.daysExcluded} disaster-period days excluded`);
        work.push(`Kwong interest: $${$(kwongInt.total)}`);
        // Add Kwong segment breakdown
        if (kwongInt.work && kwongInt.work.length > 0) {
          work.push(``);
          work.push(`── Kwong Rate Segments ──`);
          for (const seg of kwongInt.work) {
            const segInt = Math.round((seg.endBal - seg.startBal) * 100) / 100;
            const exNote = seg.excluded > 0 ? ` (${seg.excluded}d excluded)` : '';
            work.push(`  ${seg.from} → ${seg.to}: ${seg.rate}, ${seg.days}d${exNote}, bal $${$(seg.startBal)}→$${$(seg.endBal)} (+$${$(Math.abs(segInt))})`);
          }
        }
        work.push(``);
        work.push(`── Abatement ──`);
        work.push(`Full §6622: $${$(irsInt.total)} − $${$(kwongInt.total)} = $${$(abate)}`);
        work.push(`Simplified (principal only): $${$(irsSimp.total)} − $${$(kwongSimp.total)} = $${$(abateSimp)}`);
        if (abate !== abateSimp) work.push(`Range: $${$(abateSimp)} (conservative) to $${$(abate)} (full §6622)`);
        // Transcript cross-check
        if (intTranscriptTotal > 0) {
          work.push(``);
          work.push(`── Transcript Cross-Check ──`);
          work.push(`TC 196 (assessed): $${$(p.interest.assessed)}`);
          work.push(`Accrued interest (unassessed): $${$(p.accruedInt)}`);
          work.push(`Transcript total: $${$(intTranscriptTotal)}`);
          work.push(`Computed IRS total: $${$(irsInt.total)}`);
          const intVar = Math.abs(irsInt.total - intTranscriptTotal);
          const intPct = intTranscriptTotal > 0 ? (intVar / intTranscriptTotal * 100).toFixed(2) : '0';
          work.push(`Variance: $${$(intVar)} (${intPct}%)`);
          if (intVar > 100) {
            work.push(`NOTE: Variance attributable to IRS internal payment-application`);
            work.push(`splits and interest-on-penalty compounding (TC 340).`);
          }
        }
        results.items.push({code:'§6601 Interest', irsAssessed:irsInt.total, recomputed:kwongInt.total, abatement:abate, abateSimplified:abateSimp, work, intWork:kwongInt.work, irsWork:irsInt.work});
      results.totalLine2 += abate;
    }
  }

  // ── Determine when penalties were paid (for interest-on-penalty cutoff) ──
  // Once cumulative payments exceed net tax + assessed penalties + assessed interest,
  // the penalties are fully paid. Interest on penalties stops at that date.
  // For unpaid accounts, penalties are NOT paid → interest runs to today.
  const totalAssessedPI = p.ftf.assessed + p.ftp.assessed + p.interest.assessed;
  let penaltyPaidDate = null;
  if (p.payments.length > 0) {
    let cum = 0;
    for (const pay of p.payments) {
      cum += pay.amount;
      if (cum >= p.netTax + totalAssessedPI - 0.01) {
        penaltyPaidDate = pay.date;
        break;
      }
    }
  }

  // ── INTEREST ON ABATED FTF PENALTY (TC 340 cascade) ──
  // Per §6601(e)(2)(A): interest on §6651(a)(1) FTF penalty runs from
  // the RETURN DUE DATE, not the assessment/processing date.
  const ftfAbate = results.items.find(i=>i.code.includes('FTF'));
  if (ftfAbate && ftfAbate.abatement > 0 && p.statutoryDue) {
    const penIntStart = p.statutoryDue;
    const endDate = penaltyPaidDate || accrualEnd;
    const intOnFTF = computeInterestOnAmount(ftfAbate.abatement, penIntStart, endDate);
    const work = [
      `The FTF of $${$(ftfAbate.abatement)} should not have been assessed`,
      `§6601(e)(2)(A): interest on FTF runs from return due date`,
      `Interest ran from ${fmt(penIntStart)} to ${fmt(endDate)}${penaltyPaidDate ? ' (penalty paid)' : ' (unpaid — running to accrual date)'}`,
      `Period: ${diffDays(penIntStart,endDate)} days`,
      `Daily compounding per §6622:`,
      ...intOnFTF.work.map(w=>`  ${w.from}→${w.to}: ${w.rate}, ${w.days}d, $${$(w.interest)}`),
      `Total interest on FTF: $${$(intOnFTF.total)}`,
    ];
    if (intOnFTF.total > 1.00) {
      results.items.push({code:'§6601 Int. on FTF', irsAssessed:intOnFTF.total, recomputed:0, abatement:intOnFTF.total, work});
      results.totalLine2 += intOnFTF.total;
    }
  }

  // ── INTEREST ON ABATED §6654 PENALTY ──
  // Per §6601(e)(2)(B): interest on §6654 addition runs from the return due date.
  const estAbate = results.items.find(i=>i.code.includes('6654'));
  if (estAbate && estAbate.abatement > 0 && p.statutoryDue) {
    const endDate = penaltyPaidDate || accrualEnd;
    const intOnEST = computeInterestOnAmount(estAbate.abatement, p.statutoryDue, endDate);
    const work = [
      `The §6654 penalty of $${$(estAbate.abatement)} should not have been assessed`,
      `§6601(e)(2)(B): interest runs from return due date`,
      `Interest from ${fmt(p.statutoryDue)} to ${fmt(endDate)}`,
      `Period: ${diffDays(p.statutoryDue,endDate)} days`,
      `Daily compounding per §6622: $${$(intOnEST.total)}`,
    ];
    if (intOnEST.total > 1.00) {
      results.items.push({code:'§6601 Int. on §6654', irsAssessed:intOnEST.total, recomputed:0, abatement:intOnEST.total, work});
      results.totalLine2 += intOnEST.total;
    }
  }

  // ── INTEREST ON ABATED FTP (disaster-period excess) ──
  // The FTP abatement represents disaster-period months that should not have accrued.
  // Interest on this excess runs from the Kwong due date (when FTP correctly starts).
  const ftpItem = results.items.find(i=>i.code.includes('FTP'));
  if (ftpItem && ftpItem.abatement > 0) {
    const endDate = penaltyPaidDate || accrualEnd;
    const intOnFTP = computeInterestOnAmount(ftpItem.abatement, KWONG_DUE, endDate);
    const work = [
      `FTP abatement: $${$(ftpItem.abatement)} (disaster-period months)`,
      `Interest on excess FTP from ${fmt(KWONG_DUE)} to ${fmt(endDate)}`,
      `Period: ${diffDays(KWONG_DUE,endDate)} days`,
      `Daily compounding per §6622: $${$(intOnFTP.total)}`,
    ];
    if (intOnFTP.total > 1.00) {
      results.items.push({code:'§6601 Int. on FTP', irsAssessed:intOnFTP.total, recomputed:0, abatement:intOnFTP.total, work});
      results.totalLine2 += intOnFTP.total;
    }
  }

  results.totalLine2 = Math.round(results.totalLine2*100)/100;
  // Conservative total: swap full §6622 interest for simplified
  const intItem = results.items.find(i=>i.code==='§6601 Interest');
  const intDiff = intItem && intItem.abateSimplified!==undefined ? Math.round((intItem.abatement - intItem.abateSimplified)*100)/100 : 0;
  results.totalConservative = Math.round((results.totalLine2 - intDiff)*100)/100;
  results.hasRange = intDiff > 0;
  const daysLeft = Math.max(0,Math.round((CLAIM_DEADLINE-new Date())/86400000));
  results.notes.push(`Claim deadline: ${fmt(CLAIM_DEADLINE)} (${daysLeft} days remaining)`);
 
  // Payment schedule summary for transparency
  if (p.payments.length > 0) {
    const payWork = [
      `── Payment Schedule (${p.payments.length} payments, $${$(p.payments.reduce((s,pay)=>s+pay.amount,0))}) ──`,
    ];
    let cumPaid = 0;
    for (const pay of p.payments) {
      cumPaid += pay.amount;
      const remainingTax = Math.max(0, p.netTax - cumPaid);
      const inD = inDisaster(pay.date);
      payWork.push(`  ${fmt(pay.date)}: $${$(pay.amount)} → cumulative $${$(cumPaid)}, tax remaining $${$(remainingTax)}${inD ? ' [disaster]' : ''}`);
    }
    // Account balance reconciliation
    const reconTax = p.taxGross - p.credits;
    const reconPen = p.est.assessed + p.ftp.assessed + p.ftf.assessed;
    const reconInt = p.interest.assessed;
    const reconBal = reconTax + reconPen + reconInt - cumPaid;
    payWork.push(``);
    payWork.push(`── Account Balance Reconciliation ──`);
    payWork.push(`Tax: $${$(reconTax)} + Penalties: $${$(reconPen)} + Interest: $${$(reconInt)} − Payments: $${$(cumPaid)}`);
    payWork.push(`= $${$(reconBal)}`);
    if (p.accruedInt > 0 || p.accruedPen > 0) {
      payWork.push(`Computed balance: $${$(reconBal)} (verify against transcript account balance)`);
    }
    results.paymentSchedule = payWork;
  }
 
  return results;
}

// ═══════════════════════════════════════════════════════════════
// WORK DETAIL COMPONENT
// ═══════════════════════════════════════════════════════════════
function WorkDetail({item}) {
  const [open, setOpen] = useState(false);
  const [ftpOpen, setFtpOpen] = useState(false);
 
  // Style for section headers inside the work detail
  const sectionStyle = {fontWeight:700, color:'#007cba', marginTop:8, borderBottom:'1px solid #b0c4d8', paddingBottom:2};
 
  return (
    <div style={{fontSize:12, color:'#4a5568'}}>
      <button onClick={()=>setOpen(!open)} style={{background:'none',border:'none',cursor:'pointer',color:'#007cba',fontSize:12,fontWeight:600,padding:'4px 0',textDecoration:'underline'}}>
        {open ? '▼ Hide work' : '▶ Show work'}
      </button>
      {open && (
        <div style={{background:'#eaf1f8',border:'1px solid #b0c4d8',borderRadius:4,padding:12,margin:'4px 0 8px',fontFamily:"'Ubuntu',sans-serif",fontSize:11,lineHeight:1.7,whiteSpace:'pre-wrap'}}>
          {item.work.map((w,i) => {
            // Render section headers with styling
            if (w.startsWith('──') && w.endsWith('──')) {
              return <div key={i} style={sectionStyle}>{w.replace(/──/g,'').trim()}</div>;
            }
            // Render empty lines as spacers
            if (w.trim() === '') return <div key={i} style={{height:6}} />;
            // Render NOTE lines with warning background
            if (w.startsWith('NOTE:')) {
              return <div key={i} style={{background:'#fff3cd',padding:'2px 6px',borderRadius:3,margin:'2px 0',fontSize:10}}>{w}</div>;
            }
            return <div key={i}>{w}</div>;
          })}
 
          {/* FTP month-by-month expandable table */}
          {item.ftpDetail && item.ftpDetail.length > 0 && (
            <>
              <button onClick={()=>setFtpOpen(!ftpOpen)} style={{background:'none',border:'none',cursor:'pointer',color:'#007cba',fontSize:11,fontWeight:600,padding:'4px 0',textDecoration:'underline',marginTop:8}}>
                {ftpOpen ? '▼ Hide month-by-month' : '▶ Show month-by-month FTP detail'}
              </button>
              {ftpOpen && (
                <div style={{marginTop:4,maxHeight:400,overflow:'auto'}}>
                  <table style={{width:'100%',fontSize:10,borderCollapse:'collapse'}}>
                    <thead><tr style={{borderBottom:'1px solid #b0c4d8',background:'#dce8f2'}}>
                      <th style={{textAlign:'left',padding:'3px 4px'}}>Mo</th>
                      <th style={{textAlign:'left'}}>Date</th>
                      <th style={{textAlign:'right'}}>Balance</th>
                      <th style={{textAlign:'center'}}>Rate</th>
                      <th style={{textAlign:'right'}}>FTP</th>
                      <th style={{textAlign:'right'}}>Paid</th>
                      <th style={{textAlign:'left'}}>Note</th>
                    </tr></thead>
                    <tbody>
                      {item.ftpDetail.map((m,i)=>{
                        const cumFTP = item.ftpDetail.slice(0,i+1).reduce((s,x)=>s+x.ftp,0);
                        return (
                          <tr key={i} style={{background:m.disaster?'#fff3cd':'transparent',borderBottom:'1px solid #e2e8f0'}}>
                            <td style={{padding:'2px 4px'}}>{m.month}</td>
                            <td>{m.date}</td>
                            <td style={{textAlign:'right',fontFamily:'monospace'}}>${$(m.balance)}</td>
                            <td style={{textAlign:'center'}}>{m.rate}</td>
                            <td style={{textAlign:'right',fontFamily:'monospace',color:m.ftp>0?'#2e8b57':'#888'}}>${$(m.ftp)}</td>
                            <td style={{textAlign:'right',fontFamily:'monospace',color:m.paid>0?'#007cba':'#ccc'}}>{m.paid>0?`$${$(m.paid)}`:'-'}</td>
                            <td style={{color:'#888',fontSize:9}}>{m.disaster?'DISASTER':''}{!m.disaster&&m.ftp>0?`cum $${$(Math.round(cumFTP*100)/100)}`:''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{borderTop:'2px solid #007cba',fontWeight:700}}>
                        <td colSpan={4} style={{padding:'3px 4px'}}>Total</td>
                        <td style={{textAlign:'right',fontFamily:'monospace',color:'#2e8b57'}}>
                          ${$(item.ftpDetail.reduce((s,m)=>s+m.ftp,0))}
                        </td>
                        <td style={{textAlign:'right',fontFamily:'monospace',color:'#007cba'}}>
                          ${$(item.ftpDetail.reduce((s,m)=>s+m.paid,0))}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
 

// ═══════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [text,setText]=useState('');
  const [parsed,setParsed]=useState(null);
  const [results,setResults]=useState(null);
  const [step,setStep]=useState(1);
  const [loading,setLoading]=useState(false);
  const [apiKey,setApiKey]=useState('');
  const [showSettings,setShowSettings]=useState(false);

  const handleParse = useCallback(()=>{
    const p=parseTranscript(text); setParsed(p);
    const r=runAnalysis(p); setResults(r); setStep(3);
  },[text]);

  const handlePDF = useCallback(async(file)=>{
    setLoading(true);
    try{
      if (!apiKey) { alert('Enter your Anthropic API key in Settings (gear icon).'); setLoading(false); return; }
      const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=()=>rej(new Error("Read failed"));r.readAsDataURL(file);});
      const apiUrl = import.meta.env.DEV ? '/api/anthropic/v1/messages' : 'https://api.anthropic.com/v1/messages';
      const resp=await fetch(apiUrl,{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:4000,
          messages:[{role:"user",content:[
            {type:"document",source:{type:"base64",media_type:"application/pdf",data:base64}},
            {type:"text",text:`Extract ALL text from this IRS Account Transcript. Format:\n\nHEADER: Include Tax Period, Form Number, Tax per return, Return due date or return received date, Processing date, Accrued interest, Accrued penalty, Account balance.\n\nTRANSACTIONS: Each on ONE line as:\nCODE  Description  CYCLE  MM-DD-YYYY  $AMOUNT\n\nExample:\n150   Tax return filed                               20231805  06-05-2023  $77,764.00\n806   W-2 or 1099 withholding                                  04-15-2023  -$51,938.00\n\nCRITICAL: 3-digit code, MM-DD-YYYY date, $AMOUNT on every line. ALL pages. Only transcript text.`}
          ]}]})});
      const data=await resp.json();
      if (!resp.ok) {
        alert(`API error (${resp.status}): ${data.error?.message || JSON.stringify(data)}`);
        setLoading(false); return;
      }
      const extracted=data.content?.find(c=>c.type==='text')?.text||'';
      setText(extracted);setStep(2);
    }catch(e){alert(`PDF extraction failed: ${e.message}`);}
    setLoading(false);
  },[apiKey]);

  const daysLeft=Math.max(0,Math.round((CLAIM_DEADLINE-new Date())/86400000));

  return (
    <div style={{fontFamily:'"Ubuntu",sans-serif',maxWidth:920,margin:'0 auto',padding:'24px 16px',color:'#007cba',lineHeight:1.6}}>
      <style>{`
       @import url('https://fonts.googleapis.com/css?family=Ubuntu:400,500,700&subset=greek,latin,greek-ext,vietnamese,cyrillic-ext,latin-ext,cyrillic');
        *{box-sizing:border-box;} .mono{font-family:'Ubuntu',sans-serif;font-size:13px;font-weight:500;}
        .card{background:#fff;border:1px solid #b0c4d8;border-radius:6px;padding:20px;margin:16px 0;box-shadow:0 1px 3px rgba(0,84,143,0.08);}
        .btn{padding:10px 24px;border:none;border-radius:4px;font-family:'Ubuntu',sans-serif;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.15s;}
        .btn-primary{background:#007cba;color:#fff;} .btn-primary:hover{background:#005a87;}
        .btn-secondary{background:#e8f0f7;color:#007cba;border:1px solid #b0c4d8;} .btn-secondary:hover{background:#d0e0f0;}
        textarea{width:100%;border:1px solid #b0c4d8;border-radius:4px;padding:12px;font-family:'Courier New',Courier,monospace;font-size:11px;line-height:1.6;resize:vertical;}
        textarea:focus{outline:none;border-color:#007cba;box-shadow:0 0 0 2px rgba(0,84,143,0.15);}
        table{width:100%;border-collapse:collapse;margin:12px 0;}
        th{text-align:left;padding:8px 12px;border-bottom:2px solid #007cba;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;}
        td{padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;}
        .amt{text-align:right;font-family:'Ubuntu',sans-serif;font-size:13px;font-weight:500;}
        .pos{color:#48C482;} .zero{color:#888;}
        .badge{display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;}
        .badge-warn{background:#fff3cd;color:#856404;} .badge-ok{background:#d4f0e2;color:#2e8b57;} .badge-dead{background:#fde0de;color:#d94535;}
        .drop-zone{border:2px dashed #b0c4d8;border-radius:8px;padding:40px;text-align:center;cursor:pointer;transition:all 0.2s;}
        .drop-zone:hover{border-color:#007cba;background:#eaf1f8;}
        hr.div{border:none;border-top:1px solid #d0e0f0;margin:20px 0;}
        @media(max-width:600px){
          textarea{font-size:9px !important;line-height:1.4 !important;padding:8px !important;}
          .card{padding:12px;margin:10px 0;}
          th,td{padding:4px 6px;font-size:12px;}
          .amt{font-size:11px;}
          pre{font-size:9px !important;overflow-x:auto;}
        }
      `}</style>

      <div style={{borderBottom:'3px solid #007cba',paddingBottom:12,marginBottom:24}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
          <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
            <LASLogo size={65} />
            <div>
<h1 style={{margin:0,fontSize:'clamp(18px, 4vw, 28px)',fontWeight:700,letterSpacing:'-0.5px'}}>Kwong v. United States</h1>
              <span style={{fontSize:15,color:'#4a5568'}}>Form 843 Computation Tool</span>
              <div style={{marginTop:4}}>
                <span style={{display:'inline-block',padding:'3px 10px',borderRadius:3,fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',
                  background:daysLeft<30?'#FB6962':'#007cba',color:'#fff'}}>
                  {daysLeft} days until deadline
                </span>
              </div>
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
            {!apiKey && (
              <span style={{fontSize:11,color:'#856404',background:'#fff3cd',padding:'2px 8px',borderRadius:3,marginBottom:4,whiteSpace:'nowrap'}}>
                Start here: Enter API key
              </span>
            )}
            <button onClick={()=>setShowSettings(!showSettings)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,padding:4}} title="Settings">⚙️</button>
          </div>
        </div>
        {showSettings && (
          <div style={{marginTop:12,padding:16,background:'#e8f0f7',borderRadius:6,fontSize:13}}>
            <div style={{fontWeight:600,marginBottom:8}}>API Key (for PDF scanning)</div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)}
                placeholder="sk-ant-..." style={{flex:1,padding:'6px 10px',border:'1px solid #b0c4d8',borderRadius:4,fontFamily:"'Ubuntu',sans-serif",fontSize:12}} />
              <span style={{color:apiKey?'#48C482':'#888'}}>{apiKey?'✓ Set':'Not set'}</span>
            </div>
            <div style={{marginTop:6,color:'#4a5568',fontSize:11}}>
              Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{color:'#007cba'}}>console.anthropic.com</a>.
              Stored in browser memory only. Never logged or shared. Required for PDF upload. Not needed for text paste.
            </div>
          </div>
        )}
      </div>

      {step<=2 && (
        <div className="card">
          <h2 style={{margin:'0 0 16px',fontSize:20}}>{step===1?'1. Upload Transcript':'2. Review Extracted Text'}</h2>
          {step===1 && (<>
            <div className="drop-zone" onClick={()=>document.getElementById('pdf-input').click()}
              onDragOver={e=>{e.preventDefault();}} onDrop={e=>{e.preventDefault();if(e.dataTransfer.files[0])handlePDF(e.dataTransfer.files[0]);}}>
              <input id="pdf-input" type="file" accept=".pdf,.txt" style={{display:'none'}}
                onChange={e=>{const f=e.target.files[0];if(!f)return;if(f.name.endsWith('.txt')){const r=new FileReader();r.onload=()=>{setText(r.result);setStep(2);};r.readAsText(f);}else handlePDF(f);}} />
              {loading?<div style={{fontSize:16}}>Scanning transcript... ⏳</div>:
              <><div style={{fontSize:18,fontWeight:600,marginBottom:8}}>Drop PDF or text file here</div>
              <div style={{fontSize:14,color:'#4a5568'}}>or click to browse • Scanned PDFs supported via transcription</div></>}
            </div>
            <hr className="div" />
<div style={{textAlign:'center',color:'#4a5568',fontSize:13,margin:'8px 0'}}>or paste transcript text</div>
<textarea rows={20} value={text} onChange={e=>setText(e.target.value)} placeholder={`HEADER:
- Form Number: 1040
- Tax Period: 12-31-2021
- Tax Per Return: $42,318.00
- Return Due Date or Return Received Date: 09-14-2022
- Processing Date: 11-07-2022
- Accrued Interest: $3,741.22 (As of: 03-24-2026)
- Accrued Penalty: $4,085.63 (As of: 03-24-2026)
- Account Balance: $18,276.44

TRANSACTIONS:
150   Tax return filed                               20223105  11-07-2022   $42,318.00
806   W-2 or 1099 withholding                                  04-15-2022  -$29,451.00
166   Penalty for filing tax return after due date   20223305  11-07-2022      $837.92
276   Penalty for late payment of tax                20223305  11-07-2022      $193.04
196   Interest charged for late payment              20223305  11-07-2022      $211.57
971   Notice issued CP 0014                                    11-07-2022        $0.00
960   Appointed representative                                 01-18-2023        $0.00
530   Balance due account currently not collectible            06-22-2024        $0.00
610   Payment with return                                      09-14-2022     -$412.00
670   Payment                                                  05-19-2025     -$125.00
290   Disallowed claim                               20241205  07-08-2024        $0.00`} />
<div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',padding:'8px 0',fontSize:12}}>
              <button onClick={()=>document.getElementById('format-guide').toggleAttribute('hidden')}
                style={{background:'none',border:'none',cursor:'pointer',color:'#007cba',fontSize:12,fontWeight:600,textDecoration:'underline'}}>
                📋 Show format guide
              </button>
              <a href="https://youtu.be/lQ2UWYlmTog?si=x8fBHZxTHDGbXqQz" target="_blank" rel="noreferrer"
                style={{color:'#007cba',fontSize:12,fontWeight:600,textDecoration:'underline',cursor:'pointer'}}>
                ▶️ Watch tutorial [Youtube]
              </a>
              <a href="https://github.com/rl05262n/kwong-app1" target="_blank" rel="noreferrer"
                style={{color:'#007cba',fontSize:12,fontWeight:600,textDecoration:'underline',cursor:'pointer'}}>
                ⚙️ Source code
              </a>
            </div>
            <div id="format-guide" hidden style={{background:'#eaf1f8',border:'1px solid #b0c4d8',borderRadius:4,padding:12,marginBottom:8,fontSize:11,fontFamily:"'Ubuntu',sans-serif",lineHeight:1.6,color:'#4a5568'}}>
              <strong style={{color:'#007cba'}}>Expected Format:</strong>
              <pre style={{margin:'6px 0 0',whiteSpace:'pre',overflowX:'auto',fontSize:11,color:'#4a5568'}}>{`HEADER (include all that appear on transcript):
- Form Number: 1040
- Tax Period: 12-31-2021
- Tax Per Return: $42,318.00
- Return Due Date or Return Received Date: 09-14-2022
- Processing Date: 11-07-2022
- Accrued Interest: $3,741.22 (As of: 03-24-2026)
- Accrued Penalty: $4,085.63 (As of: 03-24-2026)
- Account Balance: $18,276.44

TRANSACTIONS (include ALL lines, even $0.00):
150   Tax return filed                               20223105  11-07-2022   $42,318.00
806   W-2 or 1099 withholding                                  04-15-2022  -$29,451.00
166   Penalty for filing tax return after due date   20223305  11-07-2022      $837.92
276   Penalty for late payment of tax                20223305  11-07-2022      $193.04
196   Interest charged for late payment              20223305  11-07-2022      $211.57
971   Notice issued CP 0014                                    11-07-2022        $0.00
960   Appointed representative                                 01-18-2023        $0.00
530   Balance due account currently not collectible            06-22-2024        $0.00
610   Payment with return                                      09-14-2022     -$412.00
670   Payment                                                  05-19-2025     -$125.00
290   Disallowed claim                               20241205  07-08-2024        $0.00

KEY: Each transaction line needs three things:
  1. 3-digit code (e.g. 150, 806, 166, 276, 196, 610, 670, 290)
  2. Date in MM-DD-YYYY format (e.g. 11-07-2022)
  3. Dollar amount with $ sign (e.g. $837.92 or -$29,451.00)
Cycle column (8 digits) is optional — skip it if not on transcript.
Negative amounts = credits, withholding, or payments.
$0.00 lines (971, 960, 530) are informational — include them anyway.
Descriptions between code and date can be any text.`}</pre>
            </div>
            <div style={{display:'flex',gap:8,marginTop:12}}>
              <button className="btn btn-primary" onClick={()=>{if(text.trim())setStep(2);}} disabled={!text.trim()}>Continue →</button>
            </div>
          </>)}
          {step===2 && (<>
            <div style={{fontSize:14,color:'#4a5568',marginBottom:12}}>Review and correct before computing.</div>
            <textarea rows={20} value={text} onChange={e=>setText(e.target.value)} />
            <div style={{display:'flex',gap:8,marginTop:12}}>
              <button className="btn btn-primary" onClick={handleParse}>Compute Form 843 →</button>
              <button className="btn btn-secondary" onClick={()=>setStep(1)}>← Back</button>
            </div>
          </>)}
        </div>
      )}

      {step===3 && parsed && results && (<>
        <div className="card">
          <h2 style={{margin:'0 0 12px',fontSize:20}}>Transcript Summary</h2>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:'8px 24px',fontSize:14}}>
            <div><strong>Tax Year:</strong> {parsed.taxYear}</div>
            <div><strong>Form:</strong> {parsed.formType}</div>
            <div><strong>Due Date:</strong> {fmt(parsed.statutoryDue)}</div>
            <div><strong>Filed:</strong> {fmt(parsed.filedDate)}</div>
            <div><strong>Gross Tax:</strong> <span className="mono">${$(parsed.taxGross)}</span></div>
            <div><strong>Credits:</strong> <span className="mono">${$(parsed.credits)}</span></div>
            <div><strong>Net Tax Due:</strong> <span className="mono" style={{fontWeight:700}}>${$(parsed.netTax)}</span></div>
            <div><strong>Payments:</strong> {parsed.payments.length}</div>
            {parsed.accruedInt>0&&<div><strong>Accrued Interest:</strong> <span className="mono">${$(parsed.accruedInt)}</span></div>}
            {parsed.accruedPen>0&&<div><strong>Accrued Penalty:</strong> <span className="mono">${$(parsed.accruedPen)}</span></div>}
            {parsed.iaDate&&<div><strong>IA:</strong> {fmt(parsed.iaDate)} <span className="badge badge-warn">§6651(h)</span></div>}
          </div>
          {parsed.parseWarnings.length>0&&<div style={{marginTop:12,padding:12,background:'#fff3cd',borderRadius:4,fontSize:13}}>{parsed.parseWarnings.map((w,i)=><div key={i}>⚠️ {w}</div>)}</div>}
        </div>

        <div className="card">
          <h2 style={{margin:'0 0 12px',fontSize:20}}>Kwong Computation</h2>
          <table><thead><tr>
            <th>Component</th>
            <th className="amt">IRS Amount</th>
            <th className="amt">Recomputed</th>
            {results.hasRange ? (<>
              <th className="amt" style={{fontSize:11,lineHeight:1.3}}>Abatement<br/><span style={{fontWeight:400,fontSize:10,color:'#4a5568'}}>(full §6622)</span></th>
              <th className="amt" style={{fontSize:11,lineHeight:1.3}}>Abatement<br/><span style={{fontWeight:400,fontSize:10,color:'#4a5568'}}>(conservative)</span></th>
            </>) : (
              <th className="amt">Abatement</th>
            )}
          </tr></thead><tbody>
            {results.items.map((item,i)=>{
              const hasAlt = results.hasRange && item.abateSimplified !== undefined;
              const conservativeAmt = hasAlt ? item.abateSimplified : item.abatement;
              return (
              <tr key={i}>
                <td>
                  <div style={{fontWeight:600}}>{item.code}</div>
                  <WorkDetail item={item} />
                </td>
                <td className="amt">${$(item.irsAssessed)}</td>
                <td className="amt">${$(item.recomputed)}</td>
                <td className={`amt ${item.abatement>0?'pos':'zero'}`} style={{fontWeight:600}}>
                  ${$(item.abatement)}
                </td>
                {results.hasRange && (
                  <td className={`amt ${conservativeAmt>0?'pos':'zero'}`}
                    style={{fontWeight:600, color: hasAlt && conservativeAmt !== item.abatement ? '#856404' : undefined}}>
                    ${$(conservativeAmt)}
                    {hasAlt && conservativeAmt !== item.abatement && (
                      <div style={{fontSize:9,fontWeight:400,color:'#856404'}}>principal only</div>
                    )}
                  </td>
                )}
              </tr>
              );
            })}
          </tbody><tfoot>
            <tr style={{borderTop:'2px solid #007cba'}}>
              <td style={{fontWeight:700,fontSize:16}}>Form 843 Line 2</td>
              <td></td><td></td>
              <td className="amt pos" style={{fontWeight:700,fontSize:18}}>${$(results.totalLine2)}</td>
              {results.hasRange && (
                <td className="amt" style={{fontWeight:700,fontSize:18,color:'#4a5568'}}>${$(results.totalConservative)}</td>
              )}
            </tr>
            {results.hasRange && (
              <tr><td colSpan={5} style={{fontSize:11,color:'#888',paddingTop:4}}>
                Full §6622 = interest compounds daily per IRS methodology. Conservative = interest on declining tax principal only (lower bound). The difference (${$((results.totalLine2 - results.totalConservative))}) is interest-on-interest. Request IRS recompute with corrected start date.
              </td></tr>
            )}
          </tfoot></table>
        </div>
        {results.paymentSchedule && (
          <div className="card">
            <details>
              <summary style={{cursor:'pointer',fontWeight:600,fontSize:16,color:'#007cba',padding:'4px 0'}}>
                📊 Payment Schedule & Account Reconciliation ({parsed.payments.length} payments)
              </summary>
              <div style={{background:'#eaf1f8',border:'1px solid #b0c4d8',borderRadius:4,padding:12,marginTop:8,fontFamily:"'Ubuntu',sans-serif",fontSize:11,lineHeight:1.7,whiteSpace:'pre-wrap',maxHeight:500,overflow:'auto'}}>
                {results.paymentSchedule.map((w,i) => {
                  if (w.startsWith('──') && w.endsWith('──')) {
                    return <div key={i} style={{fontWeight:700,color:'#007cba',marginTop:8,borderBottom:'1px solid #b0c4d8',paddingBottom:2}}>{w.replace(/──/g,'').trim()}</div>;
                  }
                  if (w.trim() === '') return <div key={i} style={{height:6}} />;
                  // Highlight disaster-period payments
                  if (w.includes('[disaster]')) {
                    return <div key={i} style={{background:'#fff3cd',padding:'1px 4px',borderRadius:2}}>{w}</div>;
                  }
                  return <div key={i}>{w}</div>;
                })}
              </div>
            </details>
          </div>
        )}
        {results.notes.length>0&&<div className="card" style={{fontSize:13}}>
          {results.notes.map((n,i)=><div key={i} style={{padding:'2px 0'}}>📋 {n}</div>)}
        </div>}

        <div className="card" style={{fontSize:13,color:'#4a5568'}}>
          <strong>Legal Basis:</strong> I.R.C. § 7508A(d) (2019 version); <em>Kwong v. United States</em>, 179 Fed. Cl. 382 (2025); <em>Abdo v. Commissioner</em>, 162 T.C. 148 (2024). Disaster period: Jan 20, 2020 – Jul 10, 2023. Computation aid only, verify per Circular 230 § 10.22.
        </div>

        <div style={{display:'flex',gap:8,margin:'16px 0'}}>
          <button className="btn btn-secondary" onClick={()=>{setStep(2);setResults(null);setParsed(null);}}>← Edit</button>
          <button className="btn btn-secondary" onClick={()=>{setText('');setStep(1);setResults(null);setParsed(null);}}>New Transcript</button>
        </div>
      </>)}
    </div>
  );
}
