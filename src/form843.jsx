import { useState } from "react";
// FORM 843 PACKAGE GENERATOR — Kwong / former §7508A(d)
//
// Document structure mirrors the office exemplars:
//   Form843_Line8_TY2019.docx              (deficiency / §6651(a)(3) / §6662 protective)
//   Form843_Davi_TY2020_Line8_FINAL.docx   (accrual-heavy / IA §6651(h) / §6651(d))
//   Form_843_Computation_TY2022_DRAK.txt   (line-by-line + CDP posture)
// and the TAC CLE five-part narrative: Legal Authority · Facts · Computation ·
// Conclusion · Protective. Plead ALL theories per year.
//
// Wiring (see PATCHES.md): <Form843Panel parsed={parsed} results={results}
// altResults={altResults} /> where altResults = runAnalysis on the OTHER
// FTP grid, so the alternative computation can be disclosed with a number.

//constants (kept local so the module has zero imports from App) ──
const DISASTER_START = new Date(2020, 0, 20);
const DISASTER_END   = new Date(2023, 6, 10);
const KWONG_DUE      = new Date(2023, 6, 10);
const POSTPONED_FIRST= new Date(2023, 6, 11);
const F_7508AF_DATE  = new Date(2025, 11, 26); // Pub. L. 119-64 enactment date
// §7508A(f) applies to claims filed strictly AFTER 12/26/2025 — a claim dated
// 12/26/2025 itself is NOT after the enactment date.
const afterEnactment = (claimDate)=>claimDate && claimDate.getTime() >= new Date(2025,11,27).getTime();
// Module posture relative to the disregarded window, keyed to the due date:
// 'within' (due inside window), 'before' (due pre-1/20/2020 old balance that
// accrued through the window), 'after' (post-window module, e.g. TY2023+).
const duePosture = (p)=>{
  const d = p.statutoryDue || p.origDue;
  if(!d) return 'unknown';
  if(inDisaster(d) || inDisaster(p.origDue)) return 'within';
  if(d < DISASTER_START) return 'before';
  return 'after';
};

const fmt = (dt) => dt ? `${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}/${dt.getFullYear()}` : '[VERIFY]';
const money = (n) => (n==null||isNaN(n)) ? '[VERIFY]' : '$'+Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const paren = (n) => '('+money(Math.abs(n))+')';
const r2 = (n) => Math.round(n*100)/100;
const addYears = (dt,n)=>{ const x=new Date(dt); x.setFullYear(x.getFullYear()+n); return x; };
const inDisaster = (dt)=>dt&&dt>=DISASTER_START&&dt<=DISASTER_END;

const TC_DESC = {
  '150':'Return filed; tax per return','290':'Additional tax assessed','300':'Additional tax assessed (exam)','291':'Tax abatement',
  '160':'Failure-to-file penalty, §6651(a)(1)','166':'Failure-to-file penalty, §6651(a)(1)',
  '161':'FTF penalty reversal','167':'FTF penalty reversal',
  '270':'Failure-to-pay penalty, §6651','276':'Failure-to-pay penalty, §6651','271':'FTP penalty reversal','277':'FTP penalty reversal',
  '170':'Estimated-tax addition, §6654','176':'Estimated-tax addition, §6654','173':'Estimated-tax addition, §6654','171':'§6654 reversal','177':'§6654 reversal',
  '240':'Accuracy-related penalty, §6662','241':'§6662 penalty reversal',
  '196':'Underpayment interest, §6601','336':'Interest assessed','197':'Interest abated','337':'Interest abated','340':'Restricted interest assessed','341':'Restricted interest abated',
  '806':'W-2 or 1099 withholding','766':'Credit to account','846':'Refund issued',
  '610':'Payment with return','670':'Payment','680':'Payment','706':'Credit transferred in','671':'Payment reversal',
};

// FTF months under the postponed deadline (duplicated from the engine so the
// narrative sentence and the engine count cannot diverge silently — both
// implement the same month-or-fraction walk from 7/11/2023).
function ftfMonthsKwong(filedDate){
  if(!filedDate||filedDate<=KWONG_DUE) return 0;
  const ad=POSTPONED_FIRST.getDate(); let m=new Date(POSTPONED_FIRST),n=0;
  while(m<=filedDate&&n<5){ n++; let mm=m.getMonth()+1,yy=m.getFullYear(); if(mm>11){mm=0;yy++;} const dim=new Date(yy,mm+1,0).getDate(); m=new Date(yy,mm,Math.min(ad,dim)); }
  return n;
}
const findItem=(arr,s)=>(arr||[]).find(i=>i.code.includes(s));
const grab=(work,re)=>{ for(const w of (work||[])){ const m=String(w).match(re); if(m) return m; } return null; };

// ═══════════════════════════════════════════════════════════════
// SECTION BUILDERS — each returns a markdown string
// ═══════════════════════════════════════════════════════════════

function bTransactionTable(p){
  const rows=[];
  if(p.tc150date) rows.push([ '150', p.tc150date, TC_DESC['150'], money(p.tax150) ]);
  // Credits: prefer the dated 806/766/846 events so the filed table matches
  // the transcript line-for-line (a netted, undated "806/766" lump is not a
  // faithful reproduction). amount<0 = a credit to the taxpayer (withholding /
  // TC 766), shown in parentheses; amount>0 = a refund issued back out (TC
  // 846), shown as a positive. Fall back to the aggregate only when the
  // parser supplied no dated events.
  if(p.creditEvents && p.creditEvents.length){
    for(const e of p.creditEvents) rows.push([ e.tc, e.date||null, TC_DESC[e.tc]||(e.amount<0?'Withholding / credit':'Refund issued'), e.amount<0?paren(Math.abs(e.amount)):money(e.amount) ]);
  } else if(p.credits>0.005){
    rows.push([ '806/766', null, 'Withholding and other credits (aggregate — itemize against transcript before filing)', paren(p.credits) ]);
  }
  for(const e of (p.taxAdjEvents||[])) rows.push([ e.tc, e.date, TC_DESC[e.tc]||'Tax adjustment', e.amount>=0?money(e.amount):paren(e.amount) ]);
  const penMap={ftf:'§6651(a)(1)',ftp:'§6651(a)(2)/(3)',est:'§6654',acc:'§6662'};
  for(const code of ['ftf','ftp','est','acc']) for(const e of (p[code]?.events||[]))
    rows.push([ e.tc, e.date, (e.amount>=0?'':'Reversal — ')+(TC_DESC[e.tc]||penMap[code]+' penalty'), e.amount>=0?money(e.amount):paren(e.amount) ]);
  for(const e of (p.intEvents||[])) rows.push([ e.tc, e.date, TC_DESC[e.tc]||(e.amount>=0?'Interest assessed':'Interest abated'), e.amount>=0?money(e.amount):paren(e.amount) ]);
  for(const e of (p.payments||[])) rows.push([ e.tc, e.date, e.amount>=0?(TC_DESC[e.tc]||'Payment'):'Payment reversal', e.amount>=0?paren(e.amount):money(-e.amount) ]);
  const nullKey = p.tc150date ? p.tc150date.getTime()+1 : 0; // undated credits sort just after TC 150
  rows.sort((a,b)=>(a[1]?a[1].getTime():nullKey)-(b[1]?b[1].getTime():nullKey));
  let t='| TC | Date | Transaction | Amount |\n| --- | --- | --- | --- |\n';
  for(const r of rows) t+=`| ${r[0]} | ${r[1]?fmt(r[1]):'—'} | ${r[2]} | ${r[3]} |\n`;
  return t;
}

