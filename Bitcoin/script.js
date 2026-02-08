const portfolioRows=document.querySelectorAll("#portfolioBody tr");
const currencySelect=document.getElementById("currencySelect");
const chartsContainer=document.getElementById("chartsContainer");
const portfolioChartCtx=document.getElementById("portfolioChart").getContext("2d");
const calcCrypto=document.getElementById("calcCrypto");
const qtyInput=document.getElementById("qty");
const actionSelect=document.getElementById("action");
const calcResult=document.getElementById("calcResult");
const totalPortfolioElem=document.getElementById("totalPortfolio");
const totalPLElem=document.getElementById("totalPL");

let usdToInrRate=83;
let wsMap={};
let priceData={};
let charts={};
let portfolioChart=null;

function savePortfolio(){
    const portfolio=[];
    portfolioRows.forEach(row=>{
        portfolio.push({
            symbol: row.dataset.symbol,
            holdings: row.querySelector(".holdings").value,
            avgPrice: row.querySelector(".avgPrice").value,
            alertPercent: row.querySelector(".alertPercent").value
        });
    });
    localStorage.setItem("portfolio",JSON.stringify(portfolio));
}

function loadPortfolio(){
    const portfolio=JSON.parse(localStorage.getItem("portfolio")||"[]");
    if(portfolio.length===0) return;
    portfolio.forEach((p,i)=>{
        const row=portfolioRows[i];
        row.querySelector(".holdings").value=p.holdings;
        row.querySelector(".avgPrice").value=p.avgPrice;
        row.querySelector(".alertPercent").value=p.alertPercent;
    });
}

async function fetchUSDtoINR(){
    try{
        const res=await fetch('https://api.exchangerate.host/latest?base=USD&symbols=INR');
        const data=await res.json();
        usdToInrRate=data.rates.INR;
    }catch(err){console.error(err);}
}

async function fetchHistorical(symbol){
    try{
        const res=await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=20`);
        const data=await res.json();
        return data.map(d=>parseFloat(d[4]));
    }catch(err){console.error(err); return [];}
}

async function initChart(symbol){
    const canvas=document.createElement("canvas");
    canvas.id=`chart-${symbol}`;
    chartsContainer.appendChild(canvas);
    const ctx=canvas.getContext("2d");
    const histPrices=await fetchHistorical(symbol);
    charts[symbol]=new Chart(ctx,{
        type:'line',
        data:{ labels:histPrices.map((_,i)=>i+1), datasets:[{label:symbol,data:histPrices,borderColor:'#ff9800',backgroundColor:'rgba(255,152,0,0.2)',tension:0.3}]},
        options:{responsive:true,scales:{x:{display:false}}}
    });
}

function updateChart(symbol,price){
    const chart=charts[symbol];
    chart.data.labels.push(chart.data.labels.length+1);
    chart.data.datasets[0].data.push(price);
    if(chart.data.labels.length>20){chart.data.labels.shift(); chart.data.datasets[0].data.shift();}
    chart.update();
}

function connectWebSocket(symbol){
    if(wsMap[symbol]) wsMap[symbol].close();
    const ws=new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@trade`);
    wsMap[symbol]=ws;
    ws.onmessage=event=>{
        const data=JSON.parse(event.data);
        priceData[symbol]=parseFloat(data.p);
        updatePortfolio();
    };
    ws.onclose=()=>setTimeout(()=>connectWebSocket(symbol),1000);
}

function showNotification(title,msg){
    if(Notification.permission==="granted"){
        new Notification(title,{body:msg});
    }
}

function updatePortfolio(){
    let total=0,totalCost=0;
    portfolioRows.forEach(row=>{
        const symbol=row.dataset.symbol;
        const holdings=parseFloat(row.querySelector(".holdings").value)||0;
        const avgPrice=parseFloat(row.querySelector(".avgPrice").value)||0;
        const alertPercent=parseFloat(row.querySelector(".alertPercent").value)||0;
        const priceUSD=priceData[symbol]||0;
        const currency=currencySelect.value;
        const price=currency==='USD'?priceUSD:priceUSD*usdToInrRate;
        row.querySelector(".price").innerText=(currency==='USD'?'$':'₹')+price.toFixed(2);
        const value=holdings*price;
        row.querySelector(".value").innerText=(currency==='USD'?'$':'₹')+value.toFixed(2);
        const plPercent=avgPrice>0?((priceUSD-avgPrice)/avgPrice*100).toFixed(2):0;
        row.querySelector(".pl").innerText=plPercent+"%";
        total+=value;
        totalCost+=holdings*(currency==='USD'?avgPrice:avgPrice*usdToInrRate);
        if(charts[symbol]) updateChart(symbol,price);
        if(alertPercent>0 && Math.abs(plPercent)>=alertPercent){
            showNotification(symbol,"Alert! P/L reached "+plPercent+"%");
        }
    });
    totalPortfolioElem.innerText=(currencySelect.value==='USD'?'$':'₹')+total.toFixed(2);
    const totalPL=totalCost>0?((total-totalCost)/totalCost*100).toFixed(2):0;
    totalPLElem.innerText=totalPL+"%";
    if(portfolioChart){
        portfolioChart.data.labels.push(portfolioChart.data.labels.length+1);
        portfolioChart.data.datasets[0].data.push(total);
        if(portfolioChart.data.labels.length>50){portfolioChart.data.labels.shift(); portfolioChart.data.datasets[0].data.shift();}
        portfolioChart.update();
    }
    savePortfolio();
}

function calculate(){
    const symbol=calcCrypto.value;
    const qty=parseFloat(qtyInput.value);
    if(!qty||qty<=0){calcResult.innerText="Enter valid qty"; return;}
    const currency=currencySelect.value;
    const priceUSD=priceData[symbol]||0;
    const price=currency==='USD'?priceUSD:priceUSD*usdToInrRate;
    const total=qty*price;
    calcResult.innerText="Total: "+(currency==='USD'?'$':'₹')+total.toFixed(2);
}

function toggleTheme(){
    const body=document.body;
    if(body.classList.contains("dark")){body.classList.remove("dark");body.classList.add("light");document.querySelector(".theme-btn").innerText="☀️";}
    else{body.classList.remove("light");body.classList.add("dark");document.querySelector(".theme-btn").innerText="🌙";}
}

currencySelect.addEventListener("change",()=>updatePortfolio());
portfolioRows.forEach(row=>{
    row.querySelector(".holdings").addEventListener("input",()=>updatePortfolio());
    row.querySelector(".avgPrice").addEventListener("input",()=>updatePortfolio());
    row.querySelector(".alertPercent").addEventListener("input",()=>updatePortfolio());
});

window.onload=async()=>{
    if(Notification.permission!=="granted"){ Notification.requestPermission(); }
    loadPortfolio();
    await fetchUSDtoINR();
    const symbols=["BTCUSDT","ETHUSDT","DOGEUSDT"];
    portfolioChart=new Chart(portfolioChartCtx,{
        type:'line',
        data:{labels:[], datasets:[{label:'Portfolio Value', data:[], borderColor:'#4caf50', backgroundColor:'rgba(76,175,80,0.2)', tension:0.3}]},
        options:{responsive:true,scales:{x:{display:false}}}
    });
    for(const sym of symbols){ await initChart(sym); connectWebSocket(sym);}
};
