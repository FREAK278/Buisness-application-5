const DB_NAME="PaymentCalculatorDB", DB_VERSION=2;
let db, currentCalculation=null;
const $=id=>document.getElementById(id);
const money=n=>"₹"+Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const qty=n=>Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:3,maximumFractionDigits:3});
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DEFAULTS={formula:{weightDeductionKg:3.5,labourPerQtl:25,finalDeductionPercent:1},companies:[{id:"company1",name:"OP Foods"},{id:"company2",name:"Patra Foods"}],avg:{weightBasis:"net",priceStage:"before",scope:"company1",dateMode:"custom"}};
function settings(){try{const raw=JSON.parse(localStorage.getItem("paymentAppSettings")||"{}");return {...DEFAULTS,...raw,companies:Array.isArray(raw.companies)&&raw.companies.length?raw.companies:structuredClone(DEFAULTS.companies),avg:{...DEFAULTS.avg,...(raw.avg||{})},formula:{...DEFAULTS.formula,...(raw.formula||{})}};}catch{return structuredClone(DEFAULTS);}}
function saveSettings(s){localStorage.setItem("paymentAppSettings",JSON.stringify(s));}
function companyName(id){return settings().companies.find(c=>c.id===id)?.name||id||"Unknown company";}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains("transactions")){const s=d.createObjectStore("transactions",{keyPath:"receiptNo"});s.createIndex("timestamp","timestamp");s.createIndex("companyId","companyId");}if(!d.objectStoreNames.contains("fileHandles")){d.createObjectStore("fileHandles",{keyPath:"id"});}};r.onsuccess=()=>{db=r.result;const tx=db.transaction("transactions","readwrite"),s=tx.objectStore("transactions");const q=s.openCursor();q.onsuccess=()=>{const cur=q.result;if(cur){const v=cur.value;if(!v.companyId){const companies=settings().companies;v.companyId=companies.find(c=>c.name===v.company)?.id||companies[0].id;cur.update(v);}cur.continue();}};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);});}
function allTransactions(){return new Promise((resolve,reject)=>{if(!db){reject(new Error("Local database is not ready."));return;}try{const r=db.transaction("transactions","readonly").objectStore("transactions").getAll();r.onsuccess=()=>resolve((r.result||[]).sort((a,b)=>(Number(b.timestamp)||0)-(Number(a.timestamp)||0)));r.onerror=()=>reject(r.error||new Error("Could not read transactions"));}catch(e){reject(e);}});}
function saveTransaction(t){return new Promise((resolve,reject)=>{if(!db){reject(new Error("Local database is not ready. Please reload the app and try again."));return;}let tx,requestResult;try{tx=db.transaction("transactions","readwrite");const store=tx.objectStore("transactions");const req=store.add(t);req.onsuccess=()=>{requestResult=req.result;};req.onerror=()=>{reject(req.error||new Error("Could not write transaction"));};tx.oncomplete=()=>resolve(requestResult);tx.onerror=()=>reject(tx.error||new Error("Transaction save failed"));tx.onabort=()=>reject(tx.error||new Error("Transaction save was aborted"));}catch(e){reject(e);}});}
function putTransaction(t){return new Promise((resolve,reject)=>{if(!db){reject(new Error("Local database is not ready."));return;}try{const tx=db.transaction("transactions","readwrite"),r=tx.objectStore("transactions").put(t);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error||r.error);tx.onabort=()=>reject(tx.error||new Error("Database write aborted"));}catch(e){reject(e);}});}
function deleteTransaction(id){return new Promise((resolve,reject)=>{if(!db){reject(new Error("Local database is not ready."));return;}try{const tx=db.transaction("transactions","readwrite"),r=tx.objectStore("transactions").delete(id);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error||r.error);tx.onabort=()=>reject(tx.error||new Error("Database delete aborted"));}catch(e){reject(e);}});}
function populateCompanyOptions(){
 const s=settings(), companies=s.companies;
 $("company").innerHTML=companies.map((c,i)=>`<option value="${esc(c.id)}">${i+1} — ${esc(c.name)}</option>`).join("");
 $("filterCompany").innerHTML='<option value="all">All companies</option>'+companies.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
 $("avgCompany").innerHTML=companies.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} only</option>`).join("")+'<option value="both">All companies combined</option>';
 $("reportCompany").innerHTML='<option value="all">All companies combined</option>'+companies.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
 $("defaultScope").innerHTML=companies.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} only</option>`).join("")+'<option value="both">All companies combined</option>';
 $("brandLine").textContent=companies.map(c=>c.name).join(" · ")+" · Offline-ready";
}
function renderCompanySettings(){
 const companies=settings().companies;
 $("companySettingsList").innerHTML=companies.map((c,i)=>`<div class="entry"><label for="companyName-${esc(c.id)}">Company ${i+1} name</label><div class="grid2"><input id="companyName-${esc(c.id)}" class="company-name-input" data-company-id="${esc(c.id)}" maxlength="80" value="${esc(c.name)}"><button class="danger remove-company" data-company-id="${esc(c.id)}" ${companies.length<=1?"disabled":""}>Remove</button></div></div>`).join("");
 document.querySelectorAll(".remove-company").forEach(b=>b.onclick=()=>removeCompany(b.dataset.companyId));
}
async function removeCompany(id){
 const s=settings(); if(s.companies.length<=1){alert("At least one company must remain.");return;}
 const c=s.companies.find(x=>x.id===id); if(!c)return;
 const remaining=s.companies.filter(x=>x.id!==id), txs=(await allTransactions()).filter(t=>t.companyId===id);
 let targetId=null;
 if(txs.length){
   const choices=remaining.map((x,i)=>`${i+1}. ${x.name}`).join("\n");
   const answer=prompt(`This company has ${txs.length} saved transaction(s). Enter the number of the company to move them to:\n${choices}`);
   if(answer===null)return;
   const n=Number(answer); if(!Number.isInteger(n)||n<1||n>remaining.length){alert("Invalid company selection. Nothing was removed.");return;}
   targetId=remaining[n-1].id;
   if(!confirm(`Move ${txs.length} transaction(s) from "${c.name}" to "${remaining[n-1].name}" and remove this company?`))return;
   for(const t of txs){t.companyId=targetId;t.company=remaining[n-1].name;await putTransaction(t);}
 }else if(!confirm(`Remove company "${c.name}"?`))return;
 s.companies=remaining;
 if(s.avg.scope===id)s.avg.scope=remaining[0].id;
 saveSettings(s);populateCompanyOptions();renderCompanySettings();await refreshAll();alert("Company removed.");
}
function validFormulaValues(v){return Number.isFinite(v.weightDeductionKg)&&v.weightDeductionKg>=0&&v.weightDeductionKg<=100&&Number.isFinite(v.labourPerQtl)&&v.labourPerQtl>=0&&v.labourPerQtl<=100000&&Number.isFinite(v.finalDeductionPercent)&&v.finalDeductionPercent>=0&&v.finalDeductionPercent<=100;}
function formulaFromInputs(){return {weightDeductionKg:Number($("formulaWeightDeduction").value),labourPerQtl:Number($("formulaLabour").value),finalDeductionPercent:Number($("formulaPercent").value)};}
function updateFormulaPreview(){const f=formulaFromInputs(),el=$("formulaPreview");if(!validFormulaValues(f)){el.textContent="Invalid settings. Enter non-negative values within the stated limits.";return;}const w=100,price=2000,deduction=w*f.weightDeductionKg/100,net=w-deduction,amount=net*price,labour=w*f.labourPerQtl,after=amount-labour,percent=after*f.finalDeductionPercent/100,final=after-percent;el.innerHTML=`Example with 100 qtl at ₹2,000/qtl: weight deduction <strong>${qty(deduction)} qtl</strong>; net weight <strong>${qty(net)} qtl</strong>; amount after weight deduction <strong>${money(amount)}</strong>; labour <strong>${money(labour)}</strong>; ${esc(f.finalDeductionPercent)}% deduction <strong>${money(percent)}</strong>; final payment <strong>${money(final)}</strong>.`;}
function loadFormulaSettings(){const f=settings().formula||DEFAULTS.formula;$("formulaWeightDeduction").value=f.weightDeductionKg;$("formulaLabour").value=f.labourPerQtl;$("formulaPercent").value=f.finalDeductionPercent;updateFormulaPreview();}
function saveFormulaSettings(){const f=formulaFromInputs();if(!validFormulaValues(f)){alert("Invalid calculation settings. Use non-negative numbers within the limits shown.");return;}if(f.weightDeductionKg>=100){alert("Weight deduction must be less than 100 kg per actual quintal.");return;}const s=settings();s.formula=f;saveSettings(s);updateFormulaPreview();alert("Calculation settings saved. They apply to new payments; existing saved transactions are unchanged.");}
function setSettingsForm(){const s=settings();renderCompanySettings();loadFormulaSettings();$("defaultWeightBasis").value=s.avg.weightBasis;$("defaultPriceStage").value=s.avg.priceStage;$("defaultScope").value=s.avg.scope;$("defaultDateMode").value=s.avg.dateMode;$("weightBasis").value=s.avg.weightBasis;$("priceStage").value=s.avg.priceStage;$("avgCompany").value=s.avg.scope;$("dateMode").value=s.avg.dateMode;const today=new Date(),start=new Date(today.getFullYear(),today.getMonth(),1);$("avgFrom").value=isoDate(start);$("avgTo").value=isoDate(today);updateDateFields();}
function isoDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function dateRange(mode,from,to){const now=new Date();if(mode==="today"){const d=isoDate(now);return [d,d];}if(mode==="month")return [isoDate(new Date(now.getFullYear(),now.getMonth(),1)),isoDate(now)];if(mode==="all")return ["",""];return [from,to];}
function updateDateFields(){$("customDates").classList.toggle("hidden",$("dateMode").value!=="custom");}
function calculate(){const companyId=$("company").value,customer=$("customer").value.trim(),weight=Number($("weight").value),price=Number($("price").value);if(!customer){alert("Please enter the customer name.");return;}if(!Number.isFinite(weight)||!Number.isFinite(price)||weight<=0||price<=0){alert("Weight and price must be greater than zero.");return;}const formula={...(settings().formula||DEFAULTS.formula)},weightDeduction=weight*formula.weightDeductionKg/100,netWeight=weight-weightDeduction,amount=netWeight*price,labour=weight*formula.labourPerQtl,amountAfterLabour=amount-labour;if(amountAfterLabour<0){alert("Amount after labour cannot be negative with these settings. Reduce labour or check weight and price.");return;}const deduction1Percent=amountAfterLabour*formula.finalDeductionPercent/100,finalPayment=amountAfterLabour-deduction1Percent;currentCalculation={companyId,company:companyName(companyId),customer,weight,price,weightDeduction,netWeight,amount,labour,amountAfterLabour,deduction1Percent,finalPayment,formulaSettings:{...formula}};$("calculation").innerHTML=`<div class="rowline"><span>Company</span><strong>${esc(companyName(companyId))}</strong></div><div class="rowline"><span>Net weight</span><strong>${qty(netWeight)} qtl</strong></div><div class="rowline"><span>Amount before labour and 1%</span><strong>${money(amount)}</strong></div><div class="rowline"><span>Labour</span><strong>${money(labour)}</strong></div><div class="rowline"><span>${esc(formula.finalDeductionPercent)}% deduction</span><strong>${money(deduction1Percent)}</strong></div><hr><div class="small">FINAL PAYMENT</div><div class="big">${money(finalPayment)}</div>`;$("calculation").classList.remove("hidden");$("saveBtn").classList.remove("hidden");}
function receiptHTML(t){return `<div class="center">================================</div><h3>${esc(companyName(t.companyId))}</h3><h3>PAYMENT RECEIPT</h3><div class="center">================================</div><div>Receipt No: ${esc(t.receiptNo)}</div><div>Date: ${esc(t.dateTime)}</div><div class="line"></div><strong>CUSTOMER DETAILS</strong><div>Name: ${esc(t.customer)}</div><div class="line"></div><strong>WEIGHT DETAILS</strong><div class="p-row"><span>Actual weight</span><span>${qty(t.weight)} qtl</span></div><div class="p-row"><span>Price per qtl</span><span>${money(t.price)}</span></div><div class="p-row"><span>Weight deduction</span><span>${qty(t.weightDeduction)} qtl</span></div><div class="p-row"><span>Net weight</span><span>${qty(t.netWeight)} qtl</span></div><div class="line"></div><div class="p-row"><span>Amount after weight deduction</span><span>${money(t.amount)}</span></div><div class="p-row"><span>Labour charges</span><span>${money(t.labour)}</span></div><div class="p-row"><span>Amount after labour</span><span>${money(t.amountAfterLabour)}</span></div><div class="p-row"><span>${esc(t.formulaSettings?.finalDeductionPercent??1)}% deduction</span><span>${money(t.deduction1Percent)}</span></div><div class="line"></div><h3>FINAL PAYMENT</h3><h3>${money(t.finalPayment)}</h3><div class="line"></div><div>Customer signature:</div><br><div>________________________</div><div class="center">Thank you!</div><div class="center">================================</div>`;}
function showReceipt(t){$("printArea").innerHTML=receiptHTML(t);$("printArea").classList.remove("hidden");window.print();setTimeout(()=>$("printArea").classList.add("hidden"),900);}
async function saveCurrent(){if(!currentCalculation)return;const btn=$("saveBtn");btn.disabled=true;const d=new Date(),receiptNo=Date.now().toString()+"-"+Math.random().toString(36).slice(2,6).toUpperCase(),t={...currentCalculation,receiptNo,timestamp:d.getTime(),dateTime:d.toLocaleString("en-IN")};try{if(!db)await openDB();if(!db)throw new Error("Local database is not ready. Reload the app and try again.");await saveTransaction(t);const verified=(await allTransactions()).some(x=>x.receiptNo===t.receiptNo);if(!verified)throw new Error("Save verification failed. Transaction was not found in local history.");currentCalculation=null;$("calculation").classList.add("hidden");$("saveBtn").classList.add("hidden");$("customer").value="";$("weight").value="";$("price").value="";$("company").selectedIndex=0;alert("Transaction saved on this phone.");showReceipt(t);await refreshAll();}catch(e){alert("Could not save transaction: "+(e?.message||String(e))+". Your payment may not have been saved. Please take a screenshot of the calculation and reload the app before retrying.");}finally{btn.disabled=false;}}
function inDateRange(t,from,to){const day=isoDate(new Date(t.timestamp));return (!from||day>=from)&&(!to||day<=to);}
async function renderHistory(){const all=await allTransactions(),co=$("filterCompany").value,search=$("searchText").value.trim().toLowerCase(),from=$("fromHistory").value,to=$("toHistory").value;const list=all.filter(t=>(co==="all"||t.companyId===co)&&inDateRange(t,from,to)&&(!search||String(t.customer||"").toLowerCase().includes(search)||String(t.receiptNo||"").toLowerCase().includes(search)));if(!list.length){$("historyList").innerHTML='<div class="empty">No matching transactions.</div>';return;}$("historyList").innerHTML=list.map(t=>`<article class="entry"><div class="entrytop"><div><strong>${esc(t.customer)}</strong><span class="pill">${esc(companyName(t.companyId))}</span><div class="small">${esc(t.dateTime)}</div></div><strong>${money(t.finalPayment)}</strong></div><div class="small">${qty(t.weight)} qtl × ${money(t.price)}/qtl</div><div class="small">Receipt: ${esc(t.receiptNo)}</div><div class="actions"><button class="secondary" data-print="${esc(t.receiptNo)}">Print receipt</button><button class="danger" data-delete="${esc(t.receiptNo)}">Delete</button></div></article>`).join("");document.querySelectorAll("[data-print]").forEach(b=>b.onclick=async()=>{const t=(await allTransactions()).find(x=>x.receiptNo===b.dataset.print);if(t)showReceipt(t);});document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this transaction? Export a backup first if needed.")){await deleteTransaction(b.dataset.delete);await refreshAll();}});}
async function renderAverage(){const all=await allTransactions(),scope=$("avgCompany").value,stage=$("priceStage").value,basis=$("weightBasis").value,mode=$("dateMode").value,[from,to]=dateRange(mode,$("avgFrom").value,$("avgTo").value);if(mode==="custom"&&(!from||!to||from>to)){$("averageResult").classList.remove("hidden");$("averageResult").innerHTML='<strong>Choose a valid start date and end date.</strong>';return;}const list=all.filter(t=>(scope==="both"||t.companyId===scope)&&inDateRange(t,from,to));const totalWeight=list.reduce((s,t)=>s+Number(basis==="actual"?t.weight:t.netWeight),0);const amountKey=stage==="before"?"amount":stage==="labour"?"amountAfterLabour":"finalPayment";const totalAmount=list.reduce((s,t)=>s+Number(t[amountKey]||0),0);const avg=totalWeight?totalAmount/totalWeight:0;const stageLabel=stage==="before"?"Before labour and 1%":stage==="labour"?"After labour, before 1%":"After all deductions";const scopeLabel=scope==="both"?"All companies combined":companyName(scope);$("averageResult").classList.remove("hidden");$("averageResult").innerHTML=`<div class="small">AVERAGE PRICE</div><div class="big">${totalWeight?money(avg)+" / qtl":"No matching transactions"}</div><div class="rowline"><span>Company scope</span><strong>${esc(scopeLabel)}</strong></div><div class="rowline"><span>Transactions included</span><strong>${list.length}</strong></div><div class="rowline"><span>Total actual weight</span><strong>${qty(list.reduce((s,t)=>s+Number(t.weight),0))} qtl</strong></div><div class="rowline"><span>Total net weight</span><strong>${qty(list.reduce((s,t)=>s+Number(t.netWeight),0))} qtl</strong></div><div class="rowline"><span>Denominator</span><strong>${basis==="actual"?"Actual weight":"Net weight"}</strong></div><div class="rowline"><span>Price stage</span><strong>${stageLabel}</strong></div><div class="rowline"><span>Total amount at stage</span><strong>${money(totalAmount)}</strong></div><div class="rowline"><span>Weight used</span><strong>${qty(totalWeight)} qtl</strong></div><div class="small">Formula: ${money(totalAmount)} ÷ ${qty(totalWeight)} qtl.</div>`;}
let currentReportRows=[];
function selectedReportRange(){
 const mode=$("reportDateMode").value, from=$("reportFrom").value, to=$("reportTo").value;
 if(mode==="today"){const d=isoDate(new Date());return [d,d];}
 if(mode==="month")return [isoDate(new Date(new Date().getFullYear(),new Date().getMonth(),1)),isoDate(new Date())];
 if(mode==="all")return ["",""];
 return [from,to];
}
function updateReportDateFields(){$("reportCustomDates").classList.toggle("hidden",$("reportDateMode").value!=="custom");}
async function renderReports(){
 const txs=await allTransactions(), scope=$("reportCompany")?.value||"all", [from,to]=selectedReportRange();
 if($("reportDateMode").value==="custom"&&(!from||!to||from>to)){
   $("reportResult").classList.remove("hidden");$("reportResult").innerHTML="<strong>Please choose a valid start date and end date.</strong>";$("exportReportBtn").classList.add("hidden");return;
 }
 const list=txs.filter(t=>(scope==="all"||t.companyId===scope)&&inDateRange(t,from,to));
 currentReportRows=list;
 const sum=k=>list.reduce((n,t)=>n+Number(t[k]||0),0);
 const actual=sum("weight"),net=sum("netWeight"),amount=sum("amount"),labour=sum("labour"),afterLabour=sum("amountAfterLabour"),deduction=sum("deduction1Percent"),final=sum("finalPayment");
 const avg=net?amount/net:0;
 const rangeLabel=from||to?`${from||"Beginning"} to ${to||"Today"}`:"All dates";
 const companyLabel=scope==="all"?"All companies combined":companyName(scope);
 $("reportResult").classList.remove("hidden");
 $("reportResult").innerHTML=`<div class="small">REPORT SUMMARY</div><div class="big">${money(final)}</div><div class="small">Final payments · ${esc(companyLabel)} · ${esc(rangeLabel)}</div><hr>
 <div class="rowline"><span>Transactions</span><strong>${list.length}</strong></div>
 <div class="rowline"><span>Total actual weight</span><strong>${qty(actual)} qtl</strong></div>
 <div class="rowline"><span>Total net weight</span><strong>${qty(net)} qtl</strong></div>
 <div class="rowline"><span>Amount after weight deduction</span><strong>${money(amount)}</strong></div>
 <div class="rowline"><span>Labour charges</span><strong>${money(labour)}</strong></div>
 <div class="rowline"><span>Amount after labour</span><strong>${money(afterLabour)}</strong></div>
 <div class="rowline"><span>1% deduction</span><strong>${money(deduction)}</strong></div>
 <div class="rowline"><span>Final payment total</span><strong>${money(final)}</strong></div>
 <div class="rowline"><span>Average price (amount ÷ net weight)</span><strong>${net?money(avg)+" / qtl":"—"}</strong></div>`;
 $("exportReportBtn").classList.toggle("hidden",list.length===0);
}
async function exportReportCSV(){
 const txs=currentReportRows;
 if(!txs.length){alert("There are no report rows to export.");return;}
 const h=["Company Name","Date and Time","Customer Name","Actual Weight (Quintals)","Net Weight (Quintals)","Price per Quintal","Amount After Weight Deduction","Labour Charges","Amount After Labour","Final Deduction Amount","Final Payment","Weight Deduction Rate (kg/qtl)","Labour Rate (₹/qtl)","Final Deduction Rate (%)","Receipt Number"];
 const rows=txs.map(t=>[companyName(t.companyId),t.dateTime,t.customer,t.weight,t.netWeight,t.price,t.amount,t.labour,t.amountAfterLabour,t.deduction1Percent,t.finalPayment,t.receiptNo]);
 const blob=new Blob(["\uFEFF"+[h,...rows].map(r=>r.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="payment_report.csv";a.click();URL.revokeObjectURL(url);
}
function csvCell(v){return '"'+String(v??"").replace(/"/g,'""')+'"';}
function allTransactionsCSV(txs){const h=["Company Name","Date and Time","Customer Name","Actual Weight (Quintals)","Price per Quintal","Weight Deduction (Quintals)","Net Weight (Quintals)","Amount After Weight Deduction","Labour Charges","Amount After Labour","Final Deduction Amount","Final Payment","Receipt Number","Company ID","Timestamp","Weight Deduction Rate (kg/qtl)","Labour Rate (₹/qtl)","Final Deduction Rate (%)"];const rows=txs.map(t=>[companyName(t.companyId),t.dateTime,t.customer,t.weight,t.price,t.weightDeduction,t.netWeight,t.amount,t.labour,t.amountAfterLabour,t.deduction1Percent,t.finalPayment,t.receiptNo,t.companyId,t.timestamp,t.formulaSettings?.weightDeductionKg??3.5,t.formulaSettings?.labourPerQtl??25,t.formulaSettings?.finalDeductionPercent??1]);return "\uFEFF"+[h,...rows].map(r=>r.map(csvCell).join(",")).join("\r\n");}
function saveFileHandle(handle){return new Promise((resolve,reject)=>{const r=db.transaction("fileHandles","readwrite").objectStore("fileHandles").put({id:"mainCsv",handle});r.onsuccess=resolve;r.onerror=()=>reject(r.error);});}
function getFileHandle(){return new Promise((resolve,reject)=>{const r=db.transaction("fileHandles","readonly").objectStore("fileHandles").get("mainCsv");r.onsuccess=()=>resolve(r.result?.handle||null);r.onerror=()=>reject(r.error);});}
async function connectCsvFile(){
 if(!window.showSaveFilePicker){alert("Your current browser does not support connecting a live CSV file. Please open the app in an updated Chrome browser, or use Export all transactions to CSV.");return;}
 try{const handle=await window.showSaveFilePicker({suggestedName:"payment_records.csv",types:[{description:"CSV file",accept:{"text/csv":[".csv"]}}]});await saveFileHandle(handle);$("csvFileStatus").textContent="Connected CSV file: "+handle.name+". Tap Sync CSV when you want to update it.";alert("CSV file connected. It will update only when you tap Sync CSV.");}
 catch(e){if(e.name!=="AbortError")alert("Could not connect CSV file: "+e.message);}
}
async function syncCsvFile(){
 try{let handle=await getFileHandle();if(!handle){alert("First tap Choose / Create CSV File and select your CSV file.");return;}
  let permission=await handle.queryPermission({mode:"readwrite"});if(permission!=="granted")permission=await handle.requestPermission({mode:"readwrite"});if(permission!=="granted"){alert("File permission was not granted. Tap Choose / Create CSV File to reconnect it.");return;}
  const txs=await allTransactions(),contents=allTransactionsCSV(txs),writable=await handle.createWritable();await writable.write(contents);await writable.close();$("csvFileStatus").textContent=`Last synced: ${new Date().toLocaleString()} · ${txs.length} transaction(s) · ${handle.name}`;alert(`CSV synced successfully. Updated ${txs.length} transaction(s) in ${handle.name}.`);
 }catch(e){alert("CSV sync failed: "+e.message+". Your transactions remain saved in the app. Try reconnecting the CSV file or use Export all transactions to CSV.");}
}
async function refreshCsvStatus(){try{const h=await getFileHandle();if(h){$("csvFileStatus").textContent="CSV selected: "+h.name+". Tap Sync CSV to update it.";}}catch{}}
async function exportCSV(){const txs=await allTransactions(),blob=new Blob([allTransactionsCSV(txs)],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="payment_records.csv";a.click();URL.revokeObjectURL(url);}
function parseCSV(text){const rows=[];let row=[],cell="",q=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(q){if(c==='"'&&n==='"'){cell+='"';i++;}else if(c==='"')q=false;else cell+=c;}else if(c==='"')q=true;else if(c===","){row.push(cell);cell="";}else if(c==="\n"){row.push(cell.replace(/\r$/,""));rows.push(row);row=[];cell="";}else cell+=c;}if(cell.length||row.length){row.push(cell.replace(/\r$/,""));rows.push(row);}return rows;}
async function importCSV(file){
  const rows=parseCSV((await file.text()).replace(/^\uFEFF/,""));
  if(rows.length<2) throw Error("No transaction rows found.");
  const h=rows[0], ix=n=>h.indexOf(n);
  const required=["Company Name","Date and Time","Customer Name","Actual Weight (Quintals)","Price per Quintal","Weight Deduction (Quintals)","Net Weight (Quintals)","Amount After Weight Deduction","Labour Charges","Amount After Labour","Final Deduction Amount","Final Payment","Weight Deduction Rate (kg/qtl)","Labour Rate (₹/qtl)","Final Deduction Rate (%)"];
  if(required.some(n=>ix(n)<0)) throw Error("CSV headings do not match payment records.");
  let added=0;
  const existing=await allTransactions();
  const known=new Set(existing.map(t=>t.receiptNo));
  for(const r of rows.slice(1)){
    if(!r[ix("Customer Name")]) continue;
    let id;
    if(ix("Company ID")>=0 && r[ix("Company ID")]) id=r[ix("Company ID")];
    else id=r[ix("Company Name")]===settings().companies[1].name ? "company2" : "company1";
    const receipt=(ix("Receipt Number")>=0 && r[ix("Receipt Number")]) ? r[ix("Receipt Number")] : "IMPORT-"+Date.now()+"-"+Math.random().toString(36).slice(2,7);
    if(known.has(receipt)) continue;
    const timestamp=(ix("Timestamp")>=0 && Number(r[ix("Timestamp")])) ? Number(r[ix("Timestamp")]) : (Date.parse(r[ix("Date and Time")])||Date.now());
    await putTransaction({
      receiptNo:receipt, companyId:id, company:companyName(id), dateTime:r[ix("Date and Time")], customer:r[ix("Customer Name")],
      weight:Number(r[ix("Actual Weight (Quintals)")]), price:Number(r[ix("Price per Quintal")]),
      weightDeduction:Number(r[ix("Weight Deduction (Quintals)")]), netWeight:Number(r[ix("Net Weight (Quintals)")]),
      amount:Number(r[ix("Amount After Weight Deduction")]), labour:Number(r[ix("Labour Charges")]),
      amountAfterLabour:Number(r[ix("Amount After Labour")]), deduction1Percent:Number(r[ix("1% Deduction")]),
      finalPayment:Number(r[ix("Final Payment")]), timestamp, formulaSettings:{weightDeductionKg:ix("Weight Deduction Rate (kg/qtl)")>=0&&r[ix("Weight Deduction Rate (kg/qtl)")]!==""?Number(r[ix("Weight Deduction Rate (kg/qtl)")]):3.5,labourPerQtl:ix("Labour Rate (₹/qtl)")>=0&&r[ix("Labour Rate (₹/qtl)")]!==""?Number(r[ix("Labour Rate (₹/qtl)")]):25,finalDeductionPercent:ix("Final Deduction Rate (%)")>=0&&r[ix("Final Deduction Rate (%)")]!==""?Number(r[ix("Final Deduction Rate (%)")] ):1}
    });
    known.add(receipt); added++;
  }
  alert(`Import finished. Added ${added} transaction(s).`);
  await refreshAll();
}
async function refreshAll(){
  const txs=await allTransactions();
  const today=isoDate(new Date());
  const todays=txs.filter(t=>isoDate(new Date(Number(t.timestamp)||Date.now()))===today);
  const total=todays.reduce((sum,t)=>sum+Number(t.finalPayment||0),0);
  const el=$("dashboardSummary");
  if(el) el.innerHTML=`<div class="metric"><span>Today's transactions</span><strong>${todays.length}</strong></div><div class="metric"><span>Today's payouts</span><strong>${money(total)}</strong></div><div class="metric"><span>All transactions</span><strong>${txs.length}</strong></div>`;
  if($("historyView")&&!$("historyView").classList.contains("hidden")) await renderHistory();
  if($("reportsView")&&!$("reportsView").classList.contains("hidden")) await renderReports();
  if($("averageView")&&!$("averageView").classList.contains("hidden")) await renderAverage();
}
function activateTab(name){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));["new","history","reports","average","settings"].forEach(v=>$(v+"View").classList.toggle("hidden",v!==name));if(name==="history")renderHistory();if(name==="reports")renderReports();if(name==="average")renderAverage();if(name==="settings")setSettingsForm();}
function networkStatus(){$("networkStatus").textContent=navigator.onLine?"● Online · Transactions save on this phone":"● Offline · Transactions still save on this phone";}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>activateTab(b.dataset.tab));$("calculateBtn").onclick=calculate;$("saveBtn").onclick=saveCurrent;
["filterCompany","fromHistory","toHistory"].forEach(id=>$(id).addEventListener("change",renderHistory));$("searchText").addEventListener("input",renderHistory);
["avgCompany","weightBasis","priceStage","dateMode","avgFrom","avgTo"].forEach(id=>$(id).addEventListener("change",()=>{if(id==="dateMode")updateDateFields();renderAverage();}));$("calcAverageBtn").onclick=renderAverage;
$("saveCompaniesBtn").onclick=async()=>{
 const inputs=[...document.querySelectorAll(".company-name-input")], names=inputs.map(i=>i.value.trim());
 if(names.some(n=>!n)){alert("Company names cannot be empty.");return;}
 if(new Set(names.map(n=>n.toLowerCase())).size!==names.length){alert("Each company must have a different name.");return;}
 const s=settings();s.companies=s.companies.map((c,i)=>({...c,name:names[i]}));saveSettings(s);
 populateCompanyOptions();renderCompanySettings();await refreshAll();alert("Company names saved.");
};
$("addCompanyBtn").onclick=async()=>{
 const name=$("newCompanyName").value.trim();if(!name){alert("Enter a company name first.");return;}
 const s=settings();if(s.companies.some(c=>c.name.toLowerCase()===name.toLowerCase())){alert("A company with this name already exists.");return;}
 const id="company-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7);
 s.companies.push({id,name});saveSettings(s);$("newCompanyName").value="";populateCompanyOptions();renderCompanySettings();await refreshAll();alert("Company added.");
};
 ["formulaWeightDeduction","formulaLabour","formulaPercent"].forEach(id=>$(id).addEventListener("input",updateFormulaPreview));$("saveFormulaSettingsBtn").onclick=saveFormulaSettings;
$("saveAvgDefaultsBtn").onclick=()=>{const s=settings();const chosenScope=$("defaultScope").value; s.avg={weightBasis:$("defaultWeightBasis").value,priceStage:$("defaultPriceStage").value,scope:chosenScope,dateMode:$("defaultDateMode").value};saveSettings(s);setSettingsForm();alert("Average-price defaults saved.");};
$("exportBtn").onclick=exportCSV;$("connectCsvBtn").onclick=connectCsvFile;$("syncCsvBtn").onclick=syncCsvFile;$("runReportBtn").onclick=renderReports;$("exportReportBtn").onclick=exportReportCSV;$("reportDateMode").addEventListener("change",()=>{updateReportDateFields();renderReports();});["reportCompany","reportFrom","reportTo"].forEach(id=>$(id).addEventListener("change",renderReports));$("importFile").onchange=async e=>{const f=e.target.files[0];if(f)try{await importCSV(f);}catch(err){alert("Import failed: "+err.message);}e.target.value="";};
window.addEventListener("online",networkStatus);window.addEventListener("offline",networkStatus);
(async()=>{networkStatus();try{if(!localStorage.getItem("paymentAppSettings"))saveSettings(DEFAULTS);await openDB();populateCompanyOptions();setSettingsForm();const today=new Date(),monthStart=new Date(today.getFullYear(),today.getMonth(),1);$("reportFrom").value=isoDate(monthStart);$("reportTo").value=isoDate(today);updateReportDateFields();await refreshAll();await refreshCsvStatus();}catch(e){alert("Could not open local database: "+e.message);}if("serviceWorker"in navigator)try{await navigator.serviceWorker.register("./sw.js");}catch(e){console.warn(e);}})();