function bHeader(p,tp,L){
  const seg=[];
  if(L.main>0.005) seg.push(`${money(L.main)} primary (assessed)`);
  if(L.accrual>0.005) seg.push(`${money(L.accrual)} accrual correction${L.accrualInLine2?'':' (recomputation demand — not in Line 2)'}`);
  if(L.protective>0.005) seg.push(`${money(L.protective)} protective (segregated in Section V${L.protectiveInLine2?'':'; not in Line 2'})`);
  return [
    `**FORM 843 — LINE 8**`,``,
    `**Detailed Explanation and Computation (Attachment to Form 843)**`,``,
    `| | |`,`| --- | --- |`,
    `| **Taxpayer** | ${tp.name} — SSN XXX-XX-${tp.ssn4}${tp.poa?' (Power of Attorney, Form 2848, on file)':''} |`,
    `| **Tax / Return** | Individual income tax — Form ${p.formType||'1040'}${tp.status?` (${tp.status})`:''} |`,
    `| **Tax Period (Line 1)** | January 1, ${p.taxYear} – December 31, ${p.taxYear} |`,
    `| **Amount Claimed (Line 2)** | ${money(L.line2)} total — ${seg.join('; ')} |`,
    `| **Date of Claim** | ${fmt(tp.claimDate)} |`,``,
  ].join('\n');
}

function bStatement(p,L){
  const paidTotal=r2((p.payments||[]).reduce((s,x)=>s+x.amount,0));
  const unpaidLine = (p.accountBalance!=null && p.accountBalance< -0.005)
    ? `The account presently shows a credit balance of ${paren(p.accountBalance)}; in addition to the abatement requested, the Taxpayer requests refund of that overpayment with interest under I.R.C. § 6611.`
    : (paidTotal>0.005
        ? `Payments totaling ${money(paidTotal)} have been applied to the account; to the extent any payment was absorbed by amounts abated under this claim, refund with overpayment interest under I.R.C. § 6611 is requested (see Sections VII and IX).`
        : `All claimed amounts are presently unpaid; this filing is accordingly a request for abatement under I.R.C. § 6404(a)(1) and (a)(3), and a claim for refund under I.R.C. §§ 6402 and 7422 to the extent of any later payment, offset, or collection.`);
  const comps=[];
  if(L.items.int&&L.items.int.abatement>0.005) comps.push(`underpayment interest of ${money(L.items.int.abatement)}`);
  if(L.items.ftp&&L.items.ftp.abatement>0.005) comps.push(`failure-to-pay penalty of ${money(L.items.ftp.abatement)}`);
  if(L.items.ftf&&L.items.ftf.abatement>0.005) comps.push(`failure-to-file penalty of ${money(L.items.ftf.abatement)}`);
  if(L.items.est&&L.items.est.abatement>0.005) comps.push(`§ 6654 estimated-tax addition of ${money(L.items.est.abatement)}`);
  if(L.accrual>0.005&&L.accrualInLine2) comps.push(`${money(L.accrual)} of corrected accrued (unassessed) interest and penalty (Section IV, “Accrued (Unassessed) Amounts”)`);
  const protPhrase = L.protective>0.005
    ? (L.protectiveInLine2
        ? `; and a protective claim of ${money(L.protective)} identified and segregated in Section V`
        : `. In addition, a protective claim of ${money(L.protective)} is identified in Section V (not included in the Line 2 amount)`)
    : '';
  const accrualAside = (L.accrual>0.005&&!L.accrualInLine2)
    ? ` The Taxpayer further demands recomputation of the ${money(L.accrual)} of accrued (unassessed) amounts quantified in Section IV (“Accrued (Unassessed) Amounts”), which is stated as a correction demand and is not included in the Line 2 amount.`
    : '';
  return [
    `# I. Statement of Claim`,``,
    `${L.tpName} (the “Taxpayer”) requests abatement of ${money(L.line2)} of interest and penalties assessed or accrued on the Taxpayer’s Form ${p.formType||'1040'} account for the tax year ended December 31, ${p.taxYear}, and a refund, with interest under I.R.C. § 6611, of any portion of that amount that has been or is hereafter paid, offset, or collected. The claim comprises ${comps.length?comps.join('; '):'the amounts shown in Section IV'}${protPhrase}. The amounts at issue were determined without disregarding the COVID-19 federally declared disaster period, January 20, 2020 through July 10, 2023, as required by the 2019 version of I.R.C. § 7508A(d).${accrualAside} ${unpaidLine}`,``,
  ].join('\n');
}

function bLegal(claimDate){
  const after=afterEnactment(claimDate);
  return [
`# II. Legal Basis`,``,
`The 2019 version of I.R.C. § 7508A(d), added by the Taxpayer Certainty and Disaster Tax Relief Act of 2019, Pub. L. No. 116-94, Div. Q, § 205(a), provides that, for any qualified taxpayer, the period beginning on the earliest incident date specified in the disaster declaration and ending 60 days after the latest incident date “shall be disregarded” in determining, under the internal revenue laws, (A) whether any of the acts described in § 7508(a)(1) — including filing returns and paying tax — were performed within the time prescribed, (B) the amount of any interest, penalty, additional amount, or addition to the tax, and (C) the amount of any credit or refund. All references herein are to the 2019 version of subsection (d) as in effect for the COVID-19 disaster.`,``,
`In *Abdo v. Commissioner*, 162 T.C. 148 (2024), the Tax Court held that § 7508A(d) is an unambiguously self-executing mandatory postponement that operates by force of law without any IRS action, and invalidated Treas. Reg. § 301.7508A-1(g)(1) and (g)(2) to the extent they limit the acts automatically postponed. In *Kwong v. United States*, 179 Fed. Cl. 382 (2025), the Court of Federal Claims held that the COVID-19 disregarded period runs from January 20, 2020 (the earliest incident date in the COVID-19 major disaster declarations) through July 10, 2023 (60 days after the May 11, 2023 close of the incident period), and, applying *Loper Bright Enterprises v. Raimondo*, 144 S. Ct. 2244 (2024), invalidated Treas. Reg. § 301.7508A-1(g)(3)(ii), which had purported to cap the mandatory postponement at one year. *Kwong* further held that the 2021 amendment to § 7508A(d) (Pub. L. No. 117-58) applies only to disasters declared after November 15, 2021, and does not apply to the COVID-19 disaster. 179 Fed. Cl. at 391–92.`,``,
`Because the statutory command is that the disregarded period “shall be disregarded” in determining “the amount of any interest, penalty, additional amount, or addition to the tax” (former § 7508A(d), clause (B)), interest and penalty amounts attributable to days or months within January 20, 2020 through July 10, 2023 were determined without statutory authority. Such amounts are “excessive in amount” within the meaning of I.R.C. § 6404(a)(1) and “erroneously or illegally assessed” within the meaning of I.R.C. § 6404(a)(3); I.R.C. § 6404(i) expressly cross-references § 7508A for the authority to suspend the running of interest by reason of a Presidentially declared disaster. ${after?'For claims filed after December 26, 2025, I.R.C. § 7508A(f), added by Pub. L. No. 119-64, § 2(a)(1) (Dec. 26, 2025), provides that the disregarded period is treated as an extension for purposes of the § 6511(b)(2)(A) lookback (see Section IX).':'This claim is filed on or before December 26, 2025; the lookback position stated in Section IX is identified as protective.'}`,``,
  ].join('\n');
}

