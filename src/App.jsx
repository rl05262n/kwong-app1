import { useState, useCallback } from "react";
import lasLogo from './The_Legal_Aid_Society_logo.png';
import Form843Panel from './form843.jsx';
// CONSTANTS
const DISASTER_START = new Date(2020, 0, 20);
const DISASTER_END = new Date(2023, 6, 10);   // last disregarded day
const KWONG_DUE = new Date(2023, 6, 10);      // postponed deadline under Kwong
const POSTPONED_FIRST = new Date(2023, 6, 11); // first day after the disregarded period
const CLAIM_DEADLINE = new Date(2026, 6, 10);

const RATES = [
  [2019,1,0.06],[2019,2,0.06],[2019,3,0.05],[2019,4,0.05],
  [2020,1,0.05],[2020,2,0.05],[2020,3,0.03],[2020,4,0.03],
  [2021,1,0.03],[2021,2,0.03],[2021,3,0.03],[2021,4,0.03],
  [2022,1,0.03],[2022,2,0.04],[2022,3,0.05],[2022,4,0.06],
  [2023,1,0.07],[2023,2,0.07],[2023,3,0.07],[2023,4,0.08],
  [2024,1,0.08],[2024,2,0.08],[2024,3,0.08],[2024,4,0.08],
  [2025,1,0.07],[2025,2,0.07],[2025,3,0.07],[2025,4,0.07],
  [2026,1,0.07],   // Rev. Rul. 2025-22
  [2026,2,0.06],   // Rev. Rul. 2026-5
  [2026,3,0.07],   // Q3 2026 — update when Q4 2026 is announced
];
// Last day covered by the table; getRate() falls back to 7% past this, and
// runAnalysis raises a warning so the fallback is never silent.
const RATE_TABLE_END = (()=>{const L=RATES[RATES.length-1];return new Date(L[0], L[1]*3, 0);})();

// COVID-postponed filing/payment due dates (IRS notices) — used for
// FTF/FTP(a)(2) timeliness on tax SHOWN on the return.
const DUE_DATES = {"1040-2019":"2020-07-15","1040-2020":"2021-05-17","1040-2021":"2022-04-18","1040-2022":"2023-04-18"};
// ORIGINAL statutory due dates — §6601 deficiency interest runs from these,
// NOT from the COVID-postponed dates (the IRS computes deficiency interest
// from the original due date; verified by reconstruction).
const ORIG_DUE = {"1040-2019":"2020-04-15","1040-2020":"2021-04-15","1040-2021":"2022-04-18","1040-2022":"2023-04-18"};
// §7503 moves the ACT deadline (filing/payment timeliness) to the next
// business day, but §6601 interest still runs from the prescribed 15th when
// the 15th fell on a weekend/holiday — verified against transcript data
// (TY2022: $265.24 = 51 days from 4/15/2023 on tax + FTF, not 48 from 4/18).
const INT_START_OVERRIDE = {"1040-2021":"2022-04-15","1040-2022":"2023-04-15"};
const MIN_PENALTY = {2020:435,2021:435,2022:435,2023:450,2024:485,2025:510,2026:530};

