//Proxy
var tls=require("tls");
var https=require("https"); 
var http=require("http");
var url=require("url");
var fs=require("fs");

var simperiumIDs=[];
var port= process.env.PORT || 8080
var secureOptions={
  key: fs.readFileSync("key.pem"),
  cert: fs.readFileSync("cert.pem")
};
var netServer=tls.createServer(secureOptions,function(clientSocket){
  console.log("Connection Established");
  clientSocket.on("data",function(data){
    console.log("Request received");
    console.log(data);
    serverSocket=tls.createConnection({port:443,host:"www.google.com"},function(){
      console.log("Connected to Google");
      serverSocket.write(data);
      });
    serverSocket.on("data",function(data){
      console.log("Received data, writing to client");
      clientSocket.write(data);
    });
    serverSocket.on("end",function(data){
      console.log("Server ended connection, ending client.");
      clientSocket.end();
    });
  });
});

netServer.listen(8080,function(){
  console.log("Listening for Socket Connections on Port 8080");
});

var secureServer=https.createServer(secureOptions,function(req,res){
  console.log("HTTPS Request Received");
  console.log(req.url);
  responseString="";
  if(!req.upgrade){//maintain HTTP connection
    parsedUrl=url.parse(req.url);
    var options={
      hostname:parsedUrl.hostname,
      port:443,
      path:parsedUrl.path,
      method:req.method,
      headers:req.headers
    };
    request=https.request(options,function(response){
      res.writeHead(response.statusCode,response.statusMessage,response.headers);
      response.on("data",function(data){
        console.log("chunk received, sending to client ");
        res.write(data);
//        responseString+=data;
      }).on("close",function(){
        console.log("Server response finished, flushing to client");
        res.addTrailers(response.trailers);
      }).on("end",function(){
        console.log("Server closed connection, doing the same with client");
        res.end(function(){
          console.log("Client response ended");
        });
      }).resume();
    }).on('error',function(err){
      console.log("Something went wrong with the request"+err.stack);
      res.end();
    }).on('continue',function(){
      console.log("Server asking to continue");
    }).flushHeaders();
    req.on("data",function(data){
      console.log("Received chunk from client, sending to server");
      request.write(data);
    });
    
  }else{//upgrade to https or WebSockets
    
  }
  
});

secureServer.listen(port,function(){
  console.log("Listening for HTTPS on Port ",port);
});

var intercept = function (options,data){
  
}

var httpServer=http.createServer(function(req,res){
  console.log("HTTP Request Received");
  console.log(req.url);
  responseString="";
  if(!req.upgrade){//maintain HTTP connection
    parsedUrl=url.parse(req.url);
    var options={
      hostname:parsedUrl.hostname,
      port:80,
      path:parsedUrl.path,
      method:req.method,
      headers:req.headers
    };
    request=http.request(options,function(response){
      res.writeHead(response.statusCode,response.statusMessage,response.headers);
      response.on("data",function(data){
        console.log("chunk received, sending to client ");
        res.write(data);
//        responseString+=data;
      }).on("close",function(){
        console.log("Server response finished, flushing to client");
        res.addTrailers(response.trailers);
      }).on("end",function(){
        console.log("Server closed connection, doing the same with client");
        res.end(function(){
          console.log("Client response ended");
        });
      }).resume();
    }).on('error',function(err){
      console.log("Something went wrong with the request"+err.stack);
      res.end();
    }).on('continue',function(){
      console.log("Server asking to continue");
    }).flushHeaders();
    req.on("data",function(data){
      console.log("Received chunk from client, sending to server");
      request.write(data);
    });
    
  }else{//upgrade to https or WebSockets
    
  }
  
});

httpServer.listen(8001,function(){
  console.log("Listening for HTTP on Port 8001");
});




//Admin Interface
/*
var express=require("express")();
var adminhttp=require("http").Server(express);
var io=require('socket.io')(adminhttp);

express.get("/proxy.pac",function(req,res){
  console.log("Received proxy file request. Sending now.");
  res.sendFile(__dirname+"/proxy.pac");
});
express.get("/",function(req,res){
  console.log("Received Admin Console Request.");
  res.sendFile(__dirname+"/index.html");
});

adminhttp.listen(port,function(){
  console.log("Admin interface listening on "+port)
})
*/