function bFacts(p,tp){
  const sents=[];
  const posture=duePosture(p);
  if(posture==='within') sents.push(`The return and payment due date${p.statutoryDue&&p.origDue&&p.statutoryDue.getTime()!==p.origDue.getTime()?`s (${fmt(p.origDue)} original; ${fmt(p.statutoryDue)} as administratively postponed)`:` (${fmt(p.statutoryDue||p.origDue)})`} fell within the disregarded period; under § 7508A(d) the return was not due, and payment was not due, before July 10, 2023, and no failure-to-file or failure-to-pay month may begin before July 11, 2023.`);
  else if(posture==='before') sents.push(`The return and payment due date (${fmt(p.statutoryDue||p.origDue)}) preceded the disregarded period; nevertheless, every failure-to-pay month and every interest day falling within January 20, 2020 – July 10, 2023 must be disregarded under § 7508A(d) in determining the amount of any penalty or interest on the pre-existing balance.`);
  else if(posture==='after') sents.push(`The return due date (${fmt(p.statutoryDue||p.origDue)}) falls after the disregarded period; the relief claimed for this year is limited to the components whose accrual or installment deadlines fall within the period, as shown in Section IV.`);
  else sents.push(`[VERIFY: the return due date was not parsed from the transcript; confirm the module due date before filing.]`);
  const firstDef=(p.taxAdjEvents||[]).find(e=>e.amount>0);
  if(p.isDeficiency&&firstDef){
    sents.push(`A deficiency of ${money(p.deficiencyTotal)} was assessed ${fmt(firstDef.date)}${inDisaster(firstDef.date)?', within the disregarded period; the § 6651(a)(3) notice-and-demand payment deadline (approximately 21 days later) also fell within the period, so under the mandated postponement payment was not due before July 10, 2023':''}.`);
  }
  if(p.filedDate){
    if(posture==='within'){
      if(p.filedDate<=KWONG_DUE) sents.push(`The return was received ${fmt(p.filedDate)} — on or before the July 10, 2023 postponed deadline and therefore timely under § 7508A(d)${p.statutoryDue&&p.filedDate<=p.statutoryDue?' (and timely under the administrative deadline as well)':''}.`);
      else { const mo=ftfMonthsKwong(p.filedDate); sents.push(`The return was received ${fmt(p.filedDate)}, after the postponed July 10, 2023 deadline; the § 6651(a)(1) month-or-fraction count from that deadline is ${mo}${mo>=5?' (the statutory maximum)':''}.`); }
    } else {
      sents.push(`The return was received ${fmt(p.filedDate)}.`);
    }
  }
  if((posture==='within'||posture==='before')&&(p.intEvents||[]).some(e=>e.amount>0)){
    const intInWindow=(p.intEvents||[]).some(e=>e.amount>0&&inDisaster(e.date));
    sents.push(`${intInWindow?'One or more interest assessments were made within the disregarded period, and each':'Each'} interest assessment on the account includes accrual attributable to days within January 20, 2020 – July 10, 2023, or compounding on amounts that accrued during that period.`);
  }
  const accDates=(p.acc?.events||[]).filter(e=>e.amount>0&&inDisaster(e.date)).map(e=>fmt(e.date));
  if(accDates.length) sents.push(`The § 6662 accuracy-related penalty was determined and assessed on ${accDates.join(', ')}, within the disregarded period (see Section V, protective claim).`);
  if(p.iaDate) sents.push(`An installment agreement was established ${fmt(p.iaDate)} (TC 971); where applicable, § 6651(h) reduces the failure-to-pay rate to 0.25% per month.`);
  if(p.accruedAsOf&&(p.accruedInt>0.005||p.accruedPen>0.005)) sents.push(`The transcript reports accrued (unassessed) interest of ${money(p.accruedInt)} and accrued penalty of ${money(p.accruedPen)} as of ${fmt(p.accruedAsOf)}, computed without the mandatory disregard.`);
  return [
`# III. Factual Basis`,``,
`**Qualified taxpayer status.** At all relevant times the Taxpayer’s principal residence was located in ${tp.state||'[STATE]'}, within a COVID-19 federally declared major disaster area (FEMA Declaration No. ${tp.fema||'DR-[____]'}, incident period beginning January 20, 2020). Every state, territory, and the District of Columbia received a COVID-19 major disaster declaration under the Stafford Act; the Taxpayer is therefore a “qualified taxpayer” under the 2019 version of § 7508A(d).`,``,
`**Account history.** The following facts are established by the IRS Form ${p.formType||'1040'} account transcript for the period ending December 31, ${p.taxYear} (Exhibit B):`,``,
bTransactionTable(p),
`**Accrual within the disregarded period.** ${sents.join(' ')}`,``,
  ].join('\n');
}

function compTable(rows){
  let t='| Item | As assessed / accrued | As recomputed (§ 7508A(d)) | Abatement / correction |\n| --- | --- | --- | --- |\n';
  for(const r of rows) t+=`| ${r[0]} | ${money(r[1])} | ${money(r[2])} | **${money(r[3])}** |\n`;
  return t;
}