const TC_MAP = {
  "150":{type:"tax"},"300":{type:"tax_adj",sign:1},"290":{type:"tax_adj",sign:1},"291":{type:"tax_adj",sign:-1},
  "806":{type:"credit"},"766":{type:"credit"},"846":{type:"credit_offset"},
  "160":{type:"pen",code:"FTF",sign:1},"166":{type:"pen",code:"FTF",sign:1},"270":{type:"pen",code:"FTF",sign:1},
  "161":{type:"pen",code:"FTF",sign:-1},"167":{type:"pen",code:"FTF",sign:-1},
  "176":{type:"pen",code:"FTP",sign:1},"276":{type:"pen",code:"FTP",sign:1},
  "177":{type:"pen",code:"FTP",sign:-1},"271":{type:"pen",code:"FTP",sign:-1},"277":{type:"pen",code:"FTP",sign:-1},
  "170":{type:"pen",code:"EST",sign:1},"173":{type:"pen",code:"EST",sign:1},"171":{type:"pen",code:"EST",sign:-1},
  // P3: §6662/§6663 accuracy-related & misc penalties (TC 240/241) — previously
  // unparsed, which silently dropped the penalty from every computation.
  "240":{type:"pen",code:"ACC",sign:1},"241":{type:"pen",code:"ACC",sign:-1},
  "196":{type:"int",sign:1},"197":{type:"int",sign:-1},"336":{type:"int",sign:1},"337":{type:"int",sign:-1},
  "340":{type:"pen_int",sign:1},"341":{type:"pen_int",sign:-1},
  "610":{type:"pay"},"670":{type:"pay"},"680":{type:"pay"},"706":{type:"pay"},
  "671":{type:"pay_rev"},"672":{type:"acct_adj"},"460":{type:"ext"},"922":{type:"info"},
  "960":{type:"info"},"971":{type:"info"},"582":{type:"info"},"360":{type:"info"},"530":{type:"info"},
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
const MON={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
const d = (s) => { if(!s)return null; if(s instanceof Date)return s; let p=String(s).match(/(\d{4})-(\d{2})-(\d{2})/); if(p)return new Date(+p[1],+p[2]-1,+p[3]); p=String(s).match(/(\d{2})[-/](\d{2})[-/](\d{4})/); if(p)return new Date(+p[3],+p[1]-1,+p[2]); p=String(s).match(/([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/); if(p){const mn=MON[p[1].toLowerCase().slice(0,3)];if(mn!==undefined)return new Date(+p[3],mn,+p[2]);} return null; };
const fmt = (dt) => dt?`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`:'';
const diffDays = (a,b) => Math.round((b-a)/86400000);
const isLeap = (y) => (y%4===0&&y%100!==0)||y%400===0;
const daysInYear = (y) => isLeap(y)?366:365;
const inDisaster = (dt) => dt>=DISASTER_START && dt<=DISASTER_END;
const $ = (n) => n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const r2 = (n) => Math.round(n*100)/100;
function getRate(dt) { const y=dt.getFullYear(),q=Math.floor(dt.getMonth()/3)+1; const r=RATES.find(([ry,rq])=>ry===y&&rq===q); return r?r[2]:0.07; }
// Month stepper that preserves the anchor day (clamping only when the target
// month is shorter, e.g. anchor 31 → Feb 28). Replaces the old min(date,28)
// clamp, which silently shifted every anchor of 29–31 to the 28th.
function addMonthAnchored(dt, anchorDay) {
  let m=dt.getMonth()+1, y=dt.getFullYear(); if(m>11){m=0;y++;}
  const dim=new Date(y,m+1,0).getDate();
  return new Date(y,m,Math.min(anchorDay,dim));
}
function addDays(dt,n){ const x=new Date(dt); x.setDate(x.getDate()+n); return x; }
// Weekend-skipping business-day adder for §6651(a)(3): the payment window is
// 10 business days (not 21 calendar days) when the notice-and-demand amount
// is ≥ $100,000. Federal holidays are NOT modeled — flagged in the work text.
function addBusinessDays(dt,n){ let x=new Date(dt),c=0; while(c<n){ x=addDays(x,1); const w=x.getDay(); if(w!==0&&w!==6)c++; } return x; }

// ═══════════════════════════════════════════════════════════════
// PARSER
// ═══════════════════════════════════════════════════════════════
// Returns aggregates AND dated event lists. The event lists are what the
// new engine anchors to (P1): every abatement is computed against an actual
// assessed amount on the transcript, never against a modeled hypothetical.
function parseTranscript(text) {
  const lines = text.split('\n');
  const h = {taxYear:'',formType:'1040',rrd:null,dueDate:null,accruedInt:0,accruedPen:0,accruedAsOf:null,iaDate:null,levyNoticeDate:null,taxPerReturn:0,processingDate:null,accountBalance:null};
  // Date-proof amount grabber for "Accrued interest/penalty" header variants.
  // Tries, in order: (P0) embedded "(as of DATE)" then amount; (P1) $-anchored
  // decimal within 60 chars, never crossing into another "Accrued" label;
  // (P2) decimal amount with a digit-free gap; (P3) integer amount guarded
  // against capturing a date fragment. Returns {v, asOf?} or null.
  const grabAmt=(s,label)=>{let m;
    if((m=s.match(new RegExp(label+String.raw`\s*\(?\s*as\s+of:?\s*([\d/-]{8,10})\s*\)?:?[^\d.]{0,15}\$?\s?([\d,]+\.?\d*)`,'i'))))return{v:parseFloat(m[2].replace(/,/g,'')),asOf:m[1]};
    if((m=s.match(new RegExp(label+String.raw`(?:(?!accrued)[^\n]){0,60}?\$\s?([\d,]+\.\d{2})`,'i'))))return{v:parseFloat(m[1].replace(/,/g,''))};
    if((m=s.match(new RegExp(label+String.raw`[^\d.]{0,40}([\d,]+\.\d{1,2})`,'i'))))return{v:parseFloat(m[1].replace(/,/g,''))};
    if((m=s.match(new RegExp(label+String.raw`[^\d.]{0,40}\$?\s?([\d,]+)(?![\d,]*[-/.]\d)`,'i'))))return{v:parseFloat(m[1].replace(/,/g,''))};
    return null;};
  const pens = {FTF:{a:0,r:0,events:[]},FTP:{a:0,r:0,events:[]},EST:{a:0,r:0,events:[]},ACC:{a:0,r:0,events:[]}};
  let interest={a:0,r:0}, penInterest={a:0,r:0}, taxGross=0, tax150=0, credits=0, tc150date=null;
  const intEvents=[], taxAdjEvents=[], payments=[], creditEvents=[], unmatchedLines=[];

  for (const line of lines) {
    const lc = line.trim(); let m;
    // Tax year — try many formats
    if (!h.taxYear&&(m=lc.match(/(?:Tax Period|Period Ending)[:\s]+\w+\.?\s*\d+,?\s*(\d{4})/i))) h.taxYear=m[1];
    if (!h.taxYear&&(m=lc.match(/Tax\s+Period\s+Ending[:\s]+\d{2}-\d{2}-(\d{4})/i))) h.taxYear=m[1];
    if (!h.taxYear&&(m=lc.match(/Period\s+Ending[:\s]*(\d{2}[-/]\d{2}[-/]\d{4})/i))) { const pd=m[1].split(/[-/]/); h.taxYear=pd[2]; }
    if (!h.taxYear&&(m=lc.match(/Tax\s+(?:Year|Period)[:\s]+(\d{4})/i))) h.taxYear=m[1];
    if (!h.taxYear&&(m=lc.match(/12[-/]31[-/](\d{4})/))&&/period|ending|tax year/i.test(lc)) h.taxYear=m[1];
    if (!h.rrd&&(m=lc.match(/return\s+received\s+date[^0-9]{0,40}(\d{1,2}[-/]\d{1,2}[-/]\d{4})/i))) h.rrd=d(m[1]);
    if (!h.rrd&&(m=lc.match(/(?:received\s+date|whichever\s+is\s+later)[^A-Za-z0-9]{0,20}([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4})/i))) h.rrd=d(m[1]);
    if (!h.dueDate&&!/received\s+date|whichever/i.test(lc)&&(m=lc.match(/Return\s+Due\s+Date[^0-9]{0,20}(\d{1,2}[-/]\d{1,2}[-/]\d{4})/i))) h.dueDate=d(m[1]);
    if (!h.dueDate&&!/received\s+date|whichever/i.test(lc)&&(m=lc.match(/Return\s+Due\s+Date.*?([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4})/i))) h.dueDate=d(m[1]);
    if (!h._accrIntSeen&&/accrued\s+interest/i.test(lc)){const g=grabAmt(lc,String.raw`accrued\s+interest`);if(g){h.accruedInt=g.v;h._accrIntSeen=true;if(g.asOf&&!h.accruedAsOf)h.accruedAsOf=d(g.asOf);}}
    if (!h._accrPenSeen&&/accrued\s+penalt/i.test(lc)){const g=grabAmt(lc,String.raw`accrued\s+penalt\w*`);if(g){h.accruedPen=g.v;h._accrPenSeen=true;if(g.asOf&&!h.accruedAsOf)h.accruedAsOf=d(g.asOf);}}
    if (h.accountBalance===null&&!/plus\s+accrual/i.test(lc)&&(m=lc.match(/Account\s+balance[^\d.-]{0,40}(-?)\$?\s?([\d,]+\.?\d*)/i))) h.accountBalance=parseFloat((m[1]||'')+m[2].replace(/,/g,''));
    if (!h.accruedAsOf&&(m=lc.match(/As\s+of[^0-9]{0,15}(\d{1,2}[-/]\d{1,2}[-/]\d{4})/i))) h.accruedAsOf=d(m[1]);
    if (!h.accruedAsOf&&(m=lc.match(/As\s+of[^A-Za-z0-9]{0,10}([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4})/i))) h.accruedAsOf=d(m[1]);
    if (!h._requestDate&&(m=lc.match(/(?:Request|Response)\s+Date[^0-9]{0,20}(\d{1,2}[-/]\d{1,2}[-/]\d{4})/i))) h._requestDate=d(m[1]);
    if ((m=lc.match(/Form\s+Number[:\s]+(\d{3,4})/i))) h.formType=m[1];
    if ((m=lc.match(/Tax\s+per\s+return[:\s]+\$?([\d,]+\.?\d*)/i))) h.taxPerReturn=parseFloat(m[1].replace(/,/g,''));
    if ((m=lc.match(/Processing\s+date[:\s]+(\d{2}[-/]\d{2}[-/]\d{4})/i))) h.processingDate=d(m[1]);
    if (!h.processingDate&&(m=lc.match(/Processing\s+date.*?([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4})/i))) h.processingDate=d(m[1]);
    if (/[Ii]nstallment\s+agreement/i.test(lc)) { const dm=lc.match(/(\d{2}[-/]\d{2}[-/]\d{4})/); if(dm)h.iaDate=d(dm[1]); }
    if (/intent\s+to\s+levy|levy\s+issued|notice\s+of\s+levy|CP\s*0?504|LT\s*11/i.test(lc)) {
      const dm=lc.match(/(\d{2}[-/]\d{2}[-/]\d{4})/);
      if(dm){const dt=d(dm[1]); if(dt&&(!h.levyNoticeDate||dt<h.levyNoticeDate))h.levyNoticeDate=dt;}
    }

    let txm=lc.match(/^(\d{3})\s+.+?\s+(?:\d{8}\s+)?(\d{2}-\d{2}-\d{4})\s+(-?\$?[\d,]+\.\d{2})$/);
    if(!txm) txm=lc.match(/^(\d{3})\s+.+?(\d{2}-\d{2}-\d{4})\s+(-?\$?[\d,]+\.\d{2})/);
    if(!txm) txm=lc.match(/^(\d{3})[|\t]\s*.+?(\d{2}-\d{2}-\d{4})\s+(-?\$?[\d,]+\.\d{2})/);
    if(!txm){const t4=lc.match(/^(\d{3})\s+.+?(\d{2}-\d{2}-\d{4})\s+(-?\$?[\d,]+)$/);if(t4&&!t4[3].match(/\d{4}$/))txm=[null,t4[1],t4[2],t4[3]+'.00'];}
    if(!txm){const t5=lc.match(/^(\d{3})\s+.+?(\d{2}\/\d{2}\/\d{4})\s+(-?\$?[\d,]+\.?\d*)/);if(t5)txm=[null,t5[1],t5[2].replace(/\//g,'-'),t5[3]];}
    if(!txm){if(/^\d{3}\s+/.test(lc)&&/\d{2}.\d{2}.\d{4}/.test(lc))unmatchedLines.push(lc);continue;}

    const tc=txm[1],txDate=d(txm[2]); let as=txm[3].replace(/[$,]/g,''); if(!as.includes('.'))as+='.00';
    const amt=parseFloat(as); const info=TC_MAP[tc]; if(!info)continue;

    if(info.type==='pen'){const b=pens[info.code];if(info.sign>0)b.a+=Math.abs(amt);else b.r+=Math.abs(amt);if(txDate&&amt!==0)b.events.push({date:txDate,amount:Math.abs(amt)*info.sign,tc});}
    else if(info.type==='int'){if(info.sign>0)interest.a+=Math.abs(amt);else interest.r+=Math.abs(amt);if(txDate&&amt!==0)intEvents.push({date:txDate,amount:Math.abs(amt)*info.sign,tc});}
    else if(info.type==='pen_int'){if(info.sign>0)penInterest.a+=Math.abs(amt);else penInterest.r+=Math.abs(amt);if(txDate&&amt!==0)intEvents.push({date:txDate,amount:Math.abs(amt)*info.sign,tc});}
    else if(info.type==='tax'){const v=Math.abs(amt);taxGross+=v-tax150;tax150=v;tc150date=txDate;}
    else if(info.type==='tax_adj'){const v=Math.abs(amt)*(info.sign||1);taxGross+=v;if(txDate&&amt!==0)taxAdjEvents.push({date:txDate,amount:v,tc});}
    else if(info.type==='credit'){credits+=Math.abs(amt);if(txDate&&amt!==0)creditEvents.push({date:txDate,amount:-Math.abs(amt),tc});}
else if(info.type==='credit_offset'){credits-=Math.abs(amt);if(txDate&&amt!==0)creditEvents.push({date:txDate,amount:Math.abs(amt),tc});}
    else if(info.type==='pay'){if(txDate&&amt!==0)payments.push({date:txDate,amount:Math.abs(amt),tc});}
    else if(info.type==='pay_rev'){if(txDate&&amt!==0)payments.push({date:txDate,amount:-Math.abs(amt),tc});}
  }

  // ── Second-chance header pass over whitespace-flattened text ──
  // PDF extraction sometimes wraps or reflows the header block across lines;
  // rescue the critical fields from a flattened copy before any fallback.
  {
    const flat=text.replace(/\s+/g,' ');let fm;
    if (!h.rrd&&(fm=flat.match(/return\s+received\s+date[^0-9]{0,60}(\d{1,2}[-/]\d{1,2}[-/]\d{4})/i))) h.rrd=d(fm[1]);
    if (!h.rrd&&(fm=flat.match(/(?:received\s+date|whichever\s+is\s+later)[^A-Za-z0-9]{0,25}([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4})/i))) h.rrd=d(fm[1]);
    if (!h._accrIntSeen){const g=grabAmt(flat,String.raw`accrued\s+interest`);if(g){h.accruedInt=g.v;h._accrIntSeen=true;if(g.asOf&&!h.accruedAsOf)h.accruedAsOf=d(g.asOf);}}
    if (!h._accrPenSeen){const g=grabAmt(flat,String.raw`accrued\s+penalt\w*`);if(g){h.accruedPen=g.v;h._accrPenSeen=true;if(g.asOf&&!h.accruedAsOf)h.accruedAsOf=d(g.asOf);}}
    if (!h.accruedAsOf&&(fm=flat.match(/as\s+of[^0-9]{0,15}(\d{1,2}[-/]\d{1,2}[-/]\d{4})/i))) h.accruedAsOf=d(fm[1]);
    if (h.accountBalance===null&&(fm=flat.match(/account\s+balance(?!\s+plus)[^\d.-]{0,40}(-?)\$?\s?([\d,]+\.?\d*)/i))) h.accountBalance=parseFloat((fm[1]||'')+fm[2].replace(/,/g,''));
    if (!h._requestDate&&(fm=flat.match(/(?:request|response)\s+date[^0-9]{0,20}(\d{1,2}[-/]\d{1,2}[-/]\d{4})/i))) h._requestDate=d(fm[1]);
  }

  if(taxGross===0&&h.taxPerReturn>0){taxGross=h.taxPerReturn;tax150=h.taxPerReturn;}
  // Filed-date inference chain. Anything other than the transcript's own
  // "received date" header is an approximation and is disclosed loudly:
  // a TC 610 "payment with return" normally accompanies the return (close);
  // the TC 150 date is a POSTING/processing artifact (often weeks late).
  let filedDate=h.rrd, filedSource='header', filedFromPayment=false;
  if(!filedDate){
    const tc610=payments.filter(x=>x.tc==='610'&&x.amount>0).sort((a,b)=>a.date-b.date)[0];
    if(tc610&&tc150date){filedDate=tc610.date<tc150date?tc610.date:tc150date;filedSource='tc610';}
    else if(tc610){filedDate=tc610.date;filedSource='tc610';}
    else if(tc150date){filedDate=tc150date;filedSource='tc150';}
  }
  if(!filedDate){const p0=payments.find(p=>p.amount>0);if(p0){filedDate=p0.date;filedSource='payment';filedFromPayment=true;}}
  const netTax=Math.max(0,r2(taxGross-credits));
  const deficiencyTotal=r2(taxAdjEvents.reduce((s,e)=>s+e.amount,0));
  const isDeficiency=deficiencyTotal>0.005;
  // Tax shown on the return that remained unpaid after credits (basis for
  // §6651(a)(2) FTP and pre-deficiency interest). Credits apply to TC150 first.
  const tax150Unpaid=Math.max(0,r2(tax150-credits));

  if (!h.taxYear && tc150date) h.taxYear = String(tc150date.getFullYear() - 1);
  if (!h.taxYear && filedDate) { const fy=filedDate.getFullYear(),fm=filedDate.getMonth(); h.taxYear=String(fm<6?fy-1:fy); }

  const dueKey=`${h.formType}-${h.taxYear}`;
  let statutoryDue = d(DUE_DATES[dueKey]);
  if (!statutoryDue && h.dueDate) statutoryDue = h.dueDate;
  if (!statutoryDue && h.taxYear) { const ty=parseInt(h.taxYear); if(ty>=2019&&ty<=2025) statutoryDue=new Date(ty+1,3,15); }
  let origDue = d(ORIG_DUE[dueKey]);
  if (!origDue && h.taxYear) { const ty=parseInt(h.taxYear); if(ty>=2015&&ty<=2025) origDue=new Date(ty+1,3,15); }
  if (!origDue) origDue = statutoryDue;
  // §6601 interest-start dates (may precede the §7503-shifted act deadline).
  const intStartShown = d(INT_START_OVERRIDE[dueKey]) || statutoryDue;
  const intStartDef   = d(INT_START_OVERRIDE[dueKey]) || origDue;

  const parseWarnings=[];
  if(taxGross===0&&(h.accruedPen>0||h.accruedInt>0))parseWarnings.push('TC 150 not found. Check extracted text.');
  if(h.taxPerReturn>0&&!tc150date)parseWarnings.push(`Using "Tax per return" ($${h.taxPerReturn.toLocaleString()}) from header.`);
  if(unmatchedLines.length>0)parseWarnings.push(`${unmatchedLines.length} transaction line(s) didn't parse.`);
  if(filedSource==='tc610')parseWarnings.push(`Received-date header ("Return due date or return received date") not found in the extracted text — filed date approximated from the TC 610 payment-with-return (${fmt(filedDate)}), which normally accompanies the return. VERIFY the received date on the transcript before relying on timeliness, FTF, or §6651(h) conclusions; re-extract the PDF if the header exists.`);
  if(filedSource==='tc150')parseWarnings.push(`Received-date header not found — falling back to the TC 150 POSTING date (${fmt(filedDate)}). The posting date is an IRS processing artifact, often WEEKS after actual receipt, so timeliness, FTF, and §6651(h) conclusions may be WRONG. Re-extract the PDF or correct the text manually.`);
  if(filedFromPayment)parseWarnings.push(`Filed date inferred from the first payment (${fmt(filedDate)}) — no received date or TC 150 date found. Verify before relying on the FTF analysis; a TC 706 credit transfer is not a filing.`);
  if(!h._accrIntSeen&&!h._accrPenSeen)parseWarnings.push('No "Accrued interest / Accrued penalty" header was found in the extracted text. Every IRS account transcript carries these lines — if the source PDF shows them, the extraction dropped the header block and the ACCRUAL-CORRECTION ANALYSIS (often the largest relief component on paying accounts) is missing. Re-extract the PDF.');
  if((h.accruedInt>0||h.accruedPen>0)&&!h.accruedAsOf){
    if(h._requestDate){h.accruedAsOf=h._requestDate;parseWarnings.push(`Accrued amounts found but no "As of" date — using the transcript request date (${fmt(h._requestDate)}) as the accrual cutoff. Verify against the transcript.`);}
    else parseWarnings.push('Accrued amounts found but no "As of" date and no request date — accrual corrections SKIPPED. Re-extract the PDF.');
  }
  if(isDeficiency)parseWarnings.push(`Deficiency account detected (TC 290/300 totaling $${$(deficiencyTotal)}). FTP treated as §6651(a)(3); deficiency interest from original due date.`);
  if(isDeficiency&&pens.FTF.a>0)parseWarnings.push('Account has BOTH a deficiency and an FTF penalty — verify each penalty section assignment manually.');
  if(h.formType!=='1040')parseWarnings.push(`Form ${h.formType} module — the due-date tables and April-15 fallback assume Form 1040. Verify the statutory and original due dates manually before relying on any computation.`);

  return {...h,taxGross,tax150,tax150Unpaid,credits,netTax,filedDate,filedSource,tc150date,statutoryDue,origDue,intStartShown,intStartDef,
    isDeficiency,deficiencyTotal,taxAdjEvents,
    ftf:{assessed:r2(pens.FTF.a-pens.FTF.r),events:pens.FTF.events},
    ftp:{assessed:r2(pens.FTP.a-pens.FTP.r),events:pens.FTP.events},
    est:{assessed:r2(pens.EST.a-pens.EST.r),events:pens.EST.events},
    acc:{assessed:r2(pens.ACC.a-pens.ACC.r),events:pens.ACC.events},
    interest:{assessed:r2(interest.a-interest.r)},
    penInterest:{assessed:r2(penInterest.a-penInterest.r)},
    intEvents:intEvents.sort((a,b)=>a.date-b.date),
    payments:payments.sort((a,b)=>a.date-b.date), creditEvents:creditEvents.sort((a,b)=>a.date-b.date), parseWarnings, unmatchedLines};
}

// ═══════════════════════════════════════════════════════════════
// COMPUTATION ENGINE
// ═══════════════════════════════════════════════════════════════
// Daily-compounding simulator per §6622.
//   components: [{amount, start, label}] — accrual begins the day AFTER start.
//   payments:   [{date, amount}] — reduce the balance after that day's accrual.
//   checkpoints: dates at which cumulative accrued interest is recorded
//                (used to reconstruct individual TC 196 assessments).
//   excludeDisaster: when true, days in 1/20/2020–7/10/2023 are disregarded
//                under §7508A(d) — no accrual, labeled "disregarded".
// P5(a): segment labels are derived from the SAME rate used to compound that
// day, so the displayed work can no longer disagree with the math.
function simulateDailyInterest(components, payments, endDate, excludeDisaster, checkpoints=[]) {
  const comps=[...components].filter(c=>c&&c.amount>0.005&&c.start).sort((a,b)=>a.start-b.start);
  const out={interest:0,endBalance:0,principal:0,segments:[],daysExcluded:0,checkpoints:{}};
  if(!comps.length||!endDate||endDate<=comps[0].start) {
    for(const cp of checkpoints) out.checkpoints[fmt(cp)]=0;
    return out;
  }
  const pays=[...payments].filter(p=>p.amount!==0).sort((a,b)=>a.date-b.date);
  const cps=[...checkpoints].sort((a,b)=>a-b);
  let ci=0,pi=0,cpi=0,balance=0,credit=0,accrued=0,excludedDays=0,principal=0;
  // credit: overpayment bucket. A payment beyond the balance parks here (it
  // must not vanish — a later reversal, TC 671, draws it back down first),
  // and it offsets later component additions before they accrue interest.
  const addComponent=(amt)=>{principal+=amt;const take=Math.min(credit,amt);credit-=take;balance+=amt-take;};
  const applyPayment=(amt)=>{
    if(amt>0){const ap=Math.min(balance,amt);balance-=ap;credit+=amt-ap;}
    else{const back=-amt;const fromCredit=Math.min(credit,back);credit-=fromCredit;balance+=back-fromCredit;}
  };
  let cursor=new Date(comps[0].start);
  while(ci<comps.length&&comps[ci].start<=cursor){addComponent(comps[ci].amount);ci++;}
  while(pi<pays.length&&pays[pi].date<=cursor){applyPayment(pays[pi].amount);pi++;}
  while(cpi<cps.length&&cps[cpi]<=cursor){out.checkpoints[fmt(cps[cpi])]=0;cpi++;}
  const segments=[];let seg=null;
  const closeSeg=()=>{if(seg&&seg.days>0){seg.interest=r2(seg.accr);delete seg.accr;delete seg.key;segments.push(seg);}seg=null;};
  while(cursor<endDate){
    const day=addDays(cursor,1);
    let event=false;
    while(ci<comps.length&&comps[ci].start<=cursor){addComponent(comps[ci].amount);ci++;event=true;}
    const excluded=excludeDisaster&&inDisaster(day);
    const rate=getRate(day),yd=daysInYear(day.getFullYear());
    const key=excluded?'X':`${rate}-${yd}`;
    if(event||!seg||seg.key!==key){closeSeg();seg={key,from:fmt(day),to:fmt(day),rate:excluded?'disregarded':`${(rate*100).toFixed(0)}%`,days:0,accr:0,startBal:r2(balance),endBal:r2(balance),excluded};}
    if(excluded){excludedDays++;}
    else{const delta=balance*rate/yd;accrued+=delta;balance+=delta;seg.accr+=delta;}
    seg.days++;seg.to=fmt(day);seg.endBal=r2(balance);
    while(cpi<cps.length&&cps[cpi].getTime()===day.getTime()){out.checkpoints[fmt(cps[cpi])]=r2(accrued);cpi++;}
    let paid=false;
    while(pi<pays.length&&pays[pi].date<=day){applyPayment(pays[pi].amount);paid=true;pi++;}
    if(paid)closeSeg();
    cursor=day;
    if(balance<=0.005&&ci>=comps.length&&pi>=pays.length&&cpi>=cps.length)break;
  }
  closeSeg();
  // Record any checkpoints at/after the end of the loop
  while(cpi<cps.length){out.checkpoints[fmt(cps[cpi])]=r2(accrued);cpi++;}
  out.interest=r2(accrued);out.endBalance=r2(balance);out.principal=r2(principal);
  out.segments=segments;out.daysExcluded=excludedDays;
  return out;
}

// §6651(a)(2)/(a)(3) FTP engine — anchored to the transcript (P1) with two
// selectable Kwong month grids (P6):
//   'postponed' — Abdo/Kwong postponed-deadline reading: payment was timely
//                 through 7/10/2023, so penalty months are anchored at
//                 7/11/2023. (Primary; one month more favorable.)
//   'disregard' — keeps the IRS's original month anchors and removes only the
//                 months falling entirely inside the disaster period; a month
//                 straddling 7/10/2023 still counts under the
//                 month-or-fraction rule. (Conservative.)
// In BOTH grids the abatement is clamped to the actually-assessed amount.
function computeFTPAnchored({base, originalStart, endAnchor, payments, grid, iaDate, returnTimely, onePctFrom}) {
  const res={recomputed:0,abatement:0,detail:[],months:0,skipped:0,note:''};
  if(!originalStart||!endAnchor||base<=0.005) return res;
  const pays=[...payments].sort((a,b)=>a.date-b.date);
  // Unclamped running ledger, clamped only at read: a payment beyond the
  // balance leaves a negative ledger so a later reversal restores the true
  // figure instead of overshooting past it.
  const balAt=(dt)=>{let b=base;for(const p of pays){if(p.date<=dt)b-=p.amount;else break;}return Math.max(0,b);};
  // §6651(d): rate doubles to 1%/month for months beginning on/after the
  // 10th day following a §6331(d) intent-to-levy notice. Overrides the
  // §6651(h) IA reduced rate (the rate increase supersedes).
  const rateFor=(mStart)=>(onePctFrom&&mStart>=onePctFrom)?0.01:((iaDate&&returnTimely&&mStart>=iaDate)?0.0025:0.005);
  const rateLabel=(r)=>r===0.01?'1%':r===0.0025?'0.25%':'0.5%';
  const monthFullyInDisaster=(mStart,anchorDay)=>{
    const mEnd=addDays(addMonthAnchored(mStart,anchorDay),-1);
    return mStart>=DISASTER_START&&mEnd<=DISASTER_END;
  };
  if(grid==='postponed'){
    const start=originalStart<=DISASTER_END?POSTPONED_FIRST:originalStart;
    const anchorDay=start.getDate();
    let mStart=new Date(start),cumRate=0,total=0,n=0;
    for(let iter=0;iter<600&&mStart<=endAnchor&&cumRate<0.25;iter++){
      const bal=balAt(mStart);
      if(bal<=0.005){mStart=addMonthAnchored(mStart,anchorDay);continue;} // zero month: skip, don't stop — a reversal may revive the balance
      const rate=rateFor(mStart);
      const ftpExact=bal*rate;total+=ftpExact;cumRate+=rate;n++;
      res.detail.push({month:n,date:fmt(mStart),balance:r2(bal),rate:rateLabel(rate),ftpExact,ftp:r2(ftpExact),skipped:false});
      mStart=addMonthAnchored(mStart,anchorDay);
    }
    res.months=n;res.recomputed=r2(total);res.capBound=cumRate>=0.25;
    res.note=`Postponed-deadline grid: months anchored ${fmt(start)} (deadline postponed to ${fmt(KWONG_DUE)} under §7508A(d)); ${n} months charged.${onePctFrom?` §6651(d) 1%/month applied from ${fmt(onePctFrom)}.`:''}${res.capBound?' 25% cap reached.':''}`;
  } else {
    // 'disregard' grid: walk the IRS's own schedule; the abatement is the sum
    // of the charges in months that fall entirely within the disaster period.
    // Disregarded months do not consume the 25% cap — only charged months do.
    const anchorDay=originalStart.getDate();
    let mStart=new Date(originalStart),cumCharged=0,cumAll=0,abated=0,charged=0,n=0,nSkipped=0;
    for(let iter=0;iter<600&&mStart<=endAnchor&&cumCharged<0.25;iter++){
      const bal=balAt(mStart);
      if(bal<=0.005){mStart=addMonthAnchored(mStart,anchorDay);continue;}
      const rate=rateFor(mStart);
      const charge=bal*rate;n++;cumAll+=rate;
      if(monthFullyInDisaster(mStart,anchorDay)){
        abated+=charge;nSkipped++;
        res.detail.push({month:n,date:fmt(mStart),balance:r2(bal),rate:rateLabel(rate),ftpExact:0,ftp:0,skipped:true,wouldBe:r2(charge)});
      } else {
        charged+=charge;cumCharged+=rate;
        res.detail.push({month:n,date:fmt(mStart),balance:r2(bal),rate:rateLabel(rate),ftpExact:charge,ftp:r2(charge),skipped:false});
      }
      mStart=addMonthAnchored(mStart,anchorDay);
    }
    res.months=n-nSkipped;res.skipped=nSkipped;res.capBound=cumAll>=0.25;
    res.recomputed=r2(charged);res.abatementRaw=r2(abated);
    res.note=`Day-disregard grid: IRS month anchors kept (${fmt(originalStart)}); ${nSkipped} months entirely within the disaster period removed; a straddle month still counts (month-or-fraction).${onePctFrom?` §6651(d) 1%/month applied from ${fmt(onePctFrom)}.`:''}${res.capBound?' 25% cap reached.':''}`;
  }
  return res;
}

// IRS-side reconstruction of the FTP actually assessed (verification layer).
function reconstructFTP({base, originalStart, endAnchor, payments, iaDate, returnTimely, onePctFrom}) {
  if(!originalStart||!endAnchor||base<=0.005) return {total:0,months:0};
  const pays=[...payments].sort((a,b)=>a.date-b.date);
  const balAt=(dt)=>{let b=base;for(const p of pays){if(p.date<=dt)b-=p.amount;else break;}return Math.max(0,b);};
  const anchorDay=originalStart.getDate();
  let mStart=new Date(originalStart),cumRate=0,total=0,n=0;
  for(let iter=0;iter<600&&mStart<=endAnchor&&cumRate<0.25;iter++){
    const bal=balAt(mStart);
    if(bal<=0.005){mStart=addMonthAnchored(mStart,anchorDay);continue;}
    const rate=(onePctFrom&&mStart>=onePctFrom)?0.01:((iaDate&&returnTimely&&mStart>=iaDate)?0.0025:0.005);
    total+=bal*rate;cumRate+=rate;n++;
    mStart=addMonthAnchored(mStart,anchorDay);
  }
  return {total:r2(total),months:n};
}

// FTF months under the Kwong postponed deadline (return due 7/10/2023).
function countFTFMonths(filedDate){
  if(!filedDate||filedDate<=KWONG_DUE)return 0;
  const anchorDay=POSTPONED_FIRST.getDate();
  let mStart=new Date(POSTPONED_FIRST),n=0;
  while(mStart<=filedDate&&n<5){n++;mStart=addMonthAnchored(mStart,anchorDay);}
  return n;
}

// ═══════════════════════════════════════════════════════════════
// VERIFICATION LAYER (P1)
// ═══════════════════════════════════════════════════════════════
// Reconstructs each TC 196 from transcript parameters using IRS module-balance
// conventions (deficiency from original due date; penalties and prior interest
// enter the compounding base at their assessment dates; payments tax-first;
// NO disaster exclusion) and reports the per-assessment variance. Large
// variance ⇒ the parsed inputs are wrong or the account has structure the
// model doesn't capture — warn, never adjust the claim to the model.
function reconstructInterestAssessments(p){
  const posInt=p.intEvents.filter(e=>e.amount>0);
  if(!posInt.length)return {rows:[],totalAssessed:0,totalPredicted:0,note:''};
  const penEvents=[],ftfEvents=[];
  for(const code of ['ftp','est','acc'])for(const e of p[code].events)if(e.amount>0)penEvents.push({date:e.date,amount:e.amount});
  for(const e of p.ftf.events)if(e.amount>0)ftfEvents.push({date:e.date,amount:e.amount});
  const taxBase=(p.tax150Unpaid>0.005?p.tax150Unpaid:0)+p.taxAdjEvents.reduce((s,e)=>s+e.amount,0);
  const iShown=p.intStartShown||p.statutoryDue, iDef=p.intStartDef||p.origDue;
  const rows=[];let totalPredicted=0,prevDate=null;
  for(let k=0;k<posInt.length;k++){
    const e=posInt[k];
    let comps,pays;
    if(k===0){
      // First window: tax components from their §6601 start dates (the
      // prescribed 15th, not the §7503-shifted act deadline); FTF in the
      // due-date group per §6601(e)(2)(A); other penalties assessed before
      // this window's end at their own dates.
      comps=[];
      if(p.tax150Unpaid>0.005)comps.push({amount:p.tax150Unpaid,start:iShown});
      for(const t of p.taxAdjEvents)comps.push({amount:t.amount,start:iDef});
      for(const fe of ftfEvents)if(fe.date<=e.date)comps.push({amount:fe.amount,start:iShown});
      for(const pe of penEvents)if(pe.date<e.date)comps.push({amount:pe.amount,start:pe.date});
      pays=p.payments.filter(x=>x.date<=e.date);
    }else{
      // Later windows: start from the ASSESSED module balance at the prior
      // assessment date (the prior accrual was assessed — it does not also
      // carry forward as simulated growth), then add penalties assessed
      // inside this window at their dates.
      const allPen=[...penEvents,...ftfEvents];
      const penUpTo=allPen.filter(pe=>pe.date<=prevDate).reduce((s,pe)=>s+pe.amount,0);
      const intUpTo=posInt.slice(0,k).reduce((s,x)=>s+x.amount,0);
      const paidUpTo=p.payments.filter(x=>x.date<=prevDate).reduce((s,x)=>s+x.amount,0);
      const moduleBal=Math.max(0,r2(taxBase+penUpTo+intUpTo-paidUpTo));
      comps=[{amount:moduleBal,start:prevDate}];
      for(const pe of allPen)if(pe.date>prevDate&&pe.date<e.date)comps.push({amount:pe.amount,start:pe.date});
      pays=p.payments.filter(x=>x.date>prevDate&&x.date<=e.date);
    }
    const sim=simulateDailyInterest(comps,pays,e.date,false);
    const predicted=sim.interest;
    totalPredicted+=predicted;
    rows.push({date:fmt(e.date),assessed:e.amount,predicted:r2(predicted),variance:r2(e.amount-predicted),
      pct:e.amount>0?Math.abs((e.amount-predicted)/e.amount*100):0});
    prevDate=e.date;
  }
  return {rows,totalAssessed:r2(posInt.reduce((s,e)=>s+e.amount,0)),totalPredicted:r2(totalPredicted),
    note:'Module convention: tax interest from the prescribed due date (the 15th, even when §7503 shifts the act deadline); deficiency interest from the original due date; FTF in the §6601(e)(2)(A) due-date group; other penalties and prior assessed interest enter at their assessment dates; payments tax-first; no disaster exclusion.'};
}

// IRS-side reconstruction of the transcript's ACCRUED (unassessed) interest:
// one module-balance window from the last interest assessment (or the due
// date if none) to the as-of date. Penalty/interest reversals inside the
// window are applied as balance credits on their dates.
function reconstructAccruedInterest(p){
  if(!p.accruedAsOf||p.accruedInt<=0.005)return null;
  const posInt=p.intEvents.filter(e=>e.amount>0);
  const allPen=[];
  for(const code of ['ftf','ftp','est','acc'])for(const e of p[code].events)allPen.push(e);
  allPen.sort((a,b)=>a.date-b.date);
  const taxBase=(p.tax150Unpaid>0.005?p.tax150Unpaid:0)+p.taxAdjEvents.reduce((s,e)=>s+e.amount,0);
  const lastInt=posInt.length?posInt[posInt.length-1].date:null;
  const comps=[],pays=[];
  if(lastInt){
    const penNet=allPen.filter(e=>e.date<=lastInt).reduce((s,e)=>s+e.amount,0);
    const intNet=p.intEvents.filter(e=>e.date<=lastInt).reduce((s,e)=>s+e.amount,0);
    const paid=p.payments.filter(x=>x.date<=lastInt).reduce((s,x)=>s+x.amount,0);
    const M=Math.max(0,r2(taxBase+penNet+intNet-paid));
    comps.push({amount:M,start:lastInt});
    for(const e of allPen)if(e.date>lastInt&&e.date<=p.accruedAsOf){
      if(e.amount>0)comps.push({amount:e.amount,start:e.date});
      else pays.push({date:e.date,amount:-e.amount});
    }
    for(const e of p.intEvents)if(e.amount<0&&e.date>lastInt&&e.date<=p.accruedAsOf)pays.push({date:e.date,amount:-e.amount});
    pays.push(...p.payments.filter(x=>x.date>lastInt&&x.date<=p.accruedAsOf));
  } else {
    if(p.tax150Unpaid>0.005)comps.push({amount:p.tax150Unpaid,start:p.intStartShown||p.statutoryDue});
    for(const t of p.taxAdjEvents)if(t.amount>0)comps.push({amount:t.amount,start:p.intStartDef||p.origDue});
    for(const e of allPen)if(e.date<=p.accruedAsOf){
      if(e.amount>0)comps.push({amount:e.amount,start:e.date});
      else pays.push({date:e.date,amount:-e.amount});
    }
    pays.push(...p.payments.filter(x=>x.date<=p.accruedAsOf));
  }
  const sim=simulateDailyInterest(comps,pays,p.accruedAsOf,false);
  return {predicted:sim.interest,figure:p.accruedInt,
    from:lastInt||p.statutoryDue, baseBal:lastInt?comps[0].amount:null,
    pct:p.accruedInt>0?Math.abs((p.accruedInt-sim.interest)/p.accruedInt*100):0};
}

// Render simulator segments for a work exhibit: every charged segment shown
// explicitly; consecutive disregarded segments (often split by in-window
// payments) merged into one §7508A(d) line for readability.
function segmentLines(segments){
  const out=[];let i=0;
  while(i<segments.length){
    const s=segments[i];
    if(s.excluded){
      let j=i,days=0,to=s.to,endBal=s.endBal;
      while(j<segments.length&&segments[j].excluded){days+=segments[j].days;to=segments[j].to;endBal=segments[j].endBal;j++;}
      out.push(`  ${s.from} → ${to}: DISREGARDED §7508A(d), ${days}d, bal $${$(s.startBal)}→$${$(endBal)} (payments still applied; no accrual)`);
      i=j;
    } else {
      out.push(`  ${s.from} → ${s.to}: ${s.rate}, ${s.days}d, bal $${$(s.startBal)}→$${$(s.endBal)} (+$${$(s.interest)})`);
      i++;
    }
  }
  return out;
}

// IRS-side reconstruction of the transcript's ACCRUED (unassessed) FTP:
// the IRS grid run to the as-of date, counting only months that BEGIN after
// the last FTP transaction (assessment or abatement) — those are the months
// the running accrual covers. IA months at 0.25% (§6651(h), timely filers).
function reconstructAccruedFTP(p,{base,originalStart,returnTimely,onePctFrom}){
  if(!p.accruedAsOf||p.accruedPen<=0.005||!originalStart||base<=0.005)return null;
  const pays=[...p.payments].sort((a,b)=>a.date-b.date);
  const balAt=(dt)=>{let b=base;for(const x of pays){if(x.date<=dt)b-=x.amount;else break;}return Math.max(0,b);};
  const evs=[...p.ftp.events].sort((a,b)=>a.date-b.date);
  const cutoff=evs.length?evs[evs.length-1].date:null;
  const anchorDay=originalStart.getDate();
  let mStart=new Date(originalStart),cum=0,total=0,n=0;
  for(let iter=0;iter<700&&mStart<=p.accruedAsOf&&cum<0.25;iter++){
    const bal=balAt(mStart);
    if(bal<=0.005){mStart=addMonthAnchored(mStart,anchorDay);continue;}
    const rate=(onePctFrom&&mStart>=onePctFrom)?0.01:((p.iaDate&&returnTimely&&mStart>=p.iaDate)?0.0025:0.005);
    cum+=rate;
    if(!cutoff||mStart>cutoff){total+=bal*rate;n++;}
    mStart=addMonthAnchored(mStart,anchorDay);
  }
  return {predicted:r2(total),figure:p.accruedPen,months:n,onePctFrom:onePctFrom||null,
    pct:p.accruedPen>0?Math.abs((p.accruedPen-total)/p.accruedPen*100):0};
}

// §6651(d) trigger inference. The 1%/month rate step follows a §6331(d)
// intent-to-levy notice — usually a CP504, which RARELY posts as a visible
// 971 on account transcripts. When the baseline accrued-FTP reconstruction
// misses the transcript figure, try (1) the earliest parsed levy notice
// (+10 days), then (2) every candidate month on the IRS grid, and accept a
// candidate only if it reproduces the transcript accrual within 0.75%.
function inferOnePctStart(p,{base,originalStart,returnTimely}){
  const baseline=reconstructAccruedFTP(p,{base,originalStart,returnTimely,onePctFrom:null});
  if(!baseline)return {onePctFrom:null,source:'',recon:null};
  if(baseline.pct<=7.5)return {onePctFrom:null,source:'',recon:baseline};
  const anchorDay=originalStart.getDate();
  const firstMonthOnOrAfter=(dt)=>{let m=new Date(originalStart);for(let i=0;i<700&&m<dt;i++)m=addMonthAnchored(m,anchorDay);return m;};
  // (1) parsed §6331(d)-style notice from the transcript
  if(p.levyNoticeDate){
    const cand=firstMonthOnOrAfter(addDays(p.levyNoticeDate,10));
    const r=reconstructAccruedFTP(p,{base,originalStart,returnTimely,onePctFrom:cand});
    if(r&&r.pct<=0.75)return {onePctFrom:cand,source:'parsed §6331(d) intent-to-levy notice',recon:r};
  }
  // (2) grid search
  let best=null,m=new Date(originalStart);
  for(let i=0;i<48&&m<=p.accruedAsOf;i++){
    const r=reconstructAccruedFTP(p,{base,originalStart,returnTimely,onePctFrom:new Date(m)});
    if(r&&(!best||r.pct<best.recon.pct))best={onePctFrom:new Date(m),recon:r};
    m=addMonthAnchored(m,anchorDay);
  }
  if(best&&best.recon.pct<=0.75)return {onePctFrom:best.onePctFrom,source:'inferred from the accrual reconstruction (no §6331(d) notice visible on the transcript)',recon:best.recon};
  return {onePctFrom:null,source:'',recon:baseline};
}

// ═══════════════════════════════════════════════════════════════
// FULL ANALYSIS
// ═══════════════════════════════════════════════════════════════
// Architecture (P1): for every component —
//   abatement = (amount actually assessed on the transcript)
//             − (that same item recomputed with the §7508A(d) period removed)
// clamped to [0, assessed]. Accrued-but-unassessed amounts are reported as
// informational only: they are not Form 843 Line 2 items (the IRS recomputes
// accruals automatically once the assessed amounts are corrected).
function runAnalysis(p, opts={}) {
  const ftpGrid = opts.ftpGrid || 'postponed';
  const results = {items:[], protectiveItems:[], accrualItems:[],
                   totalMain:0, totalProtective:0, totalAccrual:0,
                   totalEconomic:0, totalGrand:0, totalCombined:0,
                   warnings:[], notes:[], verification:null, ftpGrid};
  if (!p.statutoryDue) {results.warnings.push('Could not determine statutory due date');return results;}

  const lastIntDate = (()=>{const e=p.intEvents.filter(e=>e.amount>0);return e.length?e[e.length-1].date:null;})();
  const lastFTPDate = (()=>{const e=p.ftp.events.filter(e=>e.amount>0);return e.length?e[e.length-1].date:null;})();
  // §6651(h) reduced IA rate requires a TIMELY-FILED return — an IA alone is
  // not enough (the old `|| iaDate` fallback made the timeliness test vacuous).
  const returnTimely = !!(p.filedDate && p.statutoryDue && p.filedDate <= p.statutoryDue);
  // First POSITIVE tax adjustment — a TC 291 reversal that happens to appear
  // earlier must not become the notice-and-demand anchor.
  const firstDeficiency = p.taxAdjEvents.find(e=>e.amount>0)||null;

  // Module guard: §7508A(d) relief only reaches amounts whose accrual touches
  // the disaster window. If both due dates fall after 7/10/2023, a "Kwong
  // recomputation" is identical to the IRS computation, and any difference is
  // pure model-convention noise — so no abatement items are generated at all.
  const disasterApplies = !!((p.statutoryDue && p.statutoryDue <= DISASTER_END) || (p.origDue && p.origDue <= DISASTER_END));
  if(!disasterApplies){
    results.notes.push(`Module due dates (${fmt(p.origDue)} / ${fmt(p.statutoryDue)}) fall after the disaster period ended ${fmt(DISASTER_END)} — no §7508A(d)/Kwong relief is available for FTF, FTP, or interest on this module; only §6654 installments that fall inside the window (if any) qualify. Verification and reconciliation are still shown.`);
  }
  if((lastIntDate&&lastIntDate>RATE_TABLE_END)||(p.accruedAsOf&&p.accruedAsOf>RATE_TABLE_END)){
    results.warnings.push(`Computation dates extend past the rate table (ends ${fmt(RATE_TABLE_END)}); getRate() falls back to 7% beyond it. Add the newly announced §6621 quarterly rate to RATES.`);
  }
  if(p.intEvents.some(e=>e.amount<0)){
    results.warnings.push('Interest reversal(s) present (TC 197/337/341). Net amounts are used for the claim, but the verification reconstruction treats gross assessments — review those rows manually.');
  }

  // §6651(a)(3) payment window after notice & demand: 21 calendar days, or
  // 10 BUSINESS days when the demanded amount is ≥ $100,000. The demanded
  // amount is approximated as everything assessed on the deficiency date.
  // (Federal holidays are not modeled in the business-day count.)
  const isA3 = !!(p.isDeficiency && firstDeficiency && lastFTPDate && lastFTPDate >= firstDeficiency.date);
  let ftpOriginalStart=null, ftpBase=0, ndDaysLabel='21 days';
  if(lastFTPDate){
    if(isA3){
      const sd=firstDeficiency.date.getTime();
      const onND=(e)=>e.date&&e.date.getTime()===sd&&e.amount>0;
      const ndAmount=r2(p.taxAdjEvents.filter(e=>e.date.getTime()===sd).reduce((s,e)=>s+e.amount,0)
        +[...p.ftf.events,...p.ftp.events,...p.est.events,...p.acc.events].filter(onND).reduce((s,e)=>s+e.amount,0)
        +p.intEvents.filter(onND).reduce((s,e)=>s+e.amount,0));
      if(ndAmount>=100000){ndDaysLabel='10 business days (demand ≥ $100,000 — holidays not modeled, verify the start date)';ftpOriginalStart=addBusinessDays(firstDeficiency.date,10);}
      else ftpOriginalStart=addDays(firstDeficiency.date,21);
      ftpBase=p.deficiencyTotal;
    } else { ftpOriginalStart=addDays(p.statutoryDue,1); ftpBase=p.tax150Unpaid; }
  }

  // §6651(d) resolution — the 1%/month post-levy-notice rate. Resolved ONCE
  // here and threaded through the assessed grid, the accrual correction, and
  // the verification reconstructions, so all four use the same rate schedule.
  const accrFtpBase = lastFTPDate?ftpBase:(p.isDeficiency&&firstDeficiency?p.deficiencyTotal:p.tax150Unpaid);
  const accrFtpStart = ftpOriginalStart||(p.statutoryDue?addDays(p.statutoryDue,1):null);
  let ftpOnePctFrom=null, accrFtpReconResolved=null;
  if(p.accruedAsOf&&p.accruedPen>0.005&&accrFtpStart&&accrFtpBase>0.005){
    const inf=inferOnePctStart(p,{base:accrFtpBase,originalStart:accrFtpStart,returnTimely});
    ftpOnePctFrom=inf.onePctFrom; accrFtpReconResolved=inf.recon;
    if(ftpOnePctFrom){
      results.notes.push(`§6651(d): the FTP rate steps to 1%/month for months beginning ${fmt(ftpOnePctFrom)} (${inf.source}; reconstruction matches the transcript accrual within ${inf.recon.pct.toFixed(2)}%). Confirm the §6331(d) notice (CP504/LT11) date with the IRS — CP504s often do not appear on account transcripts. The 1% months are honored in the corrected accrual: a post-window rate step is not itself correctable under §7508A(d).`);
      if(inDisaster(ftpOnePctFrom)||(p.levyNoticeDate&&inDisaster(p.levyNoticeDate))){
        results.notes.push('PROTECTIVE FLAG: the §6651(d) rate step traces to a notice issued INSIDE the §7508A(d) window — a suspension/prohibited-act argument against the rate increase itself may be available. Flag for practitioner review.');
      }
    }
  } else if (p.levyNoticeDate&&inDisaster(p.levyNoticeDate)) {
    results.notes.push('PROTECTIVE FLAG: an intent-to-levy/levy notice was issued inside the §7508A(d) window — review for prohibited-act/suspension arguments.');
  }

  // ── §6651(a)(1) FTF — anchored to assessed amount ──
  let recomputedFTF=0, ftfItem=null;
  if (disasterApplies && p.ftf.assessed > 0.005) {
    const work=[`IRS assessed (TC 160/166/270 net): $${$(p.ftf.assessed)}`];
    const base=Math.max(0,r2(p.tax150Unpaid - p.payments.filter(x=>x.date<=KWONG_DUE).reduce((s,x)=>s+x.amount,0)));
    if (p.filedDate && p.filedDate<=KWONG_DUE) {
      work.push(`Filed ${fmt(p.filedDate)} ≤ postponed due date ${fmt(KWONG_DUE)} (§7508A(d); Abdo; Kwong)`);
      work.push(`Return was TIMELY under Kwong → recomputed FTF: $0.00`);
      recomputedFTF=0;
    } else if (p.filedDate) {
      const months=countFTFMonths(p.filedDate);
      const concurrent = base>0.005; // FTP running in the same months → §6651(c)(1)
      const rate=concurrent?0.045:0.05;
      recomputedFTF=r2(Math.min(months*rate,concurrent?0.225:0.25)*base);
      work.push(`Filed ${fmt(p.filedDate)} — ${months} month(s) after postponed due date ${fmt(KWONG_DUE)}`);
      work.push(`${months} mo × ${(rate*100).toFixed(1)}%${concurrent?' (5% − 0.5% concurrent-FTP reduction, §6651(c)(1))':''} × $${$(base)} = $${$(recomputedFTF)}`);
      const daysLate=diffDays(KWONG_DUE,p.filedDate);
      if(daysLate>60){
        const cap=MIN_PENALTY[KWONG_DUE.getFullYear()]||450;
        const min=Math.min(cap,base);
        if(recomputedFTF<min){work.push(`>60 days late → §6651(a) minimum: min($${cap}, $${$(base)}) = $${$(min)}`);recomputedFTF=min;}
      }
    } else { work.push('Filed date unknown — assuming filed within postponed period.'); recomputedFTF=0; }
    const abate=Math.min(p.ftf.assessed,Math.max(0,r2(p.ftf.assessed-recomputedFTF)));
    work.push(`Abatement = $${$(p.ftf.assessed)} − $${$(recomputedFTF)} = $${$(abate)}`);
    ftfItem={code:'§6651(a)(1) FTF',irsAssessed:p.ftf.assessed,recomputed:recomputedFTF,abatement:abate,work};
    results.items.push(ftfItem);results.totalMain+=abate;
  }

  // ── §6651(a)(2)/(a)(3) FTP — anchored, with grid toggle (P2/P6) ──
  let ftpRes=null;
  if (disasterApplies && p.ftp.assessed > 0.005 && lastFTPDate) {
    const base = ftpBase;
    const originalStart = ftpOriginalStart;
    ftpRes = computeFTPAnchored({base,originalStart,endAnchor:lastFTPDate,payments:p.payments,grid:ftpGrid,iaDate:p.iaDate,returnTimely,onePctFrom:ftpOnePctFrom});
    let abate, recomputed;
    if(ftpGrid==='disregard'){
      abate=Math.min(p.ftp.assessed,Math.max(0,ftpRes.abatementRaw||0));
      recomputed=r2(p.ftp.assessed-abate);
    }else{
      recomputed=Math.min(ftpRes.recomputed,p.ftp.assessed);
      abate=Math.max(0,r2(p.ftp.assessed-recomputed));
    }
    if(ftpGrid==='disregard'&&ftpRes.capBound)results.warnings.push('FTP: the 25% cap was binding on the IRS schedule — removed disaster months free up cap room for later months, so hand-verify the disregard-grid abatement.');
    const work=[
      `Section: §6651(a)(${isA3?'3':'2'}) — ${isA3?`deficiency assessed ${fmt(firstDeficiency.date)}; payment due ${ndDaysLabel} after notice & demand (${fmt(originalStart)})`:`tax shown on return; due ${fmt(p.statutoryDue)}`}`,
      `Base (unpaid ${isA3?'deficiency':'tax shown'}): $${$(base)} — payments applied tax-first`,
      `IRS assessed (TC 176/276 net): $${$(p.ftp.assessed)} through ${fmt(lastFTPDate)}`,
      ``,
      `── Kwong recomputation ──`,
      ftpRes.note,
      `Recomputed FTP: $${$(recomputed)}${ftpGrid==='postponed'?` (${ftpRes.months} months × rate)`:''}`,
      `Cap check: ${ftpRes.months} charged month(s); cumulative charged-month rate within the 25% statutory cap${p.iaDate?' (IA months at 0.25% where applicable, §6651(h))':''}`,
      ``,
      `── Abatement ──`,
      `$${$(p.ftp.assessed)} (assessed) − $${$(recomputed)} (recomputed) = $${$(abate)}`,
      `Alternative grid available via the toggle above the table — the two grids differ by exactly one straddle month.`,
    ];
    if(p.accruedPen>0.005)work.push(``,`Accrued (unassessed) penalty of $${$(p.accruedPen)} is NOT a Line 2 item — see the "\u00a76651 FTP — accrued" recomputation row below for the quantified correction.`);
    results.items.push({code:`§6651(a)(${isA3?'3':'2'}) FTP`,irsAssessed:p.ftp.assessed,recomputed,abatement:abate,work,ftpDetail:ftpRes.detail});
    results.totalMain+=abate;
  } else if (p.accruedPen>0.005 && p.ftp.assessed<=0.005) {
    results.notes.push(`Accrued penalty of $${$(p.accruedPen)} is unassessed — informational only; no Line 2 claim until assessed.`);
  }

  // ── §6654 estimated-tax addition — anchored ──
  // Installment deadlines use nominal 4/15, 6/15, 9/15, 1/15 dates; weekend/
  // holiday rollovers are not applied. For 2019–2022 modules every rollover
  // lands on the same side of the disaster window, so the IN/OUT count is
  // unaffected.
let recomputedEST=0;
  // §6654 runs off installment deadlines DURING the tax year, not the return
  // due date — a post-disaster module (e.g. TY2023, due 4/15/2024) can still
  // have Q1/Q2-2023 installments inside the window. Gate independently of
  // disasterApplies.
  if (p.est.assessed > 0.005) {
    const ty=parseInt(p.taxYear);
    const dls=[new Date(ty,3,15),new Date(ty,5,15),new Date(ty,8,15),new Date(ty+1,0,15)];
    const inD=dls.filter(dl=>dl>=DISASTER_START&&dl<=DISASTER_END).length;
    if(inD===0){
      recomputedEST=p.est.assessed; // no relief — the FULL addition survives into the interest base
      results.notes.push(`§6654 addition of $${$(p.est.assessed)}: no installment deadline falls inside the disaster window — no §7508A(d) relief for this component.`);
    } else {
      const abate=inD===4?p.est.assessed:r2(p.est.assessed*inD/4);
      recomputedEST=r2(p.est.assessed-abate);
      const work=[
        `IRS assessed (TC 170/173 net): $${$(p.est.assessed)}`,
        `Quarterly deadlines: ${dls.map(dl=>`${fmt(dl)} (${dl>=DISASTER_START&&dl<=DISASTER_END?'IN':'OUT'})`).join(', ')}`,
        `${inD}/4 installment deadlines inside the disaster period → ${inD===4?'full':'proportional'} abatement`,
        `Abatement: $${$(abate)} — pro-rata allocation; verify against a Form 2210-style per-quarter computation before accepting a partial allowance.`,
      ];
      results.items.push({code:'§6654 Est. Tax',irsAssessed:p.est.assessed,recomputed:recomputedEST,abatement:abate,work});
      results.totalMain+=abate;
    }
  }

  // ── §6601 interest — ONE corrected-account simulation (P1/P2/P4) ──
  // The recomputed base contains: unpaid tax shown (from due date), the
  // deficiency (from ORIGINAL due date), the §6662 penalty (from due date per
  // §6601(e)(2)(B) — primary claim retains it), and any SURVIVING recomputed
  // FTF/§6654 (from the postponed due date per §6601(e)(2)). Recomputed FTP
  // bears no interest before its own notice & demand, so it is excluded.
  // Because the IRS-side figure is the ACTUAL assessed TC 196 total — which
  // already includes the IRS's interest-on-penalties — the differential
  // automatically captures interest on every abated penalty. The old separate
  // "interest-on-penalty cascade" items are therefore gone by design (P4):
  // they double-counted, and for unpaid late-assessed FTP they claimed
  // interest that was never charged.
  const assessedInt=r2(p.intEvents.filter(e=>e.amount>0).reduce((s,e)=>s+e.amount,0)
                      -p.intEvents.filter(e=>e.amount<0).reduce((s,e)=>s-e.amount,0));
  let intSimPrimary=null,intSimProtective=null;
  // In-window portion of the §6662 assessment — only this much is removable
  // under the crystallization theory; an out-of-window remainder stays in the
  // protective base too. (Both sims keep assessed reality where unchallenged.)
  const accInWindow = r2(p.acc.events.filter(e=>e.amount>0&&inDisaster(e.date)).reduce((s,e)=>s+e.amount,0));
  const accProtective = Math.min(Math.max(p.acc.assessed,0), accInWindow);
  // Corrected-account interest base, shared by the assessed-interest sim and
  // the accrual-correction engine so the two can never drift apart.
  const buildInterestBaseComps = () => {
    const c=[];
    if(p.tax150Unpaid>0.005)c.push({amount:p.tax150Unpaid,start:p.intStartShown||p.statutoryDue,label:'unpaid tax shown'});
    for(const e of p.taxAdjEvents)if(e.amount>0)c.push({amount:e.amount,start:p.intStartDef||p.origDue,label:`deficiency (TC ${e.tc})`});
    // Surviving FTF: §6601(e)(2)(A) group — interest from the (postponed)
    // return due date.
    if(recomputedFTF>0.005)c.push({amount:recomputedFTF,start:KWONG_DUE,label:'surviving FTF (§6601(e)(2) due-date group)'});
    // Surviving §6654: NOT in the due-date group — interest runs only from
    // notice & demand, i.e. its assessment date. (§6601(e)(2) lists only
    // §§6651(a)(1), 6653, 6662, 6663 for due-date treatment.)
    if(recomputedEST>0.005){
      const estND=(p.est.events.find(e=>e.amount>0)||{}).date||lastIntDate||p.accruedAsOf;
      c.push({amount:recomputedEST,start:estND,label:'surviving §6654 (from notice & demand)'});
    }
    return c;
  };
  if (disasterApplies && assessedInt>0.005 && lastIntDate) {
    const baseComps=buildInterestBaseComps();
    const primaryComps=[...baseComps];
    if(p.acc.assessed>0.005)primaryComps.push({amount:p.acc.assessed,start:p.intStartDef||p.origDue,label:'§6662 penalty (retained — primary claim)'});
    intSimPrimary=simulateDailyInterest(primaryComps,p.payments,lastIntDate,true);
    if(accProtective>0.005){
      const protectiveComps=[...baseComps];
      const accRemainder=r2(Math.max(p.acc.assessed,0)-accProtective);
      if(accRemainder>0.005)protectiveComps.push({amount:accRemainder,start:p.intStartDef||p.origDue,label:'§6662 (out-of-window portion, retained)'});
      intSimProtective=simulateDailyInterest(protectiveComps,p.payments,lastIntDate,true);
    } else { intSimProtective=intSimPrimary; }
    const recomputed=intSimPrimary.interest;
    const abate=Math.min(assessedInt,Math.max(0,r2(assessedInt-recomputed)));
    const work=[
      `IRS assessed interest (ΣTC 196/336, net of reversals): $${$(assessedInt)} through ${fmt(lastIntDate)}`,
      ``,
      `── Kwong recomputation (corrected account, §7508A(d) days disregarded) ──`,
      `Base components:`,
      ...primaryComps.map(c=>`  • $${$(c.amount)} — ${c.label}, interest from ${fmt(c.start)}`),
      `Payments applied: ${p.payments.length} (tax-first)`,
      `Days disregarded (1/20/2020–7/10/2023): ${intSimPrimary.daysExcluded}`,
      `Recomputed interest through ${fmt(lastIntDate)}: $${$(recomputed)}`,
      ``,
      `── Rate segments (recomputed) ──`,
      ...intSimPrimary.segments.map(s=>`  ${s.from} → ${s.to}: ${s.rate}, ${s.days}d, bal $${$(s.startBal)}→$${$(s.endBal)}${s.excluded?'':` (+$${$(s.interest)})`}`),
      ``,
      `── Abatement ──`,
      `$${$(assessedInt)} − $${$(recomputed)} = $${$(abate)}`,
      `Interest on every abated penalty is captured here automatically: the assessed figure includes the IRS's interest-on-penalties, and the recomputed base excludes the abated penalties. No separate "interest on penalty" line is claimed (it would double-count).`,
    ];
    if(p.accruedInt>0.005)work.push(``,`Accrued (unassessed) interest of $${$(p.accruedInt)} is NOT a Line 2 item — see the "\u00a76601 Interest — accrued" recomputation row below for the quantified correction.`);
    results.items.push({code:'§6601 Interest',irsAssessed:assessedInt,recomputed,abatement:abate,work});
    results.totalMain+=abate;
  } else if (p.accruedInt>0.005 && assessedInt<=0.005) {
    results.notes.push(`Accrued interest of $${$(p.accruedInt)} is unassessed — informational only; no Line 2 claim until assessed.`);
  }

  // ── §6662 accuracy-related penalty — PROTECTIVE claim only (P3) ──
  // The crystallization-date argument (a penalty determined and assessed
  // inside the mandatory disregarded period may not be assessed) goes beyond
  // the matters directly adjudicated in Abdo and Kwong. It is reported
  // separately, never silently added to the main Line 2 total — and it can
  // only apply to TC 240 amounts actually assessed INSIDE the window.
  // (accInWindow / accProtective are computed above the interest block so the
  //  protective sim can retain any out-of-window remainder.)
  if (disasterApplies && p.acc.assessed > 0.005 && accProtective > 0.005) {
    const accDates=p.acc.events.filter(e=>e.amount>0&&inDisaster(e.date)).map(e=>fmt(e.date)).join(', ');
    const work=[
      `IRS assessed (TC 240, within the disregarded period): $${$(accProtective)} on ${accDates}${accProtective<p.acc.assessed?` (of $${$(p.acc.assessed)} total — the remainder was assessed outside the window and is not claimed)`:''}`,
      `Theory: §7508A(d) clause (B) requires the period to be disregarded in determining "the amount of any … penalty"; an amount determined during the disregarded period is itself subject to abatement.`,
      `LABEL: PROTECTIVE CLAIM — no judicial support yet; the IRS opposes. File segregated from the main claim.`,
    ];
    results.protectiveItems.push({code:'§6662 Accuracy (protective)',irsAssessed:accProtective,recomputed:0,abatement:accProtective,work,protective:true});
    results.totalProtective+=accProtective;
    if(intSimPrimary&&intSimProtective&&intSimPrimary!==intSimProtective){
      const deriv=Math.max(0,r2(intSimPrimary.interest-intSimProtective.interest));
      if(deriv>0.005){
        const dwork=[
          `If the in-window §6662 amount is abated, the recomputed interest base drops by $${$(accProtective)} from ${fmt(p.origDue)} forward.`,
          `Recomputed interest with §6662 in base:    $${$(intSimPrimary.interest)}`,
          `Recomputed interest without that portion:  $${$(intSimProtective.interest)}`,
          `Derivative additional interest abatement:  $${$(deriv)}`,
          `LABEL: PROTECTIVE — stands or falls with the §6662 protective claim above.`,
        ];
        results.protectiveItems.push({code:'§6601 Int. on §6662 (protective)',irsAssessed:deriv,recomputed:0,abatement:deriv,work:dwork,protective:true});
        results.totalProtective+=deriv;
      }
    }
  } else if (p.acc.assessed > 0.005) {
    results.notes.push(`§6662 penalty of $${$(p.acc.assessed)} was assessed outside the §7508A(d) window — the crystallization-date protective theory does not reach it; no protective claim generated.`);
  }

  // ── ACCRUED (UNASSESSED) AMOUNTS — recomputation demand ──
  // The transcript's "Accrued interest / Accrued penalty" header lines are
  // running module accruals the IRS has NOT yet assessed. They cannot be
  // "abated" under §6404(a) (there is no assessment to abate), but §7508A(d)
  // means the LAWFUL accrual excludes the disaster period — so the claim must
  // quantify the correction and demand that the module accruals and any
  // payoff figure be recomputed. Practitioner materials (Frost Law Kwong
  // deck) treat disaster-period accruals as claimable abatement/refund even
  // while a payment plan is running. On paying-taxpayer accounts this is
  // routinely the LARGEST component of the relief.
  // If the IRS later assesses these accruals, each assessment becomes an
  // immediate §6404(a) abatement claim; if the taxpayer pays them, a refund
  // claim follows (watch §6511(b) lookback).
  const recomputedFTPAssessed=(results.items.find(i=>i.code.includes('FTP'))||{recomputed:0}).recomputed||0;
  const recomputedIntAssessed=intSimPrimary?intSimPrimary.interest:0;
  if (disasterApplies && p.ftp.assessed<=0.005 && p.ftp.events.some(e=>e.amount<0)) {
    results.notes.push('Assessed FTP was previously abated/reversed (TC 271/277) — there is no assessed-FTP amount left to claim on Line 2; the remaining FTP relief is in the accrual correction below.');
  }
  // IRS-side reconstructions of the transcript accrual figures — cited in the
  // work exhibits below and surfaced again in the verification card.
  const accrIntRecon=reconstructAccruedInterest(p);
  const accrFtpRecon=accrFtpReconResolved||reconstructAccruedFTP(p,{
    base:accrFtpBase, originalStart:accrFtpStart, returnTimely, onePctFrom:ftpOnePctFrom});
  if (disasterApplies && p.accruedAsOf && (p.accruedInt>0.005 || p.accruedPen>0.005)) {
    if (p.accruedInt>0.005) {
      const accrComps=buildInterestBaseComps();
      if(p.acc.assessed>0.005)accrComps.push({amount:p.acc.assessed,start:p.intStartDef||p.origDue,label:'§6662 penalty (retained — primary claim)'});
      const corr=simulateDailyInterest(accrComps,p.payments,p.accruedAsOf,true);
      const correctedAccrued=Math.max(0,r2(corr.interest-recomputedIntAssessed));
      const correction=Math.min(p.accruedInt,Math.max(0,r2(p.accruedInt-correctedAccrued)));
      const work=[
        `Transcript accrued (unassessed) interest as of ${fmt(p.accruedAsOf)}: $${$(p.accruedInt)}`,
        ``,
        `── IRS-side check (uncorrected module, full §6621 rates) ──`,
        ...(accrIntRecon?[
          accrIntRecon.baseBal!=null
            ?`Module balance at last interest assessment (${fmt(accrIntRecon.from)}): $${$(accrIntRecon.baseBal)} (tax + assessed penalties + assessed interest − payments to date)`
            :`No prior interest assessment — module accrual reconstructed from ${fmt(accrIntRecon.from)}`,
          `Accrued straight through (no §7508A(d) disregard) → ${fmt(p.accruedAsOf)}: $${$(accrIntRecon.predicted)}  (transcript $${$(p.accruedInt)}, Δ ${accrIntRecon.pct.toFixed(2)}%)`,
          `The IRS path accrues through the disaster window; the corrected path below disregards those days.`,
        ]:[`(IRS-side reconstruction unavailable for this account shape)`]),
        ``,
        `── Corrected accrual (§7508A(d) days disregarded) ──`,
        `Base components (corrected account — abated items excluded):`,
        ...accrComps.map(cc=>`  • $${$(cc.amount)} — ${cc.label||'component'}, interest from ${fmt(cc.start)}`),
        `Payments applied: ${p.payments.length} (tax-first)`,
        `Days disregarded (1/20/2020–7/10/2023): ${corr.daysExcluded}`,
        ``,
        `── Rate segments (corrected; consecutive disregarded periods merged) ──`,
        ...segmentLines(corr.segments),
        ``,
        `Corrected TOTAL interest, due date → ${fmt(p.accruedAsOf)}: $${$(corr.interest)} (${corr.daysExcluded} disaster days disregarded; ${p.payments.length} payments applied tax-first)`,
        `Less recomputed ASSESSED interest (claimed above): $${$(recomputedIntAssessed)}`,
        `Corrected accrued interest: $${$(correctedAccrued)}`,
        ``,
        `── Correction ──`,
        `$${$(p.accruedInt)} (IRS accrual) − $${$(correctedAccrued)} (lawful accrual) = $${$(correction)}`,
        `Recomputed FTP bears interest only after its own notice & demand and is excluded from this base.`,
        `LABEL: NOT a §6404(a) abatement of an assessment — these amounts are unassessed. Present as a demand that the module accruals and payoff be recomputed under §7508A(d); per Frost Law practice, claim abatement/refund of disaster-period accruals even on an active payment plan.`,
      ];
      if(correction<=0.005&&correctedAccrued>=p.accruedInt)work.push(`NOTE: corrected accrual ≥ transcript accrual under this grid (anchor/convention offset) — no correction claimed.`);
      results.accrualItems.push({code:'§6601 Interest — accrued (unassessed)',irsAssessed:p.accruedInt,recomputed:correctedAccrued,abatement:correction,accrual:true,work});
      results.totalAccrual+=correction;
    }
    if (p.accruedPen>0.005) {
      const start=accrFtpStart;
      const base=accrFtpBase;
      const c=computeFTPAnchored({base,originalStart:start,endAnchor:p.accruedAsOf,payments:p.payments,grid:ftpGrid,iaDate:p.iaDate,returnTimely,onePctFrom:ftpOnePctFrom});
      const correctedTotal=c.recomputed; // charged months only under either grid
      const correctedAccrued=Math.max(0,r2(correctedTotal-recomputedFTPAssessed));
      const correction=Math.min(p.accruedPen,Math.max(0,r2(p.accruedPen-correctedAccrued)));
      const chargedRows=c.detail.filter(rw=>!rw.skipped);
      const comp={};for(const rw of chargedRows)comp[rw.rate]=(comp[rw.rate]||0)+1;
      const compLine='Rate composition (charged months): '+(chargedRows.length
        ?['0.5%','0.25%','1%'].filter(k=>comp[k]).map(k=>`${comp[k]} mo @ ${k}${k==='0.25%'?' (§6651(h) IA)':k==='1%'?' (§6651(d) post-levy-notice)':''}`).join(' + ')
        :'none — balance fully paid before any chargeable month');
      const cumPct=r2(chargedRows.reduce((s,rw)=>s+parseFloat(rw.rate),0));
      const work=[
        `Transcript accrued (unassessed) penalty as of ${fmt(p.accruedAsOf)}: $${$(p.accruedPen)} — treated as §6651 FTP${p.ftf.assessed>0.005?' (account also shows FTF; verify the accrued-penalty composition)':''}`,
        ``,
        `── IRS-side check (uncorrected schedule) ──`,
        ...(accrFtpRecon?[
          `Months beginning after the last FTP transaction, on the IRS's own anchors${p.iaDate&&returnTimely?', §6651(h) 0.25% during the IA':''}${ftpOnePctFrom?`, §6651(d) 1% from ${fmt(ftpOnePctFrom)}`:''}: ${accrFtpRecon.months} mo → $${$(accrFtpRecon.predicted)}  (transcript $${$(p.accruedPen)}, Δ ${accrFtpRecon.pct.toFixed(2)}%)`,
          `The IRS schedule keeps charging through the disaster window; the corrected grid below removes those months.`,
        ]:[`(IRS-side reconstruction unavailable for this account shape)`]),
        ``,
        `── Corrected accrual (§7508A(d)) ──`,
        c.note,
        compLine,
        `Cumulative rate consumed: ${cumPct.toFixed(2)}% of the 25% cap${c.capBound?' — CAP BINDING (the penalty has stopped growing; removed disaster months are replaced by later capped months)':''}`,
        ...(chargedRows.length?[`Charged months run ${chargedRows[0].date} → ${chargedRows[chargedRows.length-1].date} (month-by-month table below)`]:[]),
        ...(ftpGrid==='disregard'&&c.skipped>0?[`${c.skipped} disaster-window months removed (would-be charges $${$(c.abatementRaw||0)}); removed months do not consume the cap.`]:[]),
        `Corrected TOTAL FTP, start → ${fmt(p.accruedAsOf)}: $${$(correctedTotal)} (${c.months} charged month(s)${p.iaDate&&returnTimely&&!ftpOnePctFrom?' — §6651(h) 0.25% IA rate where applicable':''}${ftpOnePctFrom?` — §6651(d) 1% months honored from ${fmt(ftpOnePctFrom)}`:''})`,
        `Less recomputed ASSESSED FTP (claimed above): $${$(recomputedFTPAssessed)}`,
        `Corrected accrued FTP: $${$(correctedAccrued)}`,
        ``,
        `── Correction ──`,
        `$${$(p.accruedPen)} (IRS accrual) − $${$(correctedAccrued)} (lawful accrual) = $${$(correction)}`,
        `LABEL: NOT a §6404(a) abatement of an assessment — unassessed accrual. Demand recomputation of the module accrual and payoff; claim abatement/refund of the disaster-period months per Frost Law practice.`,
      ];
      if(correction<=0.005&&correctedAccrued>=p.accruedPen)work.push(`NOTE: corrected accrual ≥ transcript accrual under this grid (25% cap interaction, §6651(d) months, or anchor offset) — no correction claimed.`);
      results.accrualItems.push({code:'§6651 FTP — accrued (unassessed)',irsAssessed:p.accruedPen,recomputed:correctedAccrued,abatement:correction,accrual:true,work,ftpDetail:c.detail});
      results.totalAccrual+=correction;
    }
  }

  results.totalMain=r2(results.totalMain);
  results.totalProtective=r2(results.totalProtective);
  results.totalAccrual=r2(results.totalAccrual);
  results.totalEconomic=r2(results.totalMain+results.totalAccrual);
  results.totalCombined=r2(results.totalMain+results.totalProtective);
  results.totalGrand=r2(results.totalMain+results.totalAccrual+results.totalProtective);

  // ── Verification layer (P1) ──
  const intRecon=reconstructInterestAssessments(p);
  let ftpRecon=null;
  if(p.ftp.assessed>0.005&&lastFTPDate&&ftpOriginalStart){
    ftpRecon=reconstructFTP({base:ftpBase,originalStart:ftpOriginalStart,
      endAnchor:lastFTPDate,payments:p.payments,iaDate:p.iaDate,returnTimely,onePctFrom:ftpOnePctFrom});
  }
  const penTotal=r2(Math.max(p.ftf.assessed,0)+Math.max(p.ftp.assessed,0)+Math.max(p.est.assessed,0)+Math.max(p.acc.assessed,0));
  const paidTotal=r2(p.payments.reduce((s,x)=>s+x.amount,0));
  const reconBalance=r2(p.netTax+penTotal+assessedInt-paidTotal);
  results.verification={
    interest:intRecon, ftp:ftpRecon?{...ftpRecon,assessed:p.ftp.assessed,variance:r2(p.ftp.assessed-ftpRecon.total)}:null,
    accruedInterest:accrIntRecon, accruedFTP:accrFtpRecon,
    balance:{computed:reconBalance,transcript:p.accountBalance,
      ok:p.accountBalance!=null?Math.abs(reconBalance-p.accountBalance)<=Math.max(1,Math.abs(p.accountBalance)*0.001):null},
  };
  if(accrIntRecon&&accrIntRecon.pct>5)results.warnings.push(`Accrued-interest reconstruction off by ${accrIntRecon.pct.toFixed(1)}% — verify payments and events before relying on the accrual correction.`);
  if(accrFtpRecon&&accrFtpRecon.pct>7.5)results.warnings.push(`Accrued-FTP reconstruction off by ${accrFtpRecon.pct.toFixed(1)}% — verify the IA date, §6651(h) eligibility, and payment list before relying on the accrual correction.`);
  for(const row of intRecon.rows){
    if(row.pct>5)results.warnings.push(`Interest assessment ${row.date}: reconstruction off by ${row.pct.toFixed(1)}% — verify parsed inputs before filing.`);
  }
  if(ftpRecon&&p.ftp.assessed>0&&Math.abs(p.ftp.assessed-ftpRecon.total)/p.ftp.assessed>0.05)
    results.warnings.push(`FTP reconstruction off by ${(Math.abs(p.ftp.assessed-ftpRecon.total)/p.ftp.assessed*100).toFixed(1)}% — verify section/(a)(2)-vs-(a)(3), start date, and payments.`);
  if(results.verification.balance.ok===false)
    results.warnings.push(`Balance reconciliation: computed $${$(reconBalance)} vs transcript $${$(p.accountBalance)} — a transaction may be missing or misparsed.`);

  const daysLeft=Math.max(0,Math.round((CLAIM_DEADLINE-new Date())/86400000));
  results.notes.push(`Claim deadline: ${fmt(CLAIM_DEADLINE)} (${daysLeft} days remaining)`);

  // ── Payment schedule & reconciliation (now includes §6662 — old version
  //    omitted TC 240 and reconciled $1,547 short on deficiency accounts) ──
  if (p.payments.length > 0) {
    const payWork=[`── Payment Schedule (${p.payments.length} payments, $${$(paidTotal)}) ──`];
    let cum=0;
    for(const pay of p.payments){
      cum+=pay.amount;
      const remaining=Math.max(0,p.netTax-cum);
      payWork.push(`  ${fmt(pay.date)}: $${$(pay.amount)} → cumulative $${$(cum)}, tax remaining $${$(remaining)}${inDisaster(pay.date)?' [disaster]':''}`);
    }
    payWork.push(``,`── Account Balance Reconciliation ──`,
      `Tax: $${$(p.netTax)} + Penalties (FTF+FTP+EST+§6662): $${$(penTotal)} + Interest: $${$(assessedInt)} − Payments: $${$(paidTotal)}`,
      `= $${$(reconBalance)}${p.accountBalance!=null?`  (transcript: $${$(p.accountBalance)} ${results.verification.balance.ok?'✓':'⚠ MISMATCH'})`:''}`);
    results.paymentSchedule=payWork;
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════
// UI COMPONENTS (JSX below this line)
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

function WorkDetail({item}) {
  const [open, setOpen] = useState(false);
  const [ftpOpen, setFtpOpen] = useState(false);
  const sectionStyle = {fontWeight:700, color:'#007cba', marginTop:8, borderBottom:'1px solid #b0c4d8', paddingBottom:2};

  return (
    <div style={{fontSize:12, color:'#4a5568'}}>
      <button onClick={()=>setOpen(!open)} style={{background:'none',border:'none',cursor:'pointer',color:'#007cba',fontSize:12,fontWeight:600,padding:'4px 0',textDecoration:'underline'}}>
        {open ? '▼ Hide work' : '▶ Show work'}
      </button>
      {open && (
        <div style={{background:'#eaf1f8',border:'1px solid #b0c4d8',borderRadius:4,padding:12,margin:'4px 0 8px',fontFamily:"'Ubuntu',sans-serif",fontSize:11,lineHeight:1.7,whiteSpace:'pre-wrap'}}>
          {item.work.map((w,i) => {
            if (w.startsWith('──') && w.endsWith('──')) {
              return <div key={i} style={sectionStyle}>{w.replace(/──/g,'').trim()}</div>;
            }
            if (w.trim() === '') return <div key={i} style={{height:6}} />;
            if (w.startsWith('NOTE:') || w.startsWith('LABEL:')) {
              return <div key={i} style={{background:'#fff3cd',padding:'2px 6px',borderRadius:3,margin:'2px 0',fontSize:10}}>{w}</div>;
            }
            return <div key={i}>{w}</div>;
          })}

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
                      <th style={{textAlign:'left'}}>Month begins</th>
                      <th style={{textAlign:'right'}}>Balance</th>
                      <th style={{textAlign:'center'}}>Rate</th>
                      <th style={{textAlign:'right'}}>FTP</th>
                      <th style={{textAlign:'left'}}>Note</th>
                    </tr></thead>
                    <tbody>
                      {(()=>{
                        // P5(b): display rounded per-month figures, but the
                        // running total accumulates the EXACT values so the
                        // footer always equals the engine total.
                        let cumExact=0;
                        return item.ftpDetail.map((m,i)=>{
                          cumExact+=m.ftpExact||0;
                          return (
                            <tr key={i} style={{background:m.skipped?'#fff3cd':'transparent',borderBottom:'1px solid #e2e8f0'}}>
                              <td style={{padding:'2px 4px'}}>{m.month}</td>
                              <td>{m.date}</td>
                              <td style={{textAlign:'right',fontFamily:'monospace'}}>${$(m.balance)}</td>
                              <td style={{textAlign:'center'}}>{m.rate}</td>
                              <td style={{textAlign:'right',fontFamily:'monospace',color:m.ftp>0?'#2e8b57':'#888'}}>${$(m.ftp)}</td>
                              <td style={{color:'#888',fontSize:9}}>{m.skipped?`DISREGARDED${m.wouldBe?` (−$${$(m.wouldBe)})`:''}`:`cum $${$(r2(cumExact))}`}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                    <tfoot>
                      <tr style={{borderTop:'2px solid #007cba',fontWeight:700}}>
                        <td colSpan={4} style={{padding:'3px 4px'}}>Total charged</td>
                        <td style={{textAlign:'right',fontFamily:'monospace',color:'#2e8b57'}}>
                          ${$(r2(item.ftpDetail.reduce((s,m)=>s+(m.ftpExact||0),0)))}
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

function VerificationCard({verification}) {
  const [open,setOpen]=useState(false);
  if(!verification)return null;
  const v=verification;
  const badge=(ok)=>ok?<span className="badge badge-ok">✓ match</span>:<span className="badge badge-warn">⚠ check</span>;
  return (
    <div className="card">
      <details open={open} onToggle={e=>setOpen(e.target.open)}>
        <summary style={{cursor:'pointer',fontWeight:600,fontSize:16,color:'#007cba',padding:'4px 0'}}>
          🔎 Verification — reconstruction of IRS-assessed amounts
        </summary>
        <div style={{fontSize:12,color:'#4a5568',margin:'8px 0'}}>
          Each assessed amount is reconstructed from the parsed transcript parameters. Small variances (rounding, day-count conventions) are normal; large variances mean a parsing or assumption error — fix the inputs, never the claim.
        </div>
        {v.interest && v.interest.rows.length>0 && (
          <table>
            <thead><tr><th>TC 196 date</th><th className="amt">Assessed</th><th className="amt">Reconstructed</th><th className="amt">Δ</th><th>Status</th></tr></thead>
            <tbody>
              {v.interest.rows.map((r,i)=>(
                <tr key={i}>
                  <td>{r.date}</td>
                  <td className="amt">${$(r.assessed)}</td>
                  <td className="amt">${$(r.predicted)}</td>
                  <td className="amt">${$(Math.abs(r.variance))} ({r.pct.toFixed(2)}%)</td>
                  <td>{badge(r.pct<=5)}</td>
                </tr>
              ))}
              {v.ftp && (
                <tr>
                  <td>FTP (through last TC 276)</td>
                  <td className="amt">${$(v.ftp.assessed)}</td>
                  <td className="amt">${$(v.ftp.total)} ({v.ftp.months} mo)</td>
                  <td className="amt">${$(Math.abs(v.ftp.variance))}</td>
                  <td>{badge(v.ftp.assessed>0?Math.abs(v.ftp.variance)/v.ftp.assessed<=0.05:true)}</td>
                </tr>
              )}
              {v.accruedInterest && (
                <tr>
                  <td>Accrued interest (as-of header)</td>
                  <td className="amt">${$(v.accruedInterest.figure)}</td>
                  <td className="amt">${$(v.accruedInterest.predicted)}</td>
                  <td className="amt">${$(Math.abs(r2(v.accruedInterest.figure-v.accruedInterest.predicted)))} ({v.accruedInterest.pct.toFixed(2)}%)</td>
                  <td>{badge(v.accruedInterest.pct<=5)}</td>
                </tr>
              )}
              {v.accruedFTP && (
                <tr>
                  <td>Accrued FTP (as-of header)</td>
                  <td className="amt">${$(v.accruedFTP.figure)}</td>
                  <td className="amt">${$(v.accruedFTP.predicted)} ({v.accruedFTP.months} mo)</td>
                  <td className="amt">${$(Math.abs(r2(v.accruedFTP.figure-v.accruedFTP.predicted)))} ({v.accruedFTP.pct.toFixed(2)}%)</td>
                  <td>{badge(v.accruedFTP.pct<=7.5)}</td>
                </tr>
              )}
              {v.balance && v.balance.transcript!=null && (
                <tr>
                  <td>Account balance</td>
                  <td className="amt">${$(v.balance.transcript)}</td>
                  <td className="amt">${$(v.balance.computed)}</td>
                  <td className="amt">${$(Math.abs(r2(v.balance.computed-v.balance.transcript)))}</td>
                  <td>{badge(v.balance.ok)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {v.interest && <div style={{fontSize:10,color:'#888'}}>{v.interest.note}</div>}
      </details>
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
  const [ftpGrid,setFtpGrid]=useState('postponed');
  const [altResults,setAltResults]=useState(null);

  const handleParse = useCallback(()=>{
    const p=parseTranscript(text); setParsed(p);
    const r=runAnalysis(p,{ftpGrid}); setResults(r);
    setAltResults(runAnalysis(p,{ftpGrid:ftpGrid==='postponed'?'disregard':'postponed'}));
    setStep(3);
  },[text,ftpGrid]);

  const handleGridChange = useCallback((g)=>{
    setFtpGrid(g);
    if(parsed){
      setResults(runAnalysis(parsed,{ftpGrid:g}));
      setAltResults(runAnalysis(parsed,{ftpGrid:g==='postponed'?'disregard':'postponed'}));
    }
  },[parsed]);

  const handlePDF = useCallback(async(file)=>{
    setLoading(true);
    try{
      if (!apiKey) { alert('Enter your Anthropic API key in Settings (gear icon).'); setLoading(false); return; }
      const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=()=>rej(new Error("Read failed"));r.readAsDataURL(file);});
      const apiUrl = import.meta.env.DEV ? '/api/anthropic/v1/messages' : 'https://api.anthropic.com/v1/messages';
      const resp=await fetch(apiUrl,{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:8000,
          messages:[{role:"user",content:[
            {type:"document",source:{type:"base64",media_type:"application/pdf",data:base64}},
            {type:"text",text:`Extract ALL text from this IRS Account Transcript VERBATIM.\n\nHEADER — reproduce these lines exactly as printed, one field per line, keeping every label word and every date (do NOT reword, merge, summarize, or omit any of them):\nRequest Date: MM-DD-YYYY\nForm Number: NNNN\nReport for Tax Period Ending: MM-DD-YYYY\nAccount balance: $X,XXX.XX\nAccrued interest: $X,XXX.XX As of: MM-DD-YYYY\nAccrued penalty: $X,XXX.XX As of: MM-DD-YYYY\nTax per return: $X,XXX.XX\nReturn due date or return received date (whichever is later): MM-DD-YYYY\nProcessing date: MM-DD-YYYY\n\nTRANSACTIONS: Each on ONE line as:\nCODE  Description  CYCLE  MM-DD-YYYY  $AMOUNT\n\nExample:\n150   Tax return filed                               20231805  06-05-2023  $77,764.00\n806   W-2 or 1099 withholding                                  04-15-2023  -$51,938.00\n240   Miscellaneous penalty IRC 6662                 20222605  07-18-2022  $1,547.00\n971   Installment agreement established                        07-28-2021  $0.00\n\nCRITICAL: 3-digit code, MM-DD-YYYY date, $AMOUNT on every line; preserve minus signs on credits and payments. Include EVERY transaction from ALL pages (150/240/276/271/290/291/196/197/670/706/971 and all others) — never truncate or summarize long payment lists. OUTPUT RULES: Respond with ONLY the transcript text. Your very first character must be the first header line (e.g. "Request Date: ..."). No preamble ("Here is...", "Below is..."), no markdown code fences, no closing commentary.`}
          ]}]})});
      const data=await resp.json();
      if (!resp.ok) {
        alert(`API error (${resp.status}): ${data.error?.message || JSON.stringify(data)}`);
        setLoading(false); return;
      }
      let extracted = data.content?.find(c=>c.type==='text')?.text || '';
// strip markdown fences if the model wrapped the output
extracted = extracted.replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/, '');
// drop leading preamble lines until the first recognizable transcript line
const exLines = extracted.split('\n');
const firstReal = exLines.findIndex(l =>
  /^(request date|form number|report for|tax period|account balance|accrued|tax per return|return due|processing date|\d{3}\s)/i.test(l.trim())
);
if (firstReal > 0) extracted = exLines.slice(firstReal).join('\n');
setText(extracted.trim()); setStep(2);
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
        .badge-prot{background:#ede4f7;color:#6b46a8;} .badge-acc{background:#d6f0ee;color:#0e7470;}
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
240   Miscellaneous penalty IRC 6662                 20222605  07-18-2022    $1,547.00
290   Additional tax assessed                        20222605  07-18-2022    $7,736.00
196   Interest charged for late payment              20223305  11-07-2022      $211.57
971   Notice issued CP 0014                                    11-07-2022        $0.00
610   Payment with return                                      09-14-2022     -$412.00
670   Payment                                                  05-19-2025     -$125.00

KEY: Each transaction line needs three things:
  1. 3-digit code (e.g. 150, 806, 166, 276, 240, 290, 196, 610, 670)
  2. Date in MM-DD-YYYY format (e.g. 11-07-2022)
  3. Dollar amount with $ sign (e.g. $837.92 or -$29,451.00)
Cycle column (8 digits) is optional — skip it if not on transcript.
Negative amounts = credits, withholding, or payments.
$0.00 lines (971, 960, 530) are informational — include them anyway.
TC 240 (§6662) and TC 290/291 (deficiency) lines are REQUIRED for
deficiency accounts — the engine branches on them.
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
            <div><strong>Due (postponed notices):</strong> {fmt(parsed.statutoryDue)}</div>
            <div><strong>Original due:</strong> {fmt(parsed.origDue)}</div>
            <div><strong>Filed:</strong> {fmt(parsed.filedDate)}</div>
            <div><strong>Gross Tax:</strong> <span className="mono">${$(parsed.taxGross)}</span></div>
            <div><strong>Credits:</strong> <span className="mono">${$(parsed.credits)}</span></div>
            <div><strong>Net Tax Due:</strong> <span className="mono" style={{fontWeight:700}}>${$(parsed.netTax)}</span></div>
            {parsed.isDeficiency&&<div><strong>Deficiency (TC 290/300):</strong> <span className="mono">${$(parsed.deficiencyTotal)}</span> <span className="badge badge-warn">§6651(a)(3)</span></div>}
            {parsed.acc.assessed>0&&<div><strong>§6662 Penalty:</strong> <span className="mono">${$(parsed.acc.assessed)}</span> <span className="badge badge-prot">protective</span></div>}
            <div><strong>Payments:</strong> {parsed.payments.length}</div>
            {parsed.accruedInt>0&&<div><strong>Accrued Interest:</strong> <span className="mono">${$(parsed.accruedInt)}</span>{parsed.accruedAsOf?` (as of ${fmt(parsed.accruedAsOf)})`:''}</div>}
            {parsed.accruedPen>0&&<div><strong>Accrued Penalty:</strong> <span className="mono">${$(parsed.accruedPen)}</span>{parsed.accruedAsOf?` (as of ${fmt(parsed.accruedAsOf)})`:''}</div>}
            {!parsed._accrIntSeen&&!parsed._accrPenSeen&&<div style={{color:'#c0392b',fontWeight:600}}>Accrued amounts: not found in extraction ⚠️</div>}
            {parsed.filedSource&&parsed.filedSource!=='header'&&<div style={{color:'#c0392b',fontWeight:600}}>Filed date approximated from {parsed.filedSource==='tc610'?'TC 610 payment-with-return':parsed.filedSource==='tc150'?'TC 150 posting date':'first payment'} ⚠️</div>}
            {parsed.iaDate&&<div><strong>IA:</strong> {fmt(parsed.iaDate)} <span className="badge badge-warn">§6651(h)</span></div>}
          </div>
          {parsed.parseWarnings.length>0&&<div style={{marginTop:12,padding:12,background:'#fff3cd',borderRadius:4,fontSize:13}}>{parsed.parseWarnings.map((w,i)=><div key={i}>⚠️ {w}</div>)}</div>}
          {results.warnings.length>0&&<div style={{marginTop:8,padding:12,background:'#fde0de',borderRadius:4,fontSize:13}}>{results.warnings.map((w,i)=><div key={i}>🛑 {w}</div>)}</div>}
        </div>

        <div className="card">
          <h2 style={{margin:'0 0 4px',fontSize:20}}>Kwong Computation</h2>
          <div style={{fontSize:12,color:'#4a5568',marginBottom:8}}>
            Every figure is anchored to the transcript: assessed items are claimed as §6404(a) abatements (Form 843 Line 2); unassessed accruals are quantified as a §7508A(d) recomputation demand. Nothing is claimed beyond what the IRS shows as assessed or accrued.
          </div>
          <div style={{fontSize:12,background:'#e8f0f7',border:'1px solid #b0c4d8',borderRadius:4,padding:'8px 12px',marginBottom:8}}>
            <strong>FTP month grid:</strong>{' '}
            <label style={{marginRight:14,cursor:'pointer'}}>
              <input type="radio" name="grid" checked={results.ftpGrid==='postponed'} onChange={()=>handleGridChange('postponed')} />{' '}
              Postponed-deadline (primary — months restart 7/11/2023)
            </label>
            <label style={{cursor:'pointer'}}>
              <input type="radio" name="grid" checked={results.ftpGrid==='disregard'} onChange={()=>handleGridChange('disregard')} />{' '}
              Day-disregard (conservative — straddle month still counts)
            </label>
            <div style={{fontSize:10,color:'#888',marginTop:2}}>The two grids differ by exactly one penalty month. Disclose the alternative in the Line 8 statement.</div>
          </div>
          <table><thead><tr>
            <th>Component</th>
            <th className="amt">IRS Assessed / Accrued</th>
            <th className="amt">Recomputed</th>
            <th className="amt">Abatement / Correction</th>
          </tr></thead><tbody>
            {results.items.map((item,i)=>(
              <tr key={i}>
                <td>
                  <div style={{fontWeight:600}}>{item.code}</div>
                  <WorkDetail item={item} />
                </td>
                <td className="amt">${$(item.irsAssessed)}</td>
                <td className="amt">${$(item.recomputed)}</td>
                <td className={`amt ${item.abatement>0?'pos':'zero'}`} style={{fontWeight:600}}>${$(item.abatement)}</td>
              </tr>
            ))}
            <tr style={{borderTop:'2px solid #007cba',background:'#f4f8fb'}}>
              <td style={{fontWeight:700,fontSize:15}}>Main claim — Form 843 Line 2 (assessed amounts)</td>
              <td></td><td></td>
              <td className="amt pos" style={{fontWeight:700,fontSize:17}}>${$(results.totalMain)}</td>
            </tr>
            {results.accrualItems.map((item,i)=>(
              <tr key={`a${i}`} style={{background:'#f2fbfa'}}>
                <td>
                  <div style={{fontWeight:600}}>{item.code} <span className="badge badge-acc">recomputation</span></div>
                  <WorkDetail item={item} />
                </td>
                <td className="amt">${$(item.irsAssessed)}</td>
                <td className="amt">${$(item.recomputed)}</td>
                <td className="amt" style={{fontWeight:600,color:'#0e7470'}}>${$(item.abatement)}</td>
              </tr>
            ))}
            {results.accrualItems.length>0 && (<>
              <tr style={{background:'#f2fbfa'}}>
                <td style={{fontWeight:700}}>Accrual corrections <span style={{fontWeight:400,fontSize:11,color:'#888'}}>(unassessed — demand recomputation of module accruals & payoff)</span></td>
                <td></td><td></td>
                <td className="amt" style={{fontWeight:700,color:'#0e7470'}}>${$(results.totalAccrual)}</td>
              </tr>
              <tr style={{borderTop:'2px solid #0e7470',background:'#eaf7f5'}}>
                <td style={{fontWeight:700,fontSize:15}}>Total relief — Line 2 + accrual corrections</td>
                <td></td><td></td>
                <td className="amt" style={{fontWeight:700,fontSize:17,color:'#0e7470'}}>${$(results.totalEconomic)}</td>
              </tr>
            </>)}
            {results.protectiveItems.map((item,i)=>(
              <tr key={`p${i}`} style={{background:'#faf7fd'}}>
                <td>
                  <div style={{fontWeight:600}}>{item.code} <span className="badge badge-prot">protective</span></div>
                  <WorkDetail item={item} />
                </td>
                <td className="amt">${$(item.irsAssessed)}</td>
                <td className="amt">${$(item.recomputed)}</td>
                <td className="amt" style={{fontWeight:600,color:'#6b46a8'}}>${$(item.abatement)}</td>
              </tr>
            ))}
            {results.protectiveItems.length>0 && (
              <tr style={{background:'#faf7fd'}}>
                <td style={{fontWeight:700}}>Protective claim subtotal <span style={{fontWeight:400,fontSize:11,color:'#888'}}>(file segregated; not in main Line 2)</span></td>
                <td></td><td></td>
                <td className="amt" style={{fontWeight:700,color:'#6b46a8'}}>${$(results.totalProtective)}</td>
              </tr>
            )}
          </tbody><tfoot>
            <tr style={{borderTop:'2px solid #007cba'}}>
              <td style={{fontWeight:700,fontSize:16}}>Combined (if everything granted)</td>
              <td></td><td></td>
              <td className="amt pos" style={{fontWeight:700,fontSize:18}}>${$(results.totalGrand)}</td>
            </tr>
          </tfoot></table>
        </div>

        <VerificationCard verification={results.verification} />

        <Form843Panel parsed={parsed} results={results} altResults={altResults} />

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
                  if (w.includes('[disaster]')) {
                    return <div key={i} style={{background:'#fff3cd',padding:'1px 4px',borderRadius:2}}>{w}</div>;
                  }
                  if (w.includes('⚠ MISMATCH')) {
                    return <div key={i} style={{background:'#fde0de',padding:'1px 4px',borderRadius:2}}>{w}</div>;
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
          <strong>Legal Basis:</strong> I.R.C. § 7508A(d) (2019 version); <em>Kwong v. United States</em>, 179 Fed. Cl. 382 (2025); <em>Abdo v. Commissioner</em>, 162 T.C. 148 (2024). Disaster period: Jan 20, 2020 – Jul 10, 2023. Protective items (§6662 crystallization) rest on a reading beyond the holdings of those cases and are labeled accordingly. Computation aid only — verify per Circular 230 § 10.22.
        </div>

        <div style={{display:'flex',gap:8,margin:'16px 0'}}>
          <button className="btn btn-secondary" onClick={()=>{setStep(2);setResults(null);setParsed(null);}}>← Edit</button>
          <button className="btn btn-secondary" onClick={()=>{setText('');setStep(1);setResults(null);setParsed(null);}}>New Transcript</button>
        </div>
      </>)}
    </div>
  );
}
