const express = require('express');
const http = require('http');
const https = require('https');
const httpProxy = require('http-proxy');
const fs = require('fs');
const cluster = require('cluster');
const Ddos = require('ddos');

const setting = require('./setting.json');

const app = express();
const proxy = httpProxy.createProxyServer();

let sub_http;
if (setting.USE_SSL) sub_http = express();

proxy.on('proxyReq', (proxyReq, req, res, options) => {
    proxyReq.setHeader('X-Real-IP', req.connection.remoteAddress);
    proxyReq.setHeader('HTTP_VIA', req.connection.remoteAddress);
    proxyReq.setHeader('HTTP_X_FORWARD_FOR', req.connection.remoteAddress);
    proxyReq.setHeader('x-forwarded-for', req.connection.remoteAddress);
});

const noddos = `디도스가 감지되었습니다!
천천히 사용해주세요.`
const ddos = new Ddos({ burst : 10 , limit : 200 , maxexpiry : 30 , errormessage : noddos });
app.use(ddos.express);

app.use((req, res, next) => {
    const date = new Date();
    console.log(`[${date.getFullYear()}-${date.getMonth() + 1}-${date.getDay()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}.${date.getMilliseconds()}] ${req.connection.remoteAddress}가 https://${req.hostname}:${setting.HTTPS_PORT}${req.url} 에 접속하였습니다.`);
    let log = '';
    if(fs.existsSync(`./logs/${date.toLocaleDateString()}-${req.hostname}.log`)) {
        log = fs.readFileSync(`./logs/${date.toLocaleDateString()}-${req.hostname}.log`);
    }
    log = log + `\n[${date.getFullYear()}-${date.getMonth() + 1}-${date.getDay()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}.${date.getMilliseconds()}] ${req.connection.remoteAddress}가 https://${req.hostname}:${setting.HTTPS_PORT}${req.url} 에 접속하였습니다.`;
    fs.writeFileSync(`./logs/${date.toLocaleDateString()}-${req.hostname}.log`, log);
    const domain = JSON.parse(fs.readFileSync('./domain.json'));

    if(domain.hasOwnProperty(req.hostname)) {
        proxy.web(req, res, {
            target: domain[req.hostname]
        });
        return;
    }
    else {
        res.send('<h1>잘못된 접근입니다!</h1>');
    }
});

sub_http.use((req, res, next) => {
    const domain = JSON.parse(fs.readFileSync('./domain.json'));

    if(domain.hasOwnProperty(req.hostname)) {
        res.redirect(`https://${req.hostname}:${setting.HTTPS_PORT}${req.url}`);
        return;
    }
    else {
        res.send('<h1>잘못된 접근입니다!</h1>');
    }
});

if(cluster.isMaster) {
    console.log(`마스터 프로세스 ${process.pid}번이 시작되었습니다.`);
    cluster.fork();

    cluster.on('exit', (worker, code, signal) => {
        console.log(`${worker.process.pid}번이 종료되었습니다. 새로운 프로세스를 시작합니다.`);
        cluster.fork();
    });
}
else {
    if (setting.USE_SSL) {
        let options = {
            cert: fs.readFileSync(setting.SSL_CERT),
            key: fs.readFileSync(setting.SSL_KEY)
        }
        https.createServer(options, app).listen(setting.HTTPS_PORT, () => {
            console.log('보안 서버가 구동중입니다!');
        });
        http.createServer(sub_http).listen(setting.HTTP_PORT, () => {
            console.log("보조 HTTP 서버가 구동중입니다!");
        });
    } else {
        http.createServer(app).listen(setting.HTTP_PORT, () => {
            console.log("서버가 구동중입니다!");
        });
    }

    console.log(`${process.pid}번 슬레이브 프로세스가 시작되었습니다.`);
}