function bComputation(p,results,alt,L){
  const out=[`# IV. Computation`,``,
`All interest is computed with daily compounding under I.R.C. § 6622 at the quarterly rates established under I.R.C. § 6621 (366-day basis in leap years). Assessed amounts were first reconstructed from the transcript (see the tool’s verification layer) and the recomputation then removes all accrual attributable to January 20, 2020 – July 10, 2023, clamped so that no component claim exceeds the amount the Service actually assessed.`,``];
  let sub='A'.charCodeAt(0);
  const Letter=()=>String.fromCharCode(sub++)+'.';

  // ── FTF ──
  const ftf=L.items.ftf;
  const posture=duePosture(p);
  out.push(`## ${Letter()} Failure-to-File Penalty — I.R.C. § 6651(a)(1)`,``);
  if(!ftf && (!p.ftf || p.ftf.assessed<=0.005)){
    const timelyNote = p.filedDate&&p.filedDate<=KWONG_DUE&&posture==='within'
      ? (p.statutoryDue&&p.filedDate<=p.statutoryDue
          ? ' The return was timely under both the administrative deadline and the § 7508A(d) postponed deadline.'
          : ' The return was timely under the § 7508A(d) postponed deadline.')
      : '';
    out.push(`No failure-to-file penalty was assessed.${timelyNote} Abatement: $0.00.`,``);
  } else if(!ftf && p.ftf && p.ftf.assessed>0.005){
    out.push(`A failure-to-file penalty of ${money(p.ftf.assessed)} is posted on the account, but the computation engine generated no § 7508A(d) relief for it${posture==='after'?' because the module’s filing deadline falls after the disregarded period':''} (see “Components Examined and Excluded” below and the engine notes). The component was examined and is excluded, not overlooked.`,``);
  } else if(ftf && ftf.recomputed<=0.005 && ftf.abatement>0.005 && p.filedDate && p.filedDate<=KWONG_DUE){
    out.push(`The Service assessed ${money(ftf.irsAssessed)}. The return was received ${fmt(p.filedDate)}, on or before the July 10, 2023 postponed deadline; under § 7508A(d) the return is timely. The correct addition is $0.00.`,``,compTable([[ 'FTF § 6651(a)(1)', ftf.irsAssessed, 0, ftf.abatement ]]));
  } else if(ftf && ftf.abatement>0.005 && p.filedDate){
    const mo=ftfMonthsKwong(p.filedDate);
    out.push(`The Service assessed ${money(ftf.irsAssessed)} measured from ${fmt(p.statutoryDue)}. Under the postponed deadline the § 6651(a)(1) month-or-fraction count is ${mo}${mo>=5?' (the statutory maximum)':''}, and the addition recomputes to ${money(ftf.recomputed)}${(ftf.work||[]).some(w=>String(w).includes('minimum'))?' (the § 6651(a) flush-language minimum applies because the return was filed more than 60 days after even the postponed deadline)':''}.`,``,compTable([[ 'FTF § 6651(a)(1)', ftf.irsAssessed, ftf.recomputed, ftf.abatement ]]));
  } else if(ftf && ftf.abatement>0.005){
    out.push(`The Service assessed ${money(ftf.irsAssessed)}; recomputed under the § 7508A(d) postponed deadline, the correct addition is ${money(ftf.recomputed)} (per the engine computation; the return-received date was not parsed — see the practitioner flags).`,``,compTable([[ 'FTF § 6651(a)(1)', ftf.irsAssessed, ftf.recomputed, ftf.abatement ]]));
  } else if(ftf){
    out.push(`The Service assessed ${money(ftf.irsAssessed)}. The recomputation under the postponed deadline produces the same amount${(ftf.work||[]).some(w=>String(w).includes('minimum'))?' — the return was filed more than 60 days after even the July 10, 2023 postponed deadline, so the § 6651(a) flush-language minimum penalty governs under both computations':''}. No FTF abatement is claimed for this year; the component was examined and is excluded, not overlooked.`,``);
  }

  // ── FTP ──
  const ftp=L.items.ftp;
  out.push(`## ${Letter()} Failure-to-Pay Penalty — I.R.C. § 6651(a)(2)/(a)(3)`,``);
  if(!ftp && (!p.ftp || p.ftp.assessed<=0.005)){
    out.push(`No failure-to-pay penalty is posted as assessed.${p.accruedPen>0.005?' The transcript carries an accrued (unassessed) penalty addressed in the “Accrued (Unassessed) Amounts” subsection below.':''}`,``);
  } else if(!ftp && p.ftp && p.ftp.assessed>0.005){
    out.push(`A failure-to-pay penalty of ${money(p.ftp.assessed)} is posted on the account, but the computation engine generated no § 7508A(d) relief for it${posture==='after'?' because the module’s payment due date falls after the disregarded period':''} (see “Components Examined and Excluded” below and the engine notes). The component was examined and is excluded, not overlooked.`,``);
  } else if(ftp){
    const a3=ftp.code.includes('(a)(3)');
    const method=(ftp.work||[]).find(w=>/^(Postponed-deadline grid|Day-disregard grid)/.test(String(w)))||'';
    const altItem=alt?findItem(alt.items,'FTP'):null;
    const primaryIsPostponed = method ? /^Postponed-deadline grid/.test(String(method)) : results.ftpGrid==='postponed';
    const altLabel = primaryIsPostponed
      ? 'a day-disregard reading that preserves the Service’s month anchors and removes only months falling wholly within the disregarded period'
      : 'the postponed-deadline reading under which no penalty month may begin before July 11, 2023';
    const methodStr = method ? ` Recomputation method: ${String(method).trim()}${/[.!?]$/.test(String(method).trim())?'':'.'}` : '';
    out.push(`The Service assessed ${money(ftp.irsAssessed)} under § 6651${a3?'(a)(3), measured from the notice-and-demand payment deadline following the deficiency assessment':'(a)(2), measured from the original payment due date'}.${methodStr} The recomputed penalty is ${money(ftp.recomputed)}.`,``,
      compTable([[ `FTP § 6651${a3?'(a)(3)':'(a)(2)'}`, ftp.irsAssessed, ftp.recomputed, ftp.abatement ]]),
      `**Alternative computation (disclosed for completeness under the variance doctrine).** Under ${altLabel}, the abatement of the assessed penalty would be ${altItem?money(altItem.abatement):'[run the alternative grid in the tool]'}; any difference between the two computations arises at straddle months under the month-or-fraction rule. The Taxpayer claims the amount stated above and, in the alternative, the other computation, whichever is greater as ultimately allowed.`,``);
  }

  // ── §6654 ──
  const est=L.items.est;
  out.push(`## ${Letter()} Estimated-Tax Addition — I.R.C. § 6654`,``);
  if(!est && (!p.est || p.est.assessed<=0.005)){
    out.push(`No § 6654 addition was assessed. Nothing to abate.`,``);
  } else if(!est && p.est && p.est.assessed>0.005){
    const ty0=parseInt(p.taxYear);
    const dls0=[new Date(ty0,3,15),new Date(ty0,5,15),new Date(ty0,8,15),new Date(ty0+1,0,15)];
    const inD0=dls0.filter(dl=>dl>=DISASTER_START&&dl<=DISASTER_END).length;
    if(inD0===0){
      out.push(`A § 6654 addition of ${money(p.est.assessed)} was assessed, but none of the four installment deadlines for tax year ${p.taxYear} falls within the disregarded period; no § 7508A(d) relief reaches this component. The component was examined and is excluded, not overlooked.`,``);
    } else {
      out.push(`[VERIFY — DO NOT FILE AS-IS] A § 6654 addition of ${money(p.est.assessed)} was assessed and ${inD0} of its 4 installment deadlines fall within the disregarded period, but the computation engine produced no § 6654 item. This is the known engine gating bug — apply PATCH 1 from PATCHES.md and regenerate this package.`,``);
    }
  } else if(est){
    const ty=parseInt(p.taxYear);
    const dls=[new Date(ty,3,15),new Date(ty,5,15),new Date(ty,8,15),new Date(ty+1,0,15)];
    const inD=dls.filter(dl=>dl>=DISASTER_START&&dl<=DISASTER_END);
    let qt='| Installment | Nominal deadline | Within disregarded period |\n| --- | --- | --- |\n';
    dls.forEach((dl,i)=>{ qt+=`| Q${i+1} | ${fmt(dl)} | ${dl>=DISASTER_START&&dl<=DISASTER_END?'**Yes**':'No'} |\n`; });
    out.push(`The Service assessed ${money(est.irsAssessed)}. Under § 7508(a)(1)(B), payment of any income tax or installment thereof is among the postponed acts; installment deadlines falling within the disregarded period are postponed by § 7508A(d).`,``,qt,
      inD.length===4
        ? `All four installment deadlines fall within the disregarded period; the addition is abated in full: ${money(est.abatement)}.`
        : `${inD.length} of 4 installment deadlines fall within the disregarded period. The portion of the addition attributable to those installments — allocated here pro rata at ${inD.length}/4 of the assessed amount, ${money(est.abatement)} — is claimed; the precise per-quarter allocation should be confirmed against a Form 2210-style computation before any partial allowance is accepted.`,``);
  }

  // ── §6601 interest (assessed) ──
  const intI=L.items.int;
  const netInt=r2((p.intEvents||[]).reduce((s,e)=>s+e.amount,0));
  out.push(`## ${Letter()} Underpayment Interest — I.R.C. §§ 6601, 6622`,``);
  if(!intI && netInt<=0.005){
    out.push(`No interest is posted as assessed.${p.accruedInt>0.005?' The transcript carries accrued (unassessed) interest addressed in the “Accrued (Unassessed) Amounts” subsection below.':''}`,``);
  } else if(!intI){
    out.push(`Assessed interest of ${money(netInt)} (net of reversals) is posted on the account, but the computation engine generated no § 7508A(d) interest relief for this module${posture==='after'?' because the underpayment period begins after the disregarded period ended':''} (see “Components Examined and Excluded” below and the engine notes). The component was examined and is excluded, not overlooked.`,``);
  } else {
    const days=grab(intI.work,/Days disregarded[^:]*:\s*([\d,]+)/);
    out.push(`The Service assessed ${money(intI.irsAssessed)} of underpayment interest (net of reversals). The corrected computation rebuilds the account from the due date with the ${days?days[1]:'[N]'} days within January 20, 2020 – July 10, 2023 disregarded, applies every payment tax-first, and excludes the abated penalties from the compounding base. Recomputed interest: ${money(intI.recomputed)}.`,``,
      compTable([[ 'Interest §§ 6601/6622', intI.irsAssessed, intI.recomputed, intI.abatement ]]),
      `Because the assessed figure includes the Service’s interest-on-penalty compounding while the recomputed base excludes the abated penalties, the differential above already captures all interest attributable to the abated penalties; no separate “interest on penalty” amount is claimed, which avoids double counting.`,``);
  }

  // ── zero-relief / informational notes from the engine ──
  const zeroNotes=(results.notes||[]).filter(n=>/no §7508A\(d\)|unassessed — informational|no protective claim generated|no §7508A\(d\)\/Kwong relief/i.test(n));
  if(zeroNotes.length){ out.push(`## ${Letter()} Components Examined and Excluded`,``); for(const n of zeroNotes) out.push(`- ${n}`); out.push(``); }

  // ── accrual corrections ──
  if((results.accrualItems||[]).length){
    out.push(`## ${Letter()} Accrued (Unassessed) Amounts — Correction and Recomputation Demand`,``,
`The transcript’s running accruals as of ${fmt(p.accruedAsOf)} were computed without the mandatory disregard. These amounts are not yet assessed; they are presented as a demand that the module accruals and any payoff figure be recomputed under § 7508A(d)${L.accrualInLine2?', and the corrected differential is included in the Line 2 amount as penalty and interest “accrued” in excess of the lawful amount':''}. If the Service hereafter assesses any portion of the uncorrected accruals, each such assessment is subject to immediate abatement under § 6404(a) on the grounds stated in this claim; if the Taxpayer pays any portion, a refund follows (subject to § 6511(b), see Section IX).`,``,
      compTable((results.accrualItems||[]).map(it=>[ it.code, it.irsAssessed, it.recomputed, it.abatement ])));
  }

  // ── summary ──
  const sumRows=[];
  for(const it of (results.items||[])) if(it.abatement>0.005) sumRows.push(`| ${it.code} | ${money(it.irsAssessed)} | ${money(it.recomputed)} | ${money(it.abatement)} |`);
  out.push(`## Summary of Amounts Claimed (Line 2)`,``,
`| Component | Assessed / accrued | Recomputed | Claimed |\n| --- | --- | --- | --- |`,
    ...sumRows,
    `| **Primary claim subtotal** | | | **${money(L.main)}** |`,
    ...(L.accrual>0.005?[
      ...(results.accrualItems||[]).map(it=>`| ${it.code} | ${money(it.irsAssessed)} | ${money(it.recomputed)} | ${money(it.abatement)} |`),
      `| **Accrual-correction subtotal**${L.accrualInLine2?'':' *(not in Line 2)*'} | | | **${money(L.accrual)}** |`]:[]),
    ...(L.protective>0.005?[`| Protective claim (Section V)${L.protectiveInLine2?'':' *(not in Line 2)*'} | ${money(L.protective)} | $0.00 | ${money(L.protective)} |`]:[]),
    `| **Total claimed (Line 2)** | | | **${money(L.line2)}** |`,``);
  return out.join('\n');
}

