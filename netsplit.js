//var https=require("https");
//var fs = require('fs');
var http=require("http");
var sockjs = require('sockjs');
var sockClient = require('sockjs-client');
var ws=require("ws");

var splitter=sockjs.createServer({sockjs_url:'https://cdn.jsdelivr.net/sockjs/0.3.4/sockjs.min.js'});

var appName=process.argv[2]||"photo-wages-1b6";
/*

var options = {
    key: fs.readFileSync('ssl/server.pem'),
    cert: fs.readFileSync('ssl/server.crt'),
    requestCert: false,
    rejectUnauthorized: false
};
*/
console.log(sockClient);
splitter.on("connection",function(conn){
  var simperium=new sockClient("https://api.simperium.com/sock/1/"+appName);
  simperium.onopen=function(){
    console.log(simperium);
    console.log("Simperium connection opened");
  }
  simperium.onmessage=function(message){
    console.log("simperium",message);
    conn.write(message);
  }
  simperium.onclose=function(ev){
    console.log(simperium,ev);
    console.log("Simperium connection closed");
    conn.close();
    cellophane.close();
  }
  var cellophane=new sockClient("https://localhost:5000/sock/1/"+appName);
  cellophane.onopen=function(){
    console.log("cellophane connection opened");
  }
  cellophane.onmessage=function(message){
    console.log("cellophane",message,"(discarded)");
  }
  cellophane.onclose=function(){
    console.log("cellophane connection closed");
    conn.close();
    simperium.close();
  }
  conn.on("data",function(message){
    console.log("client",message);
    simperium.send(message);
    cellophane.send(message);
  });
  conn.on("close",function(){
    console.log("Client connection closed");
    simperium.close();
    cellophane.close();
  });
})

//var server=https.createServer(options);
var server=http.createServer();
splitter.installHandlers(server,{prefix:"/sock/1/"+appName});
server.listen(8000,function(){
  //testing
  var test=new sockClient("https://localhost:8000/sock/1/"+appName);
  test.onopen=function(){
    console.log("Test connection opened");
  }  
});

