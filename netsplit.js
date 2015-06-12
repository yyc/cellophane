//var https=require("https");
//var fs = require('fs');
var http=require("http");
var sockjs = require('sockjs');
var sockClient = require('sockjs-client');
var WebSocket=require("ws");

var splitter=sockjs.createServer({sockjs_url:'https://cdn.jsdelivr.net/sockjs/0.3.4/sockjs.min.js'});

var appName=process.argv[2]||"photo-wages-1b6";
var cellophane=process.argv[3]||0;
/*

var options = {
    key: fs.readFileSync('ssl/server.pem'),
    cert: fs.readFileSync('ssl/server.crt'),
    requestCert: false,
    rejectUnauthorized: false
};
*/

if(cellophane=="false"||cellophane=="0"){
  cellophane=false;
}

if(cellophane){
  console.log("Using cellophane as main channel with Simperium as backup");
}
else{
  console.log("Using Simperium as main channel with Cellophane as backup");
}

splitter.on("connection",function(conn){
  var simperium=new WebSocket("https://api.simperium.com/sock/1/"+appName+"/websocket");
  var SmessageQueue=[];
  var CmessageQueue=[];
  simperium.on("open",function(){
    console.log("Simperium connection opened");
    while(message=SmessageQueue.pop()){
      simperium.send(message);
      console.log("Sending queued simp message",message);
    }
  });
  simperium.on("message",function(message){
    if(!cellophane){
      console.log("simperium",message);
      conn.write(message);
    }
    else{
      console.log("simperium",message,"(discarded)");
    }    
  });
  simperium.on("close",function(ev){
    console.log("Simperium connection closed");
    conn.close();
    cellophane.close();
  });
  var cellophane=new sockClient("https://localhost:5000/sock/1/"+appName);
  cellophane.onopen=function(){
    console.log("cellophane connection opened");
    while(message=CmessageQueue.pop()){
      cellophane.send(message);
      console.log("Sending queued cell message",message);
    }
  }
  cellophane.onmessage=function(message){
    if(cellophane){
      conn.write(message.data);
      console.log("cellophane",message.data);
    }
    else{
      console.log("cellophane",message.data,"(discarded)");
    }
  }
  cellophane.onclose=function(){
    console.log("cellophane connection closed");
    conn.close();
    simperium.close();
  }
  conn.on("data",function(message){
    console.log("client",message);
    try{
      simperium.send(message);
    }catch(err){
      console.log("Error sending message to simperium",err)
    }
    try{
      cellophane.send(message);
    }catch(err){
      console.log("Error sending message to cellophane",err)
      SmessageQueue.push(message);
      CmessageQueue.push(message);
    }
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
server.listen(6000,function(){
  //testing
  var test=new sockClient("https://localhost:6000/sock/1/"+appName);
  test.onopen=function(){
    console.log("Test connection opened");
  }  
});