function bProtective(p,results,claimDate,L){
  const after=afterEnactment(claimDate);
  const out=[`# V. Protective Claim Statement and Conflicting IRS Guidance`,``,
`**Protective claim.** To the extent any portion of this claim relies on interpretations of § 7508A(d) not yet affirmed by appellate courts, this claim is filed as a protective claim under Treas. Reg. § 301.6402-2(b)(1) to preserve the Taxpayer’s rights pending further judicial or administrative resolution. For the avoidance of doubt: the issues directly adjudicated were the timeliness of a Tax Court petition (*Abdo*) and the timeliness of a refund suit under § 6532(a) (*Kwong*); the application of the mandatory disregard to the amount of interest and penalties rests on the plain text of clause (B) of former § 7508A(d) as construed by those decisions, and the entirety of this claim is protective to the extent that application is not yet affirmed on appeal.`,``];
  const p662=findItem(results.protectiveItems,'Accuracy');
  const pInt=findItem(results.protectiveItems,'Int. on');
  if(p662){
    const dates=(p.acc?.events||[]).filter(e=>e.amount>0&&inDisaster(e.date)).map(e=>fmt(e.date)).join(', ')||'a date within the disregarded period (see the transcript and Exhibit B)';
    out.push(`**§ 6662 crystallization (protective — ${money(p662.abatement+(pInt?pInt.abatement:0))}).** The accuracy-related penalty of ${money(p662.abatement)} was determined and assessed on ${dates}, within the mandatory disregarded period. Clause (B) of former § 7508A(d) requires the period to be disregarded in determining “the amount of any … penalty”; a penalty determined during the disregarded period is itself subject to abatement.${pInt?` Derivative interest attributable to that penalty, ${money(pInt.abatement)}, stands or falls with it.`:''} This component goes beyond the matters directly adjudicated in *Kwong* and *Abdo* and is segregated from the primary claim. Conflicting IRS guidance: the Service has not extended the § 7508A(d) disregard to accuracy-related penalty crystallization.`,``);
  } else if(p.acc && p.acc.assessed>0.005){
    out.push(`**§ 6662 (no protective amount claimed).** A § 6662 penalty of ${money(p.acc.assessed)} appears on the account but was assessed outside the disregarded period; the crystallization theory does not reach it and no protective amount is claimed for it.`,``);
  } else {
    out.push(`**§ 6662 reservation (protective).** No accuracy-related penalty is currently assessed. The Taxpayer reserves the argument that no such penalty may crystallize for a return whose filing deadline fell within the disregarded period, and notes that the § 6501 assessment-limitations analysis is likewise affected by the postponed filing date.`,``);
  }
  const d6651=(results.notes||[]).some(n=>n.includes('§6651(d)')&&n.includes('PROTECTIVE FLAG'))||(p.levyNoticeDate&&inDisaster(p.levyNoticeDate));
  if(d6651){
    out.push(`**§ 6651(d) rate trigger (protective).** The intent-to-levy notice underlying the 1%-per-month failure-to-pay rate was issued ${p.levyNoticeDate?fmt(p.levyNoticeDate):'on a date'} during the disregarded period, for a liability that was not yet delinquent under the mandated postponement. Such a notice cannot trigger the § 6651(d) rate increase. Conflicting IRS guidance: the Service does not treat the disaster-period postponement as affecting the § 6651(d) trigger. This position is labeled protective.`,``);
  } else if((results.notes||[]).some(n=>n.includes('§6651(d): the FTP rate steps'))){
    out.push(`**§ 6651(d) note.** The 1%-per-month post-levy-notice rate is honored in the recomputation for months beginning after the (post-window) § 6331(d) notice; the rate step itself is not contested here.`,``);
  }
  out.push(`**§ 6511(b)(2)(A) lookback.** ${after?'For this claim, filed after December 26, 2025, the treatment of the disregarded period as an extension of the lookback is statutory under I.R.C. § 7508A(f) (Pub. L. No. 119-64, § 2(a)(1)); no protective framing is required, although the position is restated here out of caution.':'This claim is filed on or before December 26, 2025; the position that the disregarded period expands the lookback (clause (C) of former § 7508A(d): “the amount of any credit or refund”) is identified as protective and conflicts with IRS Notice 2023-21, 2023-14 I.R.B. 702.'}`,``,
`**Conflicting IRS guidance, identified separately:** (a) Treas. Reg. § 301.7508A-1(g)(3)(ii) (one-year cap), invalidated in *Kwong*; (b) Treas. Reg. § 301.7508A-1(g)(1) and (g)(2) (limiting the postponed acts), invalidated in *Abdo*; (c) PMTA 2020-07 (Chief Counsel position that § 7508A relief does not suspend interest and certain penalty accrual) — non-precedential and contrary to the statutory text as construed in *Kwong* and *Abdo*; (d) CCA 202053013 and Notice 2023-21 (lookback position)${after?', superseded for post-December 26, 2025 filings by § 7508A(f)':''}. The statute and the controlling decisions govern over invalidated regulations and non-precedential guidance.`,``);
  return out.join('\n');
}

function bRelief(L){
  return [`# VI. Relief Requested`,``,
`The Taxpayer requests: (1) abatement under I.R.C. § 6404(a)(1) and (a)(3) of ${money(L.main)} of assessed penalties and interest (primary claim)${L.protective>0.005?`, and of the additional ${money(L.protective)} identified as protective in Section V`:''}; (2) recomputation under § 7508A(d) of all module accruals and any payoff figure${L.accrual>0.005?`, correcting the ${money(L.accrual)} of excess accrued amounts quantified in Section IV (“Accrued (Unassessed) Amounts”)`:''}; (3) refund, with overpayment interest under I.R.C. § 6611, of any portion of the abated or corrected amounts that has been or is hereafter paid, offset, or collected; and (4) such other relief as is appropriate. This Form 843 is intended to constitute a duly filed administrative claim for refund within the meaning of I.R.C. § 7422(a) and Treas. Reg. § 301.6402-2 with respect to every theory and amount stated herein.`,``].join('\n');
}

