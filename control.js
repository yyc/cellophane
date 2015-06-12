
var net=require("net");

process.on("message",function(message){
  console.log("CHILD RECEIVED",message);
});

net.createServer().listen(process.env.port,function(){
  process.send("Server started");
});