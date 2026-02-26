const ADMIN_PASSWORD="1234";
const SUPER_ADMIN_PASSWORD="9999";

let SESSION_ROLE="guest";

const DEFAULT_MOSQUES=[
{id:"bene-tally",name:"Bene Tally",wave:"772682103",orange:"772682103"},
{id:"medina-centre",name:"Medina Centre",wave:"770000000",orange:"780000000"}
];

function loadMosques(){
let m=JSON.parse(localStorage.getItem("mosques"));
if(!m){
localStorage.setItem("mosques",JSON.stringify(DEFAULT_MOSQUES));
return DEFAULT_MOSQUES;
}
return m;
}

function getCurrentMosqueId(){
return localStorage.getItem("currentMosqueId")||"bene-tally";
}

function getCurrentMosque(){
return loadMosques().find(m=>m.id===getCurrentMosqueId());
}

function setCurrentMosque(id){
localStorage.setItem("currentMosqueId",id);
}

function getDonKey(){
return "donList_"+getCurrentMosqueId();
}

function getMonthKey(){
return "monthSum_"+getCurrentMosqueId();
}

function updateClock(){
document.getElementById("current-time").innerText=new Date().toLocaleTimeString();
}
setInterval(updateClock,1000);

function formatDate(){
let d=new Date();
return d.toLocaleDateString("fr-FR");
}

function updatePublicStats(){
let goal=500000;
let month=parseInt(localStorage.getItem(getMonthKey())||0);

document.getElementById("don-public-goal").innerText=goal;
document.getElementById("don-public-month").innerText=month;

let percent=Math.min(100,(month/goal)*100);
document.getElementById("don-public-bar").style.width=percent+"%";
}

function openDonModal(){
document.getElementById("don-modal").style.display="block";
}

function closeDonModal(){
document.getElementById("don-modal").style.display="none";
}

document.getElementById("btn-claimed").onclick=openDonModal;

document.getElementById("don-confirm").onclick=function(){
let amount=parseInt(document.getElementById("don-amount").value);
let category=document.getElementById("don-category").value;
let ref=document.getElementById("don-ref").value;

if(!amount) return alert("Montant invalide");

let list=JSON.parse(localStorage.getItem(getDonKey())||"[]");

list.push({
date:formatDate(),
amount,
category,
ref,
status:"pending"
});

localStorage.setItem(getDonKey(),JSON.stringify(list));

closeDonModal();
showPopup(`Merci pour votre don de ${amount} CFA. En attente de confirmation. BarakAllahu fik.`);
updateAdminBadge();
renderAdmin();
};

function showPopup(msg){
let p=document.getElementById("popup");
p.innerText=msg;
p.style.display="block";
setTimeout(()=>p.style.display="none",5000);
}

function renderAdmin(){
let tbody=document.getElementById("don-table-body");
tbody.innerHTML="";
let list=JSON.parse(localStorage.getItem(getDonKey())||"[]");

list.forEach((d,i)=>{
let tr=document.createElement("tr");
tr.innerHTML=
`<td>${d.date}</td>
<td>${d.amount}</td>
<td>${d.category}</td>
<td>${d.ref}</td>
<td>${d.status}</td>
<td>
<button onclick="confirmDon(${i})">OK</button>
<button onclick="deleteDon(${i})">X</button>
</td>`;
tbody.appendChild(tr);
});
}

function confirmDon(i){
let list=JSON.parse(localStorage.getItem(getDonKey())||"[]");
list[i].status="ok";

let month=parseInt(localStorage.getItem(getMonthKey())||0);
month+=list[i].amount;
localStorage.setItem(getMonthKey(),month);

localStorage.setItem(getDonKey(),JSON.stringify(list));

updatePublicStats();
renderAdmin();
updateAdminBadge();
}

function deleteDon(i){
let list=JSON.parse(localStorage.getItem(getDonKey())||"[]");
list.splice(i,1);
localStorage.setItem(getDonKey(),JSON.stringify(list));
renderAdmin();
updateAdminBadge();
}

function updateAdminBadge(){
let list=JSON.parse(localStorage.getItem(getDonKey())||"[]");
let count=list.filter(d=>d.status==="pending").length;
let badge=document.getElementById("admin-badge");

if(count>0){
badge.style.display="block";
badge.innerText=count;
}else{
badge.style.display="none";
}
}

document.getElementById("admin-button").onclick=function(){
let pw=prompt("Code ?");
if(pw===SUPER_ADMIN_PASSWORD){
SESSION_ROLE="super";
document.getElementById("mosque-select-row").style.display="block";
}else if(pw===ADMIN_PASSWORD){
SESSION_ROLE="admin";
}else{
alert("Incorrect");
return;
}
document.getElementById("don-admin").style.display="block";
renderAdmin();
};

document.getElementById("btn-wave").onclick=function(){
let m=getCurrentMosque();
window.open(`https://wa.me/${m.wave}?text=Salam je souhaite faire un don.`);
};

document.getElementById("btn-orange").onclick=function(){
let m=getCurrentMosque();
window.open(`https://wa.me/${m.orange}?text=Salam je souhaite faire un don.`);
};

updatePublicStats();
updateAdminBadge();