function b6611(p){
  const paidTotal=r2((p.payments||[]).reduce((s,x)=>s+x.amount,0));
  return [`# VII. Overpayment Interest (I.R.C. § 6611)`,``,
    paidTotal>0.005
      ? `Payments totaling ${money(paidTotal)} were applied to a balance that included disaster-period penalties and interest charged without statutory authority. To the extent those payments were absorbed by amounts subject to abatement under this claim, they constitute overpayments refundable with interest under I.R.C. § 6611 at the § 6621 overpayment rate, compounded daily under § 6622, from the date of each payment. The Taxpayer requests that the Service compute the precise § 6611 amount from its payment-application records. *Practitioner flag: verify the I.R.C. § 7508A(c) interaction with the § 6611 computation before any refund amount is finalized.*`
      : `No payment has yet been absorbed by the contested amounts. If any abated amount is hereafter paid, offset, or collected, the Taxpayer is entitled to overpayment interest under I.R.C. § 6611 at the § 6621 overpayment rate, compounded daily under § 6622. *Practitioner flag: verify the I.R.C. § 7508A(c) interaction before any refund amount is finalized.*`,``].join('\n');
}

function b6751(p){
  const has662 = p.acc&&p.acc.assessed>0.005;
  return [`# VIII. Independent Defense: § 6751(b)`,``,
    has662
      ? `The Taxpayer preserves the right to challenge the § 6662 penalty under I.R.C. § 6751(b) (written supervisory approval) and requests production of the § 6751(b) approval documentation for every penalty assessed for this year that is not excepted by § 6751(b)(2).`
      : `No penalty subject to the I.R.C. § 6751(b) written-supervisory-approval requirement is currently assessed for this year (the §§ 6651 and 6654 additions at issue are excepted by § 6751(b)(2)). Should any such penalty hereafter be assessed, the Taxpayer reserves all § 6751(b) arguments and requests production of the approval documentation.`,``].join('\n');
}

// §6511(a)/§6513(a) dates, shared by Section IX and the practitioner flags.
function solDates(p){
  const kwongDeemed = !!(p.filedDate && p.filedDate<=KWONG_DUE && duePosture(p)==='within');
  const ordDeemed = !!(p.filedDate && !kwongDeemed && p.statutoryDue && p.filedDate<=p.statutoryDue);
  const filedEff = kwongDeemed ? KWONG_DUE : (ordDeemed ? p.statutoryDue : (p.filedDate||null));
  const threeYr = filedEff ? addYears(filedEff,3) : null;
  const lastPay = (p.payments||[]).filter(x=>x.amount>0&&x.date).sort((a,b)=>a.date-b.date).slice(-1)[0]||null;
  const twoYr = lastPay ? addYears(lastPay.date,2) : null;
  const later = (threeYr&&twoYr) ? (threeYr>twoYr?threeYr:twoYr) : (threeYr||twoYr||null);
  return {kwongDeemed, ordDeemed, filedEff, threeYr, lastPay, twoYr, later};
}

function bSOL(p,claimDate){
  const after=afterEnactment(claimDate);
  const S=solDates(p);
  const basis = S.kwongDeemed
    ? `Because the filing deadline was postponed to July 10, 2023 by § 7508A(d), the return is deemed filed July 10, 2023 under § 6513(a), and the three-year period of § 6511(a) runs through ${fmt(S.threeYr)}.`
    : (S.ordDeemed
        ? `Because the return was received on or before its ${fmt(p.statutoryDue)} due date, it is deemed filed on that date under § 6513(a), and the three-year period of § 6511(a) runs through ${fmt(S.threeYr)}.`
        : (p.filedDate
            ? `The three-year period of § 6511(a) runs through ${fmt(S.threeYr)} (three years from receipt).`
            : `The § 6511(a) three-year period runs from the date the return was filed, which was not parsed from this transcript — verify before filing.`));
  const payLine = S.lastPay
    ? `The most recent payment of ${money(S.lastPay.amount)} was made ${fmt(S.lastPay.date)}; the two-year-from-payment period of § 6511(a) runs through ${fmt(S.twoYr)}.${S.threeYr?' The claim is timely if filed by the later of the two dates.':''}`
    : 'No post-return payment appears on the transcript; the three-year period controls.';
  const timely = S.later
    ? (claimDate<=S.later
        ? `This claim, dated ${fmt(claimDate)}, is timely under § 6511(a).`
        : `[VERIFY — DO NOT FILE WITHOUT RESOLVING] This claim is dated ${fmt(claimDate)}, which falls after the later of the computed § 6511(a) dates (${fmt(S.later)}). Confirm the §§ 6511, 6513, and 7508A(f) analysis — including any payments or extensions not parsed from this transcript — before filing.`)
    : `The timeliness of this claim under § 6511(a) could not be computed from the parsed data — verify the filing and payment dates before filing.`;
  return [`# IX. Statute of Limitations (§ 6511) and Lookback`,``,
`The return was received ${fmt(p.filedDate)}. ${basis} ${payLine} ${timely}`,``,
`**Lookback (§ 6511(b)(2)(A)).** ${after?'Because this claim is filed after December 26, 2025, I.R.C. § 7508A(f) (Pub. L. No. 119-64) treats the 1,268-day disregarded period (January 20, 2020 – July 10, 2023, inclusive) as an extension for lookback purposes, expanding the recovery window accordingly. Confirm each payment (including withholding deemed paid under § 6513(b)(1)) falls within the expanded window before filing.':'For claims filed on or before December 26, 2025, the IRS position (Notice 2023-21, 2023-14 I.R.B. 702; CCA 202053013) limits the lookback; the Taxpayer asserts, as a protective position, that clause (C) of former § 7508A(d) requires the disregarded period to be excluded in determining “the amount of any credit or refund,” which necessarily expands the lookback.'}`,``].join('\n');
}

function bCDP(p){
  if(!p.levyNoticeDate) return '';
  return [`# X. Collection Posture (CDP)`,``,
`The transcript reflects an intent-to-levy or levy notice dated ${fmt(p.levyNoticeDate)}.${inDisaster(p.levyNoticeDate)?' That notice issued during the mandatory disregarded period, for a liability not yet delinquent under the postponement; its validity and every consequence flowing from it (including the § 6651(d) rate step) are contested — see Section V.':''} If a Collection Due Process hearing is pending or available (Form 12153 within 30 days of the notice — strict statutory deadline), the Taxpayer raises: (1) verification under § 6330(c)(1) — the Settlement Officer must verify that the disregarded period was excluded from every assessed interest and penalty computation, per *Hoyle v. Commissioner*, 131 T.C. 197, 200–03 (2008); and (2) appropriateness under § 6330(c)(2)(A) — collection of amounts that are excessive (§ 6404(a)(1)) or erroneously assessed (§ 6404(a)(3)) is not appropriate. Interest abatement is not a § 6330(c)(2)(B) liability challenge (IRM 8.22.8.11), so the prior-opportunity bar does not apply. Attach this Form 843 to any Form 12153 and reference it in the narrative.`,``].join('\n');
}

