//It's St. Patrick's Day!

var program=require("commander");
var net=require("net");
var child_process=require("child_process");
var forever=require("forever-monitor");
var http=require("http");


//Startup options
program
.usage("[options]")
.option("-p, --port <port>","The port to listen on for all connections. Default behaviour is the value in configs.port if present, or to try binding to 80,5000,5001...",parseInt)
.option("-s, --splitter <port>","The port to listen for the network splitter. Defaults to 6000.")
.option("--simperium","Use Simperium as the main communication channel, with Cellophane as the backup. The default is with Cellophane as the main channel for speed.")
.option("-c , --config <FILENAME>","Custom config file, if applicable. Defaults to config.js in the same directory.")
.option("-r, --redis <IP>","Redis server connection, defaults to the options in configFile or tcp://localhost:6379")
.parse(process.argv);

//Fetch config file
configFile=program.config || "config.js";
var configs=require("./"+configFile);

if(program.port){
  process.env.port=program.port;
}
else if(configs.port){
  process.env.port=configs.port;
}
else{
  process.env.port=80;
}

//Checks if specified port is available/tries to find an available port, and calls success() when a port has been found
var connected=0;
var httpListener=http.createServer();
httpListener.on("error",function(error){
  console.log("Unable to bind to port "+process.env.port+"!",error);
  connected=0;
  if(process.env.port==80){
    process.env.port=5000;
  }
  else{
    process.env.port++;
  }
  httpListener.listen(process.env.port);
});
httpListener.listen(process.env.port,success);
function success(){
  httpListener.close(start);
}
function start(){
  //manage other config stuff
  console.log("Using port "+process.env.port+" with configuration",configs);
  configs.port=process.env.port;
  if(configs.redis){
    configs.redisOptions=configs.redis;
  }
  
  var app=require("./http-endpoint.js")(configs);
  console.log("STARTING NOW");

  httpListener=http.Server(app);
  var httpEndpoint=child_process.fork("admin.js");
  httpEndpoint.on("data",function(data){
    console.log("dayta here",data);
  })
  httpEndpoint.on("start",function(message){
    httpEndpoint.send({type:"redisOptions",d:configs.redisOptions});
    httpEndpoint.send("start",server);
  });
  
  startLast();
}
  
function startLast(){
  //HTTP Endpoint. Start last, only after control and cache pages have started
  httpListener.listen(process.env.port,function(){
    console.log("Cellophane started on port",process.env.port);
  })
}