function bLineByLine(p,tp,L,results){
  const secs=new Set(['I.R.C. § 6404(a)(1), (a)(3) (abatement authority)','I.R.C. § 6404(i) (disaster-period cross-reference)','Former I.R.C. § 7508A(d)']);
  for(const arr of [results.items, results.accrualItems]) for(const it of (arr||[])) if(it.abatement>0.005){
    if(it.code.includes('FTF')) secs.add('I.R.C. § 6651(a)(1)');
    if(it.code.includes('FTP')) secs.add(it.code.includes('(a)(3)')?'I.R.C. § 6651(a)(3)':'I.R.C. § 6651(a)(2)');
    if(it.code.includes('6654')) secs.add('I.R.C. § 6654');
    if(it.code.includes('6601')||/[Ii]nterest/.test(it.code)) secs.add('I.R.C. §§ 6601, 6622');
  }
  if(L.protective>0.005) secs.add('I.R.C. § 6662 (protective)');
  const payLines=(p.payments||[]).filter(x=>x.amount>0).map(x=>`${fmt(x.date)} (${money(x.amount)})`);
  const whLines=(p.creditEvents||[]).filter(e=>e.amount<0&&e.date).map(e=>`${fmt(e.date)} (${money(Math.abs(e.amount))} ${e.tc==='806'?'withholding, § 6513(b)(1) deemed-paid':'credit'})`);
  const line3 = (payLines.length||whLines.length)
    ? [...whLines,...payLines].join('; ')+'; verify each against the transcript'
    : `[itemize each payment and the withholding deemed-paid date — 04/15/${parseInt(p.taxYear)+1} per § 6513(b)(1) — against the transcript]`;
  return [`# Form 843 — Line-by-Line Entries`,``,
`| Line | Entry |`,`| --- | --- |`,
`| Reason-for-filing box (page 1) | “Other (specify): Interest and penalty abatement/refund based on recomputation of both under former I.R.C. § 7508A(d) and *Kwong v. United States*” |`,
`| Line 1 (tax period) | 01/01/${p.taxYear} – 12/31/${p.taxYear} |`,
`| Line 2 (amount) | ${money(L.line2)} |`,
`| Line 3 (dates of payment) | ${line3} |`,
`| Line 4 (type of tax) | Income |`,
`| Line 5 (type of return) | ${p.formType||'1040'} |`,
`| Line 6 (IRC sections) | ${[...secs].join('; ')} |`,
`| Line 7 (reason) | Check box (c), “reasonable cause or other reason allowed under the law” — the “other reason allowed under law” being the mandatory § 7508A(d) postponement; box (d) + specify is an acceptable alternative per the TAC materials. Verify box lettering against the current form revision. |`,
`| Line 8 | “See attached Statement in Support of Form 843 (Sections I–${p.levyNoticeDate?'X':'IX'}), incorporated herein.” |`,``,
`*Use a separate Form 843 for each tax period. File by certified mail (or § 7502(f) designated PDS); retain proof. Calendar § 6532(a): suit available six months after filing absent action; two years from any notice of disallowance.*`,``].join('\n');
}

function bPractitioner(p,results,tp,flags){
  const lines=[`# Practitioner Materials (do not file this section)`,``,
`## A. Recommended Attachments`,``,
`- Exhibit A — this Line 8 statement and computation.`,
`- Exhibit B — IRS account transcript for ${p.taxYear}${p._requestDate?` (request date ${fmt(p._requestDate)})`:''}; Form 4340 if litigation is anticipated.`,
`- Exhibit C — copies of the IRS notices underlying each assessment${p.levyNoticeDate?` and the ${fmt(p.levyNoticeDate)} levy notice`:''}.`,
`- Exhibit D — payment records / proof of credit transfers.`,
`- Exhibit E — proof of qualified-taxpayer status (principal-residence documentation; FEMA declaration number).`,
`- Exhibit F — Form 2848 (confirm it covers ${p.taxYear} and Form 843 matters).`,``,
`## B. Filing`,``,
`- Verify the mailing address against the current Form 843 instructions immediately before filing; if the claim responds to a notice, mail to the address on the notice; otherwise to the service center for the taxpayer’s paper Form 1040.`,
`- Certified mail, return receipt requested; retain a complete copy. One Form 843 per tax period.`,
`- Claim deadline discipline: most Kwong-window claims must be filed by July 10, 2026; check the per-account § 6511 dates in Section IX.`,``,
`## C. Pre-Filing Verification Checklist`,``,
`- Complete the [bracketed] placeholders: taxpayer name, state, FEMA declaration number, filing status, claim date.`,
`- Cross-check every transcript figure in Section III against the original transcript; re-pull a fresh transcript near the filing date so the accrued-as-of figures are current.`,
`- Statutory-credit note: former § 7508A(d) is credited here to Pub. L. No. 116-94, Div. Q, § 205(a) per the Code annotations; the office CLE materials cite Div. Q, § 204, 133 Stat. 2534. Verify against the Statutes at Large and conform before filing.`,
`- Verify PMTA 2020-07’s characterization independently; check the current appellate status of *Abdo* and *Kwong* immediately before filing (the protective framing assumes both remain subject to appeal). Confirm all reporter volumes and pin cites (179 Fed. Cl. 382, 391–92; 162 T.C. 148; 131 T.C. 197, 200–03) against Westlaw/Lexis.`,
`- State tax: the federal § 7508A(d) suspension does not automatically reach state interest/penalties — analyze conformity separately. MFS/spouse accounts need their own Form 843.`,
`- Sign Form 843 manually (taxpayer or representative); no AI-generated signature block is included, by design. Computation aid only — verify per Circular 230 § 10.22.`,``];
  if(flags.length){
    lines.push(`## D. Machine-Generated Flags (resolve every item before filing)`,``);
    for(const f of flags) lines.push(`- ${f}`);
    lines.push(``);
  }
  return lines.join('\n');
}

function buildNoClaimMemo(p,results){
  return [`# NO-CLAIM MEMO — TY ${p.taxYear}`,``,
`The engine found no abatable or correctable amounts for this module under § 7508A(d). Do not file a Form 843 from this output.`,``,
`Reasons recorded by the engine:`,``,
...(results.notes||[]).map(n=>`- ${n}`),
...(results.warnings||[]).map(w=>`- ⚠ ${w}`),``,
`If the transcript shows a credit balance, an erroneous levy, or an unrelated penalty issue, those are pursued on their own grounds — not under this Kwong template.`].join('\n');
}

// ═══════════════════════════════════════════════════════════════
// PACKAGE ASSEMBLY
// ═══════════════════════════════════════════════════════════════
export function buildForm843Package(parsed,results,altResults,taxpayer,opts={}){
  const tp={ name:'[TAXPAYER NAME]', ssn4:'____', status:'', state:'', fema:'', poa:false, claimDate:new Date(), ...taxpayer };
  const accrualInLine2 = opts.accrualInLine2!==false;     // Davi-FINAL convention: claim "assessed or accrued"
  const protectiveInLine2 = opts.protectiveInLine2!==false; // TY2019 convention: in Line 2, segregated in §V
  const L={
    tpName: tp.name||'[TAXPAYER NAME]',
    main: results.totalMain||0,
    accrual: results.totalAccrual||0,
    protective: results.totalProtective||0,
    accrualInLine2, protectiveInLine2,
    items:{
      ftf: findItem(results.items,'FTF'),
      ftp: findItem(results.items,'FTP'),
      est: findItem(results.items,'6654'),
      int: (results.items||[]).find(i=>i.code==='§6601 Interest'),
    },
  };
  L.line2 = r2(L.main + (accrualInLine2?L.accrual:0) + (protectiveInLine2?L.protective:0));

  if(L.main<=0.005 && L.accrual<=0.005 && L.protective<=0.005) return { markdown: buildNoClaimMemo(parsed,results), line2: 0, flags: [], noClaim:true };

  const flags=[
    ...(parsed.parseWarnings||[]).map(w=>'PARSER: '+w),
    ...(results.warnings||[]).map(w=>'ENGINE: '+w),
  ];
  if(parsed.filedSource && parsed.filedSource!=='header') flags.push(`Filed date was approximated (${parsed.filedSource}) — the timeliness, FTF, deemed-filed, and § 6511 statements in Sections III, IV.A, and IX all depend on it. Verify against the transcript header before filing.`);
  if(!parsed.filedDate) flags.push('No return-received date was parsed — Sections III, IV.A, and IX contain [VERIFY] placeholders that must be resolved against the transcript before filing.');
  if(parsed.creditEvents && parsed.creditEvents.length)
    flags.push('Line 3 / Section III: withholding and credits are now itemized with their transcript dates (TC 806 deemed paid 04/15 of the filing year per § 6513(b)(1)). Confirm each date and amount against the transcript before filing.');
  else
    flags.push('Line 3: the parser found no dated TC 806/766 credit lines, so credits are shown as one undated aggregate — itemize the withholding/credit dates (§ 6513(b)(1) deemed-paid: 04/15 of the filing year) against the transcript manually.');
  if(L.items.est && L.items.est.recomputed>0.005) flags.push('§ 6654: the abatement uses a pro-rata quarter allocation of the assessed addition; confirm against a Form 2210-style per-quarter computation before accepting a partial allowance.');
  if(L.accrual>0.005) flags.push(`Accrual corrections are computed to the transcript “as of” date (${fmt(parsed.accruedAsOf)}); re-pull the transcript near filing and regenerate so the figures are current.`);
  if(!altResults) flags.push('Alternative FTP grid was not supplied — the variance-doctrine alternative-computation sentence in Section IV.B has a placeholder. Wire altResults per PATCHES.md.');
  const S=solDates(parsed);
  if(!S.later) flags.push('§ 6511 timeliness could not be computed (missing filed/payment dates) — Section IX requires manual verification.');
  else if(tp.claimDate>S.later) flags.push(`§ 6511 ALERT: the claim date (${fmt(tp.claimDate)}) falls after the later computed § 6511(a) date (${fmt(S.later)}). Section IX is marked DO NOT FILE WITHOUT RESOLVING.`);

  const md=[
    bHeader(parsed,tp,L),
    bStatement(parsed,L),
    bLegal(tp.claimDate),
    bFacts(parsed,tp),
    bComputation(parsed,results,altResults,L),
    bProtective(parsed,results,tp.claimDate,L),
    bRelief(L),
    b6611(parsed),
    b6751(parsed),
    bSOL(parsed,tp.claimDate),
    bCDP(parsed),
    `*Signature: to be completed manually by the taxpayer or authorized representative on Form 843 itself before filing. Do not file this attachment without the signed Form 843.*`,``,
    bLineByLine(parsed,tp,L,results),
    bPractitioner(parsed,results,tp,flags),
  ].filter(Boolean).join('\n');
  return { markdown: md, line2: L.line2, flags, noClaim:false };
}

// ═══════════════════════════════════════════════════════════════
// PANEL
// ═══════════════════════════════════════════════════════════════
export default function Form843Panel({parsed,results,altResults}){
  const [tp,setTp]=useState({name:'',ssn4:'',status:'',state:'',fema:'',poa:false,claimDate:new Date().toISOString().slice(0,10)});
  const [accrualInLine2,setAccrualInLine2]=useState(true);
  const [protectiveInLine2,setProtectiveInLine2]=useState(true);
  const [out,setOut]=useState(null);
  const [copied,setCopied]=useState(false);
  const [docxBusy,setDocxBusy]=useState(false);
  if(!parsed||!results) return null;
  const set=(k)=>(e)=>setTp(t=>({...t,[k]:e.target.type==='checkbox'?e.target.checked:e.target.value}));
  const gen=()=>{
    const cd=tp.claimDate?new Date(tp.claimDate+'T12:00:00'):new Date();
    const pkg=buildForm843Package(parsed,results,altResults,
      {name:tp.name||'[TAXPAYER NAME]',ssn4:tp.ssn4||'____',status:tp.status,state:tp.state,fema:tp.fema,poa:tp.poa,claimDate:cd},
      {accrualInLine2,protectiveInLine2});
    setOut(pkg); setCopied(false);
  };
  const fileBase=()=>`Form843_Line8_TY${parsed.taxYear}_${(tp.name||'TAXPAYER').replace(/\W+/g,'_')}`;
  const download=(ext)=>{
    if(!out) return;
    const blob=new Blob([out.markdown],{type:'text/plain;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`${fileBase()}.${ext}`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  const downloadDocx=async()=>{
    if(!out||docxBusy) return;
    setDocxBusy(true);
    try{
      // Lazy import: the docx library loads as its own chunk on first click,
      // so the main GitHub Pages bundle stays small.
      const { downloadForm843Docx } = await import('./docx843.js');
      await downloadForm843Docx(out.markdown, `${fileBase()}.docx`, { title:`Form 843 Line 8 — TY ${parsed.taxYear}` });
    }catch(e){
      alert('Word export failed. If this is a fresh deploy, make sure the "docx" package is installed (npm i docx), then rebuild and republish.\n\n'+(e&&e.message?e.message:String(e)));
    }finally{ setDocxBusy(false); }
  };
  const copy=async()=>{ if(!out)return; try{ await navigator.clipboard.writeText(out.markdown); setCopied(true);}catch{ /* textarea fallback below */ } };
  const inp={padding:'6px 10px',border:'1px solid #b0c4d8',borderRadius:4,fontFamily:"'Ubuntu',sans-serif",fontSize:12,width:'100%'};
  return (
    <div className="card">
      <h2 style={{margin:'0 0 4px',fontSize:20}}>📄 Form 843 Package Generator</h2>
      <div style={{fontSize:12,color:'#4a5568',marginBottom:10}}>
        Generates the Line 8 statement (five-part narrative), line-by-line Form 843 entries, and a practitioner checklist — every figure projected from the computation above, nothing recomputed. Download as a Word document (.docx) for letterhead and prose edits; the numbers should be regenerated here, not hand-edited.
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',gap:8,marginBottom:8}}>
        <label style={{fontSize:11}}>Taxpayer name<input style={inp} value={tp.name} onChange={set('name')} placeholder="[TAXPAYER NAME]"/></label>
        <label style={{fontSize:11}}>SSN last 4<input style={inp} value={tp.ssn4} onChange={set('ssn4')} placeholder="____" maxLength={4}/></label>
        <label style={{fontSize:11}}>Filing status<input style={inp} value={tp.status} onChange={set('status')} placeholder="Single / MFJ / MFS…"/></label>
        <label style={{fontSize:11}}>State of residence<input style={inp} value={tp.state} onChange={set('state')} placeholder="[STATE]"/></label>
        <label style={{fontSize:11}}>FEMA declaration<input style={inp} value={tp.fema} onChange={set('fema')} placeholder="DR-____"/></label>
        <label style={{fontSize:11}}>Date of claim<input type="date" style={inp} value={tp.claimDate} onChange={set('claimDate')}/></label>
      </div>
      <div style={{fontSize:12,display:'flex',gap:18,flexWrap:'wrap',marginBottom:8}}>
        <label style={{cursor:'pointer'}}><input type="checkbox" checked={tp.poa} onChange={set('poa')}/> Form 2848 POA on file</label>
        <label style={{cursor:'pointer'}} title="Davi-FINAL convention: Line 2 claims amounts 'assessed or accrued'; off = TY2019 convention (assessed only on Line 2, accruals as a recomputation demand)">
          <input type="checkbox" checked={accrualInLine2} onChange={e=>setAccrualInLine2(e.target.checked)}/> Include accrual corrections in Line 2
        </label>
        <label style={{cursor:'pointer'}} title="TY2019 convention: protective amount in the Line 2 total, segregated in Section V">
          <input type="checkbox" checked={protectiveInLine2} onChange={e=>setProtectiveInLine2(e.target.checked)}/> Include protective claim in Line 2
        </label>
      </div>
      <button className="btn btn-primary" onClick={gen}>Generate Form 843 package</button>
      {out && (
        <div style={{marginTop:12}}>
          {out.noClaim
            ? <div style={{background:'#fff3cd',padding:'6px 10px',borderRadius:4,fontSize:13,marginBottom:8}}>No claimable amounts — a NO-CLAIM memo was generated instead of a filing package.</div>
            : <div style={{fontSize:13,marginBottom:8}}>
                <strong>Line 2 total: {money(out.line2)}</strong>
                {out.flags && out.flags.length>0 && <span style={{marginLeft:10,background:'#fde0de',color:'#d94535',padding:'2px 8px',borderRadius:3,fontSize:11,fontWeight:600}}>{out.flags.length} flag(s) to resolve — see Practitioner §D</span>}
              </div>}
          <div style={{display:'flex',gap:8,marginBottom:6,flexWrap:'wrap'}}>
            <button className="btn btn-primary" onClick={downloadDocx} disabled={docxBusy}>{docxBusy?'Generating Word file…':'Download .docx (Word)'}</button>
            <button className="btn btn-secondary" onClick={copy}>{copied?'✓ Copied':'Copy'}</button>
            <button className="btn btn-secondary" onClick={()=>download('md')}>Download .md</button>
            <button className="btn btn-secondary" onClick={()=>download('txt')}>Download .txt</button>
          </div>
          <textarea readOnly rows={26} value={out.markdown} style={{fontSize:10}} onFocus={e=>e.target.select()} />
        </div>
      )}
    </div>
  );
